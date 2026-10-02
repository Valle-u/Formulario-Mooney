/**
 * Test de `GET /traza/v1/feed` y de los scopes por token (`MSG-TRAZA-20260908-3`).
 * Correr: `npm run test:traza-feed` (tsx, sin build).
 *
 * Lo que importa que quede cubierto:
 *  - **Paginación con `created_at` empatado.** El cursor es `(created_at, id)` justamente porque
 *    con la fecha sola dos scans del mismo milisegundo se saltean o se repiten para siempre. El
 *    test fuerza el empate a propósito.
 *  - **`telefono` E.164 o null.** En la base hay cadenas vacías (el `phone` es opcional en
 *    `/scan`), que no son ni E.164 ni null: si se pasaran crudas, romperían el contrato de TRAZA.
 *  - **Scopes.** Que un token acotado NO pueda lo que no le corresponde: es la razón por la que
 *    esto se pudo emitir (el 28/08 se negó un token por no poder hacer cumplir el alcance).
 *
 * SQLite temporal (DB_PATH) para no tocar la base real. Env ANTES de importar módulos que leen
 * `env` al importar → imports dinámicos.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const tmpDir = mkdtempSync(join(tmpdir(), "gate-traza-feed-test-"));
process.env.DB_PATH = join(tmpDir, "test.db");
process.env.RECEIPT_STORAGE_PATH = join(tmpDir, "receipts");
process.env.RECEIPT_CLAMAV_ENABLED = "false";
process.env.RECEIPT_VIEW_TTL_HOURS = "168";
// Dos tokens: uno acotado al feed, otro sin entrada (queda COMPLETO, comportamiento histórico).
process.env.RECEIPT_GATE_TOKENS = "traza:tok-traza-xxxxxxxx,pam:tok-pam-yyyyyyyy";
process.env.RECEIPT_GATE_SCOPES = "traza=traza:feed,stats";

const { buildTrazaFeed, telefonoE164, encodeCursor, decodeCursor, FEED_LIMIT_MAX } = await import(
  "../src/http/traza-feed.js"
);
const { insertScan, deleteAllScans } = await import("../src/db/scans.js");
const { GATE_CLIENTS, SCOPES, clientScopeSummary } = await import("../src/config/env.js");
const { db } = await import("../src/db/index.js");
type Extraction = import("../src/forensic/types.js").ReceiptExtraction;

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

function ext(over: Partial<Extraction> = {}): Extraction {
  return {
    monto: 1000,
    codigo_operacion: null,
    fecha: "2026-09-08 14:06",
    nombre_emisor: "Juan Perez",
    cuenta_emisora: null,
    cuenta_receptora: "0000003100010000000001",
    entidad_emisora: "Brubank",
    tipo_operacion: "transferencia",
    confianza: 0.95,
    signos_edicion: false,
    es_comprobante_valido: true,
    coelsa_id: null,
    observaciones: null,
    ...over,
  };
}

function seed(opts: { phone?: string; createdAt?: string; subject?: string; sha256?: string }): string {
  const id = randomUUID();
  insertScan({
    scanId: id,
    subjectId: opts.subject ?? "prod:store_1",
    phone: opts.phone,
    channel: "pam_store",
    phash: "7c2c695d7d587d78",
    sha256: opts.sha256 ?? id.replace(/-/g, ""),
    bankCanonical: "Brubank",
    bankKnown: true,
    storagePath: `/tmp/${id}.jpg`,
    extraction: ext(),
    alerts: [],
    forensicStatus: "ok",
    expiresAt: new Date(Date.now() + 168 * 3600 * 1000).toISOString(),
  });
  if (opts.createdAt) {
    db.prepare("UPDATE scan_records SET created_at = ? WHERE id = ?").run(opts.createdAt, id);
  }
  return id;
}

// ── 1. telefono: E.164 o null, nunca cadena vacía ────────────────────────────
console.log("\n1. telefono (E.164 o null)");
check("cadena vacía → null", telefonoE164("") === null);
check("null → null", telefonoE164(null) === null);
check("E.164 válido se conserva", telefonoE164("+5491112345678") === "+5491112345678");
check("separadores se limpian", telefonoE164("+54 9 11 1234-5678") === "+5491112345678");
check("sin '+' → null (no adivinamos país)", telefonoE164("5491112345678") === null);
check("basura → null", telefonoE164("no-es-un-tel") === null);

// ── 2. cursor ────────────────────────────────────────────────────────────────
console.log("\n2. cursor opaco (created_at, id)");
{
  const rec = { created_at: "2026-09-08T10:00:00.000Z", id: "abc-123" } as never;
  const c = encodeCursor(rec);
  const back = decodeCursor(c);
  check("round-trip", back?.createdAt === "2026-09-08T10:00:00.000Z" && back?.id === "abc-123", back);
  check("cursor basura → null", decodeCursor("###no-base64###") === null);
  check("cursor vacío → null", decodeCursor("") === null);
}

// ── 3. paginación con created_at EMPATADO ────────────────────────────────────
console.log("\n3. paginación (el caso que rompe el cursor por fecha sola)");
{
  deleteAllScans();
  const mismoTs = "2026-09-08T12:00:00.000Z";
  const ids = new Set<string>();
  for (let i = 0; i < 5; i++) ids.add(seed({ createdAt: mismoTs }));
  for (let i = 0; i < 3; i++)
    ids.add(seed({ createdAt: `2026-09-08T12:00:0${i + 1}.000Z` }));

  const vistos: string[] = [];
  let cursor: string | undefined;
  let vueltas = 0;
  for (;;) {
    const feed = buildTrazaFeed({ cursor, types: ["gate.scan"], limit: 2 });
    for (const it of feed.items) vistos.push(String(it.payload.scan_id));
    if (!feed.hasMore) break;
    cursor = feed.cursor ?? undefined;
    if (++vueltas > 20) break; // guarda contra loop infinito
  }
  check("trae los 8 scans", vistos.length === 8, vistos.length);
  check("sin repetidos", new Set(vistos).size === vistos.length);
  check("cubre exactamente el set sembrado", vistos.every((v) => ids.has(v)) && new Set(vistos).size === ids.size);
}

// ── 4. since ─────────────────────────────────────────────────────────────────
console.log("\n4. since");
{
  deleteAllScans();
  seed({ createdAt: "2026-09-01T00:00:00.000Z" });
  seed({ createdAt: "2026-09-07T00:00:00.000Z" });
  const feed = buildTrazaFeed({ sinceIso: "2026-09-05T00:00:00.000Z", types: ["gate.scan"] });
  check("filtra los anteriores al since", feed.items.length === 1, feed.items.length);
  const vacio = buildTrazaFeed({ sinceIso: "2027-01-01T00:00:00.000Z", types: ["gate.scan"] });
  check("período sin actividad → items vacío (no error)", vacio.items.length === 0 && vacio.hasMore === false);
  check("declara el piso de retención", typeof vacio.retencion?.desde_utc === "string" && vacio.retencion.horas === 168, vacio.retencion);
}

// ── 5. types y envelope ──────────────────────────────────────────────────────
console.log("\n5. types y envelope");
{
  deleteAllScans();
  seed({ phone: "+5491112345678" });
  seed({ phone: "" });

  const todo = buildTrazaFeed({});
  check("program = gate", todo.program === "gate");
  check("generatedAt es ISO", !Number.isNaN(new Date(todo.generatedAt).getTime()));
  check("id estable gate.scan:<scan_id>", todo.items.some((i) => i.id === `gate.scan:${i.payload.scan_id}`));
  check("veredicto siempre accepted", todo.items.filter((i) => i.type === "gate.scan").every((i) => i.payload.veredicto === "accepted"));
  check("telefono vacío sale null en el ítem", todo.items.some((i) => i.type === "gate.scan" && i.telefono === null));
  check("telefono válido sale E.164 en el ítem", todo.items.some((i) => i.telefono === "+5491112345678"));

  const soloScan = buildTrazaFeed({ types: ["gate.scan"] });
  check("types=gate.scan no trae stats", soloScan.items.every((i) => i.type === "gate.scan"));

  const soloStats = buildTrazaFeed({ types: ["gate.stats"] });
  check("types=gate.stats no trae scans", soloStats.items.every((i) => i.type === "gate.stats"));
  check("stats sin eventos se omite", soloStats.items.length === 0, soloStats.items);
}

// ── 6. stats declara que es memoria ──────────────────────────────────────────
console.log("\n6. gate.stats declara su naturaleza");
{
  const { recordAccepted, recordRejected } = await import("../src/stats.js");
  recordAccepted();
  recordRejected("too_small");
  const feed = buildTrazaFeed({ types: ["gate.stats"] });
  const st = feed.items.find((i) => i.type === "gate.stats");
  check("aparece el ítem con eventos", st !== undefined);
  check("persistencia = memoria", st?.payload.persistencia === "memoria", st?.payload.persistencia);
  check("declara que reinicia con el proceso", st?.payload.reinicia_con_el_proceso === true);
  check("declara que no es acumulable", st?.payload.acumulable === false);
  check("trae los rechazos agregados", (st?.payload.rechazados as number) >= 1, st?.payload.rechazados);
  check("stats sólo en la primera página", buildTrazaFeed({ cursor: encodeCursor({ created_at: "2026-01-01T00:00:00.000Z", id: "x" } as never) }).items.every((i) => i.type !== "gate.stats"));
}

// ── 7. limit ─────────────────────────────────────────────────────────────────
console.log("\n7. limit");
{
  deleteAllScans();
  for (let i = 0; i < 4; i++) seed({});
  check("respeta el limit pedido", buildTrazaFeed({ types: ["gate.scan"], limit: 2 }).items.length === 2);
  check("hasMore avisa que falta", buildTrazaFeed({ types: ["gate.scan"], limit: 2 }).hasMore === true);
  check("limit por encima del tope se recorta", buildTrazaFeed({ types: ["gate.scan"], limit: 9999 }).items.length === 4);
  check("tope declarado en 500", FEED_LIMIT_MAX === 500);
}

// ── 8. duplicate por sha256 ──────────────────────────────────────────────────
console.log("\n8. duplicate (alcance sha256)");
{
  deleteAllScans();
  const compartido = "aa".repeat(32);
  seed({ sha256: compartido, subject: "prod:store_1", createdAt: "2026-09-08T09:00:00.000Z" });
  seed({ sha256: compartido, subject: "prod:store_2", createdAt: "2026-09-08T10:00:00.000Z" });
  const feed = buildTrazaFeed({ types: ["gate.scan"] });
  const segundo = feed.items[1];
  check("marca seen", segundo?.payload.duplicate !== undefined && (segundo.payload.duplicate as Record<string, unknown>).seen === true);
  check("marca cross_user", (segundo?.payload.duplicate as Record<string, unknown>)?.cross_user === true);
  check("declara el alcance", (segundo?.payload.duplicate as Record<string, unknown>)?.alcance === "sha256_exacto");
}

// ── 9. scopes ────────────────────────────────────────────────────────────────
console.log("\n9. scopes por token");
{
  const traza = GATE_CLIENTS.find((c) => c.label === "traza");
  const pam = GATE_CLIENTS.find((c) => c.label === "pam");
  check("el token de traza queda acotado", traza?.scopes !== null && traza?.scopes !== undefined);
  check("traza PUEDE el feed", traza?.scopes?.has(SCOPES.trazaFeed) === true);
  check("traza PUEDE stats", traza?.scopes?.has(SCOPES.stats) === true);
  check("traza NO puede POST /scan (créditos de IA)", traza?.scopes?.has(SCOPES.scan) === false);
  check("traza NO puede leer comprobantes", traza?.scopes?.has(SCOPES.read) === false);
  check("token sin entrada queda COMPLETO (histórico)", pam?.scopes === null);
  const resumen = clientScopeSummary();
  check("el resumen de arranque marca cuál es COMPLETO", resumen.some((r) => r.label === "pam" && r.scopes === "COMPLETO"), resumen);
}

// Cerrar antes de borrar: en Windows el handle abierto de SQLite hace fallar el rmSync (EPERM) y
// un temporal que no se puede borrar no es motivo para dar la suite en rojo.
try {
  db.close();
} catch {
  /* ya cerrada */
}
try {
  rmSync(tmpDir, { recursive: true, force: true });
} catch {
  console.log(`  (temporal no borrado, queda en ${tmpDir})`);
}
console.log(`\n${failed === 0 ? "OK" : "FALLÓ"} — ${passed} pasaron, ${failed} fallaron`);
process.exit(failed === 0 ? 0 : 1);
