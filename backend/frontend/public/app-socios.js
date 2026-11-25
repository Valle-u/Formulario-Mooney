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
// las subcolumnas repiten el mismo orden Casa / Socio / Nexo. "pct" calcula el
// porcentaje que se muestra chico debajo de cada monto y "nota" explica en el
// encabezado sobre qué es ese porcentaje.
const sobre = (k, base) => (d) => (Number(d[base]) > 0 ? Number(d[k]) / Number(d[base]) : null);
const sobreNetwin = (k) => (d) => (Number(d.netwin) > 0 ? Number(d[k]) / Number(d.netwin) : null);
const GRUPOS_SOCIOS = [
  { id: "info", titulo: "Información general", cols: [
    { k: "netwin", t: "Netwin", color: "neg" }, { k: "entrada", t: "Entrada" },
    { k: "salida", t: "Salida", nota: "RTP", pct: sobre("salida", "entrada") },
    { k: "ggr", t: "GGR", color: true, fuerte: true, nota: "% de la entrada", pct: sobre("ggr", "entrada") }] },
  { id: "ggr", titulo: "Reparto del GGR · % del GGR", cols: [
    { k: "ggr_casa", t: "Casa", color: "neg", pct: sobre("ggr_casa", "ggr") },
    { k: "ggr_socio", t: "Socio", color: "neg", pct: sobre("ggr_socio", "ggr") },
    { k: "ggr_nexo", t: "Nexo", color: "neg", pct: sobre("ggr_nexo", "ggr") }] },
  { id: "cef", titulo: "CEF · % de la entrada", cols: [
    { k: "cef_casa", t: "Casa", nota: "resto del real", pct: sobre("cef_casa", "entrada") },
    { k: "cef_socio", t: "Socio", nota: "pactado", pct: sobre("cef_socio", "entrada") },
    { k: "cef_nexo", t: "Nexo", nota: "su % de costos", pct: sobre("cef_nexo", "entrada") }] },
  { id: "fichas", titulo: "Fichas · % del netwin", cols: [
    { k: "fichas_casa", t: "Casa", nota: "real ÷ 2", pct: sobreNetwin("fichas_casa") },
    { k: "fichas_socio", t: "Socio", nota: "pactado", pct: sobreNetwin("fichas_socio") },
    { k: "fichas_nexo", t: "Nexo", nota: "su % de GGR", pct: sobreNetwin("fichas_nexo") }] },
  { id: "otros", titulo: "Empleados y estructura", cols: [
    { k: "empleados_socio", t: "Empleados socio" },
    { k: "empleados_nexo", t: "Empleados nexo", nota: "% de empleados", pct: sobre("empleados_nexo", "empleados_socio") },
    { k: "costo_estructura", t: "Estructura" }] },
  { id: "ggc", titulo: "GGC · lo que queda · % del GGR", cols: [
    { k: "ggc_casa", t: "Casa", color: true, fuerte: true, pct: sobre("ggc_casa", "ggr") },
    { k: "ggc_socio", t: "Socio", color: true, fuerte: true, pct: sobre("ggc_socio", "ggr") },
    { k: "ggc_nexo", t: "Nexo", color: true, fuerte: true, pct: sobre("ggc_nexo", "ggr") }] }
];

const GRUPOS_PERSONALES = [
  { id: "info", titulo: "Información general", cols: [
    { k: "netwin", t: "Netwin", color: "neg" }, { k: "entrada", t: "Entrada" },
    { k: "salida", t: "Salida", nota: "RTP", pct: sobre("salida", "entrada") },
    { k: "ggr", t: "GGR", color: true, fuerte: true, nota: "% de la entrada", pct: sobre("ggr", "entrada") }] },
  { id: "ops", titulo: "Cantidad de operaciones", cols: [
    { k: "ops_entrada", t: "Entrada", entero: true }, { k: "ops_salida", t: "Salida", entero: true }] },
  { id: "ticket", titulo: "Ticket promedio", cols: [
    { k: "ticket_deposito", t: "Depósito", sinTotal: true }, { k: "ticket_retiro", t: "Retiro", sinTotal: true }] }
];

