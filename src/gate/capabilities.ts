import { spawn } from "node:child_process";
import sharp from "sharp";
import { logger } from "../lib/logger.js";
import { RECEIPT_GATE_CONFIG as C } from "./config.js";

/**
 * Capacidades del host para la Capa 1. Se loguea al arranque para detectar temprano un host mal
 * aprovisionado:
 *  - **libheif** (vía sharp): si aceptamos HEIC/HEIF pero el host no lo soporta, esos comprobantes
 *    fallarían en sanitización. Avisamos para instalar `libheif` o sacar HEIC de `allowedMime`.
 *  - **poppler** (`pdftoppm`): necesario para rasterizar PDFs. Sin él, los PDF caen en `failed`.
 *  - **ClamAV**: estado del flag; el healthcheck en vivo vive en `clamav.ts`.
 */
export interface ReceiptGateCapabilities {
  heif: boolean;
  avif: boolean;
  gif: boolean;
  tiff: boolean;
  poppler: boolean;
  clamavEnabled: boolean;
}

function popplerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const proc = spawn("pdftoppm", ["-v"]);
      proc.on("error", () => resolve(false));
      proc.on("close", () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

export async function detectCapabilities(): Promise<ReceiptGateCapabilities> {
  const formats = sharp.format as unknown as Record<string, { input?: { buffer?: boolean } } | undefined>;
  const supports = (name: string): boolean => Boolean(formats[name]?.input?.buffer);
  // AVIF se decodifica vía el contenedor HEIF en sharp; lo reportamos junto a heif.
  const heif = supports("heif");
  const poppler = await popplerAvailable();
  return {
    heif,
    avif: heif,
    gif: supports("gif"),
    tiff: supports("tiff"),
    poppler,
    clamavEnabled: C.clamav.enabled,
  };
}

/** Loguea capacidades al arranque y advierte si falta algo que el catálogo de tipos sí acepta. */
export async function logCapabilities(): Promise<void> {
  const caps = await detectCapabilities();
  logger.info(caps, "receipt-gate: capacidades del host");

  const aceptaHeic = (C.allowedMime as readonly string[]).some((m) => m.includes("heif") || m.includes("heic"));
  if (aceptaHeic && !caps.heif) {
    logger.warn(
      "receipt-gate: se aceptan HEIC/HEIF pero este sharp NO trae libheif → esos comprobantes " +
        "fallarían. Instalá libheif en el host o quitá image/heic|heif de allowedMime.",
    );
  }
  const aceptaAvif = (C.allowedMime as readonly string[]).includes("image/avif");
  if (aceptaAvif && !caps.avif) {
    logger.warn(
      "receipt-gate: se acepta AVIF pero este sharp NO lo decodifica → esos comprobantes fallarían. " +
        "Instalá libheif/libaom en el host o quitá image/avif de allowedMime.",
    );
  }
  const aceptaPdf = (C.allowedMime as readonly string[]).includes("application/pdf");
  if (aceptaPdf && !caps.poppler) {
    logger.warn(
      "receipt-gate: se aceptan PDFs pero `pdftoppm` (poppler-utils) NO está disponible → los PDF " +
        "caerán en failed:sanitize. Instalá poppler-utils en el host.",
    );
  }
}
