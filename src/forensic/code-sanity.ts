/**
 * Saneo post-OCR de `codigo_operacion` / `coelsa_id` — anti confusión de CAMPO (PTMUAT-414, H2).
 *
 * Hallazgo PAM (MSG-PAM-20260726-6): el 19% de las lecturas mete en `codigo_operacion` un valor de
 * OTRO campo — CUIT del titular, CBU/CVU, o un placeholder `<UNKNOWN>`. Un código equivocado no
 * concilia contra el espejo PSP y deja el depósito sin correlato.
 *
 * Este guard es DETERMINÍSTICO y CONSERVADOR: NO corrige el código (eso nunca — H1 confirmó que los
 * códigos tienen estructura y auto-corregir colisiona transferencias reales). Solo lo pone en `null`
 * cuando es INEQUÍVOCAMENTE otro campo. En dinero, `null` es seguro: PAM cae a matcheo por otros
 * campos / revisión manual, en vez de casar (o rechazar) con una llave basura.
 *
 * Reglas (solo anulan, nunca reescriben el código):
 *  1. Placeholder (`<UNKNOWN>`, `N/A`, `S/D`, `-`, `null`, …) → null.
 *  2. Igual a una cuenta de la extracción (CBU/CVU emisor/receptor, comparando solo dígitos) → null.
 *  3. Numérico puro de largo ≥ 18 (territorio CBU/CVU) → null (un código de operación real no es eso).
 *  4. Numérico puro de 11 dígitos con checksum de CUIT válido → null (es el CUIT/CUIL del titular).
 *
 * Códigos alfanuméricos legítimos (ej. `L18MKX9RPXVMQKMV2O6WYV`, `XJ8G7V957…`) y códigos numéricos
 * de billeteras (ej. Mercado Pago, típicamente < 18 dígitos y sin checksum CUIT) NO se tocan.
 */
import type { ReceiptExtraction } from "./types.js";
import { looksLikeMisreadCbu } from "./normalize.js";

const PLACEHOLDER_TOKENS = new Set([
  "", "-", "--", "---", "n/a", "na", "n/d", "s/d", "sin dato", "sin datos", "desconocido",
  "unknown", "<unknown>", "null", "none", "undefined", "xxx", "xxxx", "0", "00", "000",
]);

function isPlaceholder(raw: string): boolean {
  const norm = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (PLACEHOLDER_TOKENS.has(norm)) return true;
  // Tokens rodeados de signos: "<unknown>", "[n/a]", "(sin dato)"
  const stripped = norm.replace(/^[<\[({]+|[>\])}]+$/g, "");
  return PLACEHOLDER_TOKENS.has(stripped);
}

