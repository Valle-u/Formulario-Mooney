import { randomUUID } from "node:crypto";
import { runReceiptGate, type GateOutcome } from "../gate/receipt-gate.js";
import { rememberPhash } from "../gate/helpers.js";
import { computeDuplicateGlobal, type DuplicateGlobal } from "../gate/global-dedup.js";
import { runForensic } from "../forensic/receipt-reader.js";
import { detectBank, type BankDetection } from "../forensic/bank-detect.js";
import { validateExtraction, receiptAgeHours } from "../forensic/validate.js";
import type { ReceiptExtraction } from "../forensic/types.js";
import { insertScan, getScanById, findExpiredScans, deleteScansByIds } from "../db/scans.js";
import { saveCleanReceipt, loadCleanReceipt, deleteCleanReceipt } from "../storage/receipt-files.js";
import { logger } from "../lib/logger.js";
import { mintViewToken, buildViewUrl, verifyViewToken } from "../storage/view-token.js";
import { env } from "../config/env.js";

export type ProcessScanOutcome =
  | {
      status: "accepted";
      scan_id: string;
      phash: string;
      sha256: string;
      mime: "image/jpeg";
      /** JPEG limpio re-encodeado (compat CRM/PAM que reenvían bytes a register_deposit). */
      clean_base64: string;
      view_url: string;
      view_token: string;
      extraction: ReceiptExtraction | null;
      bank: BankDetection | null;
      validation: { is_valid: boolean; alerts: string[] } | null;
      /** Señal anti-fraude cross-subject: mismo comprobante/operación reusado (sha256 o pHash+contenido). */
      duplicate_global: DuplicateGlobal;
      forensic_status: "ok" | "skipped";
    }
  | { status: "rejected"; reason: string; user_message: string }
  | { status: "failed"; step: string; error: string };

export async function processScan(
  input: Buffer,
  declaredMime: string,
  ctx: { subjectId: string; telefono?: string; channel?: string },
): Promise<ProcessScanOutcome> {
  const gate: GateOutcome = await runReceiptGate(input, declaredMime, {
    subjectId: ctx.subjectId,
    telefono: ctx.telefono,
  });

  if (gate.status === "rejected") {
    return { status: "rejected", reason: gate.reason, user_message: gate.userMessage };
  }
  if (gate.status === "failed") {
    return { status: "failed", step: gate.step, error: gate.error };
  }

  const forensic = await runForensic(gate.clean);

  if (forensic.status === "rejected") {
    return {
      status: "rejected",
      reason: forensic.reason,
      user_message: forensic.userMessage,
    };
  }
  if (forensic.status === "failed") {
    return { status: "failed", step: "forensic", error: forensic.error };
  }

  const scanId = randomUUID();
  saveCleanReceipt(scanId, gate.clean);

  // Reusar el sha256 ya calculado por el gate (evita recomputar y mantiene una sola fuente de
  // verdad para el dedup por sha256 — ver `gate/helpers.ts` isDuplicateForSubject).
  const sha256 = gate.sha256;

  const expiresAt = new Date(
    Date.now() + env.RECEIPT_VIEW_TTL_HOURS * 3600 * 1000,
  ).toISOString();

  let extraction: ReceiptExtraction | null = null;
  let alerts: string[] = [];
  let forensicStatus = "skipped";
  let validation: { is_valid: boolean; alerts: string[] } | null = null;
  let bank: BankDetection | null = null;

  if (forensic.status === "ok") {
    extraction = forensic.extraction;
    alerts = forensic.validation.alerts;
    validation = {
      is_valid: forensic.validation.isValid,
      alerts: forensic.validation.alerts,
    };
    bank = detectBank(forensic.extraction.entidad_emisora);
    forensicStatus = "ok";
  } else {
    forensicStatus = forensic.reason;
  }

  // Señal de reuso global (cross-subject) ANTES de insertar el propio registro: sha256 exacto o
  // pHash cercano + contenido corroborado (#258). NO bloquea; PAM la consume para el rechazo cross-user.
  const duplicateGlobal = computeDuplicateGlobal({
    subjectId: ctx.subjectId,
    sha256,
    phash: gate.phash,
    extraction,
  });
  if (duplicateGlobal.seen) {
    logger.info(
      {
        event: "gate_duplicate_global",
        subjectId: ctx.subjectId,
        via: duplicateGlobal.via,
        cross_user: duplicateGlobal.cross_user,
        first_scan_id: duplicateGlobal.first_scan_id,
        count: duplicateGlobal.count,
        match_fields: duplicateGlobal.match_fields,
      },
      "gate: duplicate_global (señal no bloqueante para PAM)",
    );
  }

  insertScan({
    subjectId: ctx.subjectId,
    phone: ctx.telefono,
    channel: ctx.channel,
    phash: gate.phash,
    sha256,
    bankCanonical: bank?.canonical ?? null,
    bankKnown: bank?.known ?? false,
    storagePath: `${scanId}.jpg`,
    extraction,
    alerts,
    forensicStatus,
    expiresAt,
    scanId,
  });

  const viewToken = mintViewToken(scanId);
  const viewUrl = buildViewUrl(scanId, viewToken);

  // Recién ACÁ —con el pipeline COMPLETO (gate + forense) ya aceptado— se recuerda el pHash
  // para el anti-duplicado por subject. Si el forense hubiera rechazado (preview/inválido), el
  // pHash NUNCA se guarda, así un reenvío legítimo posterior no choca contra ese intento fallido
  // (dep #179/#180: PENDIENTE rechazado no debe "envenenar" el dedup para la COMPLETADA real).
  await rememberPhash(ctx.subjectId, gate.phash, sha256);

  return {
    status: "accepted",
    scan_id: scanId,
    phash: gate.phash,
    sha256,
    mime: gate.mime,
    clean_base64: gate.clean.toString("base64"),
    view_url: viewUrl,
    view_token: viewToken,
    extraction,
    bank,
    validation,
    duplicate_global: duplicateGlobal,
    forensic_status: forensic.status === "ok" ? "ok" : "skipped",
  };
}

