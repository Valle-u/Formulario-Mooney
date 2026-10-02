import { timingSafeEqual } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import { pinoHttp } from "pino-http";
import { z } from "zod";
import { logger } from "../lib/logger.js";
import { env, AUTH_TOKENS, GATE_CLIENTS, SCOPES, type GateClient } from "../config/env.js";
import {
  buildTrazaFeed,
  TRAZA_ITEM_TYPES,
  FEED_LIMIT_MAX,
  type TrazaItemType,
} from "./traza-feed.js";
import { RECEIPT_GATE_CONFIG as C } from "../gate/config.js";
import { detectCapabilities } from "../gate/capabilities.js";
import { recordAccepted, recordRejected, recordFailed, getStats } from "../stats.js";
import { processScan, resolveReceiptView, loadScanReceipt, getScanMetadata } from "../pipeline/process-scan.js";
import { aiConfigured } from "../forensic/receipt-reader.js";
import { receiptAgeHours } from "../forensic/validate.js";
import { ingestFeedback } from "../forensic/ocr-feedback-ingest.js";

const BODY_LIMIT_BYTES = Math.ceil(C.maxBytes * 1.4) + 256 * 1024;
const MAX_DATA_CHARS = Math.ceil(C.maxBytes * 1.4) + 1024;

const ScanBody = z.object({
  subject_id: z.string().min(1).max(256),
  phone: z.string().max(32).optional(),
  channel: z.enum(["crm_livechat", "crm_whatsapp", "pam_panel", "pam_store", "other"]).optional(),
  declared_mime: z.string().max(128).optional(),
  filename: z.string().max(512).optional(),
  data_base64: z.string().min(1),
});

// Feedback del OCR de códigos (PTMUAT-414 c) — aditivo, NO cambia el contrato /scan v1.1.
const FeedbackBody = z.object({
  code_truth: z.string().min(1).max(128),
  field: z.enum(["codigo_operacion", "coelsa_id"]).optional(),
  code_read: z.string().max(128).optional(),
  source: z.enum(["endpoint", "batch", "manual"]).optional(),
  note: z.string().max(512).optional(),
});

function clienteDelToken(recibido: string): GateClient | null {
  const a = Buffer.from(recibido);
  for (const c of GATE_CLIENTS) {
    const b = Buffer.from(c.token);
    if (a.length === b.length && timingSafeEqual(a, b)) return c;
  }
  return null;
}

/** Etiqueta del consumidor que autenticó el request (para logs; nunca al cliente). */
function clientLabel(res: Response): string {
  return typeof res.locals.gateClient === "string" ? res.locals.gateClient : "desconocido";
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (AUTH_TOKENS.length === 0) {
    if (env.NODE_ENV === "production") {
      res.status(503).json({ error: "auth_not_configured" });
      return;
    }
    res.locals.gateClient = "sin_auth";
    next();
    return;
  }
  const header = req.header("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header);
  const cliente = m?.[1] ? clienteDelToken(m[1]) : null;
  if (!cliente) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  res.locals.gateClient = cliente.label;
  res.locals.gateScopes = cliente.scopes;
  next();
}

/**
 * Exige un scope concreto además de autenticar. Un cliente con `scopes: null` (etiqueta sin entrada
 * en `RECEIPT_GATE_SCOPES`) pasa todo: es el comportamiento histórico y lo mantenemos para no
 * voltear los tokens vivos de CRM y PAM al desplegar esto.
 *
 * Sin esto no se puede emitir honestamente un token "de sólo lectura": el 28/08 le negamos uno a QA
 * justamente porque `requireAuth` no distinguía rutas y la credencial habría podido llamar a
 * `POST /scan` (créditos de IA) y bajarse comprobantes ajenos (`MSG-GATE-20260828-2`).
 */
function requireScope(scope: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    requireAuth(req, res, () => {
      const scopes = res.locals.gateScopes as ReadonlySet<string> | null | undefined;
      if (scopes && !scopes.has(scope)) {
        logger.warn(
          { client: clientLabel(res), scope, ruta: req.path },
          "gate: token sin scope para esta ruta",
        );
        res.status(403).json({ error: "forbidden_scope", required_scope: scope });
        return;
      }
      next();
    });
  };
}

