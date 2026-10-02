// E2E conjunto: gate vivo (:4100) ejercido con los TOKENS REALES de CRM y PAM
// (leídos de sus .env). Valida los caminos de integración y la propiedad clave
// "un solo scan por comprobante" (CRM → PAM por scan_id, sin re-OCR).
//
// Uso:  node scripts/e2e-conjunto.mjs [http://localhost:4100]
//
// No corre los servers de CRM/PAM: ejerce el contrato del gate exactamente como
// lo hace el cliente de cada repo (mismo token, mismo channel, mismo handoff).

import { readFileSync } from "node:fs";

const GATE = (process.argv[2] || "http://localhost:4100").replace(/\/+$/, "");
const CRM_ENV = "C:\\Users\\lauta\\Desktop\\CRM\\app\\backend\\.env";
const PAM_ENV = "C:\\Users\\lauta\\Desktop\\Black Dragon V1.0.1\\.env";
const RECEIPT =
  "C:\\Users\\lauta\\Desktop\\Comprobantes para lector\\extraidos\\Comprobantes para lector\\Banco Bica.jpg";

function envValue(path, key) {
  const txt = readFileSync(path, "utf8");
  const m = new RegExp(`^${key}=(.+)$`, "m").exec(txt);
  return m ? m[1].trim() : null;
}

const CRM_TOKEN = envValue(CRM_ENV, "RECEIPT_GATE_TOKEN");
const PAM_TOKEN = envValue(PAM_ENV, "RECEIPT_GATE_TOKEN");

let pass = 0;
let fail = 0;
function check(name, ok, detail = "") {
  const tag = ok ? "PASS" : "FAIL";
  if (ok) pass++; else fail++;
  console.log(`  [${tag}] ${name}${detail ? "  — " + detail : ""}`);
}

async function aceptados() {
  const r = await fetch(`${GATE}/stats`, { headers: { Authorization: `Bearer ${PAM_TOKEN}` } });
  const j = await r.json();
  return j.aceptados ?? -1;
}

async function scan(token, body) {
  const r = await fetch(`${GATE}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return { http: r.status, json: await r.json().catch(() => null) };
}

async function main() {
  console.log(`\n=== E2E conjunto contra ${GATE} ===`);
  console.log(`CRM token: ${CRM_TOKEN ? CRM_TOKEN.slice(0, 6) + "…" : "(falta)"}  |  PAM token: ${PAM_TOKEN ? PAM_TOKEN.slice(0, 6) + "…" : "(falta)"}`);

  // Pre-chequeos
  const health = await fetch(`${GATE}/health`).then((r) => r.json()).catch(() => null);
  check("gate /health responde + ai_configured", !!health?.ok && health?.forensic?.ai_configured === true,
    health ? `forensic=${health.forensic?.enabled} ai=${health.forensic?.ai_configured}` : "sin respuesta");
  check("tokens CRM y PAM presentes en sus .env", !!CRM_TOKEN && !!PAM_TOKEN);

  const imgB64 = readFileSync(RECEIPT).toString("base64");

  // ── LEG A: CRM (livechat) → POST /scan con token CRM ──────────────────────
  console.log("\n— LEG A: CRM livechat → POST /scan (token CRM) —");
  const before = await aceptados();
  const crmSubject = `lead-${Date.now()}`;
  const a = await scan(CRM_TOKEN, {
    subject_id: crmSubject, channel: "crm_livechat",
    declared_mime: "image/jpeg", filename: "Banco Bica.jpg", data_base64: imgB64,
  });
  const accepted = a.json?.status === "accepted";
  check("CRM: /scan aceptado", accepted, `status=${a.json?.status} http=${a.http}`);
  const scanId = a.json?.scan_id;
  check("CRM: devuelve scan_id + clean_base64", !!scanId && !!a.json?.clean_base64, scanId || "");
  check("CRM: extracción con monto + banco", a.json?.extraction?.monto != null && !!a.json?.bank,
    `monto=${a.json?.extraction?.monto} banco=${a.json?.bank?.canonical} (known=${a.json?.bank?.known})`);

  // ── LEG B: PAM recibe scan_id (handoff CRM→PAM) → GET /scans/:id, SIN re-scan ─
  console.log("\n— LEG B: PAM lee por scan_id (token PAM) — debe NO re-escanear —");
  const midAccepted = await aceptados();
  const meta = scanId
    ? await fetch(`${GATE}/scans/${scanId}`, { headers: { Authorization: `Bearer ${PAM_TOKEN}` } }).then(async (r) => ({ http: r.status, json: await r.json().catch(() => null) }))
    : { http: 0, json: null };
  check("PAM: GET /scans/:id OK con token PAM", meta.http === 200, `http=${meta.http}`);
  check("PAM: misma extracción que el gate produjo (mismo monto)",
    meta.json?.extraction?.monto === a.json?.extraction?.monto,
    `pam=${meta.json?.extraction?.monto} gate=${a.json?.extraction?.monto}`);
  check("PAM: validation en snake_case { is_valid }", meta.json?.validation == null || typeof meta.json?.validation?.is_valid === "boolean",
    `validation=${JSON.stringify(meta.json?.validation)}`);
  const afterB = await aceptados();
  check("CLAVE: leer por scan_id NO disparó re-scan (Δaceptados=0)", afterB - midAccepted === 0,
    `aceptados ${midAccepted}→${afterB}`);

  // ── LEG C: PAM panel (upload directo) → POST /scan con token PAM ───────────
  console.log("\n— LEG C: PAM panel → POST /scan (token PAM) —");
  const beforeC = await aceptados();
  const c = await scan(PAM_TOKEN, {
    subject_id: "user_999", channel: "pam_panel",
    declared_mime: "image/jpeg", filename: "panel.jpg", data_base64: imgB64,
  });
  check("PAM panel: /scan aceptado + scan_id + clean_base64",
    c.json?.status === "accepted" && !!c.json?.scan_id && !!c.json?.clean_base64,
    `status=${c.json?.status} scan_id=${c.json?.scan_id || "-"}`);
  const afterC = await aceptados();
  check("PAM panel: SÍ contó como scan (Δaceptados=1)", afterC - beforeC === 1, `aceptados ${beforeC}→${afterC}`);

  // ── LEG D: vista del operador → proxy Bearer GET /receipts/:id ─────────────
  console.log("\n— LEG D: vista operador → GET /receipts/:id (Bearer PAM) —");
  if (scanId) {
    const r = await fetch(`${GATE}/receipts/${scanId}`, { headers: { Authorization: `Bearer ${PAM_TOKEN}` } });
    const buf = Buffer.from(await r.arrayBuffer());
    const isJpeg = buf.length > 2 && buf[0] === 0xff && buf[1] === 0xd8;
    check("operador: 200 + JPEG (FFD8) por Bearer", r.status === 200 && isJpeg,
      `http=${r.status} ct=${r.headers.get("content-type")} bytes=${buf.length}`);
  } else check("operador: vista", false, "sin scan_id");

  // ── LEG E: fail-closed → token inválido = 401 (cliente va a cola) ──────────
  console.log("\n— LEG E: fail-closed → token inválido —");
  const e = await scan("token-invalido-xxxx", {
    subject_id: "x", channel: "other", data_base64: imgB64,
  });
  check("fail-closed: token inválido → 401 (no procesa)", e.http === 401, `http=${e.http}`);

  console.log(`\n=== RESULTADO: ${pass} PASS / ${fail} FAIL ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error("E2E error:", e); process.exit(2); });
