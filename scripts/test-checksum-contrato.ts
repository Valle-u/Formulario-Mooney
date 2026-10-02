/**
 * Test del checksum de cuentas y de su contrato (MSG-PAM-20260813-20). Correr:
 * `npm run test:checksum`.
 *
 * Dos cosas distintas que se protegen acá:
 *
 * 1. QUE EL FLAG SEA ARITMÉTICA Y NO UNA OPINIÓN. PAM midió el mismo CVU con veredictos distintos y
 *    dedujo que lo emitía el modelo junto con la extracción. No: lo calcula `cbuChecksumValid`
 *    (COELSA) y el schema que se le manda al modelo ni siquiera declara el campo. Lo que variaba era
 *    la ENTRADA — el OCR leyó dígitos distintos en corridas distintas.
 *
 * 2. QUE LA CLAVE EXISTA AUNQUE EL VALOR SEA null. PAM tiene una alarma en prod (PR #615) que mide
 *    la PRESENCIA de la clave para enterarse si `RECEIPT_SANITIZE_INVALID_CBU` se apaga sin aviso
 *    —cosa que casi pasa el 13/08—. Si algún día se "prolijea" el JSON omitiendo los null, esa alarma
 *    suena como si el flag estuviera apagado. La clave presente con null es contrato.
 */