export function buildServer() {
  const app = express();
  // `pino-http` loguea los headers de cada request, o sea que el Bearer del cliente terminaba
  // ESCRITO en el log. Mientras el log era sólo stdout ya estaba mal; con la traza en disco (13/08)
  // pasaba a vivir 7 días en el volumen. `redact` reemplaza el valor por [Redacted] antes de
  // serializar, así que el token no llega ni al archivo ni a `docker logs`. La etiqueta del cliente
  // ya viaja en `scan_outcome.client`, que es lo que hace falta para atribuir.
  app.use(
    pinoHttp({
      logger,
      redact: {
        paths: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-gate-alert-token"]'],
        censor: "[Redacted]",
      },
    }),
  );
  app.use(express.json({ limit: BODY_LIMIT_BYTES }));

  app.get("/health", async (_req, res) => {
    const caps = await detectCapabilities();
    const stats = getStats();
    res.json({
      ok: true,
      capabilities: caps,
      clamav: stats.clamav,
      forensic: { enabled: env.RECEIPT_FORENSIC_ENABLED, ai_configured: aiConfigured() },
    });
  });

  app.get("/stats", requireScope(SCOPES.stats), (req, res) => {
    const min = req.query.min ? Number(req.query.min) : undefined;
    res.json(getStats(min && Number.isFinite(min) ? min : undefined));
  });

  /**
   * Núcleo: archivo crudo → JPEG limpio + extracción forense + link seguro de vista.
   * El PAM/CRM reciben datos estructurados; el dinero lo decide el PAM.
   */
  app.post("/scan", requireScope(SCOPES.scan), async (req, res) => {
    const t0 = Date.now();
    const parsed = ScanBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", detail: parsed.error.flatten() });
      return;
    }
    const { subject_id, phone, channel, declared_mime, data_base64 } = parsed.data;

    if (data_base64.length > MAX_DATA_CHARS) {
      recordRejected("too_large");
      logger.info(
        { event: "scan_outcome", status: "rejected", reason: "too_large", durationMs: Date.now() - t0, channel, client: clientLabel(res), subject_id },
        "scan outcome",
      );
      res.json({
        status: "rejected",
        reason: "too_large",
        user_message: "La imagen supera 10MB. Mandala más liviana 🙏",
      });
      return;
    }

    let input: Buffer;
    try {
      input = Buffer.from(data_base64, "base64");
    } catch {
      recordRejected("bad_base64");
      logger.info(
        { event: "scan_outcome", status: "rejected", reason: "bad_base64", durationMs: Date.now() - t0, channel, client: clientLabel(res), subject_id },
        "scan outcome",
      );
      res.status(400).json({
        status: "rejected",
        reason: "bad_base64",
        user_message: "No pude leer el archivo. Reenvialo 🙏",
      });
      return;
    }

    const outcome = await processScan(input, declared_mime ?? "application/octet-stream", {
      subjectId: subject_id,
      telefono: phone,
      channel,
    });
    const durationMs = Date.now() - t0;

    if (outcome.status === "accepted") {
      recordAccepted();
      logger.info(
        {
          event: "scan_outcome",
          status: "accepted",
          durationMs,
          channel,
          client: clientLabel(res),
          subject_id,
          scan_id: outcome.scan_id,
          duplicate_global: outcome.duplicate_global?.seen ?? false,
          forensic_status: outcome.forensic_status,
        },
        "scan outcome",
      );
      res.json({
        status: "accepted",
        scan_id: outcome.scan_id,
        mime: outcome.mime,
        phash: outcome.phash,
        sha256: outcome.sha256,
        // Compat CRM/PAM: bytes del JPEG limpio para reenviar a register_deposit.
        clean_base64: outcome.clean_base64,
        view_url: outcome.view_url,
        view_token: outcome.view_token,
        extraction: outcome.extraction,
        // Aditivo (MSG-PAM-20260812-8 §6): la edad calculada acá saca del medio la ambigüedad de
        // zona. `fecha` va como está impresa en el comprobante —hora argentina, sin sufijo—, así
        // que quien la parsee en un proceso UTC la lee 3 h más vieja.
        receipt_age_hours: receiptAgeHours(outcome.extraction?.fecha ?? null),
        bank: outcome.bank,
        validation: outcome.validation,
        duplicate_global: outcome.duplicate_global,
        forensic_status: outcome.forensic_status,
      });
      return;
    }
    if (outcome.status === "rejected") {
      recordRejected(outcome.reason);
      // C5 / X01b: duplicate u otros rejects — durationMs permite ver si "queda verificando" es latencia GATE.
      // `subject_id` va acá porque un rechazo NO deja fila en `scan_records`: sin esto, la única
      // huella de a quién se le rechazó un comprobante era la etiqueta del token, que identifica al
      // consumidor y no al sujeto. Lo destapó PAM el 12/08 pidiendo confirmar `dev:store_130`
      // (`MSG-PAM-20260812-15`): el scan estaba en el log y el sujeto no.
      logger.info(
        {
          event: "scan_outcome",
          status: "rejected",
          reason: outcome.reason,
          durationMs,
          channel,
          client: clientLabel(res),
          subject_id,
        },
        "scan outcome",
      );
      res.json({
        status: "rejected",
        reason: outcome.reason,
        user_message: outcome.user_message,
      });
      return;
    }
    recordFailed(outcome.step);
    logger.warn(
      {
        event: "scan_outcome",
        status: "failed",
        step: outcome.step,
        error: outcome.error?.slice(0, 160),
        durationMs,
        channel,
        client: clientLabel(res),
        subject_id,
      },
      "scan outcome",
    );
    res.status(502).json({ status: "failed", step: outcome.step, error: outcome.error });
  });

  /** Metadata de una operación (datos extraídos + banco + view_url). Solo clientes Bearer. */
  app.get("/scans/:scanId", requireScope(SCOPES.read), (req, res) => {
    const scanId = req.params.scanId;
    if (!scanId || scanId.length > 64) {
      res.status(400).json({ error: "bad_scan_id" });
      return;
    }
    const meta = getScanMetadata(scanId);
    if ("error" in meta) {
      res.status(meta.status).json({ error: meta.error });
      return;
    }
    res.json(meta);
  });

  /**
   * Base que aprende (PTMUAT-414 c): PAM postea el código REAL cuando el match PSP cierra.
   * Aditivo — NO toca el contrato /scan v1.1. GATE lo usa para eval/regresión (y, a futuro, few-shot).
   * No decide dinero. Guarda copia retenida del comprobante para eval si sigue viva.
   */
  app.post("/scans/:scanId/feedback", requireScope(SCOPES.feedback), (req, res) => {
    const scanId = req.params.scanId;
    if (!scanId || scanId.length > 64) {
      res.status(400).json({ error: "bad_scan_id" });
      return;
    }
    const parsed = FeedbackBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "bad_request", detail: parsed.error.flatten() });
      return;
    }
    const { code_truth, field, code_read, source, note } = parsed.data;
    const result = ingestFeedback({
      scanId,
      codeTruth: code_truth,
      field,
      codeRead: code_read,
      source: source ?? "endpoint",
      note,
    });
    logger.info(
      {
        event: "ocr_feedback",
        scan_id: scanId,
        field: result.field,
        exact_match: result.exact_match,
        confusion_class: result.confusion_class,
        image_retained: result.image_retained,
        scan_found: result.scan_found,
      },
      "ocr feedback ingerido",
    );
    res.json({
      ok: true,
      field: result.field,
      exact_match: result.exact_match,
      confusion_class: result.confusion_class,
      image_retained: result.image_retained,
      scan_found: result.scan_found,
    });
  });

  /** Vista segura del comprobante saneado (token HMAC en query o Bearer de cliente). */
  /**
   * Feed de trazabilidad (`MSG-TRAZA-20260908-3`). Enumera los scans del período, que era lo que
   * faltaba entre `/stats` (agregado en memoria, sin ids) y `/scans/:id` (hay que saber el id).
   *
   * Ojo con lo que este endpoint cambia en materia de exposición: hasta acá, para leer un
   * comprobante había que CONOCER su `scan_id`. Esto permite enumerarlos todos, con extracción
   * (montos, CBU/CVU, nombres) y teléfono. Por eso exige scope propio y la allowlist de red sigue
   * siendo obligatoria: no se abre a internet.
   */
  app.get("/traza/v1/feed", requireScope(SCOPES.trazaFeed), (req, res) => {
    const q = req.query;

    let sinceIso: string | undefined;
    if (typeof q.since === "string" && q.since.trim() !== "") {
      const d = new Date(q.since);
      if (Number.isNaN(d.getTime())) {
        res.status(400).json({ error: "bad_since", detail: "fecha ISO-8601 inválida" });
        return;
      }
      sinceIso = d.toISOString();
    }

    let types: TrazaItemType[] | undefined;
    if (typeof q.types === "string" && q.types.trim() !== "") {
      const pedidos = q.types
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const invalido = pedidos.find((t) => !TRAZA_ITEM_TYPES.includes(t as TrazaItemType));
      if (invalido) {
        res
          .status(400)
          .json({ error: "bad_types", detail: invalido, soportados: TRAZA_ITEM_TYPES });
        return;
      }
      types = pedidos as TrazaItemType[];
    }

    let limit: number | undefined;
    if (typeof q.limit === "string" && q.limit.trim() !== "") {
      const n = Number(q.limit);
      if (!Number.isFinite(n) || n < 1) {
        res.status(400).json({ error: "bad_limit", max: FEED_LIMIT_MAX });
        return;
      }
      limit = n; // el tope se aplica en `buildTrazaFeed`
    }

    const cursor = typeof q.cursor === "string" && q.cursor.trim() !== "" ? q.cursor.trim() : undefined;

    try {
      const feed = buildTrazaFeed({ sinceIso, cursor, types, limit });
      logger.info(
        {
          client: clientLabel(res),
          items: feed.items.length,
          hasMore: feed.hasMore,
          since: sinceIso ?? null,
        },
        "traza_feed",
      );
      res.json(feed);
    } catch (err) {
      logger.error({ err, client: clientLabel(res) }, "traza_feed: falló");
      res.status(500).json({ error: "feed_failed" });
    }
  });

  app.get("/receipts/:scanId", async (req, res) => {
    const scanId = req.params.scanId;
    if (!scanId || scanId.length > 64) {
      res.status(400).json({ error: "bad_scan_id" });
      return;
    }

    const queryToken = typeof req.query.token === "string" ? req.query.token : "";
    const header = req.header("authorization") ?? "";
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(header);
    const bearerCliente = bearerMatch?.[1] ? clienteDelToken(bearerMatch[1]) : null;
    if (bearerCliente) res.locals.gateClient = bearerCliente.label;

    // Esta ruta autentica a mano (acepta Bearer O token de vista firmado), así que `requireScope`
    // no la cubre y sin este chequeo el scope sería decorativo: un token de sólo-feed podía
    // bajarse el JPEG de cualquier comprobante.
    if (bearerCliente?.scopes && !bearerCliente.scopes.has(SCOPES.read)) {
      logger.warn(
        { client: bearerCliente.label, scope: SCOPES.read, ruta: req.path },
        "gate: token sin scope para esta ruta",
      );
      res.status(403).json({ error: "forbidden_scope", required_scope: SCOPES.read });
      return;
    }
    const bearerOk = bearerCliente !== null;

    let view;
    if (bearerOk) {
      view = loadScanReceipt(scanId);
    } else if (queryToken) {
      view = resolveReceiptView(scanId, queryToken);
    } else {
      res.status(401).json({ error: "token_required" });
      return;
    }

    if ("error" in view) {
      res.status(view.status).json({ error: view.error });
      return;
    }

    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(view.buffer);
  });

  return app;
}
