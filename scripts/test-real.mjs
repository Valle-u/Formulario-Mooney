// Test real contra comprobantes de verdad.
// Carpeta oficial (Drive): https://drive.google.com/drive/folders/1X014DuCtbYDvFc_0CTY9bFvmHjgNoZeM
// Uso: node scripts/test-real.mjs [dir] [baseUrl] [token]
// Recorre cada archivo, lo manda a POST /scan y reporta: saneo (E0-E2),
// extracción (E3 si hay IA) y acierto de detección de banco (E3b) vs el nombre del archivo.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, basename } from "node:path";

const DIR =
  process.argv[2] ??
  "C:/Users/lauta/Desktop/Comprobantes para lector/extraidos/Comprobantes para lector";
const BASE = process.argv[3] ?? "http://localhost:4100";
const TOKEN = process.argv[4] ?? process.env.RECEIPT_GATE_TOKENS?.split(",")[0] ?? "";

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif", ".avif", ".gif", ".tiff", ".pdf"]);

// Nombre de archivo → banco esperado (normalizado simple para comparar con bank.canonical).
function expectedBankFromName(file) {
  const base = basename(file, extname(file))
    .replace(/\(\d+\)/g, "")
    .replace(/\d{3,}-\d+/g, "") // ids tipo 87668-1771518580
    .trim()
    .toLowerCase();
  return base;
}

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(banco|el|de|del|la|online|banking|pay)\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bankMatches(expectedName, detectedCanonical) {
  if (!detectedCanonical) return false;
  const e = norm(expectedName);
  const d = norm(detectedCanonical);
  if (!e || !d) return false;
  return e.includes(d) || d.includes(e) || e.split(" ").some((w) => w.length >= 4 && d.includes(w));
}

const headers = { "content-type": "application/json" };
if (TOKEN) headers["authorization"] = `Bearer ${TOKEN}`;

async function scan(buffer, file) {
  const res = await fetch(`${BASE}/scan`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      subject_id: "realtest-" + basename(file) + "-" + Date.now(),
      channel: "other",
      filename: basename(file),
      data_base64: buffer.toString("base64"),
    }),
  });
  return { http: res.status, json: await res.json() };
}

const files = readdirSync(DIR)
  .filter((f) => IMG_EXT.has(extname(f).toLowerCase()))
  .filter((f) => statSync(join(DIR, f)).isFile());

console.log(`\nTest real @ ${BASE}`);
console.log(`Carpeta: ${DIR}`);
console.log(`Archivos: ${files.length}\n`);

let accepted = 0,
  rejected = 0,
  failed = 0,
  forensicOk = 0,
  bankOk = 0,
  bankChecked = 0;

const rows = [];

for (const f of files) {
  const buffer = readFileSync(join(DIR, f));
  let r;
  try {
    r = await scan(buffer, f);
  } catch (e) {
    failed++;
    rows.push({ file: f, status: "ERROR", detail: e.message });
    continue;
  }
  const j = r.json;
  if (j.status === "accepted") {
    accepted++;
    const expected = expectedBankFromName(f);
    let bankCell = "—";
    if (j.forensic_status === "ok") {
      forensicOk++;
      bankChecked++;
      const ok = bankMatches(expected, j.bank?.canonical);
      if (ok) bankOk++;
      bankCell = `${ok ? "OK" : "MISS"} ai="${j.extraction?.entidad_emisora ?? ""}" → ${j.bank?.canonical ?? "null"}`;
    } else {
      bankCell = `(${j.forensic_status})`;
    }
    const monto = j.extraction?.monto != null ? `$${j.extraction.monto}` : "";
    rows.push({
      file: f,
      status: "accepted",
      detail: `${extname(f)} sha=${j.sha256?.slice(0, 8)} ${monto} ${bankCell}`,
    });
  } else if (j.status === "rejected") {
    rejected++;
    rows.push({ file: f, status: "REJECTED", detail: j.reason });
  } else {
    failed++;
    rows.push({ file: f, status: "FAILED", detail: `${j.step}:${j.error}` });
  }
}

for (const row of rows) {
  const tag =
    row.status === "accepted" ? "✓" : row.status === "REJECTED" ? "✗" : "‼";
  console.log(`  ${tag} ${row.file.padEnd(34)} ${row.status.padEnd(9)} ${row.detail}`);
}

console.log(`\n── Resumen ──`);
console.log(`  Saneo E0-E2:  ${accepted}/${files.length} accepted · ${rejected} rejected · ${failed} failed`);
console.log(`  Extracción E3: ${forensicOk}/${accepted} con IA (resto skipped sin API key)`);
if (bankChecked > 0) {
  const pct = ((bankOk / bankChecked) * 100).toFixed(1);
  console.log(`  Banco E3b:     ${bankOk}/${bankChecked} aciertos (${pct}%)`);
} else {
  console.log(`  Banco E3b:     sin datos (extracción skipped — falta OPENAI_API_KEY/GEMINI_API_KEY)`);
}
