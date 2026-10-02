/**
 * Reintentos para errores transitorios de proveedores OCR (Anthropic 529 Overloaded, 429, etc.).
 * Antes de caer al siguiente proveedor de la chain, reintenta el mismo con backoff corto.
 */

export function isTransientAiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b(529|429|503)\b/.test(msg) ||
    /overloaded/i.test(msg) ||
    /rate.?limit/i.test(msg) ||
    /timeout|aborted|ECONNRESET|ETIMEDOUT|fetch failed/i.test(msg)
  );
}

export type AiRetryLog = (msg: string, meta?: Record<string, unknown>) => void;

export async function withAiRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: { attempts?: number; baseDelayMs?: number; log?: AiRetryLog },
): Promise<T> {
  const attempts = opts?.attempts ?? 3;
  const baseDelayMs = opts?.baseDelayMs ?? 800;
  let last: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const retryable = isTransientAiError(e) && i < attempts;
      if (!retryable) throw e;
      const delayMs = baseDelayMs * i;
      const errMsg = e instanceof Error ? e.message : String(e);
      opts?.log?.(`forensic: retry ${label} ${i}/${attempts}`, { err: errMsg.slice(0, 160), delayMs });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw last instanceof Error ? last : new Error(String(last));
}
