// Configuración central de la capa de seguridad de comprobantes (doc 04).
// Portado del CRM al servicio aislado: mismos umbrales para mantener paridad de comportamiento.

import { env } from "../config/env.js";

export const RECEIPT_GATE_CONFIG = {
  // ── Capa 0: ClamAV ────────────────────────────────────────
  clamav: {
    enabled: env.RECEIPT_CLAMAV_ENABLED,
    // fail-closed: si ClamAV no responde, NO se asume limpio → se rechaza.
    failClosed: env.RECEIPT_CLAMAV_FAIL_CLOSED,
    clamdscan: {
      // En topología Docker (sidecar) clamd se alcanza por TCP (CLAMD_HOST:CLAMD_PORT).
      // `clamscan` prioriza el socket si está seteado, así que NO forzamos el socket
      // por defecto cuando hay CLAMD_HOST: solo lo usamos si se pide explícito
      // (bare-metal/local). Evita que el gate intente el socket inexistente y falle.
      socket: process.env.CLAMD_SOCKET || (process.env.CLAMD_HOST ? undefined : "/var/run/clamav/clamd.ctl"),
      host: process.env.CLAMD_HOST || "127.0.0.1",
      port: Number(process.env.CLAMD_PORT || 3310),
      timeout: 20_000,
      localFallback: true,
    },
    clamscan: {
      path: process.env.CLAMSCAN_PATH || "/usr/bin/clamscan",
    },
    removeInfected: false, // operamos sobre buffers en memoria
  },

  // ── Capa 1: validación ────────────────────────────────────
  // Captura universal: cualquier formato de imagen razonable que sharp/libheif
  // pueda re-encodear a JPEG limpio, más PDF (rasterizado por poppler). Todo lo
  // que entra se normaliza a JPEG en la Capa 2, así que sumar formatos no agranda
  // la superficie de salida (siempre sale image/jpeg).
  allowedMime: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "image/avif",
    "image/gif",
    "image/tiff",
    "application/pdf",
  ] as const,
  minBytes: 3 * 1024, // 3 KB
  maxBytes: 10 * 1024 * 1024, // 10 MB (paridad con el PAM)
  maxMegapixels: 50, // anti "image bomb"
  maxSideInput: 12_000,

  // ── Capa 2: sanitización ──────────────────────────────────
  reencodeQuality: 85,
  maxSideOutput: 2000,
  pdfRenderDpi: 200,
  sandboxTimeoutMs: 20_000,

  // ── Capa 3: filtro semántico ──────────────────────────────
  receiptMinConfidence: 0.6,
  // Umbral de Hamming SOLO para LOG (no bloquea). El dedup por pHash dejó de auto-rechazar:
  // issue #220 (QA 2026-07-21) probó que dos transferencias DISTINTAS con el mismo template de
  // banco (dos envíos Brubank del mismo user) dan Hamming ~0 aunque monto/fecha/código difieran →
  // bajar el umbral (5→2→1) nunca las separa, y el corte pre-OCR mataba la lectura (conf=0). Ahora
  // solo `sha256` exacto auto-rechaza (resend literal); la similitud pHash ≤ este umbral se loguea
  // como señal `gate_phash_similar` para PAM/ops, pero el pipeline sigue al OCR. PAM desambigua por
  // monto/fecha/COELSA/código (GATE no decide dinero).
  phashSimilarLogThreshold: 3,
  // Anti-duplicado acotado: comparar solo contra los N pHash más recientes del subject y, si
  // `phashTtlDays > 0`, ignorar los más viejos que eso (operaciones ya cerradas hace tiempo).
  phashHistoryLimit: 200,
  phashTtlDays: 30,

  // ── Capa 4: rate limit ────────────────────────────────────
  maxReceiptsPerWindow: 5,
  rateWindowMs: 10 * 60 * 1000, // 10 min
  // Doble límite: contador de INTENTOS barato al inicio del pipeline (cuenta TODO, incluso
  // rechazos) para cortar floods ANTES del trabajo caro (ClamAV/sharp/poppler). Umbral más alto
  // que el de aceptados para no penalizar reintentos legítimos (foto equivocada → corrige).
  maxAttemptsPerWindow: 15,
};

export type ReceiptGateConfig = typeof RECEIPT_GATE_CONFIG;
