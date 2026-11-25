// Auditoría del mes en Socios: compara lo que tiene el formulario con la
// planilla "Trazabilidad General Mensual", con la hoja del balance bancario y
// los pagos de los paneles con los egresos "Premio Pagado".
import { resumenBanco } from "./sociosBloques.js";

export const TAB_TRAZABILIDAD = "Trazabilidad General Mensual";
export const RANGO_TRAZABILIDAD = `'${TAB_TRAZABILIDAD}'!A1:Z80`;
// Diferencias menores a esto se toman por redondeo.
export const TOLERANCIA = 1;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toUpperCase();
const numero = (v) => (typeof v === "number" ? v : v === "" || v == null ? null : Number(String(v).replace(/\./g, "").replace(",", ".")) || null);

// Campos de cada tabla: clave del formulario → encabezado de la planilla.
export const CAMPOS_SOCIOS = {
  netwin: "NETWIN", entrada: "ENTRADA", salida: "SALIDA", ggr: "GGR",
  ggr_casa: "GGR CASA", ggr_socio: "GGR SOCIO", ggr_nexo: "GGR NEXO",
  fichas_socio: "FICHAS SOCIO", empleados_socio: "EMPLEADOS SOCIOS"
};
export const CAMPOS_PERSONALES = {
  netwin: "NETWIN", entrada: "ENTRADA", salida: "SALIDA",
  ops_entrada: "CANTIDAD DE OP ENTRADA", ops_salida: "CANTIDAD DE OP SALIDA",
  bonos: "BONOS Y REMARKETING", ggr: "GGR"
};
export const NOMBRES_CAMPOS = {
  netwin: "Netwin", entrada: "Entrada", salida: "Salida", ggr: "GGR", ggr_casa: "GGR casa",
  ggr_socio: "GGR socio", ggr_nexo: "GGR nexo", fichas_socio: "Fichas socio", empleados_socio: "Empleados socio",
  ops_entrada: "Op. de entrada", ops_salida: "Op. de salida", bonos: "Bonos", netwin_propio: "Netwin propio (admin − AgenteMC)",
  agentemc: "Netwin AgenteMC", depositos: "Depósitos", retiros: "Retiros"
};

// conNumero: solo una etiqueta que tenga un número a la derecha (algunas se
// repiten como subtítulo en otra tabla, como "Depositos").
function buscar(v, texto, { desdeFila = 0, col = null, conNumero = false } = {}) {
  for (let r = desdeFila; r < v.length; r++) {
    const fila = v[r] || [];
    for (let c = 0; c < fila.length; c++) {
      if ((col === null || c === col) && norm(fila[c]) === texto && (!conNumero || numero(fila[c + 1]) !== null)) return { r, c };
    }
  }
  return null;
}

// Tabla con nombres de panel en una columna, desde el título hasta la fila de total.
function tabla(v, titulo, fin, campos) {
  const t = buscar(v, titulo);
  if (!t) return null;
  let h = t.r + 1;
  while (h < v.length && !(v[h] || []).some((x) => norm(x) === "NETWIN")) h++;
  if (h >= v.length) return null;
  const col = {};
  for (const [k, etq] of Object.entries(campos)) {
    const c = (v[h] || []).findIndex((x) => norm(x) === etq);
    if (c >= 0) col[k] = c;
  }
  const filas = {};
  for (let r = h + 1; r < v.length; r++) {
    const nombre = norm(v[r]?.[t.c]);
    if (!nombre) continue;
    if (nombre === fin) break;
    filas[nombre] = Object.fromEntries(Object.entries(col).map(([k, c]) => [k, numero(v[r]?.[c])]));
  }
  return filas;
}

// Primer número debajo (o a la derecha) de una etiqueta.
function valorDe(v, etiqueta, { abajo = false, ...opc } = {}) {
  const p = buscar(v, etiqueta, opc);
  if (!p) return null;
  if (!abajo) return numero(v[p.r]?.[p.c + 1]);
  for (let r = p.r + 1; r < v.length; r++) {
    const n = numero(v[r]?.[p.c]);
    if (n !== null) return n;
  }
  return null;
}

/** Lee los valores de la planilla "Trazabilidad General Mensual". */
export function leerTrazabilidad(valores) {
  const v = valores || [];
  const general = buscar(v, "DEPOSITOS", { conNumero: true });
  return {
    socios: tabla(v, "PANEL DE SOCIOS", "TOTAL DIARIO", CAMPOS_SOCIOS),
    personales: tabla(v, "PANELES PERSONALES", "TOTAL", CAMPOS_PERSONALES),
    control: {
      netwin_propio: valorDe(v, "SUMA DE NETWIN DE PANELES DIARIOS", { abajo: true }),
      agentemc: valorDe(v, "NETWIN DE PANEL AGENTE MC", { abajo: true })
    },
    general: general ? {
      depositos: numero(v[general.r]?.[general.c + 1]),
      retiros: valorDe(v, "RETIROS", { col: general.c, desdeFila: general.r, conNumero: true }),
      ggr: valorDe(v, "GGR", { col: general.c, desdeFila: general.r, conNumero: true })
    } : null
  };
}

function fila(grupo, panel, campo, formu, planilla) {
  const f = formu === null || formu === undefined ? null : r2(formu);
  const p = planilla === null || planilla === undefined ? null : r2(planilla);
  const diferencia = f === null || p === null ? null : r2(f - p);
  const ok = f === null && p === null ? true : diferencia !== null && Math.abs(diferencia) < TOLERANCIA;
  return { grupo, panel, campo, nombre_campo: NOMBRES_CAMPOS[campo] || campo, formu: f, planilla: p, diferencia, ok };
}

