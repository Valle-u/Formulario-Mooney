import { normText, parseMonto } from "./balanceDiario.js";

const MONEDAS = ["ARS", "USDT", "USD"];

export function periodoMes(anio, mes) {
  const y = Number(anio);
  const m = Number(mes);
  const desde = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(Date.UTC(y, m, 0));
  const hasta = last.toISOString().slice(0, 10);
  return { desde, hasta };
}

/** Mes calendario anterior al inicio del período (el 1/10 devuelve septiembre). */
export function mesAnterior(desde) {
  const [y, m] = String(desde).split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return periodoMes(prev.getUTCFullYear(), prev.getUTCMonth() + 1);
}

function redondear(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function flujoVacio() {
  return {
    inicio: 0,
    entro: 0,
    salio: 0,
    quedo: 0,
    cierre_declarado: null,
    diferencia: null,
    cuentas_inicio: 0,
    cuentas_cierre: 0,
    por_etiqueta: [],
    por_dia: [],
  };
}

function claveEtiqueta(moneda, etiqueta) {
  return `${moneda}|${etiqueta}`;
}

export function armarFlujoCaja({ movimientos = [], cierresAntes = [], cierresEnPeriodo = [] } = {}) {
  const flujos = Object.fromEntries(MONEDAS.map((moneda) => [moneda, flujoVacio()]));

  for (const cierre of cierresAntes) {
    const flujo = flujos[cierre.moneda];
    if (!flujo) continue;
    flujo.inicio = redondear(flujo.inicio + Number(cierre.monto));
    flujo.cuentas_inicio += 1;
  }

  for (const cierre of cierresEnPeriodo) {
    const flujo = flujos[cierre.moneda];
    if (!flujo) continue;
    flujo.cierre_declarado = redondear((flujo.cierre_declarado || 0) + Number(cierre.monto));
    flujo.cuentas_cierre += 1;
  }

  const etiquetas = new Map();
  const dias = new Map();

  for (const mov of movimientos) {
    const flujo = flujos[mov.moneda];
    if (!flujo) continue;
    const monto = Number(mov.monto);
    const cantidad = Number(mov.n) || 0;
    const entrada = String(mov.tipo || "").toUpperCase() === "ENTRADA";
    const etiqueta = mov.etiqueta || "(sin etiqueta)";
    const fecha = mov.fecha;

    if (entrada) flujo.entro = redondear(flujo.entro + monto);
    else flujo.salio = redondear(flujo.salio + monto);

    const eKey = claveEtiqueta(mov.moneda, etiqueta);
    if (!etiquetas.has(eKey)) {
      etiquetas.set(eKey, { moneda: mov.moneda, etiqueta, entro: 0, salio: 0, movimientos: 0 });
    }
    const fila = etiquetas.get(eKey);
    if (entrada) fila.entro = redondear(fila.entro + monto);
    else fila.salio = redondear(fila.salio + monto);
    fila.movimientos += cantidad;

    const dKey = `${mov.moneda}|${fecha}`;
    if (!dias.has(dKey)) {
      dias.set(dKey, { moneda: mov.moneda, fecha, entro: 0, salio: 0, etiquetas: new Map() });
    }
    const dia = dias.get(dKey);
    if (entrada) dia.entro = redondear(dia.entro + monto);
    else dia.salio = redondear(dia.salio + monto);
    if (!dia.etiquetas.has(etiqueta)) {
      dia.etiquetas.set(etiqueta, { etiqueta, entro: 0, salio: 0, movimientos: 0 });
    }
    const delDia = dia.etiquetas.get(etiqueta);
    if (entrada) delDia.entro = redondear(delDia.entro + monto);
    else delDia.salio = redondear(delDia.salio + monto);
    delDia.movimientos += cantidad;
  }

  for (const flujo of Object.values(flujos)) {
    flujo.quedo = redondear(flujo.inicio + flujo.entro - flujo.salio);
    if (flujo.cierre_declarado != null) {
      flujo.diferencia = redondear(flujo.cierre_declarado - flujo.quedo);
    }
  }

  for (const fila of etiquetas.values()) {
    const flujo = flujos[fila.moneda];
    flujo.por_etiqueta.push({
      etiqueta: fila.etiqueta,
      entro: fila.entro,
      salio: fila.salio,
      neto: redondear(fila.entro - fila.salio),
      movimientos: fila.movimientos,
    });
  }

  for (const dia of dias.values()) {
    const flujo = flujos[dia.moneda];
    const detalle = [...dia.etiquetas.values()]
      .map((e) => ({ ...e, neto: redondear(e.entro - e.salio) }))
      .sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto) || a.etiqueta.localeCompare(b.etiqueta));
    flujo.por_dia.push({
      fecha: dia.fecha,
      entro: dia.entro,
      salio: dia.salio,
      neto: redondear(dia.entro - dia.salio),
      etiquetas: detalle,
    });
  }

  for (const flujo of Object.values(flujos)) {
    flujo.por_etiqueta.sort((a, b) => Math.abs(b.neto) - Math.abs(a.neto) || a.etiqueta.localeCompare(b.etiqueta));
    flujo.por_dia.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }

  return { flujos };
}

function fechaIso(valor) {
  const m = String(valor || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function esRechazada(estado, etiqueta) {
  const texto = `${normText(estado)} ${normText(etiqueta)}`;
  return /rechaz|cancel|failed|denied/.test(texto);
}

/**
 * Ingresos ARS del balance mensual ya etiquetado.
 * Cada fila es una transferencia entrante cargada desde el CSV del banco.
 * Columnas: 0 FechaHora, 4 Tipo, 7 Importe, 8 Estado, 10 FECHA, 12 Etiqueta.
 */
export function ingresosArsDesdeBalance(matriz, { desde, hasta }) {
  const grupos = new Map();
  for (const row of matriz || []) {
    if (!Array.isArray(row) || row.length < 8) continue;
    const tipo = normText(row[4]);
    if (!tipo.includes("entrante")) continue;
    const etiquetaRaw = String(row[12] ?? "").trim();
    if (esRechazada(row[8], etiquetaRaw)) continue;
    const fecha = fechaIso(row[10]) || fechaIso(row[0]);
    if (!fecha || fecha < desde || fecha > hasta) continue;
    const cents = parseMonto(row[7]);
    if (cents == null) continue;
    const etiqueta = etiquetaRaw || "(sin etiqueta)";
    const key = `${etiqueta}|${fecha}`;
    if (!grupos.has(key)) {
      grupos.set(key, { moneda: "ARS", etiqueta, fecha, tipo: "ENTRADA", monto: 0, n: 0 });
    }
    const grupo = grupos.get(key);
    grupo.monto = redondear(grupo.monto + cents / 100);
    grupo.n += 1;
  }
  return [...grupos.values()];
}
