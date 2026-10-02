/**
 * Test de clasificación de estado del comprobante (dep #179/#180, DolarApp/ARQ "PENDIENTE").
 * Correr: `npm run test:states` (usa tsx, no requiere build).
 */
import {
  isMissingSenderReceipt,
  isPreviewReceipt,
  REASON_RECEIPT_NO_SENDER,
  validateExtraction,
} from "../src/forensic/validate.js";
import type { ReceiptExtraction } from "../src/forensic/types.js";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}`, detail ?? "");
  }
}

function baseExtraction(overrides: Partial<ReceiptExtraction>): ReceiptExtraction {
  return {
    monto: 5000,
    codigo_operacion: "OP123456",
    fecha: "2026-07-05 12:00:00",
    nombre_emisor: "Juan Perez",
    cuenta_emisora: "juan.dolarapp",
    cuenta_receptora: "0000003100000012345678",
    entidad_emisora: "DolarApp",
    tipo_operacion: "transferencia",
    confianza: 0.9,
    signos_edicion: false,
    es_comprobante_valido: true,
    coelsa_id: null,
    observaciones: null,
    estado_comprobante: "confirmado",
    ...overrides,
  };
}

console.log("isPreviewReceipt:");

// 1) DolarApp PENDIENTE (dep #179/#180): ya tiene operación/fecha, no es preview
{
  const data = baseExtraction({ estado_comprobante: "pendiente" });
  const r = isPreviewReceipt(data);
  check("pendiente NO es preview", r.preview === false, r);
}

// 2) preview real sigue rechazándose
{
  const data = baseExtraction({
    estado_comprobante: "preview",
    codigo_operacion: null,
    fecha: null,
  });
  const r = isPreviewReceipt(data);
  check("preview real sigue siendo preview", r.preview === true, r);
}

// 3) confirmado con prueba dura sigue aceptado
{
  const data = baseExtraction({ estado_comprobante: "confirmado" });
  const r = isPreviewReceipt(data);
  check("confirmado con prueba no es preview", r.preview === false, r);
}

// 4) pendiente SIN prueba (caso raro/degenerado) — el modelo dice pendiente, confiamos en el
//    modelo (no en la heurística de "sin prueba"), no se rechaza como preview.
{
  const data = baseExtraction({
    estado_comprobante: "pendiente",
    codigo_operacion: null,
    fecha: null,
    coelsa_id: null,
  });
  const r = isPreviewReceipt(data);
  check("pendiente sin prueba tampoco es preview (confía en el modelo)", r.preview === false, r);
}

console.log("validateExtraction:");

// 5) pendiente genera alerta informativa, no bloquea (isValid sigue true si el resto está OK)
{
  const data = baseExtraction({ estado_comprobante: "pendiente" });
  const v = validateExtraction(data);
  check(
    "pendiente → alerta COMPROBANTE_PENDIENTE + isValid true",
    v.isValid === true && v.alerts.some((a) => a.startsWith("COMPROBANTE_PENDIENTE")),
    v,
  );
}

// 6) confirmado normal no dispara la alerta de pendiente
{
  const data = baseExtraction({ estado_comprobante: "confirmado" });
  const v = validateExtraction(data);
  check(
    "confirmado no dispara COMPROBANTE_PENDIENTE",
    !v.alerts.some((a) => a.startsWith("COMPROBANTE_PENDIENTE")),
    v,
  );
}

// 7) Cuenta DNI post-éxito sin emisor: no preview (MSG-CRM-20260924-1)
{
  const data = baseExtraction({
    entidad_emisora: "Cuenta DNI",
    nombre_emisor: null,
    cuenta_emisora: null,
    codigo_operacion: null,
    fecha: null,
    coelsa_id: null,
    estado_comprobante: "confirmado",
    observaciones: "Transferencia exitosa. Le transferiste a Juan. Ir al inicio.",
  });
  check("cuenta dni éxito sin emisor → isMissingSenderReceipt", isMissingSenderReceipt(data));
  const r = isPreviewReceipt(data);
  check("cuenta dni éxito sin emisor NO es preview", r.preview === false, r);
}

// 8) preview real Cuenta DNI (estado preview) sin cambio
{
  const data = baseExtraction({
    entidad_emisora: "Cuenta DNI",
    estado_comprobante: "preview",
    codigo_operacion: null,
    fecha: null,
    nombre_emisor: null,
    cuenta_emisora: null,
  });
  check("cuenta dni preview real sigue siendo preview", isPreviewReceipt(data).preview === true);
  check("cuenta dni preview no es missing_sender", isMissingSenderReceipt(data) === false);
}

{
  check("reason constante sin preview", REASON_RECEIPT_NO_SENDER === "receipt_no_sender");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
