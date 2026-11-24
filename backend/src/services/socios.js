// Reparto mensual con socios: GGR, costos (CEF, fichas, empleados, costo de
// estructura) y GGC de cada socio, de la casa y del nexo.
//
// Reglas (confirmadas con el usuario, igual que la planilla "Trazabilidad
// General Mensual"):
// - GGR = entrada − salida, repartido con los % de GGR del socio.
// - El socio paga lo pactado: CEF = entrada × 2,25% y fichas = netwin × 18%
//   × su % de costos (9% con 50/50; 0 si el netwin es negativo).
// - La casa paga el resto del CEF real (IVA / depósitos del banco): entrada ×
//   (CEF real − lo que pagan el socio y el nexo), nunca negativo. Fichas =
//   netwin × fichas real / 2.
// - El nexo paga su % de costos sobre el CEF pactado y los empleados del
//   socio, y las fichas = netwin × 18% × su % de GGR.
// - Empleados y costo de estructura los paga el socio.
// - GGC = GGR − costos. Si el GGC del socio es negativo, en el total cuenta
//   como 0.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => (v === null || v === undefined || v === "" ? 0 : Number(v) || 0);

export function mesValido(texto) {
  const m = String(texto || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  if (anio < 2020 || anio > 2100 || mes < 1 || mes > 12) return null;
  return { anio, mes, inicio: `${m[1]}-${m[2]}-01` };
}

/**
 * @param reales { cef, fichas }: % reales del mes (CEF real del banco y
 *   fichas real); si falta alguno, ese costo de la casa queda en 0.
 */
export function repartoSocio(totales, cfg, socioMes, reales = {}) {
  const netwin = num(totales?.netwin);
  const entrada = num(totales?.entrada);
  const salida = num(totales?.salida);
  const ggr = entrada - salida;

  const pctCefSocio = num(socioMes?.pct_cef_socio);
  const pctFichas = num(socioMes?.pct_fichas_pactado);
  const netwinPositivo = netwin > 0 ? netwin : 0;
  const fichasPactadas = netwinPositivo * pctFichas;

  const costos = { socio: num(cfg.pct_costos_socio), casa: num(cfg.pct_costos_casa), nexo: num(cfg.pct_costos_nexo) };
  const empleados = num(cfg.empleados);
  const estructura = [1, 2, 3, 4, 5].reduce((s, i) => s + num(cfg[`costo_estructura_s${i}`]), 0);

  const fila = {
    netwin: r2(netwin),
    entrada: r2(entrada),
    salida: r2(salida),
    ggr: r2(ggr),
    ggr_socio: r2(ggr * num(cfg.pct_ggr_socio)),
    ggr_casa: r2(ggr * num(cfg.pct_ggr_casa)),
    ggr_nexo: r2(ggr * num(cfg.pct_ggr_nexo)),
    cef_socio: r2(entrada * pctCefSocio),
    cef_casa: r2(entrada * Math.max(0, num(reales.cef) - pctCefSocio - pctCefSocio * costos.nexo)),
    cef_nexo: r2(entrada * pctCefSocio * costos.nexo),
    fichas_socio: r2(fichasPactadas * costos.socio),
    fichas_casa: r2(netwinPositivo * num(reales.fichas) / 2),
    fichas_nexo: r2(fichasPactadas * num(cfg.pct_ggr_nexo)),
    empleados_socio: r2(empleados),
    empleados_nexo: r2(empleados * costos.nexo),
    costo_estructura: r2(estructura)
  };
  fila.ggc_socio = r2(fila.ggr_socio - fila.cef_socio - fila.fichas_socio - fila.empleados_socio - fila.costo_estructura);
  fila.ggc_casa = r2(fila.ggr_casa - fila.cef_casa - fila.fichas_casa);
  fila.ggc_nexo = r2(fila.ggr_nexo - fila.cef_nexo - fila.fichas_nexo - fila.empleados_nexo);
  return fila;
}

export function filaPersonal(totales) {
  const entrada = num(totales?.entrada);
  const salida = num(totales?.salida);
  const bonos = num(totales?.bonos);
  const opsE = num(totales?.ops_entrada);
  const opsS = num(totales?.ops_salida);
  return {
    netwin: r2(totales?.netwin),
    entrada: r2(entrada),
    salida: r2(salida),
    ops_entrada: opsE,
    ops_salida: opsS,
    ticket_deposito: opsE > 0 ? r2(entrada / opsE) : null,
    ticket_retiro: opsS > 0 ? r2(salida / opsS) : null,
    bonos: r2(bonos),
    ggr: r2(entrada - salida - bonos),
    inversion_publicidad: r2(totales?.inversion_publicidad)
  };
}

function sumar(filas, campos) {
  const total = {};
  for (const c of campos) total[c] = r2(filas.reduce((s, f) => s + num(f[c]), 0));
  return total;
}

/**
 * @param paneles   [{ id, nombre, tipo, orden, is_active }]
 * @param totales   { [panel_id]: { netwin, entrada, salida, ops_entrada, ops_salida, bonos, inversion_publicidad } }
 * @param configs   { [panel_id]: fila de panel_config_mes (+ heredada, nexo_nombre) }
 * @param socioMes  fila de socios_mes (o null)
 */
/**
 * @param netwinAnterior { admin, agentemc } del mes anterior: el costo real de
 *   fichas es la factura del mes (en pesos) sobre el netwin propio del mes pasado.
 */
export function calcularReparto({ paneles, totales, configs, socioMes, netwinAnterior = null, pctCefReal = null }) {
  // Fichas real: factura del mes en pesos sobre el netwin del admin (total)
  // del mes pasado, igual que "FICHAS REAL" de la planilla.
  const factura = socioMes?.factura_usd === null || socioMes?.factura_usd === undefined ? null : num(socioMes.factura_usd);
  const cotizacion = socioMes?.cotizacion === null || socioMes?.cotizacion === undefined ? null : num(socioMes.cotizacion);
  const costoFichasArs = factura !== null && cotizacion !== null ? r2(factura * cotizacion) : null;
  const adminAnterior = netwinAnterior?.admin ?? null;
  const pctFichasReal = costoFichasArs !== null && adminAnterior > 0 ? costoFichasArs / adminAnterior : null;
  const reales = { cef: pctCefReal, fichas: pctFichasReal };

  const socios = [];
  const personales = [];
  const control = {};

  for (const p of paneles) {
    const t = totales[p.id];
    if (p.tipo === "control") {
      control[p.nombre] = r2(t?.netwin);
      continue;
    }
    // Un panel inactivo solo aparece si tiene datos en el mes.
    if (!p.is_active && !t) continue;
    if (p.tipo === "personal") {
      personales.push({ panel_id: p.id, nombre: p.nombre, ...filaPersonal(t) });
    } else if (p.tipo === "socio") {
      const cfg = configs[p.id];
      if (!cfg) {
        socios.push({ panel_id: p.id, nombre: p.nombre, sin_config: true, ...repartoSocio(t, {}, socioMes, reales) });
        continue;
      }
      socios.push({
        panel_id: p.id,
        nombre: p.nombre,
        nexo: cfg.nexo_nombre || null,
        config_heredada: Boolean(cfg.heredada),
        ...repartoSocio(t, cfg, socioMes, reales)
      });
    }
  }

  const camposSocio = ["netwin", "entrada", "salida", "ggr", "ggr_socio", "ggr_casa", "ggr_nexo",
    "cef_socio", "cef_casa", "cef_nexo", "fichas_socio", "fichas_casa", "fichas_nexo",
    "empleados_socio", "empleados_nexo", "costo_estructura", "ggc_casa"];
  const totalSocios = sumar(socios, camposSocio);
  totalSocios.ggc_socio = r2(socios.reduce((s, f) => s + Math.max(0, f.ggc_socio), 0));
  totalSocios.ggc_nexo = r2(socios.reduce((s, f) => s + Math.max(0, f.ggc_nexo), 0));

  const totalPersonales = sumar(personales, ["netwin", "entrada", "salida", "ops_entrada", "ops_salida", "bonos", "ggr", "inversion_publicidad"]);

  const netwinAdmin = control.ADMIN ?? null;
  const netwinAgenteMc = control.AGENTEMC ?? null;
  const netwinPropio = netwinAdmin === null ? null : r2(netwinAdmin - (netwinAgenteMc || 0));

  return {
    socios,
    total_socios: totalSocios,
    personales,
    total_personales: totalPersonales,
    resumen: {
      netwin_admin: netwinAdmin,
      netwin_agentemc: netwinAgenteMc,
      netwin_propio: netwinPropio,
      factura_usd: factura,
      cotizacion,
      costo_fichas_ars: costoFichasArs,
      netwin_admin_anterior: adminAnterior === null ? null : r2(adminAnterior),
      pct_fichas_real: pctFichasReal,
      pct_cef_real: pctCefReal,
      pct_fichas_pactado: num(socioMes?.pct_fichas_pactado),
      pct_cef_socio: num(socioMes?.pct_cef_socio)
    }
  };
}

// Lo que AgenteMC nos paga por las fichas (23%) menos lo que nos cuestan (13%),
// igual que "GANANCIA POR FICHAS" de la planilla.
export const PCT_FICHAS_VENTA_AGENTEMC = 0.23;
export const PCT_FICHAS_COSTO_AGENTEMC = 0.13;

/**
 * Control de netwin por día: la suma de los paneles (socios y personales)
 * tiene que dar igual que ADMIN − AGENTEMC.
 * @param filas [{ fecha: "AAAA-MM-DD", tipo, nombre, netwin }]
 */
export function controlNetwin(filas) {
  const porDia = new Map();
  for (const f of filas || []) {
    const d = porDia.get(f.fecha) || { fecha: f.fecha, admin: null, agentemc: null, paneles: 0 };
    if (f.tipo === "control") {
      if (f.nombre === "ADMIN") d.admin = num(f.netwin);
      else if (f.nombre === "AGENTEMC") d.agentemc = num(f.netwin);
    } else {
      d.paneles += num(f.netwin);
    }
    porDia.set(f.fecha, d);
  }
  const dias = [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((d) => {
    const control = d.admin === null ? null : d.admin - (d.agentemc || 0);
    return {
      fecha: d.fecha,
      admin: d.admin === null ? null : r2(d.admin),
      agentemc: d.agentemc === null ? null : r2(d.agentemc),
      control: control === null ? null : r2(control),
      paneles: r2(d.paneles),
      diferencia: control === null ? null : r2(d.paneles - control)
    };
  });
  const suma = (k) => r2(dias.reduce((s, d) => s + (d[k] || 0), 0));
  const total = { admin: suma("admin"), agentemc: suma("agentemc"), control: suma("control"), paneles: suma("paneles"), diferencia: suma("diferencia") };
  return {
    dias,
    total,
    dias_con_diferencia: dias.filter((d) => d.diferencia !== null && Math.abs(d.diferencia) >= 1).length,
    ganancia_fichas: r2(total.agentemc * PCT_FICHAS_VENTA_AGENTEMC - total.agentemc * PCT_FICHAS_COSTO_AGENTEMC)
  };
}

// --- Validación de lo que se edita desde la pantalla ---

function pct(valor) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : NaN;
}

function monto(valor, { permitirNegativo = false } = {}) {
  if (valor === null || valor === undefined || valor === "") return 0;
  const n = Number(valor);
  if (!Number.isFinite(n) || Math.abs(n) >= 1e13) return NaN;
  if (!permitirNegativo && n < 0) return NaN;
  return Math.round(n * 100) / 100;
}

export function validarSocioMes(body) {
  const mes = mesValido(body?.mes);
  if (!mes) return { error: "mes inválido (AAAA-MM)" };
  const opcional = (v, positivo) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n >= 1e13 || (positivo && n === 0)) return NaN;
    return Math.round(n * 100) / 100;
  };
  const datos = {
    mes: mes.inicio,
    factura_usd: opcional(body.factura_usd, false),
    cotizacion: opcional(body.cotizacion, true),
    pct_fichas_pactado: pct(body.pct_fichas_pactado),
    pct_cef_socio: pct(body.pct_cef_socio)
  };
  for (const [k, v] of Object.entries(datos)) {
    if (Number.isNaN(v)) return { error: `${k} inválido` };
  }
  return datos;
}

