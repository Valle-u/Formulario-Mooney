// Dedup GLOBAL (cross-subject) de comprobantes — señal anti-fraude para PAM (#258 / CROSS-X01b).
//
// GATE NO decide dinero: esto NO auto-rechaza. Enriquece `duplicate_global` en la respuesta de
// `/scan` con una señal robusta de REUSO de comprobante (incluido el reuso cross-user), que PAM
// consume para aplicar la consecuencia (rechazo cross-user) sin re-detectar imágenes por su cuenta.
//
// Política acordada con PAM (R1 MSG-GATE-20260723-3 / MSG-PAM-20260723-6):
//   `seen=true` cuando existe un scan PREVIO (cualquier subject) que matchea por:
//     (a) sha256 exacto  → reuso literal (mismos bytes del JPEG limpio), o
//     (b) pHash Hamming ≤ umbral  Y  corroboración de CONTENIDO (OCR):
//           coelsa_id igual (si ambos lo tienen), o
//           monto + fecha (hh:mm) + cuenta_receptora iguales.
//
// Por qué NO pHash "a secas": dos jugadores DISTINTOS del mismo banco (Brubank) comparten el
// template → pHash casi idéntico aunque la transferencia sea legítima y distinta (el gemelo
// cross-user de #220). La corroboración por contenido evita ese falso positivo: dos usuarios
// distintos difieren en monto/fecha/receptor; el MISMO comprobante reusado coincide en todo.

import { RECEIPT_GATE_CONFIG as C } from "./config.js";
import { env } from "../config/env.js";
import { hammingDistanceHex } from "./helpers.js";
import { findScansBySha256, findRecentScans, type ScanRecord } from "../db/scans.js";
import type { ReceiptExtraction } from "../forensic/types.js";

export interface DuplicateGlobal {
  /** ¿El mismo comprobante/operación ya se vio en otra solicitud? */
  seen: boolean;
  /**
   * Cómo matcheó:
   * - `sha256`: bytes idénticos del JPEG limpio (reuso literal).
   * - `content`: identidad de la operación por contenido, SIN depender de pHash (coelsa_id exacto,
   *   o monto+fecha+cuenta_receptora+cuenta_emisora). Cubre dos CAPTURAS distintas del mismo
   *   comprobante que pHash no agrupa (#402, MSG-PAM-20260727-3).
   * - `phash_content`: pHash cercano + contenido débil corroborado (monto+fecha+cuenta_receptora).
   */
  via: "sha256" | "content" | "phash_content" | null;
  /** El match previo pertenece a OTRO subject (reuso cross-user). PAM lo corrobora con su user_id. */
  cross_user: boolean;
  /** scan_id del match previo más antiguo (siempre presente si seen). PAM mapea a la solicitud previa. */
  first_scan_id: string | null;
  /** Cantidad de matches previos (sha256 + phash_content). */
  count: number;
  /** Campos que corroboraron el match (traza de auditoría para el motivo del rechazo en PAM). */
  match_fields: string[];
}

const EMPTY: DuplicateGlobal = {
  seen: false,
  via: null,
  cross_user: false,
  first_scan_id: null,
  count: 0,
  match_fields: [],
};

// Placeholders de OCR que NO son valor real (no deben corroborar un match).
const PLACEHOLDERS = new Set([
  "",
  "-",
  "--",
  "n/a",
  "na",
  "null",
  "none",
  "s/d",
  "sin dato",
  "sin datos",
  "desconocido",
  "unknown",
  "<unknown>",
]);

/** Texto normalizado para comparar (trim + colapsa espacios + minúsculas). null si vacío/placeholder. */
function normText(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim().replace(/\s+/g, " ");
  if (!t || PLACEHOLDERS.has(t.toLowerCase())) return null;
  return t.toLowerCase();
}

/** Identificador normalizado (coelsa_id): solo alfanumérico en mayúsculas. null si vacío/placeholder. */
function normId(v: string | null | undefined): string | null {
  if (v == null) return null;
  if (PLACEHOLDERS.has(v.trim().toLowerCase())) return null;
  const t = v.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return t.length ? t : null;
}

function extractionOf(rec: ScanRecord): ReceiptExtraction | null {
  if (!rec.extraction_json) return null;
  try {
    return JSON.parse(rec.extraction_json) as ReceiptExtraction;
  } catch {
    return null;
  }
}

/**
 * ¿La fecha OCR trae HORA REAL (hh:mm, distinta de 00:00)? Requisito del path por tupla (MSG-PAM-20260727-4):
 * PAM rechaza automático ante seen && cross_user, y sin hora la llave degrada de "mismo minuto" a
 * "mismo día" (167 pares de transferencias REALES distintas colisionan → rechazaría cobros legítimos).
 * Con hora al minuto la regla es limpia (0 FP sobre 353 transferencias reales). 00:00 = sin hora → degrada.
 */
function hasRealTime(v: string | null | undefined): boolean {
  if (!v) return false;
  const m = /(\d{1,2}):(\d{2})/.exec(v);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return false;
  if (h === 0 && min === 0) return false; // 00:00 = hora ausente/colapsada → no dispara la tupla
  return true;
}

/**
 * Corroboración FUERTE: identidad de la operación aunque la IMAGEN difiera (NO usa pHash).
 * - coelsa_id igual → identidad fuerte de la operación Coelsa. INCONDICIONAL (no es coincidencia).
 * - monto + fecha (con HORA REAL hh:mm) + cuenta_receptora + cuenta_emisora, todos iguales → mismo
 *   envío. Seguro contra el FP cross-user del mismo banco (emisora es única por jugador) Y contra el
 *   FP de "mismo día sin hora" (se exige hora real; ver hasRealTime + MSG-PAM-20260727-4).
 */
