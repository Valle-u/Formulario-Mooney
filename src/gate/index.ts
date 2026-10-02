// Capa de seguridad de comprobantes (doc 04). Portero pre-PAM: deja pasar solo material limpio,
// normalizado y plausible (ver receipt-gate.ts).
export { runReceiptGate, type GateOutcome } from "./receipt-gate.js";
export { RECEIPT_GATE_CONFIG } from "./config.js";
export { clamavHealthCached, type ClamHealth } from "./clamav.js";
export { detectCapabilities, logCapabilities } from "./capabilities.js";
export { resetRateLimits } from "./helpers.js";