export function validarConfigPanel(body) {
  const mes = mesValido(body?.mes);
  if (!mes) return { error: "mes inválido (AAAA-MM)" };
  const panelId = Number(body?.panel_id);
  if (!Number.isSafeInteger(panelId) || panelId <= 0) return { error: "panel inválido" };
  const nexoId = body?.nexo_panel_id === null || body?.nexo_panel_id === undefined || body?.nexo_panel_id === ""
    ? null : Number(body.nexo_panel_id);
  if (nexoId !== null && (!Number.isSafeInteger(nexoId) || nexoId <= 0 || nexoId === panelId)) {
    return { error: "nexo inválido" };
  }

  const datos = {
    mes: mes.inicio,
    panel_id: panelId,
    nexo_panel_id: nexoId,
    pct_ggr_socio: pct(body.pct_ggr_socio),
    pct_ggr_casa: pct(body.pct_ggr_casa),
    pct_ggr_nexo: nexoId === null ? 0 : pct(body.pct_ggr_nexo ?? 0),
    pct_costos_socio: pct(body.pct_costos_socio),
    pct_costos_casa: pct(body.pct_costos_casa),
    pct_costos_nexo: nexoId === null ? 0 : pct(body.pct_costos_nexo ?? 0),
    empleados: monto(body.empleados)
  };
  const estructura = Array.isArray(body.costo_estructura) ? body.costo_estructura : [];
  if (estructura.length > 5) return { error: "costo de estructura: máximo 5 semanas" };
  for (let i = 0; i < 5; i++) datos[`costo_estructura_s${i + 1}`] = monto(estructura[i], { permitirNegativo: true });

  for (const [k, v] of Object.entries(datos)) {
    if (Number.isNaN(v)) return { error: `${k} inválido` };
  }
  if (Math.abs(datos.pct_ggr_socio + datos.pct_ggr_casa + datos.pct_ggr_nexo - 1) >= 0.0001) {
    return { error: "los % de GGR tienen que sumar 100%" };
  }
  if (Math.abs(datos.pct_costos_socio + datos.pct_costos_casa + datos.pct_costos_nexo - 1) >= 0.0001) {
    return { error: "los % de costos tienen que sumar 100%" };
  }
  return datos;
}