function celdaGrupo(datos, col, grupo, inicio, esTotal) {
  const valor = datos[col.k];
  const clases = [`g-${grupo.id}`];
  if (inicio) clases.push("ini");
  if (col.fuerte) clases.push("fuerte");
  if (esTotal && col.sinTotal) return `<td class="${clases.join(" ")}"></td>`;
  const v = Number(valor);
  if (!v) return `<td class="${clases.join(" ")}"><span class="vacio">—</span></td>`;
  // color "neg": solo los negativos en rojo (los positivos verdes quedan para GGR y GGC).
  if (col.color === true || (col.color === "neg" && v < 0)) clases.push(claseNum(v));
  const texto = col.entero ? v.toLocaleString("es-AR") : pesos(v);
  const p = col.pct ? col.pct(datos) : null;
  const pctHtml = p === null || !Number.isFinite(p) ? "" : `<span class="pct-celda">${porcentaje(p)}</span>`;
  return `<td class="${clases.join(" ")}">${texto}${pctHtml}</td>`;
}

function tablaAgrupada(tabla, titulo, grupos, filas, total) {
  const cabGrupos = `<tr class="grupo"><th rowspan="2" class="col-nombre">${titulo}</th>${grupos.map((g) =>
    `<th colspan="${g.cols.length}" class="g-${g.id} ini">${g.titulo}</th>`).join("")}</tr>`;
  const cabCols = `<tr class="sub">${grupos.map((g) => g.cols.map((c, i) =>
    `<th class="g-${g.id}${i === 0 ? " ini" : ""}">${c.t}${c.nota ? `<small class="nota-col">${c.nota}</small>` : ""}</th>`).join("")).join("")}</tr>`;
  const fila = (nombreHtml, datos, esTotal) =>
    `<tr${esTotal ? ' class="total"' : ""}><td class="col-nombre">${nombreHtml}</td>${grupos.map((g) =>
      g.cols.map((c, i) => celdaGrupo(datos, c, g, i === 0, esTotal)).join("")).join("")}</tr>`;
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

// --- Resumen del mes (bloques de la planilla) ---

const conPct = (valor, p) =>
  `${pesos(valor)}${p === null || p === undefined ? "" : `<span class="pct">${porcentaje(p)}</span>`}`;

function filaBloque(etiqueta, valorHtml, clase = "", claseValor = "") {
  return `<div class="bloque-fila ${clase}"><span class="etq">${escapeHtml(etiqueta)}</span><span class="val ${claseValor}">${valorHtml}</span></div>`;
}

function bloque(titulo, grupo, filas) {
  return `<div class="bloque g-${grupo}"><div class="bloque-titulo">${escapeHtml(titulo)}</div><div class="bloque-filas">${filas.join("")}</div></div>`;
}

const filasFijos = (lista) => lista.map((c) => filaBloque(c.categoria, c.monto ? pesos(c.monto) : "—", "sub"));

function renderBloques(data) {
  const b = data.bloques;
  const aviso = document.getElementById("avisoBloques");
  const avisos = [];
  if (data.aviso_banco) avisos.push(`${data.aviso_banco} Mientras tanto, depósitos, retiros y CEF real quedan en 0.`);
  const estadoBanco = document.getElementById("estadoBanco");
  if (data.banco?.updated_at) {
    const cuando = new Date(data.banco.updated_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
    const como = data.banco.origen === "sincronizar" ? "traído a mano" : "al cargar el balance";
    estadoBanco.textContent = `Balance bancario actualizado el ${cuando} (${como}). Se actualiza solo cada vez que se carga el balance.`;
  } else {
    estadoBanco.textContent = "Balance bancario de este mes: sin datos todavía.";
  }
  if (data.usd_sin_cotizacion) avisos.push(`Hay ${data.usd_sin_cotizacion.toLocaleString("es-AR")} USD/USDT de costos fijos sin sumar porque falta la cotización del mes.`);
  if (data.resumen.costo_fichas_ars === null) avisos.push("Falta la factura o la cotización del mes: el costo de fichas queda en 0.");
  aviso.hidden = !avisos.length;
  aviso.textContent = avisos.join(" ");

  const g = b.general;
  const general = bloque("Información general", "general", [
    filaBloque("Depósitos", pesos(g.depositos)),
    filaBloque("Retiros", pesos(g.retiros)),
    filaBloque("RTP", g.rtp === null ? "—" : porcentaje(g.rtp)),
    filaBloque("GGR", pesos(g.ggr), "total", claseNum(g.ggr)),
    filaBloque("Costos fijos", pesos(g.costos_fijos_total), "seccion"),
    ...filasFijos(g.costos_fijos),
    filaBloque("Costo variable", "", "seccion"),
    filaBloque(`CEF${g.pct_cef_real === null ? "" : ` (${porcentaje(g.pct_cef_real)} real)`}`, pesos(g.cef), "sub"),
    filaBloque("Costo de fichas", pesos(g.fichas), "sub"),
    filaBloque("Costo de estructura", pesos(g.costo_estructura)),
    filaBloque("Utilidades a pagar socios y nexos", pesos(g.utilidades)),
    filaBloque("Costos totales", pesos(g.costos_totales), "total"),
    filaBloque("Neta final", pesos(g.neta), "neta", claseNum(g.neta))
  ]);

  const c = b.casa;
  const casa = bloque("Información casa", "casa", [
    filaBloque("GGR casa", pesos(c.ggr), "total", claseNum(c.ggr)),
    filaBloque("CEF", pesos(c.cef)),
    filaBloque("Fichas", pesos(c.fichas)),
    filaBloque("Costos fijos", pesos(c.costos_fijos_total), "seccion"),
    ...filasFijos(c.costos_fijos),
    filaBloque("Costos totales", pesos(c.costos_totales), "total"),
    filaBloque("Neta", pesos(c.neta), "neta", claseNum(c.neta))
  ]);

  const s = b.socios;
  const socios = bloque("Información socios", "socios", [
    filaBloque("GGR socios", pesos(s.ggr), "total", claseNum(s.ggr)),
    filaBloque("Utilidades a pagar", pesos(s.utilidades)),
    filaBloque("Costo de estructura", pesos(s.costo_estructura)),
    filaBloque("Ganancia de la casa", pesos(s.ganancia_casa), "total", claseNum(s.ganancia_casa)),
    filaBloque("CEF", pesos(s.cef)),
    filaBloque("Fichas", pesos(s.fichas)),
    filaBloque("Costos totales", pesos(s.costos_totales), "total"),
    filaBloque("Neta", pesos(s.neta), "neta", claseNum(s.neta))
  ]);

  const r = b.representacion;
  const repr = bloque("Representación GGR", "repr", [
    filaBloque("GGR total", pesos(r.total), "total", claseNum(r.total)),
    filaBloque("GGR por socio", conPct(r.por_socio, r.pct_por_socio)),
    filaBloque("GGR propio", conPct(r.propio, r.pct_propio))
  ]);

  const v = b.volumen;
  const vol = bloque("Volumen de venta", "vol", [
    filaBloque("Venta total", pesos(v.total), "total"),
    filaBloque("Venta socio", conPct(v.socio, v.pct_socio)),
    filaBloque("Venta casa", conPct(v.casa, v.pct_casa))
  ]);

  document.getElementById("bloques").innerHTML = general + casa + socios + `<div class="socios-bloques">${repr}${vol}</div>`;
}

async function sincronizarBanco() {
  const btn = document.getElementById("btnSincronizarBanco");
  btn.disabled = true;
  const texto = btn.textContent;
  btn.textContent = "Leyendo el balance…";
  try {
    await api("/api/socios/sincronizar-banco", { method: "POST", body: { mes: document.getElementById("mes").value }, timeout: 180000 });
    toast("Listo", "Totales del balance bancario actualizados", "success");
    await cargar(null, { mantenerConfigAbierta: true });
  } catch (e) {
    toast("Error", e.message || "No pude leer el balance bancario", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = texto;
  }
}

// --- Etiquetas de costos fijos ---

function renderFijos(data) {
  const asignadas = new Map((data.costos_fijos_etiquetas || []).map((a) => [a.etiqueta.trim(), a.categoria]));
  const disponibles = (typeof getEtiquetas_dynamic === "function" ? getEtiquetas_dynamic() : [])
    .map((e) => String(e).trim())
    .filter((e) => e && e !== "Cierre de Caja");
  // Las asignadas primero; después el resto de las etiquetas del formulario.
  const etiquetas = [...new Set([...asignadas.keys(), ...disponibles])];
  const categorias = [...new Set([...asignadas.values(), "Empleados", "Livechat", "Servidor", "Mantenimiento CRM", "Granja", "IA"])];
  document.getElementById("categoriasFijos").innerHTML = categorias.map((cat) => `<option value="${escapeHtml(cat)}">`).join("");
  document.getElementById("tablaFijos").innerHTML = `<thead><tr><th>Etiqueta de egreso</th><th>Categoría de costo fijo</th></tr></thead><tbody>${
    etiquetas.map((e) => `<tr><td>${escapeHtml(e)}</td><td><input type="text" list="categoriasFijos" maxlength="40" data-etiqueta="${escapeHtml(e)}" value="${escapeHtml(asignadas.get(e) || "")}" placeholder="No cuenta"></td></tr>`).join("")
  }</tbody>`;
}

async function guardarFijos() {
  const btn = document.getElementById("btnGuardarFijos");
  const asignaciones = [...document.querySelectorAll("#tablaFijos input[data-etiqueta]")]
    .map((i) => ({ etiqueta: i.dataset.etiqueta, categoria: i.value.trim() }))
    .filter((a) => a.categoria);
  btn.disabled = true;
  try {
    await api("/api/socios/costos-fijos", { method: "PUT", body: { asignaciones } });
    toast("Guardado", "Etiquetas de costos fijos actualizadas", "success");
    await cargar(null, { mantenerConfigAbierta: true });
  } catch (e) {
    toast("Error", e.message || "No se pudo guardar", "error");
  } finally {
    btn.disabled = false;
  }
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
    : r.netwin_admin_anterior === null
      ? `${pesos(r.costo_fichas_ars)} de factura · falta el netwin del admin del mes pasado`
      : `${pesos(r.costo_fichas_ars)} de factura sobre netwin admin del mes pasado ${pesos(r.netwin_admin_anterior)} · pactado ${porcentaje(r.pct_fichas_pactado, 0)}`;
  document.getElementById("sociosKpis").innerHTML = [
    kpi("GGR socios", pesos(t.ggr), claseNum(t.ggr)),
    kpi("GGC casa", pesos(t.ggc_casa), claseNum(t.ggc_casa), "Lo que nos queda de los paneles de socios"),
    kpi("Utilidades a pagar", pesos(t.ggc_socio + t.ggc_nexo), "", "GGC positivo de socios y nexos"),
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
  const inputCot = document.getElementById("cotizacion");
  inputCot.value = m.cotizacion ?? "";
  inputCot.placeholder = m.cotizacion_en_vivo ? `En vivo: ${m.cotizacion_en_vivo.valor}` : "En vivo";
  document.getElementById("notaCotizacion").textContent = m.cotizacion !== null
    ? "Cotización fija cargada a mano. Borrala para usar la cotización en vivo."
    : m.cotizacion_en_vivo
      ? `Se usa la cotización en vivo de Binance (CriptoYa): ${m.cotizacion_en_vivo.valor}.`
      : "No se pudo leer la cotización en vivo: cargala a mano.";
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

// --- Control de netwin ---

function renderControl(data) {
  const c = data.control_netwin;
  const kpi = (titulo, valor, clase = "", nota = "") =>
    `<div class="socios-kpi"><span>${titulo}</span><strong class="${clase}">${valor}</strong>${nota ? `<small>${escapeHtml(nota)}</small>` : ""}</div>`;
  const t = c.total;
  const difClase = Math.abs(t.diferencia) >= 1 ? "num-neg" : "num-pos";
  document.getElementById("controlKpis").innerHTML = [
    kpi("Suma de netwin de paneles diarios", pesos(t.paneles), claseNum(t.paneles)),
    kpi("Netwin admin − AgenteMC", pesos(t.control), claseNum(t.control), `Admin ${pesos(t.admin)}`),
    kpi("Diferencia", pesos(t.diferencia), difClase,
      c.dias_con_diferencia ? `${c.dias_con_diferencia} día(s) no coinciden` : "Todos los días coinciden"),
    kpi("Ganancia por fichas", pesos(c.ganancia_fichas), claseNum(c.ganancia_fichas), "AgenteMC y DistriPablo según la escala")
  ].join("");

  const celda = (v, clase = "") => `<td class="${clase}">${v === null ? "—" : pesos(v)}</td>`;
  const dif = (v) => celda(v, v === null ? "" : Math.abs(v) >= 1 ? "num-neg" : "");

  // Fichas de los autónomos: escala sobre el netwin del mes.
  const a = c.autonomos;
  const costoNota = c.pct_fichas_real === null ? "falta fichas real" : `fichas real ${porcentaje(c.pct_fichas_real)}`;
  const filaAut = (nombre, x) => `<tr><td class="col-nombre">${nombre}</td>${celda(x.netwin, claseNum(x.netwin) === "num-neg" ? "num-neg" : "")}<td>${porcentaje(x.pct_escala, 0)}</td>${celda(x.cobro)}${celda(x.costo)}${celda(x.ganancia, claseNum(x.ganancia))}</tr>`;
  const sinDp = !c.hay_distripablo ? '<tr><td class="col-nombre">DistriPablo</td><td colspan="5" class="note">Sin datos de DistriPablo este mes.</td></tr>' : filaAut("DistriPablo", a.distripablo);
  document.getElementById("tablaAutonomos").innerHTML =
    `<thead><tr class="sub"><th class="col-nombre">Panel</th><th>Netwin del mes</th><th>Tramo</th><th>Nos paga</th><th>Nos cuesta<small class="nota-col">${costoNota}</small></th><th>Ganancia</th></tr></thead>` +
    `<tbody>${filaAut("AgenteMC (sin DistriPablo)", a.agentemc)}${sinDp}</tbody>` +
    `<tfoot><tr class="total"><td class="col-nombre">Total</td>${celda(a.agentemc.netwin + a.distripablo.netwin)}<td></td>${celda(a.agentemc.cobro + a.distripablo.cobro)}${celda(a.agentemc.costo + a.distripablo.costo)}${celda(c.ganancia_fichas, claseNum(c.ganancia_fichas))}</tr></tfoot>`;

  const filas = c.dias.map((d) => `<tr><td class="col-nombre">${fechaCorta(d.fecha)}</td>${celda(d.admin)}${celda(d.agentemc)}${celda(d.distripablo)}${celda(d.agentemc_propio)}${celda(d.control)}${celda(d.paneles)}${dif(d.diferencia)}</tr>`);
  document.getElementById("tablaControl").innerHTML =
    `<thead><tr class="sub"><th class="col-nombre">Fecha</th><th>Netwin admin</th><th>AgenteMC</th><th>DistriPablo</th><th>AgenteMC − DistriPablo</th><th>Admin − AgenteMC</th><th>Suma paneles</th><th>Diferencia</th></tr></thead>` +
    `<tbody>${filas.join("") || '<tr><td colspan="8" class="note">Sin datos este mes.</td></tr>'}</tbody>` +
    `<tfoot><tr class="total"><td class="col-nombre">Total</td>${celda(t.admin)}${celda(t.agentemc)}${celda(c.hay_distripablo ? t.distripablo : null)}${celda(t.agentemc_propio)}${celda(t.control)}${celda(t.paneles)}${dif(t.diferencia)}</tr></tfoot>`;
}

function render(data) {
  ultimoReparto = data;
  renderKpis(data);
  renderSocios(data);
  renderPersonales(data);
  renderControl(data);
  renderBloques(data);
  renderConfig(data);
  document.getElementById("btnSincronizarBanco").disabled = false;
  renderFijos(data);
  document.getElementById("sociosResultado").hidden = false;

  const d = data.datos || {};
  const estado = d.dias
    ? `${d.dias} días con datos de los paneles, el último del ${fechaCorta(d.ultima)}.`
    : "Todavía no llegaron datos de los paneles para este mes.";
  const avisoMes = data.socio_mes.heredado && data.socio_mes.factura_usd === null ? " La factura de fichas del mes todavía no se cargó." : "";
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
  // Al guardar, los paneles de configuración quedan como estaban.
  const detalles = ["detalleConfig", "detalleFijos"].map((id) => document.getElementById(id));
  const abiertos = detalles.map((d) => mantenerConfigAbierta && d.open);
  btn.disabled = true;
  if (!ultimoReparto) estado.textContent = "Armando el reparto…";
  try {
    const data = await api(`/api/socios/reparto?mes=${encodeURIComponent(valor)}`);
    render(data);
    detalles.forEach((d, i) => { d.open = abiertos[i]; });
  } catch (e) {
    estado.textContent = e.message || "No pude armar el reparto";
  } finally {
    btn.disabled = false;
  }
}

// --- Planilla del balance de cada mes ---

function nombreMes(iso) {
  const [y, m] = String(iso).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("es-AR", { month: "long", year: "numeric", timeZone: "UTC" });
}

async function cargarPlanillas() {
  let planillas;
  try {
    ({ planillas } = await api("/api/socios/planillas"));
  } catch {
    return;
  }
  const tabla = document.getElementById("tablaPlanillas");
  tabla.innerHTML = planillas.length
    ? `<thead><tr><th>Mes</th><th>Planilla</th><th>Actualizada</th><th></th></tr></thead><tbody>${
        planillas.map((p) => `<tr>
          <td>${escapeHtml(nombreMes(p.mes))}</td>
          <td><a href="https://docs.google.com/spreadsheets/d/${encodeURIComponent(p.balance_id)}" target="_blank" rel="noopener noreferrer">${escapeHtml(p.titulo || p.balance_id)}</a>${
            p.distinta_del_entorno ? `<span class="socios-aviso">BALANCE_DEF_SHEETS del servidor nombra otra planilla para este mes; se usa esta.</span>` : ""}</td>
          <td class="note">${p.actualizado_por ? `${escapeHtml(p.actualizado_por)} · ${fechaHora(p.updated_at)}` : "del historial del scraper"}</td>
          <td><button class="btn btn-ghost btn-small" type="button" data-mes="${escapeHtml(p.mes.slice(0, 7))}" data-id="${escapeHtml(p.balance_id)}">Cambiar</button></td>
        </tr>`).join("")}</tbody>`
    : `<tbody><tr><td class="note">Todavía no hay planillas cargadas.</td></tr></tbody>`;
}

async function guardarPlanilla(ev) {
  ev.preventDefault();
  const btn = document.getElementById("btnGuardarPlanilla");
  btn.disabled = true;
  try {
    const r = await api("/api/socios/planillas", {
      method: "PUT",
      body: { mes: document.getElementById("planillaMes").value, balance_id: document.getElementById("planillaId").value },
      timeout: 30000
    });
    toast("Planilla guardada", `${nombreMes(r.mes)}: ${r.titulo}`, "success");
    document.getElementById("planillaId").value = "";
    cargarPlanillas();
  } catch (e) {
    toast("Error", e.message || "No se pudo guardar la planilla", "error");
  } finally {
    btn.disabled = false;
  }
}

// --- Pedidos al scraper (traer un rango de fechas) ---

const QUE_PEDIDO = { todo: "Netwin y pagos", netwin: "Solo netwin", pagos: "Solo pagos" };
const ESTADO_PEDIDO = { pendiente: "Esperando a la PC", corriendo: "Trayendo datos…", listo: "Listo", error: "Con errores", cancelado: "Cancelado" };
let timerPedidos = null;

function fechaHora(iso) {
  return iso ? new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" }) : "";
}

function detallePedido(p) {
  const r = p.resultado || {};
  const partes = [];
  if (r.dias_ok?.length) partes.push(`${r.dias_ok.length} día(s) traídos`);
  if (r.dias_error?.length) partes.push(`con error: ${r.dias_error.join(", ")}`);
  if (r.mensaje) partes.push(r.mensaje);
  if (r.errores?.length && !r.dias_error?.length) partes.push(r.errores.slice(0, 3).join(" · "));
  return partes.join(" · ");
}

async function cargarPedidos({ recargarReparto = false } = {}) {
  let pedidos;
  try {
    ({ pedidos } = await api("/api/socios/pedidos"));
  } catch {
    return;
  }
  pedidos = pedidos || [];
  const abiertos = pedidos.filter((p) => p.estado === "pendiente" || p.estado === "corriendo");
  const recientes = pedidos.filter((p) => abiertos.includes(p) || (p.terminado_at && Date.now() - new Date(p.terminado_at) < 24 * 3600 * 1000));
  const cont = document.getElementById("listaPedidos");
  cont.innerHTML = recientes.length
    ? `<table class="socios-pedidos"><thead><tr><th>Rango</th><th>Qué</th><th>Estado</th><th>Detalle</th><th></th></tr></thead><tbody>${
        recientes.map((p) => `<tr>
          <td>${fechaCorta(p.desde)} → ${fechaCorta(p.hasta)}</td>
          <td>${QUE_PEDIDO[p.que] || escapeHtml(p.que)}</td>
          <td class="estado-${escapeHtml(p.estado)}">${ESTADO_PEDIDO[p.estado] || escapeHtml(p.estado)}</td>
          <td class="note">${escapeHtml(detallePedido(p) || `pedido por ${p.creado_por || "—"} el ${fechaHora(p.created_at)}`)}</td>
          <td>${p.estado === "pendiente" ? `<button class="btn btn-ghost btn-small" type="button" data-cancelar="${Number(p.id)}">Cancelar</button>` : ""}</td>
        </tr>`).join("")}</tbody></table>`
    : "";
  // Mientras haya pedidos abiertos se refresca solo; al terminar se recarga el reparto.
  clearTimeout(timerPedidos);
  if (abiertos.length) timerPedidos = setTimeout(() => cargarPedidos({ recargarReparto: true }), 20000);
  else if (recargarReparto) cargar(null, { mantenerConfigAbierta: true });
}

function abrirPedido() {
  const hoy = new Date().toLocaleDateString("en-CA");
  const mes = document.getElementById("mes").value;
  const base = /^\d{4}-\d{2}$/.test(mes) ? mes : hoy.slice(0, 7);
  const [y, m] = base.split("-").map(Number);
  const finMes = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  document.getElementById("pedidoDesde").value = `${base}-01`;
  // Por defecto hasta ayer: el día de hoy todavía no está completo.
  const ayer = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
  document.getElementById("pedidoHasta").value = finMes < ayer ? finMes : ayer;
  document.getElementById("pedidoDesde").max = hoy;
  document.getElementById("pedidoHasta").max = hoy;
  document.getElementById("pedidoModal").style.display = "flex";
}

function cerrarPedido() {
  document.getElementById("pedidoModal").style.display = "none";
}

async function enviarPedido(ev) {
  ev.preventDefault();
  const btn = document.getElementById("pedidoEnviar");
  btn.disabled = true;
  try {
    await api("/api/socios/pedidos", {
      method: "POST",
      body: {
        desde: document.getElementById("pedidoDesde").value,
        hasta: document.getElementById("pedidoHasta").value,
        que: document.getElementById("pedidoQue").value
      }
    });
    toast("Pedido enviado", "El scraper lo va a tomar en unos minutos", "success");
    cerrarPedido();
    cargarPedidos();
  } catch (e) {
    toast("Error", e.message || "No se pudo crear el pedido", "error");
  } finally {
    btn.disabled = false;
  }
}

async function cancelarPedido(id) {
  try {
    await api(`/api/socios/pedidos/${id}/cancelar`, { method: "POST" });
    cargarPedidos();
  } catch (e) {
    toast("Error", e.message || "No se pudo cancelar", "error");
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
  document.getElementById("btnGuardarFijos").addEventListener("click", guardarFijos);
  document.getElementById("btnSincronizarBanco").addEventListener("click", sincronizarBanco);
  document.getElementById("btnPedido").addEventListener("click", abrirPedido);
  document.getElementById("pedidoModalClose").addEventListener("click", cerrarPedido);
  document.getElementById("pedidoCancelar").addEventListener("click", cerrarPedido);
  document.getElementById("pedidoForm").addEventListener("submit", enviarPedido);
  document.getElementById("listaPedidos").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-cancelar]");
    if (b) cancelarPedido(b.dataset.cancelar);
  });
  cargarPedidos();
  document.getElementById("planillaMes").value = document.getElementById("mes").value;
  document.getElementById("formPlanilla").addEventListener("submit", guardarPlanilla);
  document.getElementById("tablaPlanillas").addEventListener("click", (ev) => {
    const b = ev.target.closest("[data-mes]");
    if (!b) return;
    document.getElementById("planillaMes").value = b.dataset.mes;
    document.getElementById("planillaId").value = b.dataset.id;
    document.getElementById("planillaId").focus();
  });
  cargarPlanillas();
  document.getElementById("tablaConfig").addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-guardar]");
    if (btn) guardarSocio(btn);
  });
  cargar(null);
});
