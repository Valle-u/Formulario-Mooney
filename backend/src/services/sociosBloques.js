// Bloques de resumen de la pantalla Socios (los cuadros de abajo de la
// planilla "Trazabilidad General Mensual"): Información general, Información
// casa, Información socios, Representación GGR y Volumen de venta.
import { normText, parseMonto } from "./balanceDiario.js";

export const ETIQUETA_DEPOSITO = "[Unidad M] Deposito de cliente";
export const ETIQUETA_RETIRO = "[Unidad M] Premio Pagado";
export const ETIQUETA_IVA = "[Unidad M] IVA";

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);
const pct = (parte, total) => (total ? parte / total : null);

function fechaIso(valor) {
  const m = String(valor || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
}

/**
 * Totales del mes de la hoja "Balance Mensual Bancario" (mismo criterio que
 * la planilla: SUMIFS por etiqueta y estado "Succes"; el IVA sin filtrar
 * estado). Columnas: 0 FechaHora, 7 Importe, 8 Estado, 10 FECHA, 12 Etiqueta.
 */
export function resumenBanco(matriz, { desde, hasta }) {
  const dep = normText(ETIQUETA_DEPOSITO);
  const ret = normText(ETIQUETA_RETIRO);
  const iva = normText(ETIQUETA_IVA);
  const total = { depositos: 0, retiros: 0, iva: 0, movimientos: 0 };
  for (const row of matriz || []) {
    if (!Array.isArray(row) || row.length < 13) continue;
    const fecha = fechaIso(row[10]) || fechaIso(row[0]);
    if (!fecha || fecha < desde || fecha > hasta) continue;
    const etiqueta = normText(row[12]);
    const cents = parseMonto(row[7]);
    if (cents == null) continue;
    const ok = normText(row[8]).startsWith("succes");
    if (etiqueta === dep && ok) total.depositos += cents;
    else if (etiqueta === ret && ok) total.retiros += cents;
    else if (etiqueta === iva) total.iva += cents;
    else continue;
    total.movimientos += 1;
  }
  return {
    depositos: r2(total.depositos / 100),
    retiros: r2(total.retiros / 100),
    iva: r2(Math.abs(total.iva) / 100),
    movimientos: total.movimientos
  };
}

// Primer y último día del mes de una fecha AAAA-MM-DD.
export function rangoMes(fechaIso) {
  const [y, m] = String(fechaIso).split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(ultimo).padStart(2, "0")}` };
}

/**
 * Recalcula y guarda en banco_resumen_mes los totales del mes a partir de la
 * hoja completa del balance bancario.
 */
export async function guardarResumenBanco(queryFn, fechaIso, matriz, { origen = "carga", userId = null } = {}) {
  const rango = rangoMes(fechaIso);
  const r = resumenBanco(matriz, rango);
  await queryFn(
    `INSERT INTO banco_resumen_mes (mes, depositos, retiros, iva, movimientos, origen, updated_by, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (mes) DO UPDATE SET
       depositos = EXCLUDED.depositos, retiros = EXCLUDED.retiros, iva = EXCLUDED.iva,
       movimientos = EXCLUDED.movimientos, origen = EXCLUDED.origen,
       updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [rango.desde, r.depositos, r.retiros, r.iva, r.movimientos, origen, userId]
  );
  return { mes: rango.desde, ...r };
}

/**
 * Suma los egresos del mes por categoría de costo fijo. Los montos en USD o
 * USDT se pasan a pesos con la cotización del mes.
 * @param filas [{ etiqueta, moneda, total }] (agrupado por etiqueta y moneda)
 * @param asignaciones [{ etiqueta, categoria }]
 */
export function costosFijosPorCategoria(filas, asignaciones, cotizacion) {
  const categoriaDe = new Map(asignaciones.map((a) => [normText(a.etiqueta), a.categoria]));
  const porCategoria = new Map();
  for (const a of asignaciones) if (!porCategoria.has(a.categoria)) porCategoria.set(a.categoria, 0);
  let sinCotizacion = 0;
  for (const f of filas || []) {
    const categoria = categoriaDe.get(normText(f.etiqueta));
    if (!categoria) continue;
    const moneda = String(f.moneda || "ARS").toUpperCase();
    let pesos = num(f.total);
    if (moneda !== "ARS") {
      if (!cotizacion) { sinCotizacion += pesos; continue; }
      pesos *= num(cotizacion);
    }
    porCategoria.set(categoria, (porCategoria.get(categoria) || 0) + pesos);
  }
  const lista = [...porCategoria.entries()].map(([categoria, monto]) => ({ categoria, monto: r2(monto) }));
  return {
    lista,
    total: r2(lista.reduce((s, c) => s + c.monto, 0)),
    usd_sin_cotizacion: r2(sinCotizacion)
  };
}

