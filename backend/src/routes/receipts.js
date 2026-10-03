import express from "express";
import multer from "multer";
import { auth } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/rateLimiter.js";
import { query } from "../config/db.js";
import { getActiveEmpresas } from "../utils/optionsCache.js";
import {
  isReceiptGateConfigured,
  mapExtractionToEgresoFields,
  scanReceiptWithGate,
  buildAutofillSubjectId,
} from "../services/receiptGate.js";

const router = express.Router();

const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 10);
const ALLOWED = new Set(["image/jpeg", "image/png", "application/pdf"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.has(file.mimetype)) {
      return cb(new Error("Tipo de archivo no permitido (JPG/PNG/PDF)"));
    }
    cb(null, true);
  },
});

/** Duplicado real en Mooney (egreso ya guardado), no el dedup de chat de GATE. */
async function findEgresoDuplicado(idTransferencia, empresaSalida) {
  if (!idTransferencia) return null;

  const params = [idTransferencia];
  let sql = `
    SELECT id, empresa_salida, id_transferencia, monto, moneda, etiqueta, status
    FROM egresos
    WHERE id_transferencia = $1
      AND status IS DISTINCT FROM 'anulado'
  `;

  if (empresaSalida) {
    params.push(empresaSalida);
    sql += ` AND empresa_salida = $2`;
  }

  sql += ` ORDER BY id DESC LIMIT 1`;

  const result = await query(sql, params);
  return result.rows[0] || null;
}

/**
 * POST /api/receipts/scan
 * Proxy autenticado → GATE POST /scan. Devuelve fields listos para el form de egreso.
 * Multipart field: comprobante
 */
router.post("/scan", auth, writeLimiter, (req, res) => {
  upload.single("comprobante")(req, res, async (multerErr) => {
    if (multerErr) {
      const msg =
        multerErr.code === "LIMIT_FILE_SIZE"
          ? `Comprobante muy grande (máx ${MAX_UPLOAD_MB}MB)`
          : multerErr.message || "Archivo inválido";
      return res.status(400).json({ message: msg });
    }

    try {
      if (!isReceiptGateConfigured()) {
        return res.status(503).json({
          message: "Autocompletado de comprobante no configurado en este entorno",
          code: "gate_not_configured",
        });
      }

      if (!req.file?.buffer?.length) {
        return res.status(400).json({ message: "Subí el comprobante" });
      }

      const userId = req.user?.id ?? req.user?.userId ?? "anon";
      // Subject único por intento: evitar que el dedup de GATE (pensado para chat)
      // bloquee re-lecturas del mismo archivo antes de guardar el egreso.
      const subjectId = buildAutofillSubjectId(userId);

      const gate = await scanReceiptWithGate(req.file, { subjectId });

      if (gate?.status === "rejected") {
        // duplicate de GATE no debería llegar con subject único; si llega, no lo tratamos
        // como error de negocio de Mooney.
        if (gate.reason === "duplicate") {
          return res.status(422).json({
            message:
              "GATE marcó el archivo como reenvío. Probá de nuevo; si persiste, recargá la página.",
            code: "gate_duplicate_retry",
            gate_status: gate.status,
          });
        }
        return res.status(422).json({
          message: gate.user_message || "El comprobante fue rechazado",
          code: gate.reason || "rejected",
          gate_status: gate.status,
        });
      }

      if (gate?.status === "failed") {
        return res.status(502).json({
          message: gate.user_message || "GATE no pudo leer el comprobante",
          code: gate.reason || "failed",
          gate_status: gate.status,
        });
      }

      const empresas = await getActiveEmpresas();
      const { fields, filled } = mapExtractionToEgresoFields(gate?.extraction, empresas);

      let warning = null;
      try {
        const existing = await findEgresoDuplicado(
          fields.id_transferencia,
          fields.empresa_salida || null
        );
        if (existing) {
          warning = {
            code: "already_in_mooney",
            message: `Este ID ya está cargado en el sistema (Egreso #${existing.id}${existing.empresa_salida ? ` · ${existing.empresa_salida}` : ""}).`,
            egreso: {
              id: existing.id,
              empresa_salida: existing.empresa_salida,
              id_transferencia: existing.id_transferencia,
              monto: existing.monto,
              etiqueta: existing.etiqueta,
            },
          };
        }
      } catch (dupErr) {
        console.warn("⚠️ No se pudo chequear duplicado Mooney:", dupErr?.message);
      }

      return res.json({
        ok: true,
        scan_id: gate?.scan_id || null,
        forensic_status: gate?.forensic_status || null,
        fields,
        filled,
        warning,
        alerts: gate?.validation?.alerts || [],
        bank: gate?.bank || null,
      });
    } catch (err) {
      console.error("🔥 POST /api/receipts/scan ERROR:", err?.message || err);
      const status = err?.status && Number.isInteger(err.status) ? err.status : 502;
      return res.status(status >= 400 && status < 600 ? status : 502).json({
        message: err?.message || "Error al escanear el comprobante",
        code: "gate_proxy_error",
      });
    }
  });
});

export default router;