/** Solo dígitos de un string (saca separadores, letras y símbolos). */
function digitsOnly(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

/** true si, sacando separadores comunes, el string es puramente numérico. */
function isPureNumeric(s: string): boolean {
  const compact = s.replace(/[\s.\-/_#:]+/g, "");
  return compact.length > 0 && /^\d+$/.test(compact);
}

/** Prefijos de tipo válidos de CUIT/CUIL (dos primeros dígitos). b.1: se exige junto al checksum. */
const CUIT_TYPE_PREFIXES = new Set(["20", "23", "24", "25", "26", "27", "30", "33", "34"]);

/**
 * Checksum de CUIT/CUIL argentino (11 dígitos, módulo 11) + prefijo de tipo (b.1, MSG-PAM-20260727-3).
 * Exigir el prefijo válido evita anular un código legítimo que por azar pasa el módulo 11 pero no es
 * un CUIT real (un CUIT siempre arranca 20/23/24/25/26/27 personas, 30/33/34 empresas).
 */
export function cuitChecksumValid(d: string): boolean {
  if (!/^\d{11}$/.test(d)) return false;
  if (!CUIT_TYPE_PREFIXES.has(d.slice(0, 2))) return false; // b.1: prefijo de tipo
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(d[i]) * weights[i]!;
  let verifier = 11 - (sum % 11);
  if (verifier === 11) verifier = 0;
  if (verifier === 10) return false; // CUIT inválido por definición
  return verifier === Number(d[10]);
}

/**
 * ¿El valor parece una FECHA (con o sin hora) y no un código? (b.4, MSG-PAM-20260727-3 / #333).
 * Ej. "21072026-1233" (ddmmyyyy-hhmm), "21/07/2026", "2026-07-21 12:33". Se validan rangos de
 * día/mes para no anular un código numérico que sólo comparte forma. Money-safe: sólo pone null.
 */
export function isDateTimeLike(raw: string): boolean {
  const t = raw.trim();
  const validDMY = (dd: string, mm: string) => {
    const d = Number(dd), m = Number(mm);
    return d >= 1 && d <= 31 && m >= 1 && m <= 12;
  };
  // ddmmyyyy-hhmm | ddmmyyyyhhmm (8 dígitos de fecha + 4 de hora, con/sin separador)
  let m = /^(\d{2})(\d{2})(\d{4})[-_ ]?(\d{2})(\d{2})$/.exec(t);
  if (m && validDMY(m[1]!, m[2]!) && Number(m[4]) <= 23 && Number(m[5]) <= 59) return true;
  // dd/mm/yyyy | dd-mm-yy [ hh:mm[:ss] ]  (con separadores explícitos)
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t);
  if (m && validDMY(m[1]!, m[2]!)) return true;
  // yyyy-mm-dd [ hh:mm[:ss] ]
  m = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?$/.exec(t);
  if (m && validDMY(m[3]!, m[2]!)) return true;
  return false;
}

/**
 * ¿El valor tiene forma de UUID? (MSG-PAM-20260727-6). LEMON/Ualá imprimen un UUID como identificador
 * de la transferencia en el comprobante — es un CÓDIGO LEGÍTIMO, nunca se anula. Un UUID estándar (con
 * letras hex) ya cae en el "no numérico" y se preserva; este guard cubre además el borde de un UUID
 * íntegramente decimal (que si no, los guiones lo dejarían como ≥18 dígitos → falso positivo CBU/CVU).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuidLike(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/** ¿El valor de una CUENTA parece en realidad el NOMBRE de la entidad/banco? (b.3, ej. "ARQ" en #439). */
function isBankNameLike(raw: string, entidad: string | null | undefined): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/\d/.test(t) || t.includes(".")) return false; // tiene dígitos o punto → CBU/CVU/alias real
  if (entidad && t.toLowerCase() === String(entidad).trim().toLowerCase()) return true;
  return /^[A-Za-z][A-Za-z +&-]{0,15}$/.test(t); // sólo letras/espacios cortos → nombre de banco
}

const foldName = (s: string): string => s.toLowerCase().replace(/\s+/g, "");

/**
 * ¿Este valor NO es una cuenta (CBU/CVU/alias) sino otro campo o un centinela?
 * MSG-PAM-20260813-26: 59 de 77 "largo ≠ 22" eran CUIT, nombre, `<UNKNOWN>` o texto de otro campo.
 * Anular acá (→ null) es lo que distingue "no encontré la cuenta" de "la leí mal":
 *   campo null + flag null     = no hay cuenta
 *   campo con dígitos + false  = misread de un número
 * Un alias real (tiene punto) y un CBU/CVU mal leído (largo 18–26, o letra suelta tipo la C) se
 * PRESERVAN: esos sí son cuentas, aunque rotas.
 */
