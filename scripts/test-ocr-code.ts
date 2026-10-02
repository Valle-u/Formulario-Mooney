/**
 * Validación puntual de lectura del nº de operación/Coelsa (PTMUAT-414).
 * Correr: `npm run test:ocr-code -- <imagen.jpg> <CODIGO_ESPERADO>`
 *
 * Corre el lector Claude (proveedor primario en prod) sobre una imagen real y compara
 * codigo_operacion / coelsa_id contra el valor esperado. Sirve para medir el before/after
 * del endurecimiento del prompt (Plan A). Usa las credenciales del vault local.
 */
import { readFileSync, existsSync } from "node:fs";

// Cargar env del vault local ANTES de importar módulos que leen `env` al importar.
function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv("E:\\credenciales\\GATE\\local.env");
process.env.DB_PATH ??= ":memory:";
process.env.RECEIPT_STORAGE_PATH ??= "E:\\CursorTemp\\ocr-test-storage";

const [, , imgPath, expected] = process.argv;
if (!imgPath || !expected) {
  console.error("uso: npm run test:ocr-code -- <imagen.jpg> <CODIGO_ESPERADO>");
  process.exit(2);
}

const { analyzeWithClaude } = await import("../src/forensic/claude.js");

function collapse(s: string): string {
  // Colapso de clases de confusión OCR (mismo criterio que la tabla propuesta a PAM).
  return s
    .toUpperCase()
    .replace(/[OQD]/g, "0")
    .replace(/[IL|!]/g, "1")
    .replace(/[Z]/g, "2")
    .replace(/[S]/g, "5")
    .replace(/[G]/g, "6")
    .replace(/[B]/g, "8")
    .replace(/[Y]/g, "V");
}

async function run() {
  const buf = readFileSync(imgPath);
  console.log(`imagen: ${imgPath} (${buf.length} bytes)`);
  console.log(`esperado: ${expected}`);
  const ext = await analyzeWithClaude(buf, "image/jpeg");
  if (process.env.DUMP === "1") console.log("extraction:", JSON.stringify(ext, null, 2));
  const got = ext.codigo_operacion ?? ext.coelsa_id ?? "";
  console.log(`leído   : codigo_operacion=${ext.codigo_operacion} · coelsa_id=${ext.coelsa_id} · conf=${ext.confianza}`);
  const exact = got === expected;
  const collapsed = collapse(got) === collapse(expected);
  console.log(`EXACTO  : ${exact ? "SÍ ✓" : "NO ✗"}`);
  console.log(`COLAPSADO (match tolerante PAM): ${collapsed ? "SÍ ✓" : "NO ✗"}`);
  if (!exact) {
    console.log(`  got      = ${got}`);
    console.log(`  expected = ${expected}`);
  }
}

await run();
