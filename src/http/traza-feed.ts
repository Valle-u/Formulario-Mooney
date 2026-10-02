/**
 * `GET /traza/v1/feed` — enumerar los scans del período para la instancia TRAZA
 * (`MSG-TRAZA-20260908-3`). Cierra el hueco entre `/stats` (contadores en memoria, sin ids) y
 * `/scans/:id` (exige saber el id de antemano).
 *
 * Tres límites del gate que el feed NO puede sortear y por eso van declarados en la respuesta, no
 * en un comentario que nadie lee:
 *
 *  1. **Sólo hay aceptados.** `scan_records` se escribe en un único lugar: la rama aceptada de
 *     `processScan`. Un rechazo (`too_small`, `bad_type`, `duplicate`, `not_a_receipt`…) no deja
 *     fila. Así que `veredicto` es constante y el feed no sirve para auditar rechazos: eso vive
 *     agregado en `gate.stats` y en la traza de disco, sin ids.
 *  2. **El horizonte es la retención.** Las filas se purgan a las `RECEIPT_VIEW_TTL_HOURS`, así que
 *     un `since` más viejo devuelve vacío por purga, no por ausencia de actividad. Sin declararlo,
 *     un consumidor de trazabilidad lee ese vacío como "no pasó nada".
 *  3. **`duplicate` acá es sólo sha256.** La señal completa (`duplicate_global`, con corroboración
 *     de contenido) recorre la ventana entera por ítem: en una página de 500 sería del orden de
 *     500×N parseos de JSON. El feed usa el índice `idx_scan_sha256`, que es O(1) por ítem; la
 *     señal completa sigue estando en `GET /scans/:id`.
 */

import { detectBank } from "../forensic/bank-detect.js";
import { validateExtraction, receiptAgeHours } from "../forensic/validate.js";
import type { ReceiptExtraction } from "../forensic/types.js";
import { findScansForFeed, findScansBySha256, type ScanRecord } from "../db/scans.js";
import { getStats } from "../stats.js";
import { env } from "../config/env.js";

export const TRAZA_ITEM_TYPES = ["gate.scan", "gate.stats"] as const;
export type TrazaItemType = (typeof TRAZA_ITEM_TYPES)[number];

export const FEED_LIMIT_DEFAULT = 100;
export const FEED_LIMIT_MAX = 500;

export interface TrazaItem {
  type: TrazaItemType;
  id: string;
  ts: string;
  telefono: string | null;
  payload: Record<string, unknown>;
}

export interface TrazaFeed {
  program: "gate";
  generatedAt: string;
  cursor: string | null;
  hasMore: boolean;
  items: TrazaItem[];
  /** Aditivo: el piso de retención. Sin esto, un `since` viejo se lee como "no hubo actividad". */
  retencion: {
    horas: number;
    desde_utc: string;
    nota: string;
  };
}

/**
 * El contrato pide E.164 o `null`. En la base hay un tercer valor que no es ninguno de los dos:
 * **cadena vacía** (el `phone` es opcional en `POST /scan` y algunos clientes mandan `""`). Pasarlo
 * crudo le entregaría a TRAZA un `""` que no matchea su validación. Normalizamos a `null`.
 *
 * No adivinamos código de país: un número sin `+` no se "arregla" prefijando algo, porque prefijar
 * mal inventa un teléfono de otra persona. Lo que no es E.164 verificable sale `null`.
 */
export function telefonoE164(raw: string | null): string | null {
  if (!raw) return null;
  const limpio = raw.replace(/[\s()-]/g, "");
  return /^\+[1-9]\d{6,14}$/.test(limpio) ? limpio : null;
}

