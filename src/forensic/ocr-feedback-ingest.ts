/**
 * Ingesta de feedback del OCR de códigos (PTMUAT-414 c). Punto único usado por el endpoint
 * POST /scan/:id/feedback y por el import de lote, para que ambos deriven los mismos campos.
 *
 * Dado un scan_id + el código REAL (ground truth de PAM), este módulo:
 *  1. Deriva `code_read` de la extracción que GATE guardó (fuente de verdad de lo que emitió),
 *     salvo que el llamador lo pase explícito (útil si el scan ya expiró de la BD).
 *  2. Calcula exact_match y la clase de confusión (exact/glyph/field/length/other).
 *  3. Snapshot de la imagen limpia al almacén RETENIDO (si sigue viva antes del TTL), para eval.
 *  4. Inserta/actualiza en ocr_feedback (upsert por scan_id+field).
 *
 * No decide dinero ni toca /scan. Solo acumula material de evaluación/aprendizaje.
 */
import { getScanById } from "../db/scans.js";
import { loadCleanReceipt, saveEvalReceipt, evalReceiptExists } from "../storage/receipt-files.js";
import {
  insertFeedback,
  type ConfusionClass,
  type FeedbackField,
  type FeedbackSource,
} from "../db/ocr-feedback.js";
import type { ReceiptExtraction } from "./types.js";

/** Colapso de clases de confusión OCR (misma tabla acordada con PAM: 0/O,1/I/L,2/Z,5/S,6/G,8/B,Y/V,U/V). */
function collapse(s: string): string {
  return s
    .toUpperCase()
    .replace(/[OQD]/g, "0")
    .replace(/[IL|!]/g, "1")
    .replace(/[Z]/g, "2")
    .replace(/[S]/g, "5")
    .replace(/[G]/g, "6")
    .replace(/[B]/g, "8")
    .replace(/[YU]/g, "V");
}

function norm(s: string): string {
  return s.toUpperCase().replace(/\s+/g, "");
}

/** Clasifica la diferencia entre lo leído y lo real. */
export function classifyConfusion(codeRead: string | null, codeTruth: string): ConfusionClass {
  const truth = norm(codeTruth);
  if (!codeRead || !norm(codeRead)) return "field"; // GATE no emitió código (nulled/placeholder/miss)
  const read = norm(codeRead);
  if (read === truth) return "exact";
  if (read.length !== truth.length) return "length";
  // mismo largo: si al colapsar clases de confusión coinciden → glifos; si no → otro (transposición…)
  return collapse(read) === collapse(truth) ? "glyph" : "other";
}

export interface FeedbackIngestInput {
  scanId: string;
  codeTruth: string;
  field?: FeedbackField;
  /** Opcional: lo que GATE leyó. Si falta, se deriva de la extracción guardada. */
  codeRead?: string | null;
  source: FeedbackSource;
  note?: string | null;
}

export interface FeedbackIngestResult {
  ok: true;
  field: FeedbackField;
  code_read: string | null;
  exact_match: boolean;
  confusion_class: ConfusionClass;
  image_retained: boolean;
  scan_found: boolean;
}

/** Elige el campo y el valor leído desde la extracción guardada. */
function deriveFromExtraction(
  extraction: ReceiptExtraction | null,
  preferred?: FeedbackField,
): { field: FeedbackField; codeRead: string | null } {
  if (preferred) {
    return { field: preferred, codeRead: (extraction?.[preferred] ?? null) as string | null };
  }
  // Sin campo explícito: preferir codigo_operacion; si está vacío y coelsa_id tiene algo, usar coelsa_id.
  const cod = extraction?.codigo_operacion ?? null;
  const coe = extraction?.coelsa_id ?? null;
  if (!cod && coe) return { field: "coelsa_id", codeRead: coe };
  return { field: "codigo_operacion", codeRead: cod };
}

export function ingestFeedback(input: FeedbackIngestInput): FeedbackIngestResult {
  const record = getScanById(input.scanId);
  const extraction: ReceiptExtraction | null = record?.extraction_json
    ? (JSON.parse(record.extraction_json) as ReceiptExtraction)
    : null;

  const derived = deriveFromExtraction(extraction, input.field);
  const field = derived.field;
  const codeRead = input.codeRead !== undefined ? input.codeRead : derived.codeRead;

  const exactMatch = !!codeRead && norm(codeRead) === norm(input.codeTruth);
  const confusionClass = classifyConfusion(codeRead ?? null, input.codeTruth);

  // Snapshot de la imagen limpia al almacén retenido, si sigue viva (antes del TTL) y no la tenemos ya.
  let imageRetained = evalReceiptExists(input.scanId);
  if (!imageRetained && record) {
    const buf = loadCleanReceipt(record.storage_path);
    if (buf) imageRetained = saveEvalReceipt(input.scanId, buf) !== null;
  }

  insertFeedback({
    scanId: input.scanId,
    field,
    codeRead: codeRead ?? null,
    codeTruth: input.codeTruth,
    exactMatch,
    confusionClass,
    bankCanonical: record?.bank_canonical ?? null,
    source: input.source,
    note: input.note ?? null,
  });

  return {
    ok: true,
    field,
    code_read: codeRead ?? null,
    exact_match: exactMatch,
    confusion_class: confusionClass,
    image_retained: imageRetained,
    scan_found: !!record,
  };
}
