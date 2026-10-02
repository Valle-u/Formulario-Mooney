// Orquestador de la capa de seguridad de comprobantes (doc 04).
// 6 capas: 0) ClamAV  1) validación  2) sanitización/defang  3) semántica  4) rate-limit  5) salida.
// Al cliente (CRM/PAM) NUNCA vuelve el archivo original: vuelve un JPEG re-encodeado (rompe
// payloads) + pHash.

import { createHash } from "node:crypto";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { RECEIPT_GATE_CONFIG as C } from "./config.js";
import { scanBuffer } from "./clamav.js";
import {
  renderPdfFirstPageToPng,
  perceptualHash,
  looksLikeReceipt,
  findDuplicateForSubject,
  allowRate,
  allowAttempt,
} from "./helpers.js";
import { logger } from "../lib/logger.js";

export type GateOutcome =
  | { status: "accepted"; clean: Buffer; mime: "image/jpeg"; phash: string; sha256: string }
  | { status: "rejected"; reason: string; userMessage: string }
  | { status: "failed"; step: string; error: string };

export async function runReceiptGate(
  input: Buffer,
  declaredMime: string,
  ctx: { subjectId: string; telefono?: string },
): Promise<GateOutcome> {
  const reject = (reason: string, userMessage: string): GateOutcome => ({
    status: "rejected",
    reason,
    userMessage,
  });

  // ── Anti-flood barato: contador de INTENTOS antes del trabajo caro ──
  // Corta ráfagas (ClamAV/sharp/poppler son caros) ANTES de procesar; cuenta también los rechazos.
  if (!(await allowAttempt(ctx.subjectId, C.maxAttemptsPerWindow, C.rateWindowMs)))
    return reject("rate_limited", "Recibí varios archivos seguidos ⏳. Esperá un momentito y reintentá 🙏");

  // ── Capa 0: ClamAV ──────────────────────────────────────────────
  const scan = await scanBuffer(input);
  if (scan.ok && !scan.clean) {
    // No revelar la detección al atacante. Alertar internamente.
    logger.warn({ subjectId: ctx.subjectId, viruses: scan.viruses }, "receipt-gate: INFECTED");
    return reject("infected", "No pude procesar el archivo 🙏. Mandame de nuevo la captura.");
  }
  if (!scan.ok && C.clamav.failClosed) {
    return { status: "failed", step: "clamav", error: scan.error };
  }

  // ── Capa 1: validación ──────────────────────────────────────────
  if (input.length < C.minBytes)
    return reject("too_small", "El archivo está vacío o dañado. Reenviá la captura 🙏");
  if (input.length > C.maxBytes)
    return reject("too_large", "La imagen supera 10MB. Mandala más liviana 🙏");

  const sniff = await fileTypeFromBuffer(input);
  if (!sniff || !(C.allowedMime as readonly string[]).includes(sniff.mime))
    return reject("bad_type", "Formato no válido. Mandame una foto (JPG/PNG) o PDF del comprobante 🙏");

  // Confiamos en el MIME REAL (magic bytes), no en el declarado por el cliente: WhatsApp/Kommo
  // suelen declarar `application/octet-stream` (o nada) para imágenes legítimas. Un archivo
  // disfrazado de imagen ya se rechaza arriba (su tipo real no está en `allowedMime`) y, además,
  // todo lo que pasa se **re-encodea** en la Capa 2, lo que rompe cualquier payload embebido.
  void declaredMime;

  // ── Capa 2: sanitización / defang ───────────────────────────────
  try {
    let working = input;
    if (sniff.mime === "application/pdf") {
      working = await renderPdfFirstPageToPng(input, C.pdfRenderDpi, C.sandboxTimeoutMs);
    }

    const meta = await sharp(working, {
      limitInputPixels: C.maxMegapixels * 1_000_000,
    }).metadata();
    if ((meta.width ?? 0) > C.maxSideInput || (meta.height ?? 0) > C.maxSideInput)
      return reject("dimensions", "La imagen es demasiado grande. Mandala normal 🙏");

    // re-encode limpio: sharp NO copia metadata por defecto → EXIF/XMP/ICC eliminados.
    const clean = await sharp(working, { limitInputPixels: C.maxMegapixels * 1_000_000 })
      .rotate() // respeta orientación EXIF y luego la descarta
      .resize({
        width: C.maxSideOutput,
        height: C.maxSideOutput,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: C.reencodeQuality, mozjpeg: true })
      .toBuffer();

    // ── Capa 3: filtro semántico ──────────────────────────────────
    const phash = await perceptualHash(clean);
    const sha256 = createHash("sha256").update(clean).digest("hex");
    const dup = await findDuplicateForSubject(
      ctx.subjectId,
      phash,
      sha256,
      C.phashSimilarLogThreshold,
    );
    // SOLO el resend EXACTO (sha256) auto-rechaza. La similitud pHash NO bloquea: dos
    // transferencias distintas con el mismo template de banco dan Hamming casi 0 (issue #220),
    // así que cortar acá mataba el OCR. La desambiguación real (monto/fecha/COELSA/código) es
    // de PAM — GATE deja pasar al forense y solo deja rastro de la similitud.
    if (dup.duplicate && dup.via === "sha256") {
      logger.info(
        {
          event: "gate_duplicate",
          subjectId: ctx.subjectId,
          via: "sha256",
          phash,
          priorPhash: dup.priorPhash,
          sha256: sha256.slice(0, 16),
          priorSha16: dup.priorSha256?.slice(0, 16) ?? null,
        },
        "gate: duplicate (exact resend)",
      );
      return reject("duplicate", "Ese comprobante ya me lo enviaste 🙂 Si hiciste otra carga, mandame el nuevo.");
    }
    if (dup.duplicate && dup.via === "phash") {
      logger.info(
        {
          event: "gate_phash_similar",
          subjectId: ctx.subjectId,
          hamming: dup.hamming,
          phash,
          priorPhash: dup.priorPhash,
          sha256: sha256.slice(0, 16),
          priorSha16: dup.priorSha256?.slice(0, 16) ?? null,
          threshold: C.phashSimilarLogThreshold,
        },
        "gate: phash similar (no bloquea, sigue al OCR)",
      );
    }

    const cls = await looksLikeReceipt(clean);
    if (cls.confidence < C.receiptMinConfidence)
      return reject("not_a_receipt", "Eso no parece un comprobante 🙈. Mandame la captura de la transferencia 🙏");

    // ── Capa 4: rate limit ────────────────────────────────────────
    if (!(await allowRate(ctx.subjectId, C.maxReceiptsPerWindow, C.rateWindowMs)))
      return reject("rate_limited", "Recibí varios comprobantes seguidos ⏳. Esperá un momentito y reintentá 🙏");

    // ── Capa 5: listo para el cliente ─────────────────────────────
    // El pHash se "recuerda" recién en `processScan`, cuando el pipeline COMPLETO (gate +
    // forense) acepta el comprobante — NO acá. Si se guardara ahora, un comprobante que el
    // forense rechaza después (ej. preview/inválido) ya habría poluido el anti-duplicado y un
    // reenvío legítimo y distinto podría chocar contra ese pHash (dep #179/#180).
    return { status: "accepted", clean, mime: "image/jpeg", phash, sha256 };
  } catch (e) {
    const error = e instanceof Error ? e.message : "sanitize_error";
    return { status: "failed", step: "sanitize", error };
  }
}
