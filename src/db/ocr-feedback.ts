/**
 * Base que aprende (PTMUAT-414 c): almacén de correcciones validadas del OCR de
 * codigo_operacion/coelsa_id. Cada fila es "lo que GATE leyó" vs "lo que era en realidad"
 * (aportado por PAM al cerrar el match PSP, o por import de lote del histórico).
 *
 * Se RETIENE (no está atada al TTL de scan_records): es material de evaluación/entrenamiento.
 * Upsert idempotente por (scan_id, field) para no duplicar si el feedback se reenvía.
 */
import { randomUUID } from "node:crypto";
import { db } from "./index.js";

export type FeedbackField = "codigo_operacion" | "coelsa_id";
export type FeedbackSource = "endpoint" | "batch" | "manual";
export type ConfusionClass = "exact" | "glyph" | "field" | "length" | "other";

export interface OcrFeedbackRecord {
  id: string;
  scan_id: string;
  field: FeedbackField;
  code_read: string | null;
  code_truth: string;
  exact_match: number;
  confusion_class: ConfusionClass | null;
  bank_canonical: string | null;
  source: FeedbackSource;
  note: string | null;
  created_at: string;
}

export interface InsertFeedbackParams {
  scanId: string;
  field: FeedbackField;
  codeRead: string | null;
  codeTruth: string;
  exactMatch: boolean;
  confusionClass: ConfusionClass | null;
  bankCanonical: string | null;
  source: FeedbackSource;
  note?: string | null;
}

/** Upsert idempotente por (scan_id, field). Devuelve el id (nuevo o el existente actualizado). */
export function insertFeedback(p: InsertFeedbackParams): string {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO ocr_feedback
       (id, scan_id, field, code_read, code_truth, exact_match, confusion_class, bank_canonical, source, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (scan_id, field) DO UPDATE SET
       code_read = excluded.code_read,
       code_truth = excluded.code_truth,
       exact_match = excluded.exact_match,
       confusion_class = excluded.confusion_class,
       bank_canonical = excluded.bank_canonical,
       source = excluded.source,
       note = excluded.note`,
  ).run(
    id,
    p.scanId,
    p.field,
    p.codeRead,
    p.codeTruth,
    p.exactMatch ? 1 : 0,
    p.confusionClass,
    p.bankCanonical,
    p.source,
    p.note ?? null,
    new Date().toISOString(),
  );
  const row = db
    .prepare("SELECT id FROM ocr_feedback WHERE scan_id = ? AND field = ?")
    .get(p.scanId, p.field) as { id: string } | undefined;
  return row?.id ?? id;
}

export function listFeedback(opts?: { limit?: number }): OcrFeedbackRecord[] {
  const limit = Math.max(1, opts?.limit ?? 10_000);
  return db
    .prepare("SELECT * FROM ocr_feedback ORDER BY created_at ASC LIMIT ?")
    .all(limit) as unknown as OcrFeedbackRecord[];
}

export function getFeedbackByScan(scanId: string): OcrFeedbackRecord[] {
  return db
    .prepare("SELECT * FROM ocr_feedback WHERE scan_id = ? ORDER BY created_at ASC")
    .all(scanId) as unknown as OcrFeedbackRecord[];
}

export function countFeedback(): number {
  const r = db.prepare("SELECT COUNT(*) AS n FROM ocr_feedback").get() as { n: number };
  return r.n;
}

export interface FeedbackStats {
  total: number;
  exact: number;
  accuracy: number;
  byBank: Array<{ bank: string; total: number; exact: number; accuracy: number }>;
  byClass: Array<{ confusion_class: string; total: number }>;
  byDay: Array<{ day: string; total: number; exact: number }>;
}

/** Métricas de precisión exact-match: global, por banco, por clase de confusión, y tendencia diaria. */
export function feedbackStats(): FeedbackStats {
  const totalRow = db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(exact_match),0) AS e FROM ocr_feedback")
    .get() as { n: number; e: number };
  const total = totalRow.n;
  const exact = totalRow.e;

  const byBank = (
    db
      .prepare(
        `SELECT COALESCE(bank_canonical,'(desconocido)') AS bank, COUNT(*) AS total,
                COALESCE(SUM(exact_match),0) AS exact
         FROM ocr_feedback GROUP BY bank ORDER BY total DESC`,
      )
      .all() as Array<{ bank: string; total: number; exact: number }>
  ).map((r) => ({ ...r, accuracy: r.total ? r.exact / r.total : 0 }));

  const byClass = db
    .prepare(
      `SELECT COALESCE(confusion_class,'(sin clase)') AS confusion_class, COUNT(*) AS total
       FROM ocr_feedback GROUP BY confusion_class ORDER BY total DESC`,
    )
    .all() as Array<{ confusion_class: string; total: number }>;

  const byDay = db
    .prepare(
      `SELECT substr(created_at,1,10) AS day, COUNT(*) AS total,
              COALESCE(SUM(exact_match),0) AS exact
       FROM ocr_feedback GROUP BY day ORDER BY day ASC`,
    )
    .all() as Array<{ day: string; total: number; exact: number }>;

  return {
    total,
    exact,
    accuracy: total ? exact / total : 0,
    byBank,
    byClass,
    byDay,
  };
}

/** Solo para tests. */
export function deleteAllFeedback(): number {
  const r = db.prepare("DELETE FROM ocr_feedback").run();
  return Number(r.changes ?? 0);
}
