/**
 * Ops: reset dedup + scans + JPEGs en GATE (UAT re-test).
 * Uso prod (dentro del contenedor, paths /data/*):
 *   node dist/ops/wipe-uat-dedup-cli.js --full --yes
 *   node dist/ops/wipe-uat-dedup-cli.js --subject-id <lead-uuid> --yes
 */
import "../config/load-env.js";
import { previewWipeUatDedup, wipeUatDedup } from "./wipe-uat-dedup.js";

function usage(): never {
  console.error(`Uso:
  node dist/ops/wipe-uat-dedup-cli.js --full [--yes] [--dry-run]
  node dist/ops/wipe-uat-dedup-cli.js --subject-id <uuid> [--yes] [--dry-run]
  node dist/ops/wipe-uat-dedup-cli.js --before <ISO-8601 UTC> [--yes] [--dry-run]

  --full          Borra todo phash_comprobante + scan_records + *.jpg en RECEIPT_STORAGE_PATH
  --subject-id    Wipe parcial: solo ese subject (lead/teléfono estable del CRM)
  --before        Wipe acotado a lo anterior a esa fecha (created_at < corte). Preferir esto sobre
                  --full en una base que atiende plata real: entre el preview y el borrado puede
                  entrar un scan legítimo, y --full se lo lleva.
  --yes           Ejecutar (sin esto solo muestra preview)
  --dry-run       Alias de preview (no escribe)

No toca RECEIPT_EVAL_STORAGE_PATH (/data/ocr-eval): esas copias son material de eval y se
retienen aparte.

Tras wipe full, reiniciar gate para limpiar rate-limits en memoria:
  docker compose restart gate
`);
  process.exit(1);
}

const args = process.argv.slice(2);
const full = args.includes("--full");
const dryRun = args.includes("--dry-run");
const yes = args.includes("--yes");
const subjectIdx = args.indexOf("--subject-id");
const subjectId = subjectIdx >= 0 ? args[subjectIdx + 1] : undefined;
const beforeIdx = args.indexOf("--before");
const beforeRaw = beforeIdx >= 0 ? args[beforeIdx + 1] : undefined;

if (!full && !subjectId && !beforeRaw) usage();
if ([full, Boolean(subjectId), Boolean(beforeRaw)].filter(Boolean).length > 1) {
  console.error("Usar sólo uno de --full | --subject-id | --before.");
  process.exit(1);
}

// El corte se normaliza a ISO UTC para comparar contra `created_at`, que se guarda con
// `toISOString()`. Una fecha ambigua acá borra de más: se aborta antes que adivinar.
let beforeIso: string | undefined;
if (beforeRaw) {
  const d = new Date(beforeRaw);
  if (Number.isNaN(d.getTime())) {
    console.error(`Fecha de corte inválida: "${beforeRaw}". Usar ISO-8601, ej. 2026-08-12T03:00:00Z`);
    process.exit(1);
  }
  beforeIso = d.toISOString();
  console.log(`Corte: created_at < ${beforeIso}`);
}

const preview = previewWipeUatDedup({ full, subjectId, beforeIso });
console.log(JSON.stringify({ preview }, null, 2));

if (dryRun || !yes) {
  if (!yes && !dryRun) {
    console.error("\nAbortado: agregar --yes para ejecutar (o --dry-run).");
  }
  process.exit(yes || dryRun ? 0 : 2);
}

const result = wipeUatDedup({ full, subjectId, beforeIso, dryRun: false });
console.log(JSON.stringify({ result }, null, 2));
