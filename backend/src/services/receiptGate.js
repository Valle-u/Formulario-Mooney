/**
 * Cliente GATE (Programa-Comprobantes) + mapeo extraction → campos de egreso Mooney.
 * Env opcional: RECEIPT_GATE_URL, RECEIPT_GATE_TOKEN.
 * Si faltan, el autocompletado queda deshabilitado (503 desde la ruta).
 */

import crypto from "crypto";
import { EMPRESAS_SALIDA } from "../utils/validators.js";

const DEFAULT_TIMEOUT_MS = 90_000;

export function isReceiptGateConfigured() {
  return Boolean(process.env.RECEIPT_GATE_URL?.trim() && process.env.RECEIPT_GATE_TOKEN?.trim());
}

function fold(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Alias comunes OCR → valor exacto del select Mooney. */
const EMPRESA_ALIASES = [
  ["mercado pago", "Mercado Pago"],
  ["mercadopago", "Mercado Pago"],
  ["mp ", "Mercado Pago"],
  ["uala", "Uala"],
  ["brubank", "Brubank"],
  ["naranja x", "NaranjaX"],
  ["naranjax", "NaranjaX"],
  ["personal pay", "Personal Pay"],
  ["lemoncash", "Lemoncash"],
  ["lemon cash", "Lemoncash"],
  ["lemon", "Lemoncash"],
  ["astro pay", "AstroPay"],
  ["astropay", "AstroPay"],
  ["dolar app", "DolarApp"],
  ["dolarapp", "DolarApp"],
  ["cuenta dni", "Cuenta DNI"],
  ["banco nacion", "Banco Nacion"],
  ["nacion", "Banco Nacion"],
  ["binance", "Binance"],
  ["trust wallet", "TrustWallet"],
  ["trustwallet", "TrustWallet"],
  ["telepagos", "Telepagos"],
  ["copter", "Copter"],
  ["palta", "Palta"],
  ["lohas", "Lohas"],
];

/**
 * @param {string|null|undefined} entidadEmisora
 * @param {string[]} [empresasActivas]
 * @returns {string|null}
 */
export function matchEmpresaSalida(entidadEmisora, empresasActivas = EMPRESAS_SALIDA) {
  const raw = fold(entidadEmisora);
  if (!raw) return null;

  const activas = Array.isArray(empresasActivas) && empresasActivas.length
    ? empresasActivas
    : EMPRESAS_SALIDA;

  for (const [alias, canonical] of EMPRESA_ALIASES) {
    if (raw.includes(alias) || alias.includes(raw)) {
      if (activas.includes(canonical)) return canonical;
    }
  }

  for (const emp of activas) {
    const f = fold(emp);
    if (!f || f.startsWith("otra")) continue;
    if (raw.includes(f) || f.includes(raw)) return emp;
  }

  return null;
}

/** GATE fecha: `YYYY-MM-DD HH:MM:SS` (o parcial) → dd/mm/aaaa + HH:MM */
export function parseGateFecha(fechaIso) {
  if (!fechaIso || typeof fechaIso !== "string") return null;
  const m = fechaIso.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!m) return null;
  const [, y, mo, d, hh, mm] = m;
  const out = { fecha: `${d}/${mo}/${y}`, hora: null };
  if (hh != null && mm != null) out.hora = `${hh}:${mm}`;
  return out;
}

export function formatMontoARS(monto) {
  if (monto == null || Number.isNaN(Number(monto))) return null;
  const n = Number(monto);
  if (!Number.isFinite(n) || n <= 0) return null;
  const fixed = n.toFixed(2);
  const [ent, dec] = fixed.split(".");
  if (dec === "00") return ent;
  return `${ent},${dec}`;
}

export function sanitizeIdTransferencia(raw) {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[^a-zA-Z0-9\-_]/g, "");
  return cleaned || null;
}

