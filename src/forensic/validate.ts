import { detectBank } from "./bank-detect.js";
import { FORENSIC_CONFIG as C } from "./config.js";
import type { ExtractionResult, ReceiptExtraction } from "./types.js";

/** Reason wire para comprobante final sin datos de emisor (Cuenta DNI post-éxito). Sin "preview" en el nombre — CRM enruta copy propio. */
export const REASON_RECEIPT_NO_SENDER = "receipt_no_sender";

function receiptTextBlob(data: ReceiptExtraction): string {
  return ((data.observaciones || "") + " ").toLowerCase();
}

export function isCuentaDniReceipt(data: ReceiptExtraction): boolean {
  const bank = detectBank(data.entidad_emisora);
  if (bank.canonical === "Cuenta DNI") return true;
  const text = receiptTextBlob(data);
  return text.includes("cuenta dni") || text.includes("cuentadni");
}

/** Pantalla final de éxito (no preview): banner en observaciones o estado del modelo. */
export function isConfirmedTransferSuccessScreen(data: ReceiptExtraction): boolean {
  const text = receiptTextBlob(data);
  const successKeywords = [
    "transferencia exitosa",
    "transferencia realizada",
    "transferencia completada",
    "le transferiste",
    "le transferiste a",
  ];
  if (successKeywords.some((kw) => text.includes(kw))) return true;
  const est = (data.estado_comprobante || "").toLowerCase();
  if (est === "preview") return false;
  return est === "confirmado" || est === "pendiente";
}

/** Caso (b) MSG-CRM-20260924-1: Cuenta DNI post-éxito con destino pero sin emisor — no es preview. */
export function isMissingSenderReceipt(data: ReceiptExtraction): boolean {
  if (!data.es_comprobante_valido) return false;
  const noSender = !String(data.nombre_emisor || "").trim() && !String(data.cuenta_emisora || "").trim();
  if (!noSender || !data.cuenta_receptora) return false;
  if (!isCuentaDniReceipt(data)) return false;
  return isConfirmedTransferSuccessScreen(data);
}

export function isPreviewReceipt(data: ReceiptExtraction): { preview: boolean; reason: string } {
  const est = (data.estado_comprobante || "").toLowerCase();
  if (est === "preview") return { preview: true, reason: "modelo clasificó estado_comprobante=preview" };

  // "pendiente" (dep #179/#180, DolarApp/ARQ): la transferencia YA se envió y tiene prueba
  // (operación/fecha) pero sigue en clearing. NO es un preview (pantalla previa a confirmar) —
  // no rechazar; el PAM decide con la alerta COMPROBANTE_PENDIENTE (validateExtraction).
  if (est === "pendiente") {
    return { preview: false, reason: "modelo=pendiente (ya enviada, en clearing/acreditación)" };
  }

  const hasRealProof = !!(data.fecha || data.codigo_operacion || data.coelsa_id);
  if (est === "confirmado" && hasRealProof) return { preview: false, reason: "modelo=confirmado + prueba dura" };

  const text = ((data.observaciones || "") + " ").toLowerCase();
  const previewKeywords = [
    "revisión del pago",
    "revision del pago",
    "previa a confirmar",
    "antes de confirmar",
    "estás enviando",
    "estas enviando",
    "confirmá los datos",
    "confirma los datos",
    "botón confirmar",
    "boton confirmar",
  ];
  const matchedKw = previewKeywords.find((kw) => text.includes(kw));
  if (matchedKw) return { preview: true, reason: `observaciones incluye "${matchedKw}"` };

  const noProof = !data.fecha && !data.codigo_operacion && !data.coelsa_id;
  const noSender = !data.nombre_emisor && !data.cuenta_emisora;
  if (noProof && noSender && data.cuenta_receptora) {
    if (isMissingSenderReceipt(data)) {
      return { preview: false, reason: "cuenta dni éxito sin emisor (no preview)" };
    }
    return {
      preview: true,
      reason: "sin fecha/código/coelsa y sin emisor — pantalla de revisión previa",
    };
  }

  return { preview: false, reason: est === "confirmado" ? "modelo=confirmado" : "no preview detectado" };
}