/** Sirve JPEG limpio si el token es válido. */
export function resolveReceiptView(
  scanId: string,
  token: string,
): { buffer: Buffer; mime: "image/jpeg" } | { error: string; status: number } {
  if (!verifyViewToken(scanId, token)) {
    return { error: "invalid_or_expired_token", status: 403 };
  }
  return loadScanReceipt(scanId);
}

/**
 * Metadata de una operación por scan_id (sin reenviar el archivo). Para CRM/PAM.
 * Devuelve la MISMA forma semántica que `/scan` (extraction, bank completo, validation,
 * duplicate_global) para que el PAM pueda operar leyendo por scan_id sin re-procesar.
 */
export function getScanMetadata(scanId: string):
  | {
      scan_id: string;
      subject_id: string;
      channel: string | null;
      phash: string;
      sha256: string | null;
      bank: { canonical: string | null; kind: string | null; known: boolean };
      extraction: ReceiptExtraction | null;
      validation: { is_valid: boolean; alerts: string[] } | null;
      receipt_age_hours: number | null;
      duplicate_global: DuplicateGlobal;
      forensic_status: string;
      view_url: string;
      created_at: string;
      expires_at: string;
    }
  | { error: string; status: number } {
  const record = getScanById(scanId);
  if (!record) return { error: "not_found", status: 404 };

  const extraction = record.extraction_json
    ? (JSON.parse(record.extraction_json) as ReceiptExtraction)
    : null;

  // Reconstruimos bank + validation desde la extracción guardada → paridad con /scan.
  const bank = extraction ? detectBank(extraction.entidad_emisora) : null;
  const validation = extraction
    ? (() => {
        const v = validateExtraction(extraction);
        return { is_valid: v.isValid, alerts: v.alerts };
      })()
    : null;

  // Señal de reuso global (cross-subject), excluye la propia: sha256 exacto o pHash+contenido (#258).
  const duplicateGlobal = computeDuplicateGlobal({
    subjectId: record.subject_id,
    sha256: record.sha256,
    phash: record.phash,
    extraction,
    excludeId: record.id,
  });

  return {
    scan_id: record.id,
    subject_id: record.subject_id,
    channel: record.channel,
    phash: record.phash,
    sha256: record.sha256,
    bank: {
      canonical: bank?.canonical ?? record.bank_canonical,
      kind: bank?.kind ?? null,
      known: bank ? bank.known : record.bank_known === 1,
    },
    extraction,
    validation,
    receipt_age_hours: receiptAgeHours(extraction?.fecha ?? null),
    duplicate_global: duplicateGlobal,
    forensic_status: record.forensic_status,
    view_url: buildViewUrl(record.id, mintViewToken(record.id)),
    created_at: record.created_at,
    expires_at: record.expires_at,
  };
}

/**
 * Limpieza de comprobantes expirados (G4): borra el JPEG del disco y el registro de la BD.
 * Pensado para correr periódicamente. Idempotente; no falla si un archivo ya no está.
 */
export function cleanupExpiredReceipts(): { deleted: number } {
  const expired = findExpiredScans(new Date().toISOString());
  if (expired.length === 0) return { deleted: 0 };

  for (const rec of expired) {
    deleteCleanReceipt(rec.storage_path);
  }
  const deleted = deleteScansByIds(expired.map((r) => r.id));
  logger.info({ deleted }, "cleanup: comprobantes expirados eliminados");
  return { deleted };
}

/** Carga comprobante por scan_id (Bearer server-to-server o tras validar token). */
export function loadScanReceipt(
  scanId: string,
): { buffer: Buffer; mime: "image/jpeg" } | { error: string; status: number } {
  const record = getScanById(scanId);
  if (!record) return { error: "not_found", status: 404 };

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { error: "receipt_expired", status: 410 };
  }

  const buffer = loadCleanReceipt(record.storage_path);
  if (!buffer) return { error: "file_missing", status: 404 };

  return { buffer, mime: "image/jpeg" };
}