/** Cursor opaco y estable: `(created_at, id)`, el mismo orden total que usa la consulta. */
export function encodeCursor(rec: ScanRecord): string {
  return Buffer.from(`${rec.created_at}|${rec.id}`, "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const sep = raw.indexOf("|");
    if (sep <= 0) return null;
    const createdAt = raw.slice(0, sep);
    const id = raw.slice(sep + 1);
    return createdAt && id ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

function scanItem(rec: ScanRecord): TrazaItem {
  const extraction = rec.extraction_json
    ? (JSON.parse(rec.extraction_json) as ReceiptExtraction)
    : null;
  const bank = extraction ? detectBank(extraction.entidad_emisora) : null;
  const validation = extraction
    ? (() => {
        const v = validateExtraction(extraction);
        return { is_valid: v.isValid, alerts: v.alerts };
      })()
    : null;

  // Reuso por sha256 exacto vía índice (ver nota 3 del encabezado).
  const mismos = rec.sha256 ? findScansBySha256(rec.sha256, rec.id) : [];
  const primero = mismos[0];

  return {
    type: "gate.scan",
    id: `gate.scan:${rec.id}`,
    ts: rec.created_at,
    telefono: telefonoE164(rec.phone),
    payload: {
      scan_id: rec.id,
      // Constante por construcción: la tabla sólo tiene aceptados (nota 1 del encabezado).
      veredicto: "accepted",
      subject_id: rec.subject_id,
      channel: rec.channel,
      phash: rec.phash,
      sha256: rec.sha256,
      bank: {
        canonical: bank?.canonical ?? rec.bank_canonical,
        kind: bank?.kind ?? null,
        known: bank ? bank.known : rec.bank_known === 1,
      },
      extraction,
      validation,
      receipt_age_hours: receiptAgeHours(extraction?.fecha ?? null),
      duplicate: {
        alcance: "sha256_exacto",
        seen: mismos.length > 0,
        count: mismos.length,
        cross_user: mismos.some((m) => m.subject_id !== rec.subject_id),
        first_scan_id: primero ? primero.id : null,
        nota: "señal completa (pHash + contenido) en GET /scans/:id → duplicate_global",
      },
      forensic_status: rec.forensic_status,
      created_at: rec.created_at,
      expires_at: rec.expires_at,
    },
  };
}

function statsItem(generatedAt: string): TrazaItem | null {
  const s = getStats();
  // "Si no hay dato, omitir": ventana sin un solo evento → no inventamos un ítem de ceros.
  if (s.aceptados === 0 && s.rechazados === 0 && s.fallas === 0) return null;
  return {
    type: "gate.stats",
    id: `gate.stats:${s.ventanaMin}m`,
    ts: generatedAt,
    telefono: null,
    payload: {
      ventana_min: s.ventanaMin,
      aceptados: s.aceptados,
      rechazados: s.rechazados,
      rechazados_por_reason: s.rechazadosPorReason,
      fallas: s.fallas,
      fallas_por_step: s.fallasPorStep,
      // Declarado porque lo pidieron explícito (acción 3 del pedido) y porque cambia cómo se lee:
      // un cero acá puede ser "no pasó nada" o "el contenedor arrancó hace un rato".
      persistencia: "memoria",
      reinicia_con_el_proceso: true,
      acumulable: false,
      nota:
        "ventana deslizante en memoria del proceso, sin ids y sin histórico: no se puede sumar " +
        "entre pulls ni reconstruir hacia atrás. Los rechazos SÓLO existen acá (agregados).",
    },
  };
}

export function buildTrazaFeed(params: {
  sinceIso?: string;
  cursor?: string;
  types?: TrazaItemType[];
  limit?: number;
}): TrazaFeed {
  const generatedAt = new Date().toISOString();
  const types = params.types && params.types.length > 0 ? params.types : [...TRAZA_ITEM_TYPES];
  const limit = Math.min(Math.max(1, params.limit ?? FEED_LIMIT_DEFAULT), FEED_LIMIT_MAX);
  const after = params.cursor ? decodeCursor(params.cursor) : null;

  const items: TrazaItem[] = [];
  let cursor: string | null = null;
  let hasMore = false;

  if (types.includes("gate.scan")) {
    // limit+1 para saber si hay página siguiente sin un COUNT aparte.
    const filas = findScansForFeed({
      sinceIso: params.sinceIso,
      afterCreatedAt: after?.createdAt,
      afterId: after?.id,
      limit: limit + 1,
    });
    hasMore = filas.length > limit;
    const pagina = hasMore ? filas.slice(0, limit) : filas;
    for (const rec of pagina) items.push(scanItem(rec));
    const ultimo = pagina[pagina.length - 1];
    if (ultimo) cursor = encodeCursor(ultimo);
  }

  // El agregado va sólo en la primera página: repetirlo en cada una lo haría contar de más si el
  // consumidor suma páginas.
  if (types.includes("gate.stats") && !after) {
    const st = statsItem(generatedAt);
    if (st) items.push(st);
  }

  const horas = env.RECEIPT_VIEW_TTL_HOURS;
  return {
    program: "gate",
    generatedAt,
    cursor,
    hasMore,
    items,
    retencion: {
      horas,
      desde_utc: new Date(Date.now() - horas * 3600 * 1000).toISOString(),
      nota:
        `los scans se purgan a las ${horas} h, así que un 'since' anterior a 'desde_utc' devuelve ` +
        "vacío por purga y NO por inactividad. El feed lista sólo comprobantes ACEPTADOS: los " +
        "rechazos nunca se escriben como fila (agregados en gate.stats).",
    },
  };
}
