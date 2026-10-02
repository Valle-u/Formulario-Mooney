/**
 * Import de lote para la base que aprende (PTMUAT-414 c). Correr:
 *   npm run ocr-eval:import -- <archivo.json|.csv>
 *
 * Canal para cargar el histórico (ej. los 14 pares del corpus) sin el endpoint. Cada fila aporta
 * el "era en realidad"; GATE deriva lo que leyó de la extracción guardada (si el scan sigue en la
 * BD) y retiene la imagen si está viva. Reusa el MISMO módulo de ingesta que el endpoint.
 *
 * Formatos:
 *   JSON: [ { "scan_id": "...", "code_truth": "...", "field"?: "...", "code_read"?: "...", "note"?: "..." }, ... ]
 *   CSV : cabecera con columnas scan_id,code_truth[,field,code_read,note] (una fila por caso)
 */
import { readFileSync, existsSync } from "node:fs";

const [, , filePath] = process.argv;
if (!filePath || !existsSync(filePath)) {
  console.error("uso: npm run ocr-eval:import -- <archivo.json|.csv>");
  process.exit(2);
}

const { ingestFeedback } = await import("../../src/forensic/ocr-feedback-ingest.js");

interface Row {
  scan_id: string;
  code_truth: string;
  field?: "codigo_operacion" | "coelsa_id";
  code_read?: string;
  note?: string;
}

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return [];
  const header = lines[0]!.split(",").map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iScan = idx("scan_id"), iTruth = idx("code_truth"), iField = idx("field"), iRead = idx("code_read"), iNote = idx("note");
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const scan_id = (cols[iScan] ?? "").trim();
    const code_truth = (cols[iTruth] ?? "").trim();
    if (!scan_id || !code_truth) continue;
    const row: Row = { scan_id, code_truth };
    if (iField >= 0 && cols[iField]?.trim()) row.field = cols[iField]!.trim() as Row["field"];
    if (iRead >= 0 && cols[iRead]?.trim()) row.code_read = cols[iRead]!.trim();
    if (iNote >= 0 && cols[iNote]?.trim()) row.note = cols[iNote]!.trim();
    rows.push(row);
  }
  return rows;
}

function loadRows(path: string): Row[] {
  const text = readFileSync(path, "utf8");
  if (path.toLowerCase().endsWith(".json")) return JSON.parse(text) as Row[];
  return parseCsv(text);
}

async function run() {
  const rows = loadRows(filePath!);
  if (rows.length === 0) { console.error("archivo sin filas válidas (scan_id + code_truth)"); process.exit(1); }

  let ok = 0, imgs = 0, notFound = 0;
  for (const r of rows) {
    const res = ingestFeedback({
      scanId: r.scan_id,
      codeTruth: r.code_truth,
      field: r.field,
      codeRead: r.code_read,
      source: "batch",
      note: r.note ?? "import-batch",
    });
    ok++;
    if (res.image_retained) imgs++;
    if (!res.scan_found) notFound++;
    console.log(`  ${r.scan_id} ${res.field} exact=${res.exact_match} class=${res.confusion_class} img=${res.image_retained} scan=${res.scan_found}`);
  }
  console.log(`\nimportadas ${ok} filas · ${imgs} con imagen retenida · ${notFound} sin scan en BD (feedback textual)`);
}

await run();
