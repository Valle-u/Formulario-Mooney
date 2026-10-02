import { db } from "./index.js";
import type { ReceiptExtraction } from "../forensic/types.js";

export interface ScanRecord {
  id: string;
  subject_id: string;
  phone: string | null;
  channel: string | null;
  phash: string;
  sha256: string | null;
  bank_canonical: string | null;
  bank_known: number;
  storage_path: string;
  extraction_json: string | null;
  alerts_json: string | null;
  forensic_status: string;
  created_at: string;
  expires_at: string;
}

export function insertScan(params: {
  scanId: string;
  subjectId: string;
  phone?: string;
  channel?: string;
  phash: string;
  sha256: string;
  bankCanonical: string | null;
  bankKnown: boolean;
  storagePath: string;
  extraction: ReceiptExtraction | null;
  alerts: string[];
  forensicStatus: string;
  expiresAt: string;
}): string {
  db.prepare(
    `INSERT INTO scan_records
      (id, subject_id, phone, channel, phash, sha256, bank_canonical, bank_known, storage_path, extraction_json, alerts_json, forensic_status, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    params.scanId,
    params.subjectId,
    params.phone ?? null,
    params.channel ?? null,
    params.phash,
    params.sha256,
    params.bankCanonical,
    params.bankKnown ? 1 : 0,
    params.storagePath,
    params.extraction ? JSON.stringify(params.extraction) : null,
    params.alerts.length ? JSON.stringify(params.alerts) : null,
    params.forensicStatus,
    new Date().toISOString(),
    params.expiresAt,
  );
  return params.scanId;
}

/** ¿Existe este SHA-256 en otra operación? Señal de reuso global (anti-fraude para el PAM). */
export function findScansBySha256(sha256: string, excludeId?: string): ScanRecord[] {
  const rows = db
    .prepare("SELECT * FROM scan_records WHERE sha256 = ? ORDER BY created_at ASC")
    .all(sha256) as unknown as ScanRecord[];
  return excludeId ? rows.filter((r) => r.id !== excludeId) : rows;
}

/**
 * Scans recientes (cross-subject) para el dedup GLOBAL por pHash + contenido (#258 / CROSS-X01b).
 * A diferencia de `findScansBySha256` (índice exacto), esto trae candidatos para comparar por
 * distancia de Hamming en JS, acotado por ventana temporal (`sinceIso`, TTL del anti-duplicado)
 * y `limit` para no crecer O(n). Orden ASC → el primero es el más antiguo (first_scan_id estable).
 */
export function findRecentScans(opts: { sinceIso?: string; limit?: number; excludeId?: string }): ScanRecord[] {
  const limit = Math.max(1, opts.limit ?? 10_000);
  const rows = opts.sinceIso
    ? (db
        .prepare("SELECT * FROM scan_records WHERE created_at >= ? ORDER BY created_at ASC LIMIT ?")
        .all(opts.sinceIso, limit) as unknown as ScanRecord[])
    : (db
        .prepare("SELECT * FROM scan_records ORDER BY created_at ASC LIMIT ?")
        .all(limit) as unknown as ScanRecord[]);
  return opts.excludeId ? rows.filter((r) => r.id !== opts.excludeId) : rows;
}

/**
 * Página de scans para `GET /traza/v1/feed` (`MSG-TRAZA-20260908-3`). Orden total y estable
 * `(created_at, id)`: `created_at` solo no alcanza como cursor porque dos scans del mismo
 * milisegundo se pisarían y la paginación saltearía uno o lo repetiría para siempre.
 *
 * OJO con lo que esto NO puede traer: la tabla se puebla en un único lugar (`insertScan`, rama
 * aceptada de `processScan`), así que acá NO hay rechazos ni fallas — no están "filtrados", nunca
 * se escribieron. Y las filas se purgan a las `RECEIPT_VIEW_TTL_HOURS`, así que el feed no puede
 * mirar más atrás que eso por más que `since` pida el año pasado.
 */
export function findScansForFeed(opts: {
  sinceIso?: string;
  afterCreatedAt?: string;
  afterId?: string;
  limit: number;
}): ScanRecord[] {
  const cond: string[] = [];
  const args: unknown[] = [];
  if (opts.sinceIso) {
    cond.push("created_at >= ?");
    args.push(opts.sinceIso);
  }
  if (opts.afterCreatedAt && opts.afterId) {
    cond.push("(created_at > ? OR (created_at = ? AND id > ?))");
    args.push(opts.afterCreatedAt, opts.afterCreatedAt, opts.afterId);
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  args.push(Math.max(1, opts.limit));
  return db
    .prepare(`SELECT * FROM scan_records ${where} ORDER BY created_at ASC, id ASC LIMIT ?`)
    .all(...(args as never[])) as unknown as ScanRecord[];
}

export function getScanById(id: string): ScanRecord | null {
  const row = db.prepare("SELECT * FROM scan_records WHERE id = ?").get(id) as ScanRecord | undefined;
  return row ?? null;
}

/** Operaciones ya expiradas (expires_at < ahora). Para el job de limpieza. */
export function findExpiredScans(nowIso: string): ScanRecord[] {
  return db
    .prepare("SELECT * FROM scan_records WHERE expires_at < ?")
    .all(nowIso) as unknown as ScanRecord[];
}

/** Borra registros por id. Devuelve cuántos. */
export function deleteScansByIds(ids: string[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const r = db.prepare(`DELETE FROM scan_records WHERE id IN (${placeholders})`).run(...ids);
  return Number(r.changes ?? 0);
}

export function countScans(subjectId?: string): number {
  if (subjectId) {
    const r = db
      .prepare("SELECT COUNT(*) AS n FROM scan_records WHERE subject_id = ?")
      .get(subjectId) as { n: number };
    return r.n;
  }
  const r = db.prepare("SELECT COUNT(*) AS n FROM scan_records").get() as { n: number };
  return r.n;
}

export function listScansBySubject(subjectId: string): ScanRecord[] {
  return db
    .prepare("SELECT * FROM scan_records WHERE subject_id = ? ORDER BY created_at DESC")
    .all(subjectId) as unknown as ScanRecord[];
}

export function listAllScans(): ScanRecord[] {
  return db
    .prepare("SELECT * FROM scan_records ORDER BY created_at DESC")
    .all() as unknown as ScanRecord[];
}

export function deleteScansBySubject(subjectId: string): number {
  const r = db.prepare("DELETE FROM scan_records WHERE subject_id = ?").run(subjectId);
  return Number(r.changes ?? 0);
}

export function deleteAllScans(): number {
  const r = db.prepare("DELETE FROM scan_records").run();
  return Number(r.changes ?? 0);
}

// ── Corte por fecha (ops) ────────────────────────────────────────────────────
// Wipe acotado a "todo lo anterior a X". Existe para no usar `--full` sobre una base que atiende
// plata real: entre el preview y el borrado puede entrar un scan legítimo, y `--full` se lo lleva.

export function countScansBefore(beforeIso: string): number {
  const r = db
    .prepare("SELECT COUNT(*) AS n FROM scan_records WHERE created_at < ?")
    .get(beforeIso) as { n: number };
  return r.n;
}

export function listScansBefore(beforeIso: string): ScanRecord[] {
  return db
    .prepare("SELECT * FROM scan_records WHERE created_at < ? ORDER BY created_at ASC")
    .all(beforeIso) as unknown as ScanRecord[];
}

export function deleteScansBefore(beforeIso: string): number {
  const r = db.prepare("DELETE FROM scan_records WHERE created_at < ?").run(beforeIso);
  return Number(r.changes ?? 0);
}
