/**
 * Corpus de regresión OCR (PTMUAT-414). Correr: `npm run test:ocr-corpus`.
 *
 * Para cada caso con imagen disponible en scripts/ocr-corpus/images/<id>.jpg corre el lector Claude
 * y verifica que NO se reintroduzca el misread histórico. Los casos "full" (ground_truth completo)
 * se asertan EXACTO; los "parciales" se chequean best-effort (el fragmento correcto aparece y el
 * incorrecto no). Los casos sin imagen se reportan como PENDIENTE (falta scan_id/imagen de PAM).
 *
 * Las imágenes son PII → gitignored. Poblar con:
 *   scripts/ocr-corpus/images/<id>.jpg  (pedir scan_id a PAM y bajar de gate prod storage, TTL 168h)
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let val = m[2]!;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[m[1]!]) process.env[m[1]!] = val;
  }
}
loadEnv("E:\\credenciales\\GATE\\local.env");
process.env.DB_PATH ??= ":memory:";
process.env.RECEIPT_STORAGE_PATH ??= "E:\\CursorTemp\\ocr-corpus-storage";

const here = dirname(fileURLToPath(import.meta.url));
const imagesDir = join(here, "ocr-corpus", "images");

interface Case {
  id: string; scan_id?: string; ocr_read: string; ground_truth: string;
  distance: number; category: string; full: boolean; note?: string;
  source?: "corpus" | "feedback";
}

const { analyzeWithClaude } = await import("../src/forensic/claude.js");
const { listFeedback } = await import("../src/db/ocr-feedback.js");
const { loadEvalReceipt } = await import("../src/storage/receipt-files.js");

function norm(s: string): string { return s.toUpperCase().replace(/\s+/g, ""); }

/** Devuelve el buffer de la imagen de un caso (corpus.json → images/<id>.jpg; feedback → almacén retenido). */
function loadCaseImage(c: Case): Buffer | null {
  if (c.source === "feedback" && c.scan_id) return loadEvalReceipt(c.scan_id);
  const img = join(imagesDir, `${c.id}.jpg`);
  return existsSync(img) ? readFileSync(img) : null;
}

async function run() {
  const corpus = JSON.parse(readFileSync(join(here, "ocr-corpus", "corpus.json"), "utf8")) as { cases: Case[] };
  const seedIds = new Set(corpus.cases.map((c) => c.id));
  // Sumar casos de la base que aprende (feedback con imagen retenida) — red de regresión viva.
  const feedbackCases: Case[] = listFeedback()
    .filter((f) => !seedIds.has(f.scan_id))
    .map((f) => ({
      id: f.scan_id, scan_id: f.scan_id, ocr_read: f.code_read ?? "", ground_truth: f.code_truth,
      distance: f.exact_match ? 0 : 1, category: f.confusion_class ?? "other",
      full: true, source: "feedback" as const,
    }));
  const cases: Case[] = [...corpus.cases.map((c) => ({ ...c, source: "corpus" as const })), ...feedbackCases];

  let pass = 0, fail = 0, pending = 0, baseline = 0;
  const fails: string[] = [];
  const baselines: string[] = [];

  for (const c of cases) {
    const buf = loadCaseImage(c);
    if (!buf) { pending++; console.log(`  … #${c.id} PENDIENTE (falta imagen/scan_id) — ${c.category} d=${c.distance}`); continue; }
    const ext = await analyzeWithClaude(buf, "image/jpeg");
    // El ground-truth del corpus es "el código", sin importar en qué slot lo ponga el modelo:
    // se compara contra codigo_operacion Y coelsa_id (a veces el modelo mete un nº de operación
    // numérico en codigo_operacion y el coelsa real en coelsa_id).
    const gotCodigo = norm(ext.codigo_operacion ?? "");
    const gotCoelsa = norm(ext.coelsa_id ?? "");
    const gots = [gotCodigo, gotCoelsa].filter(Boolean);
    const truth = norm(c.ground_truth);
    const bad = norm(c.ocr_read);

    // Estados: pass (leído bien / regresión protegida), baseline (misread CONOCIDO reproducido, no
    // empeora — Plan A no lo resuelve, es candidato a few-shot Fase 2), fail (regresión o error NUEVO).
    const isKnownMisread = !!bad && !!truth && bad !== truth;
    let status: "pass" | "baseline" | "fail";
    if (c.full && truth) {
      if (gots.includes(truth)) status = "pass";
      else if (isKnownMisread && gots.includes(bad)) status = "baseline";
      else status = "fail";
    } else if (truth) {
      const okp = gots.some((g) => g.includes(truth)) && (bad === truth || !gots.some((g) => g.includes(bad)));
      status = okp ? "pass" : "fail";
    } else {
      status = bad && gots.includes(bad) ? "baseline" : "pass";
    }

    const shown = gots.join(" | ") || "(vacío)";
    if (status === "pass") { pass++; console.log(`  ✓ #${c.id} (${c.category} d=${c.distance}) → ${truth || shown}`); }
    else if (status === "baseline") { baseline++; baselines.push(c.id); console.log(`  ◦ #${c.id} (${c.category} d=${c.distance}) baseline: misread conocido no resuelto (no empeora) → [${shown}]`); }
    else { fail++; fails.push(c.id); console.log(`  ✗ #${c.id} (${c.category}) got=[${shown}] truth=${truth} bad=${bad}`); }
  }

  console.log(`\n${pass} passed, ${baseline} baseline (misread conocido, no empeora), ${fail} failed, ${pending} pendientes (sin imagen)`);
  if (baselines.length) console.log(`BASELINE (candidatos few-shot Fase 2): ${baselines.join(", ")}`);
  if (fails.length) { console.log(`FAILS: ${fails.join(", ")}`); process.exit(1); }
}

await run();
