import crypto from "crypto";
import { query } from "../config/db.js";

export function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** UUID-like (GATE a veces pone el id de operación interno acá). */
export function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    String(value || "")
  );
}

/**
 * Busca egreso activo que ya use alguno de estos IDs (cualquier empresa).
 * @param {string[]} ids
 */
export async function findEgresoByTransferIds(ids) {
  const cleaned = [...new Set((ids || []).map((x) => String(x || "").trim()).filter(Boolean))];
  if (!cleaned.length) return null;

  const result = await query(
    `SELECT id, codigo_operacion, empresa_salida, id_transferencia, monto, moneda, etiqueta, status
     FROM egresos
     WHERE id_transferencia = ANY($1::text[])
       AND status IS DISTINCT FROM 'anulado'
     ORDER BY id DESC
     LIMIT 1`,
    [cleaned]
  );
  return result.rows[0] || null;
}

/** Busca egreso activo con el mismo hash de archivo. */
export async function findEgresoByComprobanteSha256(sha256) {
  if (!sha256) return null;
  const result = await query(
    `SELECT id, codigo_operacion, empresa_salida, id_transferencia, monto, moneda, etiqueta, status
     FROM egresos
     WHERE comprobante_sha256 = $1
       AND status IS DISTINCT FROM 'anulado'
     ORDER BY id DESC
     LIMIT 1`,
    [sha256]
  );
  return result.rows[0] || null;
}

export function formatDuplicateMessage(egreso, reason) {
  if (!egreso) return "Este comprobante ya está cargado en el sistema.";
  const code = egreso.codigo_operacion || `#${egreso.id}`;
  if (reason === "comprobante") {
    return `Este archivo de comprobante ya está cargado (${code}). No se puede volver a registrar.`;
  }
  return `Este ID de transferencia ya está cargado (${code}${egreso.empresa_salida ? ` · ${egreso.empresa_salida}` : ""}).`;
}
