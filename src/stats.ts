// Telemetría en memoria del gate. Registra cada veredicto con timestamp y expone contadores sobre
// una ventana deslizante (sin BD: el gate es stateless salvo el anti-duplicado). Suficiente para
// /stats y alertas básicas; si se quiere histórico persistente, lo agrega el cliente (CRM/PAM).

import { clamavHealthCached, type ClamHealth } from "./gate/clamav.js";
import { env } from "./config/env.js";

type Event =
  | { t: number; kind: "accepted" }
  | { t: number; kind: "rejected"; reason: string }
  | { t: number; kind: "failed"; step: string };

const MAX_EVENTS = 50_000; // tope duro de memoria (rolling)
const events: Event[] = [];

function push(ev: Event): void {
  events.push(ev);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
}

export function recordAccepted(): void {
  push({ t: Date.now(), kind: "accepted" });
}
export function recordRejected(reason: string): void {
  push({ t: Date.now(), kind: "rejected", reason });
}
export function recordFailed(step: string): void {
  push({ t: Date.now(), kind: "failed", step });
}

export interface GateStats {
  ventanaMin: number;
  aceptados: number;
  rechazados: number;
  rechazadosPorReason: Record<string, number>;
  fallas: number;
  fallasPorStep: Record<string, number>;
  clamav: ClamHealth;
}

export function getStats(ventanaMin = env.RECEIPT_STATS_MIN): GateStats {
  const cutoff = Date.now() - ventanaMin * 60 * 1000;
  const rechazadosPorReason: Record<string, number> = {};
  const fallasPorStep: Record<string, number> = {};
  let aceptados = 0;
  let rechazados = 0;
  let fallas = 0;

  for (const ev of events) {
    if (ev.t < cutoff) continue;
    if (ev.kind === "accepted") aceptados++;
    else if (ev.kind === "rejected") {
      rechazados++;
      rechazadosPorReason[ev.reason] = (rechazadosPorReason[ev.reason] ?? 0) + 1;
    } else {
      fallas++;
      fallasPorStep[ev.step] = (fallasPorStep[ev.step] ?? 0) + 1;
    }
  }

  return {
    ventanaMin,
    aceptados,
    rechazados,
    rechazadosPorReason,
    fallas,
    fallasPorStep,
    clamav: clamavHealthCached(),
  };
}
