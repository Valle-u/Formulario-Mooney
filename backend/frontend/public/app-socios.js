const ROLES_SOCIOS = new Set(["admin", "direccion"]);
let ultimoReparto = null;

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function pesos(n) {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function porcentaje(n, decimales = 2) {
  if (n === null || n === undefined) return "—";
  return `${(Number(n) * 100).toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales })}%`;
}

function claseNum(n) {
  const v = Number(n);
  if (v > 0) return "num-pos";
  if (v < 0) return "num-neg";
  return "";
}

function fechaCorta(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return d ? `${d}/${m}/${y}` : "—";
}

// --- Panel de socios ---

// Columnas agrupadas: cada grupo tiene su color (ver .g-* en socios.html) y
// las subcolumnas repiten el mismo orden Casa / Socio / Nexo.
const GRUPOS_SOCIOS = [
  { id: "info", titulo: "Información general", cols: [
    { k: "netwin", t: "Netwin", color: "neg" }, { k: "entrada", t: "Entrada" },
    { k: "salida", t: "Salida" }, { k: "ggr", t: "GGR", color: true, fuerte: true }] },
  { id: "ggr", titulo: "Reparto del GGR", cols: [
    { k: "ggr_casa", t: "Casa", color: "neg" }, { k: "ggr_socio", t: "Socio", color: "neg" }, { k: "ggr_nexo", t: "Nexo", color: "neg" }] },
  { id: "cef", titulo: "CEF", cols: [
    { k: "cef_casa", t: "Casa" }, { k: "cef_socio", t: "Socio" }, { k: "cef_nexo", t: "Nexo" }] },
  { id: "fichas", titulo: "Fichas", cols: [
    { k: "fichas_casa", t: "Casa" }, { k: "fichas_socio", t: "Socio" }, { k: "fichas_nexo", t: "Nexo" }] },
  { id: "otros", titulo: "Empleados y estructura", cols: [
    { k: "empleados_socio", t: "Empleados socio" }, { k: "empleados_nexo", t: "Empleados nexo" }, { k: "costo_estructura", t: "Estructura" }] },
  { id: "ggc", titulo: "GGC · lo que queda", cols: [
    { k: "ggc_casa", t: "Casa", color: true, fuerte: true }, { k: "ggc_socio", t: "Socio", color: true, fuerte: true },
    { k: "ggc_nexo", t: "Nexo", color: true, fuerte: true }] }
];

const GRUPOS_PERSONALES = [
  { id: "info", titulo: "Información general", cols: [
    { k: "netwin", t: "Netwin", color: "neg" }, { k: "entrada", t: "Entrada" },
    { k: "salida", t: "Salida" }, { k: "ggr", t: "GGR", color: true, fuerte: true }] },
  { id: "ops", titulo: "Cantidad de operaciones", cols: [
    { k: "ops_entrada", t: "Entrada", entero: true }, { k: "ops_salida", t: "Salida", entero: true }] },
  { id: "ticket", titulo: "Ticket promedio", cols: [
    { k: "ticket_deposito", t: "Depósito", sinTotal: true }, { k: "ticket_retiro", t: "Retiro", sinTotal: true }] }
];

function celdaGrupo(valor, col, grupo, inicio, esTotal) {
  const clases = [`g-${grupo.id}`];
  if (inicio) clases.push("ini");
  if (col.fuerte) clases.push("fuerte");
  if (esTotal && col.sinTotal) return `<td class="${clases.join(" ")}"></td>`;
  const v = Number(valor);
  if (!v) return `<td class="${clases.join(" ")}"><span class="vacio">—</span></td>`;
  // color "neg": solo los negativos en rojo (los positivos verdes quedan para GGR y GGC).
  if (col.color === true || (col.color === "neg" && v < 0)) clases.push(claseNum(v));
  const texto = col.entero ? v.toLocaleString("es-AR") : pesos(v);
  return `<td class="${clases.join(" ")}">${texto}</td>`;
}

function tablaAgrupada(tabla, titulo, grupos, filas, total) {
  const cabGrupos = `<tr class="grupo"><th rowspan="2" class="col-nombre">${titulo}</th>${grupos.map((g) =>
    `<th colspan="${g.cols.length}" class="g-${g.id} ini">${g.titulo}</th>`).join("")}</tr>`;
  const cabCols = `<tr class="sub">${grupos.map((g) => g.cols.map((c, i) =>
    `<th class="g-${g.id}${i === 0 ? " ini" : ""}">${c.t}</th>`).join("")).join("")}</tr>`;
  const fila = (nombreHtml, datos, esTotal) =>
    `<tr${esTotal ? ' class="total"' : ""}><td class="col-nombre">${nombreHtml}</td>${grupos.map((g) =>
      g.cols.map((c, i) => celdaGrupo(datos[c.k], c, g, i === 0, esTotal)).join("")).join("")}</tr>`;
  tabla.innerHTML = `<thead>${cabGrupos}${cabCols}</thead><tbody>${
    filas.map((f) => fila(f.nombreHtml, f.datos, false)).join("")}${fila("Total", total, true)}</tbody>`;
}

function renderSocios(data) {
  const tabla = document.getElementById("tablaSocios");
  if (!data.socios.length) {
    tabla.innerHTML = `<tbody><tr><td class="socios-vacio">No hay socios con datos este mes.</td></tr></tbody>`;
    return;
  }
  // Sin socios con nexo, las columnas de nexo sobran.
  const hayNexo = data.socios.some((s) => s.nexo);
  const grupos = GRUPOS_SOCIOS.map((g) => ({
    ...g,
    cols: hayNexo ? g.cols : g.cols.filter((c) => !/_nexo$/.test(c.k))
  }));
  const filas = data.socios.map((s) => {
    const avisos = [];
    if (s.sin_config) avisos.push("sin reparto cargado");
    if (s.nexo) avisos.push(`nexo: ${s.nexo}`);
    return {
      nombreHtml: `${escapeHtml(s.nombre)}${avisos.length ? `<span class="socios-aviso">${escapeHtml(avisos.join(" · "))}</span>` : ""}`,
      datos: s
    };
  });
  tablaAgrupada(tabla, "Socio", grupos, filas, data.total_socios);
}

// --- Paneles personales ---

function renderPersonales(data) {
  const tabla = document.getElementById("tablaPersonales");
  if (!data.personales.length) {
    tabla.innerHTML = `<tbody><tr><td class="socios-vacio">No hay paneles personales con datos este mes.</td></tr></tbody>`;
    return;
  }
  const filas = data.personales.map((p) => ({ nombreHtml: escapeHtml(p.nombre), datos: p }));
  tablaAgrupada(tabla, "Panel", GRUPOS_PERSONALES, filas, data.total_personales);
}

// --- KPIs ---

function renderKpis(data) {
  const t = data.total_socios;
  const r = data.resumen;
  const kpi = (titulo, valor, clase = "", nota = "") =>
    `<div class="socios-kpi"><span>${titulo}</span><strong class="${clase}">${valor}</strong>${nota ? `<small>${escapeHtml(nota)}</small>` : ""}</div>`;
  const fichasReal = r.pct_fichas_real === null
    ? "—"
    : porcentaje(r.pct_fichas_real);
  const notaFichas = r.costo_fichas_ars === null
    ? "Falta la factura o la cotización del mes"
    : `${pesos(r.costo_fichas_ars)} de factura · pactado ${porcentaje(r.pct_fichas_pactado, 0)}`;
  document.getElementById("sociosKpis").innerHTML = [
    kpi("GGR socios", pesos(t.ggr), claseNum(t.ggr)),
    kpi("GGC casa", pesos(t.ggc_casa), claseNum(t.ggc_casa), "Lo que nos queda de los paneles de socios"),
    kpi("Utilidades a pagar", pesos(t.ggc_socio + t.ggc_nexo), "", "GGC positivo de socios y nexos"),
    kpi("Nos deben", pesos(t.deuda_socios + t.deuda_nexos), t.deuda_socios + t.deuda_nexos > 0 ? "num-neg" : "", "GGC negativo de socios y nexos"),
    kpi("Netwin propio", pesos(r.netwin_propio), claseNum(r.netwin_propio),
      r.netwin_admin === null ? "Sin datos del admin" : `Admin ${pesos(r.netwin_admin)} − AgenteMC ${pesos(r.netwin_agentemc)}`),
    kpi("Costo real de fichas", fichasReal, "", notaFichas)
  ].join("");
}

// --- Configuración ---

const pctInput = (v) => Math.round(Number(v || 0) * 100 * 10000) / 10000;

function renderConfig(data) {
  const m = data.socio_mes;
  document.getElementById("facturaUsd").value = m.factura_usd ?? "";
  document.getElementById("cotizacion").value = m.cotizacion ?? "";
  document.getElementById("pctFichas").value = pctInput(m.pct_fichas_pactado);
  document.getElementById("pctCef").value = pctInput(m.pct_cef_socio);

  const socios = data.config;
  const opcionesNexo = (actual, propio) => [`<option value="">Sin nexo</option>`]
    .concat(socios.filter((s) => s.panel_id !== propio).map((s) =>
      `<option value="${s.panel_id}"${Number(actual) === s.panel_id ? " selected" : ""}>${escapeHtml(s.nombre)}</option>`))
    .join("");
  const input = (campo, valor, clase = "", paso = "0.01") =>
    `<input type="number" step="${paso}" data-campo="${campo}" value="${valor}"${clase ? ` class="${clase}"` : ""}>`;

  const filas = socios.map((s) => `<tr data-panel="${s.panel_id}">
    <td>${escapeHtml(s.nombre)}${s.is_active ? "" : `<span class="socios-aviso">inactivo</span>`}${s.heredada ? `<span class="socios-aviso">heredado de un mes anterior</span>` : ""}</td>
    <td>${input("pct_ggr_socio", pctInput(s.pct_ggr_socio))}</td>
    <td>${input("pct_ggr_casa", pctInput(s.pct_ggr_casa))}</td>
    <td>${input("pct_ggr_nexo", pctInput(s.pct_ggr_nexo))}</td>
    <td>${input("pct_costos_socio", pctInput(s.pct_costos_socio))}</td>
    <td>${input("pct_costos_casa", pctInput(s.pct_costos_casa))}</td>
    <td>${input("pct_costos_nexo", pctInput(s.pct_costos_nexo))}</td>
    <td><select data-campo="nexo_panel_id">${opcionesNexo(s.nexo_panel_id, s.panel_id)}</select></td>
    <td>${input("empleados", s.empleados, "monto")}</td>
    ${s.costo_estructura.map((v, i) => `<td>${input(`s${i + 1}`, v, "monto")}</td>`).join("")}
    <td><button type="button" class="btn btn-primary btn-small" data-guardar="${s.panel_id}">Guardar</button></td>
  </tr>`).join("");

  document.getElementById("tablaConfig").innerHTML = `<thead>
    <tr class="grupo"><th></th><th colspan="3">GGR (%)</th><th colspan="3">Costos (%)</th><th></th><th></th><th colspan="5">Costo de estructura por semana ($)</th><th></th></tr>
    <tr><th>Socio</th><th>Socio</th><th>Casa</th><th>Nexo</th><th>Socio</th><th>Casa</th><th>Nexo</th><th>Nexo</th><th>Empleados ($)</th>
      <th>S1</th><th>S2</th><th>S3</th><th>S4</th><th>S5</th><th></th></tr>
  </thead><tbody>${filas}</tbody>`;
}

async function guardarSocio(btn) {
  const fila = btn.closest("tr");
  const valor = (campo) => fila.querySelector(`[data-campo="${campo}"]`).value;
  const pct = (campo) => Number(valor(campo) || 0) / 100;
  const body = {
    mes: document.getElementById("mes").value,
    panel_id: Number(fila.dataset.panel),
    pct_ggr_socio: pct("pct_ggr_socio"),
    pct_ggr_casa: pct("pct_ggr_casa"),
    pct_ggr_nexo: pct("pct_ggr_nexo"),
    pct_costos_socio: pct("pct_costos_socio"),
    pct_costos_casa: pct("pct_costos_casa"),
    pct_costos_nexo: pct("pct_costos_nexo"),
    nexo_panel_id: valor("nexo_panel_id") || null,
    empleados: valor("empleados"),
    costo_estructura: [1, 2, 3, 4, 5].map((i) => valor(`s${i}`))
  };
  btn.disabled = true;
  try {
    await api("/api/socios/config", { method: "PUT", body });
    toast("Guardado", "Reparto del socio actualizado", "success");
    await cargar(null, { mantenerConfigAbierta: true });
  } catch (e) {
    toast("Error", e.message || "No se pudo guardar", "error");
  } finally {
    btn.disabled = false;
  }
}

async function guardarMes(ev) {
  ev.preventDefault();
  const btn = document.getElementById("btnGuardarMes");
  const body = {
    mes: document.getElementById("mes").value,
    factura_usd: document.getElementById("facturaUsd").value,
    cotizacion: document.getElementById("cotizacion").value,
    pct_fichas_pactado: Number(document.getElementById("pctFichas").value) / 100,
    pct_cef_socio: Number(document.getElementById("pctCef").value) / 100
  };
  btn.disabled = true;
  try {
    await api("/api/socios/mes", { method: "PUT", body });
    toast("Guardado", "Datos del mes actualizados", "success");
    await cargar(null, { mantenerConfigAbierta: true });
  } catch (e) {
    toast("Error", e.message || "No se pudo guardar", "error");
  } finally {
    btn.disabled = false;
  }
}

function render(data) {
  ultimoReparto = data;
  renderKpis(data);
  renderSocios(data);
  renderPersonales(data);
  renderConfig(data);
  document.getElementById("sociosResultado").hidden = false;

  const d = data.datos || {};
  const estado = d.dias
    ? `${d.dias} días con datos de los paneles, el último del ${fechaCorta(d.ultima)}.`
    : "Todavía no llegaron datos de los paneles para este mes.";
  const avisoMes = data.socio_mes.heredado ? " Los datos del mes (factura y cotización) todavía no se cargaron." : "";
  document.getElementById("sociosEstado").textContent = estado + avisoMes;
}

async function cargar(ev, { mantenerConfigAbierta = false } = {}) {
  ev?.preventDefault();
  const btn = document.getElementById("btnVer");
  const estado = document.getElementById("sociosEstado");
  const valor = document.getElementById("mes").value;
  if (!/^\d{4}-\d{2}$/.test(valor)) {
    estado.textContent = "Elegí un mes.";
    return;
  }
  const detalle = document.getElementById("detalleConfig");
  const abierto = mantenerConfigAbierta && detalle.open;
  btn.disabled = true;
  if (!ultimoReparto) estado.textContent = "Armando el reparto…";
  try {
    const data = await api(`/api/socios/reparto?mes=${encodeURIComponent(valor)}`);
    render(data);
    detalle.open = abierto;
  } catch (e) {
    estado.textContent = e.message || "No pude armar el reparto";
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  if (!ROLES_SOCIOS.has(getUser().role)) {
    window.location.replace("egreso.html");
    return;
  }
  await initCommonUI();
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);
  document.getElementById("mes").value = mesActual();
  document.getElementById("sociosForm").addEventListener("submit", cargar);
  document.getElementById("formMes").addEventListener("submit", guardarMes);
  document.getElementById("tablaConfig").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-guardar]");
    if (btn) guardarSocio(btn);
  });
  cargar(null);
});
