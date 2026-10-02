import { randomUUID } from "node:crypto";
import { db } from "./index.js";

/**
 * Repositorio de pHash de comprobantes (anti-duplicado, doc 04). Guarda el hash perceptual de
 * cada comprobante ACEPTado por `subject_id` (clave estable que pasa el cliente: lead/teléfono/
 * sesión). La capa semántica compara los nuevos contra estos por distancia de Hamming.
 *
 * Vive AQUÍ (en el gate) a propósito: el dedup queda centralizado en un solo lugar, así un mismo
 * comprobante reenviado por distintos canales (livechat, WhatsApp, plataforma) se detecta igual.
 */
export interface PhashRow {
  id: string;
  subject_id: string;
  phash: string;
  sha256: string | null;
  created_at: string;
}

export interface PhashEntry {
  phash: string;
  sha256: string | null;
}

/**
 * pHashes previos de un subject (para comparar duplicados). Acotado para evitar crecimiento O(n)
 * y falsos positivos sobre historial muy viejo: se compara solo contra los `limit` más recientes
 * y, si se pasa `sinceIso`, solo los posteriores a esa fecha (TTL del anti-duplicado).
 *
 * Incluye `sha256` (del JPEG limpio) para que el dedup pueda distinguir un resend exacto/casi
 * exacto (mismos bytes tras el re-encode) de un screenshot distinto que solo se PARECE
 * visualmente (dep #179/#180: pantallas "PENDIENTE" vs "COMPLETADA" del mismo comprobante).
 */
export function listPhashesBySubject(
  subjectId: string,
  opts: { limit?: number; sinceIso?: string } = {},
): PhashEntry[] {
  const limit = Math.max(1, opts.limit ?? 200);
  const rows = opts.sinceIso
    ? (db
        .prepare(
          "SELECT phash, sha256 FROM phash_comprobante WHERE subject_id = ? AND created_at >= ? ORDER BY created_at DESC LIMIT ?",
        )
        .all(subjectId, opts.sinceIso, limit) as Array<{ phash: string; sha256: string | null }>)
    : (db
        .prepare(
          "SELECT phash, sha256 FROM phash_comprobante WHERE subject_id = ? ORDER BY created_at DESC LIMIT ?",
        )
        .all(subjectId, limit) as Array<{ phash: string; sha256: string | null }>);
  return rows.map((r) => ({ phash: r.phash, sha256: r.sha256 ?? null }));
}

/**
 * Persiste el pHash (+ sha256) de un comprobante REALMENTE aceptado.
 *
 * IMPORTANTE (dep #179/#180): se llama solo cuando el pipeline COMPLETO (gate + forense E3)
 * aceptó el comprobante — nunca desde `runReceiptGate` solo. Si un comprobante rechazado por
 * forense (ej. `preview_receipt`) ya hubiera "recordado" su pHash, un reenvío legítimo y
 * distinto (misma operación, estado final) podía chocar contra ese pHash y quedar marcado como
 * `duplicate` sin serlo. Ver `pipeline/process-scan.ts`.
 */
export function rememberPhash(subjectId: string, phash: string, sha256: string | null): void {
  db.prepare(
    "INSERT INTO phash_comprobante (id, subject_id, phash, sha256, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(randomUUID(), subjectId, phash, sha256 ?? null, new Date().toISOString());
}

export function countPhashes(subjectId?: string): number {
  if (subjectId) {
    const r = db
      .prepare("SELECT COUNT(*) AS n FROM phash_comprobante WHERE subject_id = ?")
      .get(subjectId) as { n: number };
    return r.n;
  }
  const r = db.prepare("SELECT COUNT(*) AS n FROM phash_comprobante").get() as { n: number };
  return r.n;
}

export function countPhashesBefore(beforeIso: string): number {
  const r = db
    .prepare("SELECT COUNT(*) AS n FROM phash_comprobante WHERE created_at < ?")
    .get(beforeIso) as { n: number };
  return r.n;
}

/** Borra el anti-duplicado anterior a una fecha (ops: purga de memoria pre-live). */
export function deletePhashesBefore(beforeIso: string): number {
  const r = db.prepare("DELETE FROM phash_comprobante WHERE created_at < ?").run(beforeIso);
  return Number(r.changes ?? 0);
}

/** Resetea el anti-duplicado (todo o por subject). Lo usa el harness de testeo. */
export function resetPhashes(subjectId?: string): number {
  const r = subjectId
    ? db.prepare("DELETE FROM phash_comprobante WHERE subject_id = ?").run(subjectId)
    : db.prepare("DELETE FROM phash_comprobante").run();
  return Number(r.changes ?? 0);
}