function cleanPersonName(raw) {
  if (!raw) return null;
  const cleaned = String(raw)
    .replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

/**
 * GATE v1.1 no tiene `nombre_receptor`; a veces viene en observaciones
 * ("Transferencia de X a Y.") o en campos aditivos futuros.
 */
export function parseNombreReceptor(extraction) {
  if (!extraction || typeof extraction !== "object") return null;

  const direct =
    cleanPersonName(extraction.nombre_receptor) ||
    cleanPersonName(extraction.nombre_beneficiario) ||
    cleanPersonName(extraction.titular_receptor);
  if (direct) return direct;

  const obs = String(extraction.observaciones || "").trim();
  if (!obs) return null;

  const emisorFold = fold(extraction.nombre_emisor);

  const patterns = [
    /transferencia\s+de\s+.+?\s+a\s+([A-ZÁÉÍÓÚÑ][^.]+?)(?:\.|$)/i,
    /\bpara\s*:\s*([A-ZÁÉÍÓÚÑ][A-Za-záéíóúñüÁÉÍÓÚÑÜ\s'-]{1,80})/i,
    /\ba\s+([A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:\s+[A-ZÁÉÍÓÚÑa-záéíóúñü]+){0,4})\b/,
  ];

  for (const re of patterns) {
    const m = obs.match(re);
    if (!m?.[1]) continue;
    const name = cleanPersonName(m[1]);
    if (!name) continue;
    if (emisorFold && fold(name) === emisorFold) continue;
    if (name.length < 3) continue;
    return name;
  }

  return null;
}

/**
 * @param {object|null} extraction
 * @param {string[]} empresasActivas
 */
export function mapExtractionToEgresoFields(extraction, empresasActivas = EMPRESAS_SALIDA) {
  const fields = {};
  if (!extraction || typeof extraction !== "object") {
    return { fields, filled: [] };
  }

  const monto = formatMontoARS(extraction.monto);
  if (monto) fields.monto = monto;

  const fh = parseGateFecha(extraction.fecha);
  if (fh?.fecha) fields.fecha = fh.fecha;
  if (fh?.hora) fields.hora = fh.hora;

  const id =
    sanitizeIdTransferencia(extraction.codigo_operacion) ||
    sanitizeIdTransferencia(extraction.coelsa_id);
  if (id) fields.id_transferencia = id;

  const cuentaSalida = cleanPersonName(extraction.nombre_emisor);
  if (cuentaSalida) fields.cuenta_salida = cuentaSalida;

  const cuentaReceptora = parseNombreReceptor(extraction);
  if (cuentaReceptora) fields.cuenta_receptora = cuentaReceptora;

  const empresa = matchEmpresaSalida(extraction.entidad_emisora, empresasActivas);
  if (empresa) fields.empresa_salida = empresa;

  const filled = Object.keys(fields);
  return { fields, filled };
}

/** subject_id único por intento: el dedup de GATE es por subject+sha256 (chat). */
export function buildAutofillSubjectId(userId) {
  const uid = userId ?? "anon";
  return `mooney:autofill:${uid}:${crypto.randomUUID()}`;
}

/**
 * @param {{ buffer: Buffer, mimetype: string, originalname?: string }} file
 * @param {{ subjectId?: string, userId?: string|number, timeoutMs?: number }} opts
 */
export async function scanReceiptWithGate(file, opts = {}) {
  const baseUrl = process.env.RECEIPT_GATE_URL.replace(/\/+$/, "");
  const token = process.env.RECEIPT_GATE_TOKEN.trim();
  const timeoutMs = opts.timeoutMs ?? Number(process.env.RECEIPT_GATE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const subjectId = opts.subjectId || buildAutofillSubjectId(opts.userId);

  const data_base64 = file.buffer.toString("base64");
  const body = {
    subject_id: subjectId,
    channel: "other",
    declared_mime: file.mimetype || "application/octet-stream",
    filename: file.originalname || "comprobante",
    data_base64,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/scan`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg =
        data?.user_message ||
        data?.error ||
        data?.message ||
        `GATE respondió ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.gate = data;
      throw err;
    }

    return data;
  } catch (err) {
    if (err?.name === "AbortError") {
      const e = new Error("GATE tardó demasiado en leer el comprobante");
      e.status = 504;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
