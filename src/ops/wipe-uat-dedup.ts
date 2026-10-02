import { readdirSync } from "node:fs";
import { countPhashes, countPhashesBefore, deletePhashesBefore, resetPhashes } from "../db/phash.js";
import {
  countScans,
  countScansBefore,
  deleteAllScans,
  deleteScansBefore,
  deleteScansBySubject,
  listAllScans,
  listScansBefore,
  listScansBySubject,
} from "../db/scans.js";
import { deleteCleanReceipt } from "../storage/receipt-files.js";

export type WipeScope = "subject" | "full" | "before";

export interface WipeUatPreview {
  scope: WipeScope;
  subjectId?: string;
  beforeIso?: string;
  phashes: number;
  scans: number;
  receiptFiles: number;
}

export interface WipeUatResult extends WipeUatPreview {
  deletedPhashes: number;
  deletedScans: number;
  deletedFiles: number;
  missingFiles: number;
  dryRun: boolean;
}

function receiptFilesOnDisk(): string[] {
  const root = process.env.RECEIPT_STORAGE_PATH ?? "./data/receipts";
  try {
    return readdirSync(root).filter((f) => f.endsWith(".jpg"));
  } catch {
    return [];
  }
}

function scopeOf(opts: { full?: boolean; beforeIso?: string }): WipeScope {
  if (opts.full) return "full";
  if (opts.beforeIso) return "before";
  return "subject";
}

function preview(scope: WipeScope, subjectId?: string, beforeIso?: string): WipeUatPreview {
  if (scope === "subject" && !subjectId) {
    throw new Error("subject_id requerido para wipe parcial");
  }
  if (scope === "before" && !beforeIso) {
    throw new Error("fecha de corte requerida para wipe por corte");
  }
  if (scope === "full") {
    return {
      scope,
      phashes: countPhashes(),
      scans: countScans(),
      receiptFiles: receiptFilesOnDisk().length,
    };
  }
  if (scope === "before") {
    return {
      scope,
      beforeIso,
      phashes: countPhashesBefore(beforeIso!),
      scans: countScansBefore(beforeIso!),
      receiptFiles: listScansBefore(beforeIso!).length,
    };
  }
  return {
    scope,
    subjectId,
    phashes: countPhashes(subjectId),
    scans: countScans(subjectId),
    receiptFiles: listScansBySubject(subjectId!).length,
  };
}

/** Borra dedup pHash + scan_records + JPEGs saneados (UAT / re-test). No toca PAM/CRM. */
export function wipeUatDedup(opts: {
  subjectId?: string;
  full?: boolean;
  beforeIso?: string;
  dryRun?: boolean;
}): WipeUatResult {
  const scope = scopeOf(opts);
  const subjectId = opts.subjectId?.trim() || undefined;
  const beforeIso = opts.beforeIso?.trim() || undefined;
  const dryRun = Boolean(opts.dryRun);

  const before = preview(scope, subjectId, beforeIso);
  if (dryRun) {
    return { ...before, deletedPhashes: 0, deletedScans: 0, deletedFiles: 0, missingFiles: 0, dryRun: true };
  }

  const records =
    scope === "full"
      ? listAllScans()
      : scope === "before"
        ? listScansBefore(beforeIso!)
        : listScansBySubject(subjectId!);

  let deletedFiles = 0;
  let missingFiles = 0;
  for (const rec of records) {
    try {
      deleteCleanReceipt(rec.storage_path);
      deletedFiles += 1;
    } catch {
      missingFiles += 1;
    }
  }

  if (scope === "full") {
    for (const f of receiptFilesOnDisk()) {
      try {
        deleteCleanReceipt(f);
        deletedFiles += 1;
      } catch {
        missingFiles += 1;
      }
    }
  }

  const deletedScans =
    scope === "full"
      ? deleteAllScans()
      : scope === "before"
        ? deleteScansBefore(beforeIso!)
        : deleteScansBySubject(subjectId!);
  const deletedPhashes =
    scope === "before" ? deletePhashesBefore(beforeIso!) : resetPhashes(scope === "full" ? undefined : subjectId);

  return {
    ...before,
    deletedPhashes,
    deletedScans,
    deletedFiles,
    missingFiles,
    dryRun: false,
  };
}

export function previewWipeUatDedup(opts: {
  subjectId?: string;
  full?: boolean;
  beforeIso?: string;
}): WipeUatPreview {
  return preview(scopeOf(opts), opts.subjectId?.trim() || undefined, opts.beforeIso?.trim() || undefined);
}
