/**
 * Test del dedup GLOBAL cross-subject (#258 / CROSS-X01b).
 * Correr: `npm run test:global-dedup` (usa tsx, no requiere build).
 *
 * Política (R1 MSG-GATE-20260723-3): `duplicate_global.seen=true` cuando un scan PREVIO de
 * cualquier subject matchea por (a) sha256 exacto, o (b) pHash Hamming ≤ umbral CON contenido
 * corroborado (coelsa_id, o monto+fecha+cuenta_receptora). pHash "a secas" (mismo template de
 * banco, contenido distinto) NO marca duplicado → evita el falso positivo cross-user de #220.
 *
 * SQLite temporal (DB_PATH) para no tocar la base real. Env ANTES de importar módulos que tocan
 * `src/db/index.ts` (lee `env` al importar) → imports dinámicos.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const tmpDir = mkdtempSync(join(tmpdir(), "gate-global-dedup-test-"));
process.env.DB_PATH = join(tmpDir, "test.db");
process.env.RECEIPT_STORAGE_PATH = join(tmpDir, "receipts");
process.env.RECEIPT_CLAMAV_ENABLED = "false";
process.env.RECEIPT_DEDUP_CONTENT_STRONG = "true"; // validar el path fuerte (#402)

const { computeDuplicateGlobal } = await import("../src/gate/global-dedup.js");
const { insertScan, deleteAllScans } = await import("../src/db/scans.js");
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
    fecha: "2026-07-21 14:06",
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

function seed(params: {
  subjectId: string;
  phash: string;
  sha256: string;
  extraction: Extraction | null;
}): string {
  const id = randomUUID();
  insertScan({
    scanId: id,
    subjectId: params.subjectId,
    phash: params.phash,
    sha256: params.sha256,
    bankCanonical: "brubank",
    bankKnown: true,
    storagePath: `${id}.jpg`,
    extraction: params.extraction,
    alerts: [],
    forensicStatus: "ok",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  });
  return id;
}

const PBASE = "0000000000000000"; // pHash base
const PNEAR = "1000000000000000"; // Hamming 1 vs base (mismo template de banco)
const PFAR = "1f00000000000000"; // Hamming 5 vs base (> umbral 3)

async function run() {
  console.log("dedup GLOBAL cross-subject (#258): sha256 exacto | pHash+contenido; sin falso positivo cross-user");

  // 1) Sin historial → no seen.
  {
    deleteAllScans();
    const r = computeDuplicateGlobal({ subjectId: "userA", sha256: "sha-1", phash: PBASE, extraction: ext() });
    check("sin historial → seen=false", r.seen === false, r);
  }

  // 2) Reuso literal cross-user (mismo sha256, otro subject) → seen, via sha256, cross_user.
  {
    deleteAllScans();
    const prev = seed({ subjectId: "userA", phash: PBASE, sha256: "sha-exact", extraction: ext() });
    const r = computeDuplicateGlobal({ subjectId: "userB", sha256: "sha-exact", phash: PNEAR, extraction: ext() });
    check("sha256 exacto cross-user → seen + via=sha256 + cross_user", r.seen && r.via === "sha256" && r.cross_user, r);
    check("  first_scan_id apunta al previo", r.first_scan_id === prev, r);
  }

  // 3) #258 CLAVE: re-comprimido (sha256 distinto) + pHash cercano + coelsa_id igual, cross-user.
  {
    deleteAllScans();
    seed({ subjectId: "userA", phash: PBASE, sha256: "sha-orig", extraction: ext({ coelsa_id: "COELSA-XYZ-123" }) });
    const r = computeDuplicateGlobal({
      subjectId: "userC",
      sha256: "sha-recomp",
      phash: PNEAR,
      extraction: ext({ coelsa_id: "coelsa xyz 123" }), // mismo COELSA, formato distinto
    });
    check("recomprimido + coelsa igual cross-user → seen + via=content + cross_user", r.seen && r.via === "content" && r.cross_user, r);
    check("  match_fields = [coelsa_id]", JSON.stringify(r.match_fields) === JSON.stringify(["coelsa_id"]), r);
  }

  // 4) #258: re-comprimido + pHash cercano + tupla (monto+fecha+cuenta_receptora), SIN coelsa.
  {
    deleteAllScans();
    seed({ subjectId: "userA", phash: PBASE, sha256: "sha-orig2", extraction: ext({ monto: 2500, fecha: "2026-07-22 10:00", cuenta_receptora: "CBU-999" }) });
    const r = computeDuplicateGlobal({
      subjectId: "userD",
      sha256: "sha-recomp2",
      phash: PNEAR,
      extraction: ext({ monto: 2500, fecha: "2026-07-22 10:00", cuenta_receptora: "cbu-999" }),
    });
    check("recomprimido + tupla igual → seen + via=phash_content", r.seen && r.via === "phash_content", r);
    check("  match_fields = [monto,fecha,cuenta_receptora]", JSON.stringify(r.match_fields) === JSON.stringify(["monto", "fecha", "cuenta_receptora"]), r);
  }

  // 5) GUARDA anti falso positivo (#220 cross-user): dos users, mismo banco/template (pHash cercano)
  //    pero transferencias DISTINTAS (monto distinto) → NO seen.
  {
    deleteAllScans();
    seed({ subjectId: "userA", phash: PBASE, sha256: "sha-legit-a", extraction: ext({ monto: 1000, coelsa_id: null }) });
    const r = computeDuplicateGlobal({
      subjectId: "userE",
      sha256: "sha-legit-b",
      phash: PNEAR, // mismo template → pHash cercano
      extraction: ext({ monto: 5000, fecha: "2026-07-23 09:00", cuenta_receptora: "OTRA-CBU", coelsa_id: null }),
    });
    check("mismo template, contenido distinto → seen=false (sin falso positivo cross-user)", r.seen === false, r);
  }

  // 6) #402: pHash lejano (dos capturas distintas del MISMO comprobante) + coelsa_id igual →
  //    seen via CONTENIDO fuerte, SIN depender de pHash. (Cambio de comportamiento vs. versión previa.)
  {
    deleteAllScans();
    seed({ subjectId: "userA", phash: PBASE, sha256: "sha-orig3", extraction: ext({ coelsa_id: "SAME-COELSA-6" }) });
    const r = computeDuplicateGlobal({
      subjectId: "userF",
      sha256: "sha-diff3",
      phash: PFAR, // Hamming 5 > 3 (captura distinta)
      extraction: ext({ coelsa_id: "SAME-COELSA-6" }),
    });
    check("#402: pHash lejano + coelsa igual → seen + via=content (no depende de pHash)", r.seen && r.via === "content", r);
  }

  // 6b) #402 sin coelsa: pHash lejano + monto+fecha+cuenta_receptora+cuenta_emisora iguales → seen via content.
  {
    deleteAllScans();
    const prev = seed({
      subjectId: "userA",
      phash: PBASE,
      sha256: "sha-402a",
      extraction: ext({ monto: 1234, fecha: "2026-07-27 15:00", cuenta_receptora: "CASINO-CBU", cuenta_emisora: "EMISOR-A" }),
    });
    const r = computeDuplicateGlobal({
      subjectId: "userB",
      sha256: "sha-402b",
      phash: PFAR,
      extraction: ext({ monto: 1234, fecha: "2026-07-27 15:00", cuenta_receptora: "casino-cbu", cuenta_emisora: "emisor-a" }),
    });
    check("#402 sin coelsa: tupla+emisora igual, pHash lejano → seen + via=content + cross_user", r.seen && r.via === "content" && r.cross_user, r);
    check("  match_fields incluye cuenta_emisora", r.match_fields.includes("cuenta_emisora"), r);
    check("  first_scan_id apunta al previo", r.first_scan_id === prev, r);
  }

  // 6c) ANTI-FP del contenido fuerte: dos jugadores DISTINTOS, misma cuenta del casino + mismo monto
  //     + misma fecha, pero cuenta_emisora DISTINTA y pHash lejano → NO seen (emisora los separa).
  {
    deleteAllScans();
    seed({
      subjectId: "userA",
      phash: PBASE,
      sha256: "sha-fp-a",
      extraction: ext({ monto: 1000, fecha: "2026-07-27 16:00", cuenta_receptora: "CASINO-CBU", cuenta_emisora: "EMISOR-A" }),
    });
    const r = computeDuplicateGlobal({
      subjectId: "userB",
      sha256: "sha-fp-b",
      phash: PFAR,
      extraction: ext({ monto: 1000, fecha: "2026-07-27 16:00", cuenta_receptora: "CASINO-CBU", cuenta_emisora: "EMISOR-B" }),
    });
    check("anti-FP: mismo monto/fecha/receptora pero emisora distinta → seen=false", r.seen === false, r);
  }

  // 6d) CONDICIÓN DE HORA (MSG-PAM-20260727-4): tupla idéntica + emisora igual, pero fecha SIN hora
  //     (fecha sola) y pHash lejano → NO dispara la tupla (degrada a "mismo día"). seen=false.
  {
    deleteAllScans();
    seed({
      subjectId: "userA",
      phash: PBASE,
      sha256: "sha-noh-a",
      extraction: ext({ monto: 1000, fecha: "2026-07-27", cuenta_receptora: "CASINO-CBU", cuenta_emisora: "EMISOR-A", coelsa_id: null }),
    });
    const r = computeDuplicateGlobal({
      subjectId: "userB",
      sha256: "sha-noh-b",
      phash: PFAR,
      extraction: ext({ monto: 1000, fecha: "2026-07-27", cuenta_receptora: "CASINO-CBU", cuenta_emisora: "EMISOR-A", coelsa_id: null }),
    });
    check("condición hora: fecha SIN hora → tupla NO dispara (seen=false)", r.seen === false, r);
  }

  // 6e) CONDICIÓN DE HORA: 00:00 se trata como hora ausente → tupla NO dispara. seen=false.
  {
    deleteAllScans();
    seed({
      subjectId: "userA",
      phash: PBASE,
      sha256: "sha-000-a",
      extraction: ext({ monto: 1000, fecha: "2026-07-27 00:00", cuenta_receptora: "CASINO-CBU", cuenta_emisora: "EMISOR-A", coelsa_id: null }),
    });
    const r = computeDuplicateGlobal({
      subjectId: "userB",
      sha256: "sha-000-b",
      phash: PFAR,
      extraction: ext({ monto: 1000, fecha: "2026-07-27 00:00", cuenta_receptora: "CASINO-CBU", cuenta_emisora: "EMISOR-A", coelsa_id: null }),
    });
    check("condición hora: 00:00 = sin hora → tupla NO dispara (seen=false)", r.seen === false, r);
  }

  // 6f) coelsa_id exacto dispara INCONDICIONAL aunque falte la hora (misma operación Coelsa, no coincidencia).
  {
    deleteAllScans();
    seed({
      subjectId: "userA",
      phash: PBASE,
      sha256: "sha-coe-a",
      extraction: ext({ fecha: "2026-07-27", coelsa_id: "COELSA-NOHORA-1" }),
    });
    const r = computeDuplicateGlobal({
      subjectId: "userB",
      sha256: "sha-coe-b",
      phash: PFAR,
      extraction: ext({ fecha: "2026-07-27", coelsa_id: "COELSA-NOHORA-1" }),
    });
    check("coelsa exacto sin hora → seen + via=content (incondicional)", r.seen && r.via === "content", r);
  }

  // 7) placeholders (<UNKNOWN>/null) NO corroboran → no seen por contenido.
  {
    deleteAllScans();
    seed({ subjectId: "userA", phash: PBASE, sha256: "sha-orig4", extraction: ext({ coelsa_id: "<UNKNOWN>", monto: null, fecha: null, cuenta_receptora: null }) });
    const r = computeDuplicateGlobal({
      subjectId: "userG",
      sha256: "sha-diff4",
      phash: PNEAR,
      extraction: ext({ coelsa_id: "<UNKNOWN>", monto: null, fecha: null, cuenta_receptora: null }),
    });
    check("placeholders (<UNKNOWN>/null) NO corroboran → seen=false", r.seen === false, r);
  }

  // 8) mismo subject (no cross_user): sha256 exacto → seen pero cross_user=false.
  {
    deleteAllScans();
    seed({ subjectId: "userH", phash: PBASE, sha256: "sha-self", extraction: ext() });
    const r = computeDuplicateGlobal({ subjectId: "userH", sha256: "sha-self", phash: PBASE, extraction: ext() });
    check("mismo subject sha256 exacto → seen + cross_user=false", r.seen && r.cross_user === false, r);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows: sqlite puede dejar el dir lockeado un instante */
  }
  if (failed > 0) process.exit(1);
}

await run();
