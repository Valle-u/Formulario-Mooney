/**
 * Corre el corpus de misreads que mandó PAM (MSG-PAM-20260813-21) por MI propio flag de checksum.
 * Correr: `npx tsx scripts/test-corpus-cvu-pam.ts`.
 *
 * La pregunta que contesta no es "leí mal" —eso ya está medido— sino QUÉ LE DIJE A PAM cada vez que
 * leí mal. Si un misread sale con `checksum_valid=null`, del otro lado se lee "no hay cuenta que
 * validar", que es lo mismo que dice un alias legítimo.
 */
import { looksLikeMisreadCbu, normalizeOcrCbuStandalone } from "../src/forensic/normalize.js";

const CUENTA_REAL = "0000088800010000009679";

/** Réplica de `accountChecksumFlag` (receipt-reader.ts, no se exporta). ANTES del arreglo del 13/08. */
const flagViejo = (raw: string | null): boolean | null => {
  const norm = normalizeOcrCbuStandalone(raw);
  if (norm.checksumValid !== null) return norm.checksumValid;
  if (looksLikeMisreadCbu(norm.value)) return false;
  return null;
};

/** El de ahora: suma `kind === "digits"` como misread seguro. */
const flag = (raw: string | null): boolean | null => {
  const norm = normalizeOcrCbuStandalone(raw);
  if (norm.checksumValid !== null) return norm.checksumValid;
  if (norm.kind === "digits") return false;
  if (looksLikeMisreadCbu(norm.value)) return false;
  return null;
};

/** Las 7 variantes que PAM listó con su frecuencia. Todas son SU MISMA CUENTA leída mal. */
const CORPUS: Array<{ valor: string; veces: number; emisores: string }> = [
  { valor: "000008880001000000967", veces: 13, emisores: "Mercado Pago" },
  { valor: "00000888000100000009679", veces: 12, emisores: "LEMON, Lemon, BNA+, Digifin" },
  { valor: "0000088800010000000967", veces: 6, emisores: "LEMON, Digifin, Uala, Mercado Pago" },
  { valor: "00000088800010000009679", veces: 6, emisores: "Banco Coinag, Mercado Pago" },
  { valor: "000088800010000009679", veces: 3, emisores: "BNA+" },
  { valor: "0000088800001000000096", veces: 3, emisores: "Mercado Pago" },
  { valor: "00000888000100C00009679", veces: 2, emisores: "(sin emisor detectado)" },
];

console.log(`Cuenta real de PAM: ${CUENTA_REAL} (22 dígitos)\n`);
console.log("valor leído                largo  flag que emití   veces  emisores");
console.log("-".repeat(96));

let comoFalse = 0;
let comoNull = 0;
let comoTrue = 0;

for (const { valor, veces, emisores } of CORPUS) {
  const f = flag(valor);
  const etiqueta =
    f === false ? "false (misread)" : f === null ? "null  (NO APLICA)" : "true  (¡válido!)";
  if (f === false) comoFalse += veces;
  else if (f === null) comoNull += veces;
  else comoTrue += veces;
  console.log(
    `${valor.padEnd(26)} ${String(valor.length).padEnd(6)} ${etiqueta.padEnd(18)} x${String(veces).padEnd(5)} ${emisores}`,
  );
}

const total = comoFalse + comoNull + comoTrue;
console.log("-".repeat(96));
console.log(`\nDe ${total} lecturas MAL de la cuenta de PAM, esto es lo que le dije:`);
console.log(`  false  = "los dígitos que te mando no son válidos"   ${comoFalse} (${Math.round((comoFalse / total) * 100)}%)`);
console.log(`  null   = "no hay cuenta que validar"                 ${comoNull} (${Math.round((comoNull / total) * 100)}%)  <-- se lee igual que un alias`);
console.log(`  true   = "está bien leída"                           ${comoTrue}`);

console.log("\n¿Por qué el null? El largo:");
for (const { valor } of CORPUS) {
  const n = normalizeOcrCbuStandalone(valor);
  const puros = /^\d+$/.test(valor);
  console.log(
    `  ${valor.padEnd(26)} largo=${String(valor.length).padEnd(3)} dígitos puros=${String(puros).padEnd(6)} kind=${String(n.kind).padEnd(8)} checksumValid=${String(n.checksumValid)}`,
  );
}

console.log(`
El checksum COELSA exige 22 dígitos exactos, así que sobre 21 o 23 no corre y devuelve null. Y
looksLikeMisreadCbu se abstiene a propósito con dígitos puros -su comentario dice "lo maneja el
checksum"-, pero el checksum NO lo maneja: no aplica. Entre las dos funciones queda un hueco por
el que se va un misread SEGURO -un CBU/CVU tiene 22 dígitos siempre- reportado como "no aplica".`);

console.log("\n== EFECTO DEL ARREGLO (kind 'digits' = misread seguro) ==");
let antesNull = 0;
let ahoraFalse = 0;
for (const { valor, veces } of CORPUS) {
  const a = flagViejo(valor);
  const d = flag(valor);
  if (a === null) antesNull += veces;
  if (d === false) ahoraFalse += veces;
  if (a !== d) console.log(`  ${valor.padEnd(26)} ${String(a).padEnd(5)} -> ${String(d).padEnd(5)}  (x${veces})`);
}
console.log(`\n  misreads reportados como "no aplica":  antes ${antesNull}/45  ->  ahora ${45 - ahoraFalse}/45`);
console.log(`  misreads reportados como misread:     antes ${45 - antesNull}/45  ->  ahora ${ahoraFalse}/45`);

console.log("\n== CONTROL: lo que NO tiene que cambiar ==");
const controles: Array<[string, string | null, boolean | null]> = [
  ["la cuenta real de PAM", CUENTA_REAL, true],
  ["otra cuenta válida con 8 ceros seguidos", "0000155300000000009885", true],
  ["un alias legítimo", "mi.alias.mp", null],
  ["un alias con puntos y números", "juan.perez.99", null],
  ["vacío", null, null],
  ["un CUIT (11 dígitos, no es cuenta)", "20300107525", null],
  ["un número corto cualquiera", "1234567890", null],
  ["un CBU válido de banco", "2850590940090418135201", true],
  ["el mismo con un dígito cambiado", "2850590940090418135202", false],
];
let okControl = 0;
for (const [etiqueta, valor, esperado] of controles) {
  const d = flag(valor);
  const ok = d === esperado;
  if (ok) okControl++;
  console.log(`  ${ok ? "✓" : "✗"} ${etiqueta.padEnd(42)} flag=${String(d).padEnd(5)} esperado=${String(esperado)}`);
}
console.log(`\n  ${okControl}/${controles.length} controles OK`);

console.log("\n¿La hipótesis de PAM se sostiene? Todas difieren en corridas de ceros:");
for (const { valor } of CORPUS) {
  const corridas = (s: string) => (s.match(/0+/g) ?? []).map((c) => c.length).join("-");
  console.log(
    `  ${valor.padEnd(26)} corridas de 0: ${corridas(valor).padEnd(16)} sin ceros: ${valor.replace(/0/g, "")}`,
  );
}
console.log(`  ${CUENTA_REAL.padEnd(26)} corridas de 0: ${(CUENTA_REAL.match(/0+/g) ?? []).map((c) => c.length).join("-").padEnd(16)} sin ceros: ${CUENTA_REAL.replace(/0/g, "")}  <-- la real`);
