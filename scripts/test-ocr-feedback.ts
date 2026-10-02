/**
 * Test de la base que aprende (PTMUAT-414 c) — sin costo de API (no corre OCR).
 * Correr: npm run test:ocr-feedback. Usa DB en memoria + storage temporal.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "gate-ocr-feedback-test-"));
process.env.DB_PATH = join(tmpDir, "test.db");
process.env.RECEIPT_STORAGE_PATH = mkdtempSync(join(tmpdir(), "gate-store-"));
process.env.RECEIPT_EVAL_STORAGE_PATH = mkdtempSync(join(tmpdir(), "gate-eval-"));
process.env.RECEIPT_GATE_TOKENS = "t";

const { insertScan, deleteAllScans } = await import("../src/db/scans.js");
const { saveCleanReceipt } = await import("../src/storage/receipt-files.js");
const { evalReceiptExists } = await import("../src/storage/receipt-files.js");
const { ingestFeedback, classifyConfusion } = await import("../src/forensic/ocr-feedback-ingest.js");
const { feedbackStats, countFeedback, getFeedbackByScan, deleteAllFeedback } = await import("../src/db/ocr-feedback.js");
const type = await import("../src/forensic/types.js");

let passed = 0, failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

function baseExtraction(codigo: string | null): import("../src/forensic/types.js").ReceiptExtraction {
  void type;
  return {
    monto: 1000, codigo_operacion: codigo, fecha: "2026-07-25 20:48:00", nombre_emisor: "X",
    cuenta_emisora: null, cuenta_receptora: "0000088800010000009679", entidad_emisora: "ARQ",
    tipo_operacion: "transferencia", confianza: 0.95, signos_edicion: false,
    es_comprobante_valido: true, coelsa_id: codigo, observaciones: null, estado_comprobante: "confirmado",
  };
}

function seedScan(scanId: string, codigo: string | null) {
  saveCleanReceipt(scanId, Buffer.from("fake-jpeg-bytes"));
  insertScan({
    scanId, subjectId: "s1", phash: "0".repeat(16), sha256: "a".repeat(64),
    bankCanonical: "arq", bankKnown: true, storagePath: `${scanId}.jpg`,
    extraction: baseExtraction(codigo), alerts: [], forensicStatus: "ok",
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  });
}

function run() {
  console.log("== classifyConfusion ==");
  check("glyph (0<->O,G<->6,V<->Y)", classifyConfusion("L18MKX9RPXVMQKMV20GWVV", "L18MKX9RPXVMQKMV2O6WYV") === "glyph");
  check("exact", classifyConfusion("ABC123", "ABC123") === "exact");
  check("length", classifyConfusion("ABC12", "ABC123") === "length");
  check("field (null read)", classifyConfusion(null, "ABC123") === "field");
  check("other (transposicion)", classifyConfusion("818RMQQ", "818RQMQ") === "other");

  console.log("== ingesta con scan en BD ==");
  deleteAllScans(); deleteAllFeedback();
  seedScan("scan-1", "L18MKX9RPXVMQKMV20GWVV");
  let r = ingestFeedback({ scanId: "scan-1", codeTruth: "L18MKX9RPXVMQKMV2O6WYV", source: "endpoint" });
  check("deriva code_read de la extraccion", r.code_read === "L18MKX9RPXVMQKMV20GWVV");
  check("exact_match=false", r.exact_match === false);
  check("confusion_class=glyph", r.confusion_class === "glyph");
  check("scan_found=true", r.scan_found === true);
  check("imagen retenida", r.image_retained === true && evalReceiptExists("scan-1"));

  console.log("== upsert idempotente ==");
  ingestFeedback({ scanId: "scan-1", codeTruth: "L18MKX9RPXVMQKMV2O6WYV", source: "endpoint" });
  check("no duplica (scan_id, field)", getFeedbackByScan("scan-1").length === 1);

  console.log("== ingesta sin scan en BD (batch historico) ==");
  r = ingestFeedback({ scanId: "scan-gone", codeTruth: "ABC123", codeRead: "ABC123", source: "batch" });
  check("scan_found=false", r.scan_found === false);
  check("exact con code_read provisto", r.exact_match === true && r.confusion_class === "exact");

  console.log("== stats ==");
  const s = feedbackStats();
  check("total=2", s.total === 2 && countFeedback() === 2);
  check("exact=1", s.exact === 1);
  check("accuracy=0.5", Math.abs(s.accuracy - 0.5) < 1e-9);
  check("byBank incluye arq", s.byBank.some((b) => b.bank === "arq" && b.total === 1));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
