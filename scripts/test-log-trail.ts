/**
 * Test de la traza de log. Se prueba con ganas porque este código BORRA ARCHIVOS: un error de signo
 * o de comparación destruye exactamente la evidencia que la traza existe para conservar.
 *
 *   npm run test:log-trail
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearTrazaDiaria, limpiarTrazasVencidas } from "../src/lib/log-trail.js";

let ok = 0;
let fallos = 0;

function chequear(nombre: string, condicion: boolean, detalle?: unknown): void {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.log(`  ✗ ${nombre}${detalle === undefined ? "" : ` → ${JSON.stringify(detalle)}`}`);
  }
}

const base = mkdtempSync(join(tmpdir(), "gate-trail-"));

// ── Retención: qué se borra y qué NO ──────────────────────────────────────
{
  const dir = join(base, "retencion");
  mkdirSync(dir, { recursive: true });
  const ahora = new Date("2026-08-13T04:00:00Z");

  const archivos = {
    "gate-2026-08-13.jsonl": "hoy",
    "gate-2026-08-12.jsonl": "ayer",
    "gate-2026-08-07.jsonl": "hace 6 dias, dentro de la ventana",
    "gate-2026-08-06.jsonl": "hace 7 dias, justo en el borde",
    "gate-2026-08-01.jsonl": "hace 12 dias, vencido",
    "gate-2026-07-04.jsonl": "hace mas de un mes, vencido",
    "receipt-gate.db": "NO es una traza",
    "gate-corrupto.jsonl": "nombre sin fecha valida",
    "otro-2026-01-01.jsonl": "otro prefijo",
  };
  for (const n of Object.keys(archivos)) writeFileSync(join(dir, n), "x");

  const borradas = limpiarTrazasVencidas(dir, 7, ahora);
  const quedan = readdirSync(dir).sort();

  chequear("borra las dos trazas vencidas y sólo esas", borradas === 2, { borradas, quedan });
  chequear("conserva la de hoy", quedan.includes("gate-2026-08-13.jsonl"), quedan);
  chequear("conserva la de hace 6 días", quedan.includes("gate-2026-08-07.jsonl"), quedan);
  chequear("conserva el borde exacto de 7 días", quedan.includes("gate-2026-08-06.jsonl"), quedan);
  chequear("borra la de hace 12 días", !quedan.includes("gate-2026-08-01.jsonl"), quedan);
  // Lo más importante de esta tanda: la limpieza no puede tocar nada que no haya escrito ella.
  chequear("NO toca la base de datos", quedan.includes("receipt-gate.db"), quedan);
  chequear("NO toca un nombre sin fecha válida", quedan.includes("gate-corrupto.jsonl"), quedan);
  chequear("NO toca archivos de otro prefijo", quedan.includes("otro-2026-01-01.jsonl"), quedan);
}

// ── Retención 0 días no debe barrer el archivo del día en curso ───────────
{
  const dir = join(base, "cero");
  mkdirSync(dir, { recursive: true });
  const ahora = new Date("2026-08-13T04:00:00Z");
  writeFileSync(join(dir, "gate-2026-08-13.jsonl"), "x");
  writeFileSync(join(dir, "gate-2026-08-12.jsonl"), "x");
  limpiarTrazasVencidas(dir, 0, ahora);
  const quedan = readdirSync(dir);
  chequear("con retención 0 sobrevive el día en curso", quedan.includes("gate-2026-08-13.jsonl"), quedan);
}

// ── Un directorio que no existe no puede romper el arranque ───────────────
{
  let exploto = false;
  try {
    limpiarTrazasVencidas(join(base, "no-existe"), 7);
  } catch {
    exploto = true;
  }
  chequear("un directorio inexistente no lanza", !exploto);
}

// ── Escritura: crea el archivo del día y guarda lo escrito ────────────────
{
  const dir = join(base, "escritura");
  const traza = crearTrazaDiaria(dir, 7);
  const hoy = new Date().toISOString().slice(0, 10);
  traza.write(`{"event":"prueba","n":1}\n`);
  traza.write(`{"event":"prueba","n":2}\n`);
  await new Promise((r) => setTimeout(r, 120));

  const esperado = join(dir, `gate-${hoy}.jsonl`);
  chequear("crea el archivo del día UTC", existsSync(esperado), readdirSync(dir));
  if (existsSync(esperado)) {
    const contenido = (await import("node:fs")).readFileSync(esperado, "utf8");
    chequear("escribe las dos líneas", contenido.split("\n").filter(Boolean).length === 2, contenido);
  }
}

// ── El directorio se crea solo si no existe ───────────────────────────────
{
  const dir = join(base, "anidado", "profundo", "logs");
  crearTrazaDiaria(dir, 7);
  chequear("crea el directorio anidado", existsSync(dir));
}

rmSync(base, { recursive: true, force: true });

console.log(`\n${ok} ok, ${fallos} fallos`);
process.exit(fallos === 0 ? 0 : 1);
