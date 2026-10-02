// Smoke del Receipt Gate. Valida plumbing (saneo E0-E2 + endpoints), no la IA.
// Robusto con forensic ON u OFF: una imagen de ruido pasa el saneo pero la IA
// (si está activa) la rechaza como not_a_receipt — ambos casos prueban E0-E2.
// Uso: node scripts/smoke.mjs [baseUrl] [token]

import sharp from "sharp";

const BASE = process.argv[2] ?? "http://localhost:4100";

// Las entradas de `RECEIPT_GATE_TOKENS` pueden venir como `etiqueta:token` (atribución en logs y,
// desde MSG-TRAZA-20260908-3, scopes). Sin sacarle el prefijo, el smoke mandaba `etiqueta:token`
// entero como Bearer y daba 5/5 `unauthorized` — un rojo que parecía del gate y era del script.
// Mismo criterio que `LABELED_ENTRY` en `src/config/env.ts`.
function tokenDeEntrada(entrada) {
  const m = /^([a-z][a-z0-9_-]{0,23}):(.+)$/i.exec(entrada.trim());
  return m?.[1] && m[2] ? m[2] : entrada.trim();
}

const TOKEN =
  process.argv[3] ??
  (process.env.RECEIPT_GATE_TOKENS
    ? tokenDeEntrada(process.env.RECEIPT_GATE_TOKENS.split(",")[0])
    : "");
const SUBJECT = "smoke-" + Date.now();

const headers = { "content-type": "application/json" };
if (TOKEN) headers["authorization"] = `Bearer ${TOKEN}`;

async function scan(body) {
  const res = await fetch(`${BASE}/scan`, { method: "POST", headers, body: JSON.stringify(body) });
  return { http: res.status, json: await res.json() };
}

async function fakeReceipt(seed = 1) {
  const w = 600, h = 900;
  const buf = Buffer.alloc(w * h * 3);
  let s = seed * 7919;
  for (let i = 0; i < buf.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    buf[i] = (s >> 16) & 0xff;
  }
  return sharp(buf, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 80 }).toBuffer();
}

const b64 = (b) => Buffer.from(b).toString("base64");

// El saneo (E0-E2) pasó si: fue aceptado, o la IA lo rechazó por contenido
// (not_a_receipt/preview). Un rechazo por too_small/bad_type/dimensions = falló el saneo.
const FORENSIC_REASONS = new Set(["not_a_receipt", "preview_receipt"]);
const sanitizedOk = (j) =>
  j.status === "accepted" || (j.status === "rejected" && FORENSIC_REASONS.has(j.reason));

let pass = 0, fail = 0;
function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} → ${JSON.stringify(detail)}`); }
}

console.log(`Receipt Gate smoke @ ${BASE} (subject=${SUBJECT})\n`);

// ── Canal CRM (livechat) ──────────────────────────────────────────────────
const imgCrm = await fakeReceipt(1);
let r = await scan({
  subject_id: SUBJECT,
  channel: "crm_livechat",
  data_base64: b64(imgCrm),
  declared_mime: "application/octet-stream",
});
check("crm_livechat → saneo E0-E2 OK", sanitizedOk(r.json), r.json);

// Decide qué puede esperar el reenvío de más abajo: sin fila guardada no hay duplicado posible.
const primeroAceptado = r.json.status === "accepted";

if (r.json.status === "accepted") {
  check("  accepted trae scan_id + view_url", !!(r.json.scan_id && r.json.view_url && r.json.phash), r.json);

  const meta = await fetch(`${BASE}/scans/${r.json.scan_id}`, { headers }).then((x) => x.json());
  check(
    "  GET /scans/:id trae contrato completo (bank+validation+duplicate_global)",
    meta.channel === "crm_livechat" && "bank" in meta && "validation" in meta && "duplicate_global" in meta && !!meta.view_url,
    meta,
  );

  const viewRes = await fetch(r.json.view_url);
  const ct = viewRes.headers.get("content-type") ?? "";
  check(
    "  view_url sirve JPEG",
    viewRes.ok && ct.includes("image/jpeg") && (await viewRes.arrayBuffer()).byteLength > 100,
    { status: viewRes.status, ct },
  );
}

// ── Canal PAM (panel) ─────────────────────────────────────────────────────
const imgPam = await fakeReceipt(2);
r = await scan({
  subject_id: SUBJECT + "-pam",
  channel: "pam_panel",
  data_base64: b64(imgPam),
  declared_mime: "application/octet-stream",
});
check("pam_panel → saneo E0-E2 OK", sanitizedOk(r.json), r.json);
if (r.json.status === "accepted") {
  const meta = await fetch(`${BASE}/scans/${r.json.scan_id}`, { headers }).then((x) => x.json());
  check("  channel pam_panel persistido", meta.channel === "pam_panel", meta);
}

// ── Rechazos en el borde (E0-E2, sin IA) ──────────────────────────────────
// El reenvío sólo puede dar `duplicate` si el PRIMER envío quedó guardado. Con la IA encendida la
// imagen de ruido se rechaza como `not_a_receipt` y no se persiste nada, así que no hay nada que
// duplicar y la respuesta correcta es volver a rechazarla igual. Este caso exigía `duplicate` a
// secas, o sea que era IMPOSIBLE de pasar con forense activo —el estado de los dos hosts y del
// entorno local—: el gate de `AGENTS.md` venía dando 1 fallo permanente y exit 1. Un chequeo que no
// puede pasar no informa; entrena a ignorar la corrida entera.
r = await scan({ subject_id: SUBJECT, channel: "crm_livechat", data_base64: b64(imgCrm) });
if (primeroAceptado) {
  check("reenvío idéntico → rejected:duplicate", r.json.status === "rejected" && r.json.reason === "duplicate", r.json);
} else {
  check(
    "reenvío idéntico → mismo rechazo de contenido (nada quedó guardado, no hay duplicado posible)",
    r.json.status === "rejected" && FORENSIC_REASONS.has(r.json.reason),
    r.json,
  );
}

r = await scan({ subject_id: SUBJECT + "-b", data_base64: b64(Buffer.from("hola")) });
check("archivo chico → rejected:too_small", r.json.status === "rejected" && r.json.reason === "too_small", r.json);

r = await scan({ subject_id: SUBJECT + "-c", data_base64: b64(Buffer.alloc(5000, 0x41)) });
check("tipo inválido → rejected:bad_type", r.json.status === "rejected" && r.json.reason === "bad_type", r.json);

console.log(`\n${pass} ok, ${fail} fallos`);
process.exit(fail === 0 ? 0 : 1);
