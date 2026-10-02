// Wrapper de escaneo antivirus (Capa 0, doc 04). Usa `clamscan` contra clamd (preferido)
// o el binario clamscan. Escanea un Buffer en memoria vía stream — no toca disco.
//
// `clamscan` se importa de forma PEREZOSA: si ClamAV está deshabilitado (dev/Windows) el
// módulo nativo/daemon no hace falta y no se carga.

import { Readable } from "node:stream";
import { RECEIPT_GATE_CONFIG as C } from "./config.js";
import { logger } from "../lib/logger.js";

export type ClamResult =
  | { ok: true; clean: true }
  | { ok: true; clean: false; viruses: string[] }
  | { ok: false; error: string }; // no se pudo escanear

let _clam: Promise<unknown> | null = null;

async function getClam(): Promise<{ scanStream: (s: Readable) => Promise<{ isInfected: boolean; viruses?: string[] }> }> {
  if (!_clam) {
    _clam = (async () => {
      const mod = await import("clamscan");
      const NodeClam = (mod as { default: new () => { init: (opts: unknown) => Promise<unknown> } }).default;
      return new NodeClam().init({
        removeInfected: C.clamav.removeInfected,
        clamdscan: {
          socket: C.clamav.clamdscan.socket,
          host: C.clamav.clamdscan.host,
          port: C.clamav.clamdscan.port,
          timeout: C.clamav.clamdscan.timeout,
          localFallback: C.clamav.clamdscan.localFallback,
        },
        clamscan: { path: C.clamav.clamscan.path },
        preference: "clamdscan",
      });
    })();
  }
  return _clam as Promise<{ scanStream: (s: Readable) => Promise<{ isInfected: boolean; viruses?: string[] }> }>;
}

/**
 * Escanea un buffer. Tres resultados: limpio / infectado / no-escaneable (clamd caído,
 * timeout). El caller decide según `failClosed`. Si ClamAV está deshabilitado → limpio.
 */
export async function scanBuffer(buf: Buffer): Promise<ClamResult> {
  if (!C.clamav.enabled) return { ok: true, clean: true };

  try {
    const clam = await getClam();
    const stream = Readable.from(buf);
    const { isInfected, viruses } = await clam.scanStream(stream);
    if (isInfected) return { ok: true, clean: false, viruses: viruses ?? [] };
    return { ok: true, clean: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : "clamav_unavailable";
    logger.warn({ error }, "receipt-gate: ClamAV no disponible");
    return { ok: false, error };
  }
}

// ── Healthcheck cacheado ─────────────────────────────────────────────────────
// El /health necesita saber si clamd está vivo aunque no haya tráfico de comprobantes.
// Pingueamos con un buffer mínimo y cacheamos el resultado; el refresco es lazy
// (fire-and-forget) para no bloquear. Si ClamAV está OFF (dev/Windows), reportamos healthy.
export interface ClamHealth {
  enabled: boolean;
  ok: boolean;
  error: string | null;
  checkedAt: string | null;
}

const HEALTH_TTL_MS = 30_000;
const PING = Buffer.from([0xff, 0xd8, 0xff, 0xd9]); // JPEG mínimo (SOI+EOI), limpio
let _health: ClamHealth & { _ts: number } = {
  enabled: C.clamav.enabled,
  ok: !C.clamav.enabled,
  error: null,
  checkedAt: null,
  _ts: 0,
};

async function refreshHealth(): Promise<void> {
  const res = await scanBuffer(PING);
  _health = {
    enabled: C.clamav.enabled,
    ok: res.ok,
    error: res.ok ? null : res.error,
    checkedAt: new Date().toISOString(),
    _ts: Date.now(),
  };
}

export function clamavHealthCached(): ClamHealth {
  if (C.clamav.enabled && Date.now() - _health._ts > HEALTH_TTL_MS) {
    void refreshHealth(); // no bloqueamos: devolvemos lo último conocido y refrescamos en background
  }
  const { enabled, ok, error, checkedAt } = _health;
  return { enabled, ok, error, checkedAt };
}