/**
 * Validación informativa: alertas para el PAM; no bloquea por campos faltantes salvo `CRITICO`.
 * El prefijo va SIN tilde a propósito: `hasCritical` compara con `startsWith("CRITICO")` y PAM
 * parsea esa misma marca, así que acentuarlo rompe el chequeo de acá y el contrato de allá.
 */
export function validateExtraction(data: ReceiptExtraction): ExtractionResult {
  const alerts: string[] = [];

  if (!data.es_comprobante_valido) {
    alerts.push("CRITICO: La IA determino que NO es un comprobante valido");
    return { data, alerts, isValid: false };
  }

  if (data.confianza < C.CONFIANZA_MINIMA) {
    alerts.push(`BAJA_CONFIANZA: ${data.confianza} (minimo: ${C.CONFIANZA_MINIMA})`);
  }

  if ((data.estado_comprobante || "").toLowerCase() === "pendiente") {
    alerts.push(
      "COMPROBANTE_PENDIENTE: transferencia ya enviada, aún en clearing/acreditación (no confirmada) — no es preview",
    );
  }

  if (data.signos_edicion) {
    alerts.push("ALERTA: Se detectaron signos de edicion digital");
  }

  if (data.monto !== null) {
    if (data.monto < C.MONTO_MINIMO) {
      alerts.push(`MONTO_BAJO: $${data.monto} es menor al minimo ($${C.MONTO_MINIMO})`);
    }
    if (data.monto > C.MONTO_MAXIMO) {
      alerts.push(`MONTO_ALTO: $${data.monto} supera el maximo ($${C.MONTO_MAXIMO})`);
    }
  } else {
    alerts.push("SIN_MONTO: No se pudo extraer el monto del comprobante");
  }

  if (!data.codigo_operacion) alerts.push("SIN_CODIGO: No se encontro codigo de operacion");
  if (!data.fecha) alerts.push("SIN_FECHA: No se pudo extraer la fecha");
  if (!data.cuenta_receptora) alerts.push("SIN_CUENTA_DESTINO: No se encontro CBU/CVU/Alias destino");

  const hasCritical = alerts.some((a) => a.startsWith("CRITICO"));
  const isValid = !hasCritical && data.monto !== null;

  return { data, alerts, isValid };
}

/**
 * `fecha` se transcribe del comprobante tal como está impresa: hora de pared argentina, sin
 * sufijo de zona. Una cadena así, pasada por `new Date()`, se interpreta en la zona del proceso
 * —UTC en los contenedores—, lo que envejece el comprobante 3 horas y convierte una ventana de
 * 48 h en una de 45. Por eso el offset se aplica explícito y no se hereda del host.
 * Argentina no tiene DST desde 2009, así que es fijo.
 */
const OFFSET_COMPROBANTE_MIN = -180;

/** Instante (epoch ms) al que se refiere `fecha`. Null si no es parseable. */
export function fechaToEpochMs(fechaIso: string | null): number | null {
  if (!fechaIso) return null;
  const s = fechaIso.trim();

  // Si el modelo devolvió zona explícita, esa manda: no hay nada que suponer.
  if (/(z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const t = new Date(s.replace(" ", "T")).getTime();
    return Number.isNaN(t) ? null : t;
  }

  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (!m) return null;
  // Sin hora, 00:00 es el instante más viejo del día: la edad sale máxima y el sesgo queda del
  // lado de mandar a revisión, no del de acreditar.
  const utc = Date.UTC(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4] ?? 0),
    Number(m[5] ?? 0),
    Number(m[6] ?? 0),
  );
  if (Number.isNaN(utc)) return null;
  return utc - OFFSET_COMPROBANTE_MIN * 60_000;
}

/**
 * Antigüedad del comprobante en horas, contra el reloj del GATE. Null si no hay fecha parseable.
 * Puede ser negativa: una fecha futura es un dato del comprobante, no un error a tapar.
 */
export function receiptAgeHours(fechaIso: string | null, ahoraMs: number = Date.now()): number | null {
  const t = fechaToEpochMs(fechaIso);
  if (t === null) return null;
  return Math.round(((ahoraMs - t) / 3_600_000) * 100) / 100;
}

export function isReceiptTooOld(fechaIso: string | null): boolean {
  const age = receiptAgeHours(fechaIso);
  return age !== null && age > C.MAX_RECEIPT_AGE_HOURS;
}