import { cbuChecksumValid, looksLikeMisreadCbu, normalizeOcrCbuStandalone } from "../src/forensic/normalize.js";
import { sanitizeReceiptCodes } from "../src/forensic/code-sanity.js";
import type { ReceiptExtraction } from "../src/forensic/types.js";

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detalle?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detalle ? ` — ${detalle}` : ""}`); }
}

/** Réplica de `accountChecksumFlag` de receipt-reader.ts (no se exporta desde ahí). */
const flag = (raw: string | null): boolean | null => {
  const norm = normalizeOcrCbuStandalone(raw);
  if (norm.checksumValid !== null) return norm.checksumValid;
  if (norm.kind === "digits") return false;
  if (looksLikeMisreadCbu(norm.value)) return false;
  return null;
};

/** El CVU del riel de PAM y lo que el OCR leyó en los tres comprobantes reales del 12/08. */
const CVU_REAL = "0000088800010000009679";
const CVU_LEIDO = "0000088800010000000967";

console.log("== el flag es aritmética: mismo número, mismo veredicto, siempre ==");

check("el CVU real del riel de PAM valida", cbuChecksumValid(CVU_REAL));
check("lo que el OCR leyó NO valida (un 0 de más, se cayó el 9 final)", !cbuChecksumValid(CVU_LEIDO));
check("y son números distintos, que es todo el asunto", CVU_REAL !== CVU_LEIDO);

check(
  "el veredicto no depende de la corrida: 50 evaluaciones, un solo resultado",
  new Set(Array.from({ length: 50 }, () => cbuChecksumValid(CVU_REAL))).size === 1,
);

check(
  "el mismo número escrito de seis formas da el mismo veredicto",
  [
    CVU_REAL,
    "0000 0888 0001 0000 0096 79",
    "CVU: 0000088800010000009679",
    "00000888-00010000009679",
    "OOOOO88800010000009679", // O mayúscula por cero: corrección OCR letra→dígito
    "cuenta destino 0000088800010000009679",
  ].every((v) => flag(v) === true),
);

check("un dígito cambiado lo agarra", !cbuChecksumValid("2850590940090418135202"));
check("y el mismo CBU bien escrito pasa", cbuChecksumValid("2850590940090418135201"));

console.log("\n== un largo distinto de 22 es misread SEGURO, no 'no aplica' (MSG-PAM-20260813-21) ==");

// El hueco que tuvo el flag hasta el 13/08: el checksum no corre sobre 21 o 23 dígitos y devolvía
// null, y `looksLikeMisreadCbu` se abstiene con dígitos puros. Resultado: 34 de 45 misreads de la
// cuenta de PAM salían como "no hay cuenta que validar", indistinguibles de un alias legítimo.
const MISREADS_REALES = [
  "000008880001000000967", // 21 — Mercado Pago, x13
  "00000888000100000009679", // 23 — LEMON/BNA+, x12
  "00000088800010000009679", // 23 — Banco Coinag, x6
  "000088800010000009679", // 21 — BNA+, x3
  "0000088800010000000967", // 22 con checksum roto, x6
  "0000088800001000000096", // 22 con checksum roto, x3
  "00000888000100C00009679", // 23 con una C donde va un 0, x2
];
check(
  "las 7 variantes del corpus de PAM salen como false, ninguna como null",
  MISREADS_REALES.every((v) => flag(v) === false),
  MISREADS_REALES.map((v) => `${v}=${flag(v)}`).join(" · "),
);

check("21 dígitos puros → false", flag("000008880001000000967") === false);
check("23 dígitos puros → false", flag("00000888000100000009679") === false);

// Lo que NO se puede volver false, porque es lo que separa un misread de un dato que no aplica.
check("un CBU/CVU válido de 22 sigue en true", flag(CVU_REAL) === true);
check(
  "una cuenta válida con 8 ceros seguidos sigue en true (el falso positivo obvio)",
  flag("0000155300000000009885") === true,
);
check("un alias legítimo sigue en null", flag("mi.alias.mp") === null);
check("un alias con números y puntos sigue en null", flag("juan.perez.99") === null);
check("un CUIT de 11 dígitos sigue en null (no tiene largo de cuenta)", flag("20300107525") === null);
check("vacío sigue en null", flag(null) === null);

console.log("\n== la clave existe aunque el valor sea null (lo que PAM monitorea en prod) ==");

// Simula el bloque de receipt-reader.ts que corre con RECEIPT_SANITIZE_INVALID_CBU=true.
const emitir = (emisora: string | null, receptora: string | null): ReceiptExtraction => {
  const data = { cuenta_emisora: emisora, cuenta_receptora: receptora } as ReceiptExtraction;
  data.cuenta_emisora_checksum_valid = flag(emisora);
  data.cuenta_receptora_checksum_valid = flag(receptora);
  return data;
};

const casos: Array<[string, string | null, string | null]> = [
  ["las dos cuentas presentes", CVU_REAL, CVU_LEIDO],
  ["sin cuenta emisora (los 3 comprobantes reales de prod)", null, CVU_LEIDO],
  ["sin ninguna de las dos", null, null],
  ["alias legítimo, que no tiene checksum posible", "mi.alias.mp", "otro.alias"],
];

for (const [etiqueta, emisora, receptora] of casos) {
  const data = emitir(emisora, receptora);
  const round = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  check(
    `${etiqueta}: las dos claves sobreviven al JSON`,
    Object.prototype.hasOwnProperty.call(round, "cuenta_emisora_checksum_valid") &&
      Object.prototype.hasOwnProperty.call(round, "cuenta_receptora_checksum_valid"),
    `emitido: ${JSON.stringify(round)}`,
  );
}

check(
  "un null se serializa como null y NO desaparece (JSON.stringify borra undefined, no null)",
  JSON.stringify(emitir(null, null)).includes('"cuenta_emisora_checksum_valid":null'),
);

check(
  "el flag nunca sale undefined: sería la única forma de que la clave se pierda",
  casos.every(([, e, r]) => {
    const d = emitir(e, r);
    return d.cuenta_emisora_checksum_valid !== undefined && d.cuenta_receptora_checksum_valid !== undefined;
  }),
);

console.log("\n== cómo distingue PAM un false de un 'no encontré la cuenta' (MSG-PAM-20260813-26) ==");
console.log("  campo null + flag null  = no hay cuenta (CUIT, nombre, UNKNOWN)");
console.log("  campo con dígitos + false = misread de un número");

const pipeline = (emisora: string | null): { campo: string | null; flag: boolean | null } => {
  const data = {
    monto: 1, codigo_operacion: null, fecha: null, nombre_emisor: "Victor Trimboli",
    cuenta_emisora: emisora, cuenta_receptora: null, entidad_emisora: "LEMON",
    tipo_operacion: null, confianza: 1, signos_edicion: false, es_comprobante_valido: true,
    coelsa_id: null, observaciones: null,
  } as ReceiptExtraction;
  sanitizeReceiptCodes(data);
  return { campo: data.cuenta_emisora, flag: flag(data.cuenta_emisora) };
};

let p = pipeline("20-41564402-8");
check("CUIT → campo null y flag null (no es un false)", p.campo === null && p.flag === null);
p = pipeline("<UNKNOWN>");
check("<UNKNOWN> → campo null y flag null", p.campo === null && p.flag === null);
p = pipeline("VictorTrimboli");
check("nombre → campo null y flag null", p.campo === null && p.flag === null);
p = pipeline("000008880001000000967");
check("21 dígitos → campo CONSERVADO y flag false (misread)", p.campo === "000008880001000000967" && p.flag === false);
p = pipeline("00000888000100C00009679");
check("letra C en CBU → campo CONSERVADO y flag false (misread)", p.campo === "00000888000100C00009679" && p.flag === false);
p = pipeline(CVU_REAL);
check("CVU real → campo intacto y flag true", p.campo === CVU_REAL && p.flag === true);

console.log(`\n${passed} ok, ${failed} fallos`);
process.exit(failed === 0 ? 0 : 1);
