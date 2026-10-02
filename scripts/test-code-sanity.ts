/**
 * Test del guard anti confusión de CAMPO (PTMUAT-414 H2). Correr: `npm run test:code-sanity`.
 * Verifica que se anulen CUIT/CBU/CVU/placeholder metidos como código, y que NO se toquen códigos
 * legítimos (alfanuméricos ni numéricos de billetera).
 */
import { sanitizeReceiptCodes, cuitChecksumValid, isDateTimeLike } from "../src/forensic/code-sanity.js";
import type { ReceiptExtraction } from "../src/forensic/types.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}`); }
}

function base(over: Partial<ReceiptExtraction>): ReceiptExtraction {
  return {
    monto: 1000, codigo_operacion: null, fecha: "2026-07-25 20:48:00",
    nombre_emisor: "X", cuenta_emisora: null, cuenta_receptora: null,
    entidad_emisora: "ARQ", tipo_operacion: "transferencia", confianza: 0.95,
    signos_edicion: false, es_comprobante_valido: true, coelsa_id: null,
    observaciones: null, estado_comprobante: "confirmado", ...over,
  };
}

function run() {
  console.log("== CUIT checksum + prefijo (b.1) ==");
  check("20300107525 es CUIT válido (caso #149/#185/#188/#212/#230)", cuitChecksumValid("20300107525"));
  check("12345678901 NO es CUIT válido", !cuitChecksumValid("12345678901"));
  check("b.1: 11111111113 pasa mod11 pero prefijo 11 inválido → NO CUIT", !cuitChecksumValid("11111111113"));

  console.log("== fecha/hora como código (b.4, #333) ==");
  check("isDateTimeLike 21072026-1233 (ddmmyyyy-hhmm)", isDateTimeLike("21072026-1233"));
  check("isDateTimeLike 21/07/2026", isDateTimeLike("21/07/2026"));
  check("isDateTimeLike 2026-07-21 12:33", isDateTimeLike("2026-07-21 12:33"));
  check("isDateTimeLike NO para código real", !isDateTimeLike("L18MKX9RPXVMQKMV2O6WYV"));
  check("isDateTimeLike NO para 8 díg sin separador", !isDateTimeLike("20481000"));
  let dd = base({ codigo_operacion: "21072026-1233" });
  let rr = sanitizeReceiptCodes(dd);
  check("#333: fecha+hora en código → null (datetime)", dd.codigo_operacion === null && rr.drops[0]?.reason === "datetime");

  console.log("== nombre de banco en cuenta (b.3, #439 'ARQ') ==");
  dd = base({ cuenta_emisora: "ARQ" });
  rr = sanitizeReceiptCodes(dd);
  check("cuenta_emisora 'ARQ' → null (bank_name)", dd.cuenta_emisora === null && rr.drops.some((x) => x.field === "cuenta_emisora" && x.reason === "bank_name"));
  dd = base({ cuenta_emisora: "0000088800010000009679" });
  sanitizeReceiptCodes(dd);
  check("CBU real en cuenta_emisora intacto", dd.cuenta_emisora === "0000088800010000009679");
  dd = base({ cuenta_emisora: "juan.perez.mp" });
  sanitizeReceiptCodes(dd);
  check("alias con puntos en cuenta_emisora intacto", dd.cuenta_emisora === "juan.perez.mp");

  console.log("== cuenta que NO es cuenta (MSG-PAM-20260813-26: 59 de 77) ==");
  dd = base({ cuenta_emisora: "<UNKNOWN>" });
  rr = sanitizeReceiptCodes(dd);
  check("<UNKNOWN> en cuenta_emisora → null (placeholder)", dd.cuenta_emisora === null && rr.drops[0]?.reason === "placeholder");

  dd = base({ cuenta_emisora: "20-41564402-8" });
  rr = sanitizeReceiptCodes(dd);
  check("CUIT con guiones en cuenta_emisora → null (cuit)", dd.cuenta_emisora === null && rr.drops[0]?.reason === "cuit");

  dd = base({ cuenta_emisora: "20415644028" });
  rr = sanitizeReceiptCodes(dd);
  check("CUIT compacto en cuenta_emisora → null (cuit)", dd.cuenta_emisora === null && rr.drops[0]?.reason === "cuit");

  dd = base({ cuenta_emisora: "VictorTrimboli", nombre_emisor: "Victor Trimboli" });
  rr = sanitizeReceiptCodes(dd);
  check(
    "nombre igual a nombre_emisor → null (person_name o bank_name: ambos anulan)",
    dd.cuenta_emisora === null && rr.drops.some((x) => x.reason === "person_name" || x.reason === "bank_name"),
  );

  dd = base({ cuenta_emisora: "Lucila Abigail Azzara", nombre_emisor: "Otro" });
  rr = sanitizeReceiptCodes(dd);
  check("nombre con espacios (no es alias) → null (person_name)", dd.cuenta_emisora === null && rr.drops[0]?.reason === "person_name");

  dd = base({ cuenta_emisora: "Cajadeahorroenpesos" });
  rr = sanitizeReceiptCodes(dd);
  check("etiqueta sin dígitos ni punto → null (person_name)", dd.cuenta_emisora === null && rr.drops[0]?.reason === "person_name");

  dd = base({ cuenta_emisora: "CA$3030002083801" });
  rr = sanitizeReceiptCodes(dd);
  check("caja de ahorro (no CBU) → null (not_account)", dd.cuenta_emisora === null && rr.drops[0]?.reason === "not_account");

  dd = base({ cuenta_emisora: "Uala" });
  rr = sanitizeReceiptCodes(dd);
  check("'Uala' en cuenta_emisora → null (bank_name)", dd.cuenta_emisora === null && rr.drops[0]?.reason === "bank_name");

  dd = base({ cuenta_emisora: "000008880001000000967" });
  sanitizeReceiptCodes(dd);
  check("misread de 21 dígitos SE CONSERVA (el flag dice false, el campo no se anula)", dd.cuenta_emisora === "000008880001000000967");

  dd = base({ cuenta_emisora: "00000888000100C00009679" });
  sanitizeReceiptCodes(dd);
  check("letra C en un CBU SE CONSERVA (misread, no otro campo)", dd.cuenta_emisora === "00000888000100C00009679");

  dd = base({ cuenta_emisora: "juan.perez.99" });
  sanitizeReceiptCodes(dd);
  check("alias con punto y números intacto", dd.cuenta_emisora === "juan.perez.99");

  console.log("== anula confusión de campo ==");
  let d = base({ codigo_operacion: "<UNKNOWN>" });
  let r = sanitizeReceiptCodes(d);
  check("placeholder <UNKNOWN> → null (#267)", d.codigo_operacion === null && r.drops[0]?.reason === "placeholder");

  d = base({ codigo_operacion: "N/A", coelsa_id: "S/D" });
  sanitizeReceiptCodes(d);
  check("N/A y S/D → null", d.codigo_operacion === null && d.coelsa_id === null);

  d = base({ codigo_operacion: "20-30010752-5" });
  r = sanitizeReceiptCodes(d);
  check("CUIT con separadores → null (cuit)", d.codigo_operacion === null && r.drops[0]?.reason === "cuit");

  d = base({ codigo_operacion: "00000888000100000009679" });
  r = sanitizeReceiptCodes(d);
  check("23 dígitos numéricos (CVU) → null (numeric_account) (#315)", d.codigo_operacion === null && r.drops[0]?.reason === "numeric_account");

  d = base({ codigo_operacion: "0000088800010000009679", cuenta_receptora: "0000088800010000009679" });
  r = sanitizeReceiptCodes(d);
  check("igual a cuenta_receptora → null", d.codigo_operacion === null);

  console.log("== preserva códigos legítimos ==");
  d = base({ codigo_operacion: "L18MKX9RPXVMQKMV2O6WYV", coelsa_id: "L18MKX9RPXVMQKMV2O6WYV" });
  r = sanitizeReceiptCodes(d);
  check("código alfanumérico real (#439) intacto", d.codigo_operacion === "L18MKX9RPXVMQKMV2O6WYV" && r.drops.length === 0);

  d = base({ codigo_operacion: "112233445566" });
  sanitizeReceiptCodes(d);
  check("código numérico de billetera (12 díg, <18) intacto", d.codigo_operacion === "112233445566");

  d = base({ codigo_operacion: "12345678901" });
  sanitizeReceiptCodes(d);
  check("11 díg numérico NO-CUIT intacto", d.codigo_operacion === "12345678901");

  d = base({ codigo_operacion: "XJ8G7V957AB" });
  sanitizeReceiptCodes(d);
  check("alfanumérico con dígitos intacto", d.codigo_operacion === "XJ8G7V957AB");

  console.log("== UUID de LEMON/Ualá = código legítimo (MSG-PAM-20260727-6) ==");
  d = base({ codigo_operacion: "550e8400-e29b-41d4-a716-446655440000" });
  r = sanitizeReceiptCodes(d);
  check("UUID estándar (hex) intacto", d.codigo_operacion === "550e8400-e29b-41d4-a716-446655440000" && r.drops.length === 0);
  d = base({ coelsa_id: "3F2504E0-4F89-41D3-9A0C-0305E82C3301" });
  sanitizeReceiptCodes(d);
  check("UUID en coelsa_id (mayúsculas) intacto", d.coelsa_id === "3F2504E0-4F89-41D3-9A0C-0305E82C3301");
  d = base({ codigo_operacion: "12345678-1234-1234-1234-123456789012" });
  sanitizeReceiptCodes(d);
  check("UUID íntegramente decimal intacto (no confundir con CBU)", d.codigo_operacion === "12345678-1234-1234-1234-123456789012");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
