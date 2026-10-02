// Helpers de la capa de comprobantes (doc 04). pHash/PDF son utilidades puras; dedup y rate-limit
// usan el store local del gate (anti-duplicado centralizado).

import { spawn } from "node:child_process";
import sharp from "sharp";
import { RECEIPT_GATE_CONFIG as C } from "./config.js";
import { listPhashesBySubject, rememberPhash as dbRememberPhash } from "../db/phash.js";

// ── PDF → PNG (primera página) en sandbox vía poppler (pdftoppm) ──────────────
// Requiere poppler-utils en el sistema. Timeout y sin shell. Si falta, lanza error
// (el gate lo reporta como `failed`/sanitize) → en dev sin poppler, usar imágenes.
export async function renderPdfFirstPageToPng(
  pdf: Buffer,
  dpi = C.pdfRenderDpi,
  timeoutMs = C.sandboxTimeoutMs,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const proc = spawn("pdftoppm", ["-png", "-f", "1", "-l", "1", "-r", String(dpi)], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("pdf_render_timeout"));
    }, timeoutMs);

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || chunks.length === 0) {
        reject(new Error("pdf_render_failed: " + Buffer.concat(errChunks).toString().slice(0, 200)));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
    proc.stdin.write(pdf);
    proc.stdin.end();
  });
}

// ── Perceptual hash (dHash 64-bit) ───────────────────────────────────────────
export async function perceptualHash(img: Buffer): Promise<string> {
  const w = 9;
  const h = 8;
  const raw = await sharp(img).greyscale().resize(w, h, { fit: "fill" }).raw().toBuffer();
  let bits = "";
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w - 1; col++) {
      const left = raw[row * w + col] ?? 0;
      const right = raw[row * w + col + 1] ?? 0;
      bits += left < right ? "1" : "0";
    }
  }
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