/**
 * @param reparto  resultado de calcularReparto (socios, totales, personales, resumen)
 * @param banco    resumenBanco(...) o null si no se pudo leer
 * @param fijos    costosFijosPorCategoria(...)
 */
export function calcularBloques({ reparto, banco, fijos }) {
  const ts = reparto.total_socios;
  const tp = reparto.total_personales;
  const res = reparto.resumen;

  const depositos = num(banco?.depositos);
  const retiros = num(banco?.retiros);
  const ggr = depositos - retiros;
  const cefReal = num(banco?.iva);
  const pctCefReal = pct(cefReal, depositos);
  // Costo de fichas del mes: netwin propio × fichas real (0 si es negativo).
  const costoFichas = res.pct_fichas_real === null ? 0 : Math.max(0, num(res.netwin_propio) * res.pct_fichas_real);
  const utilidades = num(ts.ggc_socio) + num(ts.ggc_nexo);
  const estructura = num(ts.costo_estructura);

  const costosGeneral = num(fijos.total) + cefReal + costoFichas + estructura + utilidades;
  const general = {
    depositos: r2(depositos),
    retiros: r2(retiros),
    rtp: pct(retiros, depositos),
    ggr: r2(ggr),
    costos_fijos: fijos.lista,
    costos_fijos_total: fijos.total,
    cef: r2(cefReal),
    pct_cef_real: pctCefReal,
    fichas: r2(costoFichas),
    costo_estructura: r2(estructura),
    utilidades: r2(utilidades),
    costos_totales: r2(costosGeneral),
    neta: r2(ggr - costosGeneral)
  };

  // Casa: lo que queda del GGR del banco sacando el de los socios, con los
  // costos reales de los paneles personales y los costos fijos.
  const ggrCasa = ggr - num(ts.ggr);
  const cefCasa = pctCefReal === null ? 0 : num(tp.entrada) * pctCefReal;
  const fichasCasa = res.pct_fichas_real === null ? 0 : Math.max(0, num(tp.netwin) * res.pct_fichas_real);
  const costosCasa = cefCasa + fichasCasa + num(fijos.total);
  const casa = {
    ggr: r2(ggrCasa),
    cef: r2(cefCasa),
    fichas: r2(fichasCasa),
    costos_fijos: fijos.lista,
    costos_fijos_total: fijos.total,
    costos_totales: r2(costosCasa),
    neta: r2(ggrCasa - costosCasa)
  };

  // Socios: lo que le deja a la casa el GGR de los paneles de socios.
  const ggrSocios = num(ts.ggr);
  const gananciaCasa = ggrSocios - (utilidades + estructura);
  // Lo pactado con los socios: entrada × 2,25% y netwin × 18%.
  const cefSocios = num(ts.entrada) * num(res.pct_cef_socio);
  const fichasSocios = num(ts.netwin) * num(res.pct_fichas_pactado);
  const socios = {
    ggr: r2(ggrSocios),
    utilidades: r2(utilidades),
    costo_estructura: r2(estructura),
    ganancia_casa: r2(gananciaCasa),
    cef: r2(cefSocios),
    fichas: r2(fichasSocios),
    costos_totales: r2(cefSocios + fichasSocios),
    neta: r2(gananciaCasa - cefSocios - fichasSocios)
  };

  const ggrTotal = ggrCasa + gananciaCasa;
  const representacion = {
    total: r2(ggrTotal),
    por_socio: r2(gananciaCasa),
    propio: r2(ggrCasa),
    pct_por_socio: pct(gananciaCasa, ggrTotal),
    pct_propio: pct(ggrCasa, ggrTotal)
  };

  const ventaSocio = num(ts.entrada);
  const volumen = {
    total: r2(depositos),
    socio: r2(ventaSocio),
    casa: r2(depositos - ventaSocio),
    pct_socio: pct(ventaSocio, depositos),
    pct_casa: pct(depositos - ventaSocio, depositos)
  };

  return { general, casa, socios, representacion, volumen };
}

export function validarCostosFijos(body) {
  const lista = body?.asignaciones;
  if (!Array.isArray(lista) || lista.length > 200) return { error: "asignaciones inválidas" };
  const vistas = new Set();
  const asignaciones = [];
  for (const a of lista) {
    const etiqueta = String(a?.etiqueta ?? "").trim();
    const categoria = String(a?.categoria ?? "").trim().replace(/\s+/g, " ");
    if (!etiqueta || etiqueta.length > 80) return { error: "etiqueta inválida" };
    if (categoria.length > 40) return { error: `categoría muy larga para ${etiqueta}` };
    const clave = normText(etiqueta);
    if (vistas.has(clave)) return { error: `${etiqueta} está repetida` };
    vistas.add(clave);
    if (categoria) asignaciones.push({ etiqueta, categoria });
  }
  return { asignaciones };
}
