/**
 * Normalización post-OCR de cuentas (CBU / CVU / alias).
 *
 * Port de PAM `src/lib/receipt-extraction-normalize.ts` (`normalizeOcrCbuStandalone`),
 * doc `PAM: docs/payments/receipt-gate/GATE-CBU-NORMALIZE.md` (PR PAM #130).
 *
 * Contexto (dep #178, DolarApp/ARQ): la IA lee la **cuenta destino** (`cuenta_receptora`)
 * de un comprobante y a veces devuelve el CBU/CVU con separadores basura o con letras
 * confundidas por dígitos (OCR: O↔0, I/l↔1, S↔5, B↔8, etc.). El PAM valida que la cuenta
 * destino sea **una cuenta nuestra**, así que un CBU mal leído rechaza depósitos legítimos.
 *
 * Esta normalización corre **post-OCR** en el gate (E3 → antes de guardar/validar), de modo
 * que tanto `POST /scan` como `GET /scans/:id` devuelven la `cuenta_receptora` ya saneada.
 *
 * Principio conservador: **nunca corromper un alias válido**. La corrección letra→dígito solo
 * "gana" si produce exactamente 22 dígitos (largo de un CBU/CVU); si no, el valor se trata como
 * alias y solo se le sacan espacios. No decide dinero (eso es del PAM), solo limpia el texto.
 */

import type { ReceiptExtraction } from "./types.js";

export type AccountKind = "cbu" | "cvu" | "alias" | "digits" | "empty" | "unknown";

export interface CbuNormalization {
  /** Texto crudo tal cual lo devolvió la IA. */
  raw: string | null;
  /** Valor normalizado (o el alias saneado). null si no había nada. */
  value: string | null;
  /** Clasificación del valor normalizado. */
  kind: AccountKind;
  /** true si `value` difiere del crudo (se limpió algo). */
  changed: boolean;
  /** true si se aplicó corrección OCR de letra→dígito para llegar a un CBU/CVU. */
  corrected: boolean;
  /** Validez del dígito verificador CBU (solo para 22 dígitos); null si no aplica. */
  checksumValid: boolean | null;
}

/**
 * Confusiones OCR letra→dígito frecuentes en CBU/CVU argentinos.
 * Solo se aplican cuando el candidato tiene largo de CBU y produce 22 dígitos exactos,
 * así una confusión errónea no puede "ganar" (cae a tratamiento como alias).
 */
const OCR_LETTER_TO_DIGIT: Record<string, string> = {
  o: "0", q: "0", d: "0",
  i: "1", l: "1", "|": "1", "!": "1",
  z: "2",
  s: "5",
  g: "6",
  b: "8",
};

/** Separadores que humanos/OCR meten dentro de un CBU/CVU (espacios, puntos, guiones, barras). */
const ACCOUNT_SEPARATORS = /[\s.\-/_]+/g;

