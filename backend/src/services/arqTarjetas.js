import { parseMonto } from "./balanceDiario.js";

// Los saldos arrancan en 0 en esta fecha; lo anterior no se sigue.
export const INICIO_SEGUIMIENTO = "2026-09-01";

const TIPOS = new Set(["CONSUMO", "TRANSFERENCIA", "AJUSTE"]);
const MONEDAS_USD = new Set(["USD", "USDT"]);

function redondear(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function texto(v, max) {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

function idValido(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function montoCentavos(v) {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v * 100) : null;
  return parseMonto(v);
}

/**
 * Cuenta y monto en USD de un egreso que es fondeo.
 * `fila` trae el egreso (moneda, monto), la cuenta que define su etiqueta
 * (cuenta_etiqueta) y lo cargado a mano en arq_fondeos (cuenta_asignada,
 * monto_usd_confirmado, descartado).
 * Un fondeo en ARS queda pendiente hasta que se carga cuánto acreditó ARQ.
 */
export function resolverFondeo(fila) {
  const cuentaId = idValido(fila.cuenta_asignada) ?? idValido(fila.cuenta_etiqueta);
  const moneda = String(fila.moneda || "ARS").toUpperCase();
  let montoUsd = fila.monto_usd_confirmado != null ? Number(fila.monto_usd_confirmado) : null;
  if (montoUsd == null && MONEDAS_USD.has(moneda)) montoUsd = Number(fila.monto);

  let estado = "ok";
  if (fila.descartado) estado = "descartado";
  else if (!cuentaId) estado = "sin_asignar";
  else if (montoUsd == null) estado = "pendiente";

  return {
    cuenta_id: cuentaId,
    monto_usd: montoUsd == null ? null : redondear(montoUsd),
    estado,
  };
}

function saldoVacio(cuentaId) {
  return {
    cuenta_id: cuentaId,
    fondeado: 0,
    consumido: 0,
    transferido_entrada: 0,
    transferido_salida: 0,
    ajustes: 0,
    saldo: 0,
    fondeos_pendientes: 0,
  };
}

/**
 * Saldo por cuenta = fondeos + transferencias recibidas + ajustes
 *                    − consumos − transferencias enviadas.
 * `fondeos` son los ya resueltos con resolverFondeo; `movimientos`, las filas
 * activas de arq_movimientos.
 */
export function calcularSaldos({ cuentas = [], fondeos = [], movimientos = [] } = {}) {
  const saldos = new Map(cuentas.map((c) => [Number(c.id), saldoVacio(Number(c.id))]));
  const de = (id) => saldos.get(Number(id));

  for (const f of fondeos) {
    const s = de(f.cuenta_id);
    if (!s) continue;
    if (f.estado === "ok") s.fondeado = redondear(s.fondeado + f.monto_usd);
    else if (f.estado === "pendiente") s.fondeos_pendientes += 1;
  }

  for (const m of movimientos) {
    const monto = Number(m.monto_usd);
    const origen = de(m.cuenta_id);
    if (m.tipo === "CONSUMO" && origen) {
      origen.consumido = redondear(origen.consumido + monto);
    } else if (m.tipo === "AJUSTE" && origen) {
      origen.ajustes = redondear(origen.ajustes + monto);
    } else if (m.tipo === "TRANSFERENCIA") {
      if (origen) origen.transferido_salida = redondear(origen.transferido_salida + monto);
      const destino = de(m.cuenta_destino_id);
      if (destino) destino.transferido_entrada = redondear(destino.transferido_entrada + monto);
    }
  }

  for (const s of saldos.values()) {
    s.saldo = redondear(s.fondeado + s.transferido_entrada + s.ajustes - s.consumido - s.transferido_salida);
  }
  return [...saldos.values()];
}

/**
 * Valida y normaliza un movimiento cargado a mano.
 * Devuelve { error } o { mov } listo para insertar.
 */
export function validarMovimiento(body = {}) {
  const tipo = String(body.tipo || "").toUpperCase();
  if (!TIPOS.has(tipo)) return { error: "Elegí el tipo: consumo, transferencia o ajuste" };

  const cuentaId = idValido(body.cuenta_id);
  if (!cuentaId) return { error: "Elegí la cuenta" };

  const fecha = String(body.fecha || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) {
    return { error: "La fecha no es válida" };
  }
  if (fecha < INICIO_SEGUIMIENTO) {
    return { error: `El seguimiento arranca el ${INICIO_SEGUIMIENTO.split("-").reverse().join("/")}` };
  }

  const hora = texto(body.hora, 5);
  if (hora && !/^([01]\d|2[0-3]):[0-5]\d$/.test(hora)) return { error: "La hora no es válida" };

  const centavos = montoCentavos(body.monto_usd);
  if (centavos == null || centavos === 0) return { error: "Cargá el monto en USD" };
  if (tipo !== "AJUSTE" && centavos < 0) return { error: "El monto tiene que ser positivo" };

  const monedaOrigen = String(body.moneda_origen || "USD").toUpperCase();
  if (monedaOrigen !== "USD" && monedaOrigen !== "ARS") return { error: "La moneda tiene que ser USD o ARS" };
  if (monedaOrigen === "ARS" && tipo !== "CONSUMO") return { error: "Solo un consumo puede pagarse en pesos" };
  let montoOrigen = null;
  if (monedaOrigen === "ARS") {
    const c = montoCentavos(body.monto_origen);
    if (c == null || c <= 0) return { error: "Cargá cuántos pesos se pagaron" };
    montoOrigen = c / 100;
  }

  const notas = texto(body.notas, 1000);
  const mov = {
    tipo,
    cuenta_id: cuentaId,
    cuenta_destino_id: null,
    tarjeta_id: null,
    servicio: null,
    fecha,
    hora,
    monto_usd: centavos / 100,
    moneda_origen: monedaOrigen,
    monto_origen: montoOrigen,
    notas,
  };

  if (tipo === "CONSUMO") {
    mov.servicio = texto(body.servicio, 80);
    if (!mov.servicio) return { error: "Elegí o escribí el servicio" };
    if (body.tarjeta_id != null && body.tarjeta_id !== "") {
      mov.tarjeta_id = idValido(body.tarjeta_id);
      if (!mov.tarjeta_id) return { error: "La tarjeta no es válida" };
    }
  } else if (tipo === "TRANSFERENCIA") {
    mov.cuenta_destino_id = idValido(body.cuenta_destino_id);
    if (!mov.cuenta_destino_id) return { error: "Elegí la cuenta que recibe" };
    if (mov.cuenta_destino_id === cuentaId) return { error: "La cuenta que envía y la que recibe tienen que ser distintas" };
  } else if (!notas) {
    return { error: "Contá el motivo del ajuste en las notas" };
  }

  return { mov };
}
