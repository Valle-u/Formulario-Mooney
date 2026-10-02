/**
 * Test de la normalización post-OCR de cuentas (dep #178 DolarApp/ARQ).
 * Correr: `npm run test:normalize` (usa tsx, no requiere build).
 */
import { normalizeOcrCbuStandalone, cbuChecksumValid, normalizeExtractionAccounts, looksLikeMisreadCbu } from "../src/forensic/normalize.js";
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

console.log("normalizeOcrCbuStandalone:");

// 1) CBU con separadores → 22 dígitos limpios
{
  const r = normalizeOcrCbuStandalone("0170 0999 3000 0012 3456 78");
  check("strip separadores CBU", r.value === "0170099930000012345678" && r.changed && r.kind === "cbu", r);
}

// 2) CVU (000...) → clasifica cvu
{
  const r = normalizeOcrCbuStandalone("0000003100000012345678");
  check("clasifica CVU (000...)", r.value === "0000003100000012345678" && r.kind === "cvu", r);
}

// 3) Corrección OCR letra→dígito (O→0) manteniendo 22 dígitos
{
  const r = normalizeOcrCbuStandalone("O170099930000012345678");
  check("corrige O→0 en CBU", r.value === "0170099930000012345678" && r.corrected && r.kind === "cbu", r);
}

// 4) Etiqueta líder "CBU:" removida
{
  const r = normalizeOcrCbuStandalone("CBU: 0170099930000012345678");
  check("remueve etiqueta CBU:", r.value === "0170099930000012345678" && r.changed, r);
}

// 5) Alias con letras/puntos → intacto
{
  const r = normalizeOcrCbuStandalone("juan.perez.mp");
  check("alias intacto", r.value === "juan.perez.mp" && r.kind === "alias" && !r.changed, r);
}

// 6) Alias con espacios de OCR → sin espacios
{
  const r = normalizeOcrCbuStandalone("dolar app arq");
  check("alias sin espacios", r.value === "dolarapparq" && r.kind === "alias" && r.changed, r);
}

// 7) null / vacío → empty
{
  const r = normalizeOcrCbuStandalone(null);
  check("null → empty", r.value === null && r.kind === "empty", r);
}

// 8) Dígitos de largo raro (21) → kind digits, no CBU
{
  const r = normalizeOcrCbuStandalone("017009993000001234567");
  check("21 dígitos → kind digits", r.value === "017009993000001234567" && r.kind === "digits", r);
}

console.log("cbuChecksumValid:");
{
  const zeros = "0000000000000000000000";
  check("todo-ceros pasa checksum", cbuChecksumValid(zeros) === true, zeros);
  const flipped = "0000000000000000000001"; // rompe verificador del bloque 2
  check("flip de dígito rompe checksum", cbuChecksumValid(flipped) === false, flipped);
  check("no-22-dígitos → false", cbuChecksumValid("123") === false);
  // #444 (MSG-PAM-20260728-6): CBU emisor real vs misleído por OCR (dígitos corridos).
  check("#444 CBU real pasa checksum", cbuChecksumValid("0000003100017326755666") === true);
  check("#444 CBU misleído FALLA checksum (los 2 bloques)", cbuChecksumValid("0000031000173267556666") === false);
}

console.log("looksLikeMisreadCbu (#451, letra en campo de CBU):");
{
  // #451: OCR metió una "I" en un CBU (21 chars) → cbuChecksumValid no aplica, pero es misread seguro.
  check("#451 CBU con 'I' → misread", looksLikeMisreadCbu("0000031000004007I5658") === true);
  check("#451 CBU real (22 díg puros) → NO misread (lo agarra el checksum)", looksLikeMisreadCbu("0000003100000400715658") === false);
  check("alias legítimo NO es misread", looksLikeMisreadCbu("juan.perez.mp") === false);
  check("alias largo con pocos dígitos NO es misread", looksLikeMisreadCbu("empresa.pagos.2024.mp") === false);
  check("null NO es misread", looksLikeMisreadCbu(null) === false);
  check("CBU con 1 letra en 22 (ratio 0.95) → misread", looksLikeMisreadCbu("00000310000040071S658X") === true);
}

console.log("normalizeExtractionAccounts (in place):");
{
  const data = {
    monto: 1000,
    codigo_operacion: null,
    fecha: null,
    nombre_emisor: null,
    cuenta_emisora: "0170 0999 3000 0012 3456 78",
    cuenta_receptora: "CVU 0000003100000012345678",
    entidad_emisora: "DolarApp",
    tipo_operacion: "transferencia",
    confianza: 0.9,
    signos_edicion: false,
    es_comprobante_valido: true,
    coelsa_id: null,
    observaciones: null,
    estado_comprobante: "confirmado",
  } as ReceiptExtraction;
  const report = normalizeExtractionAccounts(data);
  check(
    "muta cuenta_receptora/emisora",
    data.cuenta_receptora === "0000003100000012345678" &&
      data.cuenta_emisora === "0170099930000012345678" &&
      report.receptora.changed,
    { data, report },
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
