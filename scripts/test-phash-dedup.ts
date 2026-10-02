/**
 * Test de dedup por pHash + sha256.
 * Correr: `npm run test:dedup` (usa tsx, no requiere build).
 *
 * Semántica (issue #220 / QA 2026-07-21): **solo `sha256` exacto es duplicado (auto-reject)**.
 * La similitud pHash NO bloquea — se devuelve como señal `via:"phash"` (para log / PAM), pero
 * el pipeline sigue al OCR. Dos transferencias distintas con el mismo template de banco dan
 * Hamming ~0 y NO deben cortar la lectura.
 *
 * Usa una SQLite temporal (DB_PATH) para no tocar la base real. Debe setear env ANTES de
 * importar cualquier módulo que toque `src/db/index.ts` (lee `env` al importar) — por eso los
 * imports son dinámicos, después de fijar `process.env`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tmpDir = mkdtempSync(join(tmpdir(), "gate-dedup-test-"));
process.env.DB_PATH = join(tmpDir, "test.db");
process.env.RECEIPT_STORAGE_PATH = join(tmpDir, "receipts");
process.env.RECEIPT_CLAMAV_ENABLED = "false";

const { isDuplicateForSubject, findDuplicateForSubject, rememberPhash } = await import(
  "../src/gate/helpers.js"
);

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

async function run() {
  const LOG_THRESHOLD = 3; // debe coincidir con RECEIPT_GATE_CONFIG.phashSimilarLogThreshold

  console.log("dedup (post #220): solo sha256 exacto bloquea; pHash = señal no bloqueante");

  const subject = "subject-brubank-220";
  const phashBase = "0000000000000000"; // 16 hex chars = 64 bits, todo cero
  // Hamming 1 vs base (cambia 1 bit del primer nibble: 0→1)
  const phashHamming1 = "1000000000000000";
  // Hamming 2 (issue #220: dos transferencias Brubank distintas del mismo subject)
  const phashHamming2 = "3000000000000000"; // 0x3 = 2 bits vs 0x0
  const sha256Base = "sha-base-aaa";
  const sha256Otro = "sha-otro-bbb"; // archivo distinto → sha256 distinto
  const sha256Otro2 = "sha-otro-ccc";

  // 1) Antes de recordar nada, nada es duplicado.
  {
    const dup = await isDuplicateForSubject(subject, phashBase, sha256Base, LOG_THRESHOLD);
    check("sin historial → no duplicado", dup === false);
  }

  await rememberPhash(subject, phashBase, sha256Base);

  // 2) Reenvío EXACTO (mismo sha256) → duplicado (auto-reject), aunque el pHash difiera.
  {
    const dup = await isDuplicateForSubject(subject, "ffffffffffffffff", sha256Base, LOG_THRESHOLD);
    check("mismo sha256 (bytes idénticos) → duplicado (auto-reject)", dup === true);
    const detail = await findDuplicateForSubject(subject, "ffffffffffffffff", sha256Base, LOG_THRESHOLD);
    check("  via=sha256 en el match exacto", detail.duplicate === true && detail.via === "sha256");
  }

  // 3) issue #220 CLAVE: transferencia DISTINTA (sha256 distinto), muy parecida visualmente
  //    (Hamming 1). Antes bloqueaba; AHORA NO bloquea (isDuplicate=false) y sale como señal phash.
  {
    const dup = await isDuplicateForSubject(subject, phashHamming1, sha256Otro, LOG_THRESHOLD);
    check("sha256 distinto + Hamming 1 → NO bloquea (fix #220)", dup === false, { phashHamming1 });
    const detail = await findDuplicateForSubject(subject, phashHamming1, sha256Otro, LOG_THRESHOLD);
    check(
      "  señal via=phash (no bloqueante) para Hamming 1",
      detail.duplicate === true && detail.via === "phash" && detail.hamming === 1,
      detail,
    );
  }

  // 4) issue #220: sha distinto + Hamming 2 → NO bloquea; señal phash (≤ log threshold).
  {
    const dup = await isDuplicateForSubject(subject, phashHamming2, sha256Otro2, LOG_THRESHOLD);
    check("sha256 distinto + Hamming 2 → NO bloquea (fix #220)", dup === false, { phashHamming2 });
    const detail = await findDuplicateForSubject(subject, phashHamming2, sha256Otro2, LOG_THRESHOLD);
    check(
      "  señal via=phash (no bloqueante) para Hamming 2",
      detail.duplicate === true && detail.via === "phash" && detail.hamming === 2,
      detail,
    );
  }

  // 5) sha distinto + Hamming 5 (> log threshold 3) → ni bloquea ni deja señal.
  {
    const phashLejano = "1f00000000000000"; // 0x1f = 00011111 vs 00000000 → 5 bits
    const dup = await isDuplicateForSubject(subject, phashLejano, sha256Otro, LOG_THRESHOLD);
    check("sha256 distinto + Hamming 5 → NO bloquea", dup === false, { phashLejano });
    const detail = await findDuplicateForSubject(subject, phashLejano, sha256Otro, LOG_THRESHOLD);
    check("  sin señal phash para Hamming 5 (> log threshold)", detail.duplicate === false, detail);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* Windows: sqlite puede dejar el dir lockeado un instante — no falla el test */
  }
  if (failed > 0) process.exit(1);
}

await run();