export function hammingDistanceHex(a: string, b: string): number {
  if (a.length !== b.length) return Number.MAX_SAFE_INTEGER;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i] ?? "0", 16) ^ parseInt(b[i] ?? "0", 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

// ── Clasificador semántico ───────────────────────────────────────────────────

/**
 * Clasificador "¿parece comprobante?". STUB: devuelve confianza 1 (no bloquea). El juez final
 * del comprobante es el PAM (forense/OCR). Punto de integración futuro si se quiere un filtro
 * barato acá (doc 04 capa 3).
 */
export async function looksLikeReceipt(_img: Buffer): Promise<{ confidence: number }> {
  return { confidence: 1 };
}

// ── Anti-duplicado (pHash por subject) ───────────────────────────────────────

/**
 * Anti-duplicado por subject. **Solo `sha256` exacto bloquea** (auto-reject); el pHash es una
 * señal NO bloqueante.
 *
 * Historia (issue #220 / QA 2026-07-21): el pHash NO puede distinguir dos transferencias
 * DISTINTAS que comparten el mismo template de banco (misma app, mismo layout). Dos envíos reales
 * de Brubank del mismo usuario dan Hamming 0–1 aunque el monto/fecha/código difieran — bajar el
 * umbral no las separa. Peor: el dedup corre ANTES del OCR, así que un match por pHash cortaba el
 * pipeline y PAM recibía extracción vacía (conf=0). La desambiguación real por monto/fecha/COELSA
 * es competencia de PAM (GATE no decide dinero), así que GATE dejó de auto-rechazar por similitud.
 *
 * - **`sha256` exacto** (bytes idénticos del JPEG limpio) → duplicado (resend literal) → auto-reject.
 * - **pHash cercano** (Hamming ≤ `threshold`) → NO rechaza; se devuelve como señal `phash` para log
 *   y para que PAM/ops la consideren en revisión manual si quieren. El pipeline sigue al OCR.
 */
export type DuplicateMatch =
  | { duplicate: false }
  | {
      duplicate: true;
      via: "sha256" | "phash";
      priorPhash: string;
      priorSha256: string | null;
      hamming: number | null;
    };

/**
 * Devuelve el match del subject:
 * - `via: "sha256"` si hay bytes idénticos en el historial (revisa TODO el historial primero —
 *   el exacto siempre gana sobre cualquier similitud pHash).
 * - `via: "phash"` si NO hay exacto pero el más cercano tiene Hamming ≤ `threshold` (señal, no reject).
 * - `{ duplicate: false }` si no hay exacto ni cercano.
 *
 * La decisión de rechazar (solo `sha256`) vive en `receipt-gate.ts`.
 */
export async function findDuplicateForSubject(
  subjectId: string,
  phash: string,
  sha256: string,
  threshold: number,
): Promise<DuplicateMatch> {
  const sinceIso =
    C.phashTtlDays > 0
      ? new Date(Date.now() - C.phashTtlDays * 24 * 60 * 60 * 1000).toISOString()
      : undefined;
  const previos = listPhashesBySubject(subjectId, { limit: C.phashHistoryLimit, sinceIso });

  // 1) sha256 exacto gana siempre → recorrer TODO el historial antes de mirar similitud.
  const exact = previos.find((p) => p.sha256 && p.sha256 === sha256);
  if (exact) {
    return {
      duplicate: true,
      via: "sha256",
      priorPhash: exact.phash,
      priorSha256: exact.sha256,
      hamming: hammingDistanceHex(exact.phash, phash),
    };
  }

  // 2) pHash más cercano (señal no bloqueante).
  let nearest: { phash: string; sha256: string | null; hamming: number } | null = null;
  for (const p of previos) {
    const hamming = hammingDistanceHex(p.phash, phash);
    if (nearest === null || hamming < nearest.hamming) {
      nearest = { phash: p.phash, sha256: p.sha256 ?? null, hamming };
    }
  }
  if (nearest && nearest.hamming <= threshold) {
    return {
      duplicate: true,
      via: "phash",
      priorPhash: nearest.phash,
      priorSha256: nearest.sha256,
      hamming: nearest.hamming,
    };
  }
  return { duplicate: false };
}

/** `true` solo si hay resend EXACTO (sha256). La similitud pHash NO cuenta como duplicado. */
export async function isDuplicateForSubject(
  subjectId: string,
  phash: string,
  sha256: string,
  threshold: number,
): Promise<boolean> {
  const hit = await findDuplicateForSubject(subjectId, phash, sha256, threshold);
  return hit.duplicate && hit.via === "sha256";
}

/**
 * Persiste el pHash + sha256 del comprobante REALMENTE aceptado (gate + forense).
 * Llamar solo cuando el pipeline completo (`processScan`) decide `accepted` — nunca antes
 * (ver comentario en `db/phash.ts`).
 */
export async function rememberPhash(subjectId: string, phash: string, sha256: string): Promise<void> {
  dbRememberPhash(subjectId, phash, sha256);
}

// ── Rate limit por subject (ventana deslizante, en memoria del proceso) ──────
// Dos buckets independientes: "attempts" cuenta TODA entrada al pipeline (anti-flood barato,
// al inicio); "accepted" cuenta solo los comprobantes que llegan a la Capa 4 (anti-abuso fino).
const buckets: Record<string, Map<string, number[]>> = {
  attempts: new Map(),
  accepted: new Map(),
};

function slidingAllow(bucket: string, key: string, max: number, windowMs: number): boolean {
  const map = buckets[bucket] ?? (buckets[bucket] = new Map<string, number[]>());
  const now = Date.now();
  const fresh = (map.get(key) ?? []).filter((t) => now - t < windowMs);
  if (fresh.length >= max) {
    map.set(key, fresh);
    return false;
  }
  fresh.push(now);
  map.set(key, fresh);
  return true;
}

/** Cuota de comprobantes ACEPTados por subject (Capa 4). */
export async function allowRate(subjectId: string, max: number, windowMs: number): Promise<boolean> {
  return slidingAllow("accepted", subjectId, max, windowMs);
}

/** Cuota de INTENTOS por subject (inicio del pipeline, cuenta también los rechazos). */
export async function allowAttempt(subjectId: string, max: number, windowMs: number): Promise<boolean> {
  return slidingAllow("attempts", subjectId, max, windowMs);
}

/** Limpia las ventanas de rate-limit (todas o por subject). Lo usa el harness de testeo. */
export function resetRateLimits(subjectId?: string): void {
  for (const map of Object.values(buckets)) {
    if (subjectId) map.delete(subjectId);
    else map.clear();
  }
}