function classifyBadAccount(raw: string, data: ReceiptExtraction): CodeSanityReason | null {
  if (isPlaceholder(raw)) return "placeholder";
  if (isBankNameLike(raw, data.entidad_emisora)) return "bank_name";

  if (data.nombre_emisor && !/\d/.test(raw) && foldName(raw) === foldName(data.nombre_emisor)) {
    return "person_name";
  }
  // Un alias no lleva espacios; un nombre de persona sí ("Lucila Abigail Azzara").
  if (/\s/.test(raw.trim()) && !/\d/.test(raw)) return "person_name";

  const d = digitsOnly(raw);
  if (d.length === 11 && cuitChecksumValid(d)) return "cuit";

  // Misread de un CBU/CVU: se conserva el valor y el flag de checksum dice false.
  if (looksLikeMisreadCbu(raw)) return null;
  const compact = raw.replace(/[\s.\-/_]+/g, "");
  if (/^\d+$/.test(compact) && compact.length >= 18 && compact.length <= 26) return null;

  // Alias argentino: convención con punto (juan.perez.mp). Sin punto y sin dígitos es un nombre
  // o una etiqueta ("VictorTrimboli", "Cajadeahorroenpesos"), no una cuenta.
  if (raw.includes(".")) return null;
  if (!/\d/.test(raw)) return "person_name";

  // Tiene dígitos pero no forma de cuenta: caja de ahorro, teléfono, CUIT sin checksum.
  if (d.length > 0 && d.length < 18) return "not_account";
  return null;
}

export type CodeSanityReason =
  | "placeholder"
  | "equals_account"
  | "numeric_account"
  | "cuit"
  | "datetime"
  | "bank_name"
  | "person_name"
  | "not_account";

export interface CodeSanityDrop {
  field: "codigo_operacion" | "coelsa_id" | "cuenta_emisora" | "cuenta_receptora";
  raw: string;
  reason: CodeSanityReason;
}

/** Clasifica por qué un código es inválido como código de operación; null si parece legítimo. */
function classifyBadCode(raw: string, accountDigits: string[]): CodeSanityReason | null {
  if (isPlaceholder(raw)) return "placeholder";
  if (isUuidLike(raw)) return null; // UUID = código legítimo de LEMON/Ualá — nunca anular (MSG-PAM-20260727-6)
  if (isDateTimeLike(raw)) return "datetime"; // b.4: fecha/hora en el lugar del código (#333)

  const d = digitsOnly(raw);
  // Igual a una cuenta conocida (CBU/CVU) — comparar por dígitos, min 8 para evitar coincidencias triviales.
  if (d.length >= 8 && accountDigits.includes(d)) return "equals_account";

  if (isPureNumeric(raw)) {
    if (d.length >= 18) return "numeric_account"; // CBU/CVU/cuenta larga metida como código
    if (d.length === 11 && cuitChecksumValid(d)) return "cuit"; // CUIT/CUIL del titular
  }
  return null;
}

export interface CodeSanityReport {
  drops: CodeSanityDrop[];
}

/**
 * Anula in place `codigo_operacion` / `coelsa_id` cuando son inequívocamente otro campo.
 * Devuelve el reporte para logging/auditoría. No decide dinero (eso es del PAM).
 */
export function sanitizeReceiptCodes(data: ReceiptExtraction): CodeSanityReport {
  const drops: CodeSanityDrop[] = [];

  // Sanear PRIMERO las cuentas (un nombre, un CUIT o un <UNKNOWN> en cuenta_emisora no es cuenta).
  // MSG-PAM-20260813-26: de 77 valores con largo ≠ 22, 59 no eran misreads — eran otro campo. El
  // consumidor (PAM y CRM leen el mismo /scans/:id) no puede distinguir "no encontré la cuenta"
  // de "la leí mal" si el campo sigue ocupado. Se hace antes de derivar accountDigits.
  for (const field of ["cuenta_emisora", "cuenta_receptora"] as const) {
    const val = data[field];
    if (val == null) continue;
    const raw = String(val);
    const reason = classifyBadAccount(raw, data);
    if (reason) {
      drops.push({ field, raw, reason });
      data[field] = null;
    }
  }

  const accountDigits = [data.cuenta_receptora, data.cuenta_emisora]
    .filter((v): v is string => !!v)
    .map((v) => digitsOnly(String(v)))
    .filter((v) => v.length >= 8);

  for (const field of ["codigo_operacion", "coelsa_id"] as const) {
    const val = data[field];
    if (val == null) continue;
    const reason = classifyBadCode(String(val), accountDigits);
    if (reason) {
      drops.push({ field, raw: String(val), reason });
      data[field] = null;
    }
  }
  return { drops };
}