function strongContentMatch(a: ReceiptExtraction, b: ReceiptExtraction): string[] {
  const ca = normId(a.coelsa_id);
  const cb = normId(b.coelsa_id);
  if (ca && cb && ca === cb) return ["coelsa_id"]; // incondicional

  const montoMatch = a.monto != null && b.monto != null && a.monto === b.monto;
  const fa = normText(a.fecha);
  const fb = normText(b.fecha);
  const fechaMatch = fa != null && fb != null && fa === fb;
  const ra = normText(a.cuenta_receptora);
  const rb = normText(b.cuenta_receptora);
  const recMatch = ra != null && rb != null && ra === rb;
  const ea = normText(a.cuenta_emisora);
  const eb = normText(b.cuenta_emisora);
  const emiMatch = ea != null && eb != null && ea === eb;
  // La tupla SOLO dispara con hora real (no 00:00, no fecha sin hora) — condición de PAM para el auto-rechazo.
  if (montoMatch && fechaMatch && recMatch && emiMatch && hasRealTime(a.fecha))
    return ["monto", "fecha", "cuenta_receptora", "cuenta_emisora"];

  return [];
}

/**
 * Corroboración DÉBIL (requiere pHash cercano): coelsa_id, o monto + fecha + cuenta_receptora.
 * Es el comportamiento vigente (flag `RECEIPT_DEDUP_CONTENT_STRONG` OFF). El gate de pHash evita
 * el falso positivo de dos jugadores distintos que depositan el mismo monto a la cuenta del casino.
 */
function contentMatchFields(a: ReceiptExtraction, b: ReceiptExtraction): string[] {
  const ca = normId(a.coelsa_id);
  const cb = normId(b.coelsa_id);
  if (ca && cb && ca === cb) return ["coelsa_id"];

  const montoMatch = a.monto != null && b.monto != null && a.monto === b.monto;
  const fa = normText(a.fecha);
  const fb = normText(b.fecha);
  const fechaMatch = fa != null && fb != null && fa === fb;
  const ra = normText(a.cuenta_receptora);
  const rb = normText(b.cuenta_receptora);
  const recMatch = ra != null && rb != null && ra === rb;
  if (montoMatch && fechaMatch && recMatch) return ["monto", "fecha", "cuenta_receptora"];

  return [];
}

type Match = { rec: ScanRecord; via: "sha256" | "content" | "phash_content"; fields: string[] };

/**
 * Calcula la señal `duplicate_global` cross-subject. NO bloquea (GATE no decide dinero);
 * PAM consume `cross_user` + `first_scan_id` para aplicar la consecuencia.
 */
export function computeDuplicateGlobal(params: {
  subjectId: string;
  sha256: string | null;
  phash: string;
  extraction: ReceiptExtraction | null;
  /** Excluir el propio registro (al recomputar por scan_id ya persistido). */
  excludeId?: string;
}): DuplicateGlobal {
  const { subjectId, sha256, phash, extraction, excludeId } = params;
  const matches: Match[] = [];

  // (a) sha256 exacto cross-subject (índice) — reuso literal de bytes.
  if (sha256) {
    for (const rec of findScansBySha256(sha256, excludeId)) {
      matches.push({ rec, via: "sha256", fields: ["sha256"] });
    }
  }
  const sha256Ids = new Set(matches.map((m) => m.rec.id));

  // (b)+(c) corroboración de contenido cross-subject (solo si hay OCR propio).
  if (extraction) {
    const sinceIso =
      C.phashTtlDays > 0
        ? new Date(Date.now() - C.phashTtlDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;
    const recents = findRecentScans({ sinceIso, excludeId, limit: C.phashHistoryLimit * 100 });
    for (const rec of recents) {
      if (sha256Ids.has(rec.id)) continue; // ya contado como sha256 exacto
      const prior = extractionOf(rec);
      if (!prior) continue;

      // (c) contenido FUERTE → reuso aunque pHash NO agrupe las dos capturas (#402).
      // Detrás de flag (money-sensitive): OFF en prod hasta OK de PAM; ON en gate-test.
      const strong = env.RECEIPT_DEDUP_CONTENT_STRONG ? strongContentMatch(extraction, prior) : [];
      if (strong.length > 0) {
        matches.push({ rec, via: "content", fields: strong });
        continue;
      }

      // (b) contenido DÉBIL → solo si además la imagen es casi idéntica (pHash cercano).
      if (hammingDistanceHex(rec.phash, phash) > C.phashSimilarLogThreshold) continue;
      const weak = contentMatchFields(extraction, prior);
      if (weak.length === 0) continue; // pHash cercano pero contenido distinto → NO es reuso
      matches.push({ rec, via: "phash_content", fields: weak });
    }
  }

  if (matches.length === 0) return EMPTY;

  // Prioridad de representante: sha256 (más fuerte) > content > phash_content.
  const hasSha = matches.some((m) => m.via === "sha256");
  const hasContent = matches.some((m) => m.via === "content");
  const via: "sha256" | "content" | "phash_content" = hasSha
    ? "sha256"
    : hasContent
      ? "content"
      : "phash_content";
  const cross_user = matches.some((m) => m.rec.subject_id !== subjectId);

  // Representante (via + first_scan_id + match_fields consistentes): el más antiguo del grupo `via`.
  const relevant = matches.filter((m) => m.via === via);
  relevant.sort((x, y) => (x.rec.created_at < y.rec.created_at ? -1 : x.rec.created_at > y.rec.created_at ? 1 : 0));
  const first = relevant[0]!;

  return {
    seen: true,
    via,
    cross_user,
    first_scan_id: first.rec.id,
    count: matches.length,
    match_fields: first.fields,
  };
}