function compararTabla(grupo, delFormu, deLaPlanilla, campos, filas, faltantes) {
  if (!deLaPlanilla) {
    faltantes.push(`No encontré la tabla de ${grupo} en la planilla`);
    return;
  }
  const vistos = new Set();
  for (const p of delFormu) {
    const n = norm(p.nombre);
    const hoja = deLaPlanilla[n];
    if (!hoja) {
      // Un panel sin movimientos que no está en la planilla no es diferencia.
      if (Object.keys(campos).some((k) => Math.abs(Number(p[k]) || 0) >= TOLERANCIA)) {
        faltantes.push(`${p.nombre} (${grupo}) está en el formulario pero no en la planilla`);
      }
      continue;
    }
    vistos.add(n);
    for (const k of Object.keys(campos)) {
      if (k in hoja) filas.push(fila(grupo, p.nombre, k, p[k] ?? 0, hoja[k] ?? 0));
    }
  }
  for (const [n, hoja] of Object.entries(deLaPlanilla)) {
    if (vistos.has(n)) continue;
    if (Object.values(hoja).some((x) => Math.abs(Number(x) || 0) >= TOLERANCIA)) {
      faltantes.push(`${n} (${grupo}) está en la planilla pero no en el formulario`);
    }
  }
}

/**
 * Formulario vs planilla. `reparto` es lo que devuelve /api/socios/reparto.
 * Solo se comparan datos y cálculos que tienen que coincidir: el CEF de la
 * casa y lo que depende de él se calcula distinto a propósito.
 */
export function compararPlanilla(traza, reparto) {
  const filas = [];
  const faltantes = [];
  compararTabla("Socios", reparto.socios || [], traza.socios, CAMPOS_SOCIOS, filas, faltantes);
  compararTabla("Paneles personales", reparto.personales || [], traza.personales, CAMPOS_PERSONALES, filas, faltantes);
  const res = reparto.resumen || {};
  filas.push(fila("Control de netwin", "Total del mes", "netwin_propio", res.netwin_propio, traza.control?.netwin_propio));
  filas.push(fila("Control de netwin", "Total del mes", "agentemc", res.netwin_agentemc, traza.control?.agentemc));
  if (traza.general) {
    filas.push(fila("Información general", "Banco", "depositos", reparto.banco?.depositos, traza.general.depositos));
    filas.push(fila("Información general", "Banco", "retiros", reparto.banco?.retiros, traza.general.retiros));
    filas.push(fila("Información general", "Banco", "ggr", reparto.bloques?.general?.ggr, traza.general.ggr));
  } else {
    faltantes.push("No encontré el cuadro de información general en la planilla");
  }
  return { filas, faltantes, diferencias: filas.filter((f) => !f.ok).length };
}

/** Totales del banco guardados en el formulario vs los de la hoja hoy. */
export function compararBanco(guardado, matriz, rango) {
  const hoja = resumenBanco(matriz, rango);
  const filas = ["depositos", "retiros", "iva"].map((k) =>
    fila("Banco", "Mes", k, guardado ? guardado[k] : null, hoja[k])
  );
  filas.find((f) => f.campo === "iva").nombre_campo = "IVA";
  return {
    filas,
    movimientos_hoja: hoja.movimientos,
    movimientos_formu: guardado?.movimientos ?? null,
    actualizado: guardado?.updated_at ?? null,
    diferencias: filas.filter((f) => !f.ok).length
  };
}

/** Retiros del banco (Premio Pagado) por día del rango. */
export function retirosBancoPorDia(matriz, { desde, hasta }) {
  const out = {};
  for (let d = new Date(`${desde}T12:00:00Z`); d.toISOString().slice(0, 10) <= hasta; d.setUTCDate(d.getUTCDate() + 1)) {
    const f = d.toISOString().slice(0, 10);
    const r = resumenBanco(matriz, { desde: f, hasta: f });
    if (r.retiros) out[f] = r.retiros;
  }
  return out;
}

/**
 * Pagos del panel (salida de socios y paneles personales) vs egresos
 * "[Unidad M] Premio Pagado" del formulario y retiros del banco, por día.
 * @param panel    [{ fecha, salida }]
 * @param egresos  [{ fecha, total }]
 * @param banco    { fecha: retiros } o null si no se pudo leer la hoja
 */
export function compararPagos(panel, egresos, banco) {
  const dias = new Map();
  const dia = (f) => {
    if (!dias.has(f)) dias.set(f, { fecha: f, panel: 0, egresos: 0, banco: banco ? 0 : null });
    return dias.get(f);
  };
  for (const p of panel || []) dia(p.fecha).panel += Number(p.salida) || 0;
  for (const e of egresos || []) dia(e.fecha).egresos += Number(e.total) || 0;
  for (const [f, v] of Object.entries(banco || {})) dia(f).banco += Number(v) || 0;
  const filas = [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((d) => {
    const out = { fecha: d.fecha, panel: r2(d.panel), egresos: r2(d.egresos), banco: d.banco === null ? null : r2(d.banco) };
    out.dif_egresos = r2(out.egresos - out.panel);
    out.dif_banco = out.banco === null ? null : r2(out.banco - out.panel);
    out.ok = Math.abs(out.dif_egresos) < TOLERANCIA && (out.dif_banco === null || Math.abs(out.dif_banco) < TOLERANCIA);
    return out;
  });
  const suma = (k) => r2(filas.reduce((s, f) => s + (Number(f[k]) || 0), 0));
  const total = { panel: suma("panel"), egresos: suma("egresos"), banco: banco ? suma("banco") : null };
  total.dif_egresos = r2(total.egresos - total.panel);
  total.dif_banco = banco ? r2(total.banco - total.panel) : null;
  return { filas, total, diferencias: filas.filter((f) => !f.ok).length };
}
