import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Conexión SQLite única del proceso (node:sqlite, built-in de Node 24+, sin deps nativas).
 * El gate aislado solo persiste el anti-duplicado (pHash) de comprobantes ACEPTados; no guarda
 * los archivos. Schema mínimo e idempotente, aplicado al importar.
 */
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS phash_comprobante (
  id          TEXT PRIMARY KEY,
  subject_id  TEXT NOT NULL,
  phash       TEXT NOT NULL,
  sha256      TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_phash_subject ON phash_comprobante (subject_id, created_at DESC);

CREATE TABLE IF NOT EXISTS scan_records (
  id               TEXT PRIMARY KEY,
  subject_id       TEXT NOT NULL,
  phone            TEXT,
  channel          TEXT,
  phash            TEXT NOT NULL,
  sha256           TEXT,
  bank_canonical   TEXT,
  bank_known       INTEGER NOT NULL DEFAULT 0,
  storage_path     TEXT NOT NULL,
  extraction_json  TEXT,
  alerts_json      TEXT,
  forensic_status  TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  expires_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scan_subject ON scan_records (subject_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_expires ON scan_records (expires_at);

CREATE TABLE IF NOT EXISTS ocr_feedback (
  id               TEXT PRIMARY KEY,
  scan_id          TEXT NOT NULL,
  field            TEXT NOT NULL,
  code_read        TEXT,
  code_truth       TEXT NOT NULL,
  exact_match      INTEGER NOT NULL DEFAULT 0,
  confusion_class  TEXT,
  bank_canonical   TEXT,
  source           TEXT NOT NULL,
  note             TEXT,
  created_at       TEXT NOT NULL,
  UNIQUE (scan_id, field)
);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_scan ON ocr_feedback (scan_id);
CREATE INDEX IF NOT EXISTS idx_ocr_feedback_bank ON ocr_feedback (bank_canonical);
`;

const dbPath = resolve(env.DB_PATH);
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec(SCHEMA_SQL);

// ── Migraciones idempotentes ──────────────────────────────────────────────
// `CREATE TABLE IF NOT EXISTS` no agrega columnas a tablas preexistentes; estas
// altas cubren bases creadas con un schema anterior (sha256/bank_*).
const MIGRATIONS = [
  "ALTER TABLE scan_records ADD COLUMN sha256 TEXT",
  "ALTER TABLE scan_records ADD COLUMN bank_canonical TEXT",
  "ALTER TABLE scan_records ADD COLUMN bank_known INTEGER NOT NULL DEFAULT 0",
  // dep #179/#180 (falso duplicado DolarApp/ARQ): sha256 del JPEG limpio junto al pHash,
  // para que el dedup pueda distinguir "mismo archivo re-enviado" de "screenshot visualmente
  // similar pero distinto" (ver isDuplicateForSubject en gate/helpers.ts).
  "ALTER TABLE phash_comprobante ADD COLUMN sha256 TEXT",
];
for (const sql of MIGRATIONS) {
  try {
    db.exec(sql);
  } catch {
    // columna ya existe → ignorar
  }
}
db.exec("CREATE INDEX IF NOT EXISTS idx_scan_sha256 ON scan_records (sha256);");

logger.info({ dbPath }, "SQLite inicializado (anti-duplicado pHash + scans)");
