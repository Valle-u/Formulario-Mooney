import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

const root = resolve(env.RECEIPT_STORAGE_PATH);
mkdirSync(root, { recursive: true });

/**
 * Almacén RETENIDO para la base que aprende (PTMUAT-414 c). A diferencia de `root` (efímero,
 * lo purga cleanupExpiredReceipts al vencer el TTL), estas copias se conservan como material de
 * evaluación/entrenamiento del OCR. Contienen PII → nunca a git; viven en un volumen del host.
 *
 * mkdir LAZY y TOLERANTE a fallos: la eval es no-crítica; un problema de permisos/ruta NO debe
 * crashear el servicio ni tumbar un /scan. Si no se puede escribir, se loguea y se saltea.
 */
const evalRoot = resolve(env.RECEIPT_EVAL_STORAGE_PATH);
let evalRootReady = false;
function ensureEvalRoot(): boolean {
  if (evalRootReady) return true;
  try {
    mkdirSync(evalRoot, { recursive: true });
    evalRootReady = true;
    return true;
  } catch (e) {
    logger.warn({ evalRoot, err: e instanceof Error ? e.message : String(e) }, "eval-store: no se pudo crear (se saltea la retención)");
    return false;
  }
}

/** Guarda una copia retenida del JPEG limpio para eval del OCR. Devuelve el path relativo o null si falló. */
export function saveEvalReceipt(scanId: string, jpeg: Buffer): string | null {
  if (!ensureEvalRoot()) return null;
  try {
    const rel = `${scanId}.jpg`;
    writeFileSync(join(evalRoot, rel), jpeg);
    return rel;
  } catch (e) {
    logger.warn({ scanId, err: e instanceof Error ? e.message : String(e) }, "eval-store: fallo al guardar copia (no crítico)");
    return null;
  }
}

/** Carga una copia retenida de eval, o null si no existe. */
export function loadEvalReceipt(scanId: string): Buffer | null {
  const abs = join(evalRoot, `${scanId}.jpg`);
  if (!existsSync(abs)) return null;
  return readFileSync(abs);
}

/** ¿Existe la copia retenida de eval para este scan? */
export function evalReceiptExists(scanId: string): boolean {
  return existsSync(join(evalRoot, `${scanId}.jpg`));
}

export function saveCleanReceipt(scanId: string, jpeg: Buffer): string {
  const rel = `${scanId}.jpg`;
  const abs = join(root, rel);
  writeFileSync(abs, jpeg);
  return rel;
}

export function loadCleanReceipt(storagePath: string): Buffer | null {
  const abs = join(root, storagePath);
  if (!existsSync(abs)) return null;
  return readFileSync(abs);
}

/** Borra el JPEG limpio del disco. No falla si ya no existe. */
export function deleteCleanReceipt(storagePath: string): void {
  rmSync(join(root, storagePath), { force: true });
}
