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

function celda(n, { color = false, extra = "" } = {}) {
  const v = Number(n);
  const vacio = !v;
  const clases = [color && !vacio ? claseNum(v) : "", extra].filter(Boolean).join(" ");
  return `<td${clases ? ` class="${clases}"` : ""}>${vacio ? "—" : pesos(v)}</td>`;
}

function fechaCorta(iso) {
  const [y, m, d] = String(iso || "").split("-");
  return d ? `${d}/${m}/${y}` : "—";
}

// --- Panel de socios ---

const COLUMNAS_SOCIOS = [
  ["netwin", "Netwin"], ["entrada", "Entrada"], ["salida", "Salida"], ["ggr", "GGR", true],
  ["ggr_casa", "GGR casa", true], ["ggr_socio", "GGR socio", true], ["ggr_nexo", "GGR nexo", true],
  ["cef_casa", "CEF casa"], ["cef_socio", "CEF socio"], ["cef_nexo", "CEF nexo"],
  ["fichas_casa", "Fichas casa"], ["fichas_socio", "Fichas socio"], ["fichas_nexo", "Fichas nexo"],
  ["empleados_socio", "Empleados socio"], ["empleados_nexo", "Empleados nexo"], ["costo_estructura", "Costo estructura"],
  ["ggc_casa", "GGC casa", true, "col-ggc"], ["ggc_socio", "GGC socio", true, "col-ggc"], ["ggc_nexo", "GGC nexo", true, "col-ggc"]
];

function renderSocios(data) {
  const tabla = document.getElementById("tablaSocios");
  if (!data.socios.length) {
    tabla.innerHTML = `<tbody><tr><td class="socios-vacio">No hay socios con datos este mes.</td></tr></tbody>`;
    return;
  }
  const grupos = `<tr class="grupo">
    <th></th><th colspan="4">Información general</th><th colspan="3">Reparto del GGR</th>
    <th colspan="9">Costos</th><th colspan="3">GGC</th>
  </tr>`;
  const encabezado = `<tr><th>Socio</th>${COLUMNAS_SOCIOS.map(([, titulo]) => `<th>${titulo}</th>`).join("")}</tr>`;
  const filas = data.socios.map((s) => {
    const avisos = [];
    if (s.sin_config) avisos.push("sin reparto cargado");
    if (s.nexo) avisos.push(`nexo: ${s.nexo}`);
    const nombre = `${escapeHtml(s.nombre)}${avisos.length ? `<span class="socios-aviso">${escapeHtml(avisos.join(" · "))}</span>` : ""}`;
    return `<tr><td>${nombre}</td>${COLUMNAS_SOCIOS.map(([k, , color, extra]) => celda(s[k], { color, extra })).join("")}</tr>`;
  }).join("");
  const t = data.total_socios;
  const total = `<tr class="total"><td>Total</td>${COLUMNAS_SOCIOS.map(([k, , color, extra]) => celda(t[k], { color, extra })).join("")}</tr>`;
  tabla.innerHTML = `<thead>${grupos}${encabezado}</thead><tbody>${filas}${total}</tbody>`;
}

// --- Paneles personales ---

function renderPersonales(data) {
  const tabla = document.getElementById("tablaPersonales");
  if (!data.personales.length) {
    tabla.innerHTML = `<tbody><tr><td class="socios-vacio">No hay paneles personales con datos este mes.</td></tr></tbody>`;
    return;
  }
  const filas = data.personales.map((p) => `<tr>
    <td>${escapeHtml(p.nombre)}</td>
    ${celda(p.netwin, { color: true })}${celda(p.entrada)}${celda(p.salida)}
    <td>${p.ops_entrada || "—"}</td><td>${p.ops_salida || "—"}</td>
    ${celda(p.ticket_deposito)}${celda(p.ticket_retiro)}${celda(p.bonos)}
    ${celda(p.ggr, { color: true })}${celda(p.inversion_publicidad)}
  </tr>`).join("");
  const t = data.total_personales;
  const total = `<tr class="total"><td>Total</td>
    ${celda(t.netwin, { color: true })}${celda(t.entrada)}${celda(t.salida)}
    <td>${t.ops_entrada || "—"}</td><td>${t.ops_salida || "—"}</td><td></td><td></td>
    ${celda(t.bonos)}${celda(t.ggr, { color: true })}${celda(t.inversion_publicidad)}
  </tr>`;
  tabla.innerHTML = `<thead><tr>
      <th>Panel</th><th>Netwin</th><th>Entrada</th><th>Salida</th><th>Op. entrada</th><th>Op. salida</th>
      <th>Ticket depósito</th><th>Ticket retiro</th><th>Bonos y remarketing</th><th>GGR</th><th>Inversión publicidad</th>
    </tr></thead><tbody>${filas}${total}</tbody>`;
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