/** Etiqueta al inicio del texto ("CBU:", "CVU", "Cuenta destino:", "Alias -", etc.). */
const LEADING_LABEL = /^\s*(cbu|cvu|cuenta(?:\s+(?:destino|receptora|origen|emisora))?|alias|destino)\s*[:#.\-]?\s*/i;

/**
 * Valida el dígito verificador de un CBU/CVU de 22 dígitos (algoritmo COELSA).
 * CVU comparte el mismo esquema estructural, así que también valida.
 */
export function cbuChecksumValid(cbu: string): boolean {
  if (!/^\d{22}$/.test(cbu)) return false;

  const block1 = cbu.slice(0, 8);
  const block2 = cbu.slice(8, 22);

  const check = (block: string, weights: number[]): boolean => {
    const body = block.slice(0, -1);
    const verifier = Number(block[block.length - 1]);
    let sum = 0;
    for (let i = 0; i < body.length; i++) {
      sum += Number(body[i]) * weights[i]!;
    }
    const computed = (10 - (sum % 10)) % 10;
    return computed === verifier;
  };

  const ok1 = check(block1, [7, 1, 3, 9, 7, 1, 3]);
  const ok2 = check(block2, [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]);
  return ok1 && ok2;
}

/** CVU (fintech/billetera) usa código de entidad "000..." → distinguirlo de un CBU bancario. */
function classify22Digits(digits: string): "cbu" | "cvu" {
  return digits.startsWith("000") ? "cvu" : "cbu";
}

/**
 * ¿El valor parece un CBU/CVU MAL LEÍDO por OCR? (MSG-PAM-20260728-7 / #451): largo de cuenta
 * (18–26 tras sacar separadores), MAYORÍA de dígitos, pero con ≥1 carácter no numérico. Una letra
 * suelta en un campo de CBU es un misread tan seguro como un checksum fallido, y `cbuChecksumValid`
 * no lo agarra porque no son 22 dígitos puros (ej. #451: `0000031000004007I5658`, una "I", 21 chars).
 *
 * NO marca aliases legítimos: un alias es texto (pocos dígitos, palabras/puntos) → cae bajo el 0.8.
 * Se usa para emitir `checksum_valid=false` cuando el checksum no aplica. NO anula (GATE no decide).
 */
export function looksLikeMisreadCbu(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const compact = String(raw).replace(ACCOUNT_SEPARATORS, "");
  if (compact.length < 18 || compact.length > 26) return false;
  // Dígitos puros: esta función NO opina. Con 22 los juzga el checksum; con otro largo los juzga el
  // `kind === "digits"` de `accountChecksumFlag`. OJO: hasta el 13/08 este comentario decía "lo maneja
  // el checksum" y era falso para 21/23 dígitos —el checksum no corre y devolvía null—, así que 34 de
  // 45 misreads de la cuenta de PAM se reportaron como "no aplica". Si se toca uno, mirar el otro.
  if (/^\d+$/.test(compact)) return false;
  const digits = (compact.match(/\d/g) ?? []).length;
  return digits / compact.length >= 0.8; // mayoría dígitos + al menos un no-dígito = CBU misleído
}

/**
 * Normaliza un valor de cuenta (CBU/CVU/alias) leído por OCR.
 *
 * @param raw texto crudo de la IA (p.ej. `extraction.cuenta_receptora`).
 * @returns detalle de la normalización; `value` es el texto a usar aguas abajo.
 */
export function normalizeOcrCbuStandalone(raw: string | null | undefined): CbuNormalization {
  if (raw == null || String(raw).trim() === "") {
    return { raw: raw ?? null, value: null, kind: "empty", changed: false, corrected: false, checksumValid: null };
  }

  const rawStr = String(raw);
  const trimmed = rawStr.trim();

  // 1) Sacar etiqueta líder ("CBU:", "Cuenta destino", …) si vino pegada.
  const withoutLabel = trimmed.replace(LEADING_LABEL, "").trim();

  // 2) Candidato numérico: sacar separadores internos.
  const compact = withoutLabel.replace(ACCOUNT_SEPARATORS, "");

  // 3) Caso todo-dígitos.
  if (/^\d+$/.test(compact)) {
    if (compact.length === 22) {
      const kind = classify22Digits(compact);
      return {
        raw: rawStr,
        value: compact,
        kind,
        changed: compact !== trimmed,
        corrected: false,
        checksumValid: cbuChecksumValid(compact),
      };
    }
    // Dígitos con largo raro (18–26): probablemente un CBU con dígitos de más/menos por OCR.
    // Devolvemos los dígitos compactados (mejor que espacios) pero sin marcar CBU/CVU.
    if (compact.length >= 18 && compact.length <= 26) {
      return {
        raw: rawStr,
        value: compact,
        kind: "digits",
        changed: compact !== trimmed,
        corrected: false,
        checksumValid: null,
      };
    }
    // Muy corto/largo: no tocar (podría ser código de op mal mapeado a cuenta, teléfono, etc.).
    return { raw: rawStr, value: trimmed, kind: "unknown", changed: false, corrected: false, checksumValid: null };
  }

  // 4) Caso CBU/CVU con letras confundidas: solo dígitos + letras confusables, largo de CBU.
  const lower = compact.toLowerCase();
  const onlyDigitsOrConfusable = [...lower].every(
    (ch) => /[0-9]/.test(ch) || ch in OCR_LETTER_TO_DIGIT,
  );
  if (onlyDigitsOrConfusable && lower.length === 22) {
    const mapped = [...lower].map((ch) => (ch in OCR_LETTER_TO_DIGIT ? OCR_LETTER_TO_DIGIT[ch]! : ch)).join("");
    if (/^\d{22}$/.test(mapped)) {
      return {
        raw: rawStr,
        value: mapped,
        kind: classify22Digits(mapped),
        changed: true,
        corrected: true,
        checksumValid: cbuChecksumValid(mapped),
      };
    }
  }

  // 5) Alias: normalizar solo espacios internos (los alias no llevan espacios). Preservar
  //    puntos/guiones y mayúsculas (son case-insensitive pero no los alteramos).
  const alias = withoutLabel.replace(/\s+/g, "");
  return {
    raw: rawStr,
    value: alias || trimmed,
    kind: "alias",
    changed: (alias || trimmed) !== trimmed,
    corrected: false,
    checksumValid: null,
  };
}

export interface ExtractionAccountsReport {
  receptora: CbuNormalization;
  emisora: CbuNormalization;
}

/**
 * Aplica la normalización a las cuentas de una extracción **in place**.
 * Reemplaza `cuenta_receptora` / `cuenta_emisora` por su versión saneada cuando cambia.
 * Devuelve el reporte para logging/auditoría (el que decide el dinero es el PAM).
 */
export function normalizeExtractionAccounts(data: ReceiptExtraction): ExtractionAccountsReport {
  const receptora = normalizeOcrCbuStandalone(data.cuenta_receptora);
  const emisora = normalizeOcrCbuStandalone(data.cuenta_emisora);

  if (receptora.changed && receptora.value) data.cuenta_receptora = receptora.value;
  if (emisora.changed && emisora.value) data.cuenta_emisora = emisora.value;

  return { receptora, emisora };
}
