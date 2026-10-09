let balanceActual = null;
let usdtActual = null;

function hoyISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function descargarCsv(nombre, columnas, filas) {
  const lineas = [columnas.map(csvEscape).join(",")];
  for (const f of filas) {
    lineas.push(columnas.map((c) => csvEscape(f[c] ?? "")).join(","));
  }
  const blob = new Blob(["\uFEFF" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

function peso(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const filtrosTabla = { balance: {}, revisar: {} };
let etiquetaActiva = "";
let popoverCtx = null;

function valorCelda(row, col) {
  return String(row[col] ?? "");
}

function filasVisibles(filas, tablaId) {
  const filtros = filtrosTabla[tablaId] || {};
  return filas.filter((row) => {
    if (tablaId === "balance" && etiquetaActiva) {
      const et = row.Etiqueta || "(sin etiqueta)";
      if (et !== etiquetaActiva) return false;
    }
    for (const [col, permitidos] of Object.entries(filtros)) {
      if (!(permitidos instanceof Set)) continue;
      if (!permitidos.has(valorCelda(row, col))) return false;
    }
    return true;
  });
}

function cerrarFiltro() {
  const pop = document.getElementById("filtroPopover");
  if (pop) pop.style.display = "none";
  popoverCtx = null;
}

function abrirFiltro(btn, tablaId, col, filasBase) {
  const pop = document.getElementById("filtroPopover");
  const otros = { ...(filtrosTabla[tablaId] || {}) };
  delete otros[col];
  const guardado = filtrosTabla[tablaId];
  filtrosTabla[tablaId] = otros;
  const universo = filasVisibles(filasBase, tablaId);
  filtrosTabla[tablaId] = guardado;
  const valores = [...new Set(universo.map((r) => valorCelda(r, col)))].sort((a, b) => a.localeCompare(b, "es"));
  const actual = filtrosTabla[tablaId][col];
  const rect = btn.getBoundingClientRect();
  popoverCtx = { tablaId, col, valores };
  pop.style.display = "block";
  pop.style.left = `${Math.min(rect.left, window.innerWidth - 340)}px`;
  pop.style.top = `${rect.bottom + 4}px`;
  pop.innerHTML = `
    <input id="filtroBuscar" placeholder="Buscar" style="width:100%; margin-bottom:6px">
    <div style="display:flex; gap:8px; margin-bottom:6px">
      <button type="button" class="btn" id="filtroTodos">Todos</button>
      <button type="button" class="btn" id="filtroNinguno">Ninguno</button>
      <button type="button" class="btn" id="filtroCerrar">Listo</button>
    </div>
    <div id="filtroLista"></div>
  `;
  const pintarLista = () => {
    const q = (document.getElementById("filtroBuscar").value || "").toLowerCase();
    const lista = document.getElementById("filtroLista");
    const set = filtrosTabla[tablaId][col];
    lista.innerHTML = valores.filter((v) => v.toLowerCase().includes(q)).map((v) => {
      const on = !set || set.has(v);
      return `<label><input type="checkbox" data-valor="${escapeHtml(v)}" ${on ? "checked" : ""}><span>${escapeHtml(v || "(vacío)")}</span></label>`;
    }).join("") || "<div>Sin valores</div>";
    lista.querySelectorAll("input").forEach((input) => {
      input.addEventListener("change", () => {
        let setNow = filtrosTabla[tablaId][col];
        if (!setNow) setNow = new Set(valores);
        const valor = input.getAttribute("data-valor");
        if (input.checked) setNow.add(valor);
        else setNow.delete(valor);
        if (setNow.size === valores.length) delete filtrosTabla[tablaId][col];
        else filtrosTabla[tablaId][col] = setNow;
        pintarTablas();
      });
    });
  };
  document.getElementById("filtroBuscar").addEventListener("input", pintarLista);
  document.getElementById("filtroTodos").addEventListener("click", () => {
    delete filtrosTabla[tablaId][col];
    pintarTablas();
    pintarLista();
  });
  document.getElementById("filtroNinguno").addEventListener("click", () => {
    filtrosTabla[tablaId][col] = new Set();
    pintarTablas();
    pintarLista();
  });
  document.getElementById("filtroCerrar").addEventListener("click", cerrarFiltro);
  pintarLista();
}

function opcionesEtiqueta() {
  const set = new Set(typeof getEtiquetas_dynamic === "function" ? getEtiquetas_dynamic() : []);
  for (const f of balanceActual?.filas || []) {
    const e = String(f.Etiqueta || "").trim();
    if (e) set.add(e);
  }
  return [...set].sort((a, b) => a.localeCompare(b, "es"));
}

function htmlSelectEtiqueta(fila) {
  const actual = String(fila.Etiqueta || "").trim();
  const opts = opcionesEtiqueta().map((e) =>
    `<option value="${escapeHtml(e)}"${e === actual ? " selected" : ""}>${escapeHtml(e)}</option>`
  ).join("");
  return `<select class="sel-etiqueta" data-etiqueta-fila="1"><option value="">Elegir etiqueta</option>${opts}</select>`;
}

function renderTabla(el, filas, columnas, tablaId, filasBase) {
  if (!filasBase.length) {
    el.innerHTML = "<tbody><tr><td class='muted'>Sin filas</td></tr></tbody>";
    return;
  }
  const tope = filas.slice(0, 400);
  const head = `<thead><tr>${columnas.map((c) => {
    const activo = filtrosTabla[tablaId] && filtrosTabla[tablaId][c] instanceof Set;
    return `<th>${escapeHtml(c.trim())}<button type="button" class="th-filtro${activo ? " activo" : ""}" data-tabla="${tablaId}" data-col="${escapeHtml(c)}">▾</button></th>`;
  }).join("")}</tr></thead>`;
  const body = tope.map((f, i) => `<tr data-fila-idx="${i}">${columnas.map((c) => {
    if (tablaId === "revisar" && c === "Etiqueta") return `<td>${htmlSelectEtiqueta(f)}</td>`;
    return `<td>${escapeHtml(f[c] ?? "")}</td>`;
  }).join("")}</tr>`).join("");
  const extra = filas.length > tope.length
    ? `<tr><td colspan="${columnas.length}" class="muted">Mostrando ${tope.length} de ${filas.length}. El CSV descargado trae todas.</td></tr>`
    : (filas.length !== filasBase.length
      ? `<tr><td colspan="${columnas.length}" class="muted">${filas.length} de ${filasBase.length} filas con el filtro actual.</td></tr>`
      : "");
  el.innerHTML = head + `<tbody>${body}${extra}</tbody>`;
  el.querySelectorAll(".th-filtro").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      abrirFiltro(btn, tablaId, btn.getAttribute("data-col"), filasBase);
    });
  });
  if (tablaId === "revisar") {
    el.querySelectorAll("select.sel-etiqueta").forEach((sel) => {
      sel.addEventListener("click", (ev) => ev.stopPropagation());
      sel.addEventListener("change", () => {
        const idx = Number(sel.closest("tr")?.dataset.filaIdx);
        const fila = tope[idx];
        if (fila && sel.value) aplicarEtiquetaManual(fila, sel.value);
      });
    });
  }
}

function mismaOperacion(a, b) {
  return ["FechaHora", "ID", "Empresa", "Tipo de transferencia", "Titular", "Importe"].every(
    (k) => String(a[k] ?? "") === String(b[k] ?? "")
  );
}

function etiquetaRedireccion(etiqueta) {
  return String(etiqueta || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("redireccion de capital");
}

function resumenDesdeFilas(filas) {
  const map = new Map();
  for (const f of filas) {
    const et = String(f.Etiqueta || "").trim() || "(sin etiqueta)";
    if (!map.has(et)) map.set(et, { etiqueta: et, cantidad: 0 });
    map.get(et).cantidad += 1;
  }
  return [...map.values()].sort((a, b) => b.cantidad - a.cantidad);
}

function pintarChips() {
  const resumen = document.getElementById("resumen");
  if (!resumen || !balanceActual) return;
  const chips = balanceActual.resumen || [];
  resumen.innerHTML = chips.map((r) =>
    `<button type="button" class="btn chip${r.etiqueta === etiquetaActiva ? " activo" : ""}" data-etiqueta="${escapeHtml(r.etiqueta)}">${escapeHtml(r.etiqueta)}: ${r.cantidad}</button>`
  ).join("") + `<span class="note" style="align-self:center">Pestaña destino: ${escapeHtml(balanceActual.tab || "—")}. Tocá una etiqueta para filtrar el balance.</span>`;
  resumen.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const et = btn.getAttribute("data-etiqueta");
      etiquetaActiva = etiquetaActiva === et ? "" : et;
      resumen.querySelectorAll(".chip").forEach((b) => b.classList.toggle("activo", b.getAttribute("data-etiqueta") === etiquetaActiva));
      pintarTablas();
    });
  });
}

function aplicarEtiquetaManual(filaRevisar, etiqueta) {
  const origen = (balanceActual.filas || []).find((f) => !String(f.Etiqueta || "").trim() && mismaOperacion(f, filaRevisar));
  if (origen) {
    origen.Etiqueta = etiqueta;
    if (etiquetaRedireccion(etiqueta)) {
      const invertido = origen["Tipo de transferencia"] === "Transferencia Saliente"
        ? "Transferencia Entrante"
        : "Transferencia Saliente";
      const ya = balanceActual.filas.some((f) => f !== origen && mismaOperacion(
        { ...origen, "Tipo de transferencia": invertido },
        f
      ) && f.Etiqueta === etiqueta);
      if (!ya) balanceActual.filas.push({ ...origen, "Tipo de transferencia": invertido });
    }
  }
  balanceActual.revisar = (balanceActual.revisar || []).filter((r) => r !== filaRevisar);
  balanceActual.resumen = resumenDesdeFilas(balanceActual.filas || []);
  const cuadre = document.getElementById("cuadre");
  if (cuadre) {
    cuadre.textContent = cuadre.textContent.replace(/A revisar: \d+/, `A revisar: ${balanceActual.revisar.length}`);
  }
  pintarChips();
  pintarTablas();
}

const COLUMNAS_USDT = [
  "Empresa", "Cuenta", "Cierre anterior", "Entradas", "Salidas",
  "Saldo calculado", "Cierre de hoy", "Diferencia", "Estado",
];

function estadoUsdt(c) {
  if (c.diferencia == null) return "incompleto";
  return c.cuadra ? "cuadra" : "discrepancia";
}

function filasResumenUsdt(usdt) {
  return (usdt?.cuentas || []).map((c) => ({
    Empresa: c.empresa || "",
    Cuenta: c.cuenta || "",
    "Cierre anterior": c.cierre_anterior == null ? "" : peso(c.cierre_anterior),
    Entradas: peso(c.entradas),
    Salidas: peso(c.salidas),
    "Saldo calculado": c.saldo_calculado == null ? "" : peso(c.saldo_calculado),
    "Cierre de hoy": c.cierre_dia == null ? "" : peso(c.cierre_dia),
    Diferencia: c.diferencia == null ? "" : peso(c.diferencia),
    Estado: estadoUsdt(c),
    _dif: c.diferencia != null && !c.cuadra,
  }));
}

function pintarUsdt(data) {
  const card = document.getElementById("resultadoUsdtCard");
  const box = document.getElementById("usdtCuadre");
  const tabla = document.getElementById("tablaUsdt");
  const resumen = document.getElementById("tablaUsdtResumen");
  card.style.display = "";
  const usdt = data.usdt || { cuentas: [] };
  usdtActual = {
    fecha: data.fecha,
    fechaDD: data.fechaDD || data.fecha,
    filas: filasResumenUsdt(usdt),
  };
  if (!usdt.cuentas.length) {
    box.textContent = "No hay movimientos ni cierres USDT en el formulario para este día ni para el día anterior.";
    resumen.innerHTML = "";
    tabla.innerHTML = "";
    return;
  }
  const mal = usdt.cuentas.filter((c) => c.diferencia != null && !c.cuadra).length;
  const incompletas = usdt.cuentas.filter((c) => c.diferencia == null).length;
  const partes = [`${usdt.cuentas.length} cuenta(s) USDT.`];
  if (mal) partes.push(`${mal} con diferencia entre el saldo calculado y el cierre de hoy.`);
  if (incompletas) partes.push(`${incompletas} sin cierre del día anterior o de hoy, así que no se puede cerrar.`);
  if (!mal && !incompletas) partes.push("Todas cuadran con el cierre de hoy.");
  box.textContent = partes.join(" ");
  const filas = usdtActual.filas;
  resumen.innerHTML = `<thead><tr>${COLUMNAS_USDT.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
    filas.map((f) => `<tr class="${f._dif ? "usdt-dif" : ""}">${COLUMNAS_USDT.map((c) => `<td>${escapeHtml(f[c] ?? "")}</td>`).join("")}</tr>`).join("") +
    "</tbody>";
  const movs = usdt.cuentas.flatMap((c) => c.movimientos.map((m) => ({
    Empresa: c.empresa,
    Cuenta: c.cuenta,
    Hora: m.hora,
    Tipo: m.tipo,
    Etiqueta: m.etiqueta,
    Monto: peso(m.monto),
    Contraparte: m.contraparte,
    ID: m.id_transferencia,
  })));
  const cols = ["Empresa", "Cuenta", "Hora", "Tipo", "Etiqueta", "Monto", "Contraparte", "ID"];
  if (!movs.length) {
    tabla.innerHTML = "<tbody><tr><td class='muted'>Sin movimientos USDT en el día. Solo está el cierre.</td></tr></tbody>";
    return;
  }
  tabla.innerHTML = `<thead><tr>${cols.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
    movs.map((m) => `<tr>${cols.map((c) => `<td>${escapeHtml(m[c] ?? "")}</td>`).join("")}</tr>`).join("") +
    "</tbody>";
}

function pintarTablas() {
  if (!balanceActual) return;
  const cols = balanceActual.columnas || [];
  const balance = balanceActual.filas || [];
  const revisar = balanceActual.revisar || [];
  renderTabla(
    document.getElementById("tablaBalance"),
    filasVisibles(balance, "balance"),
    cols,
    "balance",
    balance
  );
  renderTabla(
    document.getElementById("tablaRevisar"),
    filasVisibles(revisar, "revisar"),
    cols.concat(["Motivo"]),
    "revisar",
    revisar
  );
}

function pintarResultado(data) {
  balanceActual = data;
  etiquetaActiva = "";
  filtrosTabla.balance = {};
  filtrosTabla.revisar = {};
  cerrarFiltro();
  document.getElementById("resultadoCard").style.display = "";
  const avisos = document.getElementById("avisos");
  avisos.innerHTML = (data.avisos || []).map((a) =>
    `<div class="note" style="margin-bottom:8px"><strong>Aviso.</strong> ${escapeHtml(a.mensaje)}</div>`
  ).join("");

  const c = data.cuadre || {};
  const eg = data.egresosFormulario || { total: 0, hg: 0, porEmpresa: [] };
  const empresas = (eg.porEmpresa || []).map((x) => `${x.empresa}: ${x.cantidad}`).join(", ") || "ninguno";
  const rango = data.desde && data.hasta && data.desde !== data.hasta;
  const diasTxt = (data.porDia || []).map((d) =>
    `${d.fechaDD} (pestaña ${d.tab || "?"}): planilla ${d.cuadre?.planilla_filas ?? 0}, ` +
    `depósitos ${d.cuadre?.banco_deposito_filas ?? 0} ($${peso(d.cuadre?.banco_deposito_pesos)}), ` +
    `diferencia $${peso(d.cuadre?.diferencia_pesos)}, a revisar ${d.revisar ?? 0}`
  );
  const totalTxt =
    `${rango ? "Total del rango" : `Cuadre planilla (pestaña ${data.planilla?.tab || "?"})`}: ` +
    `${c.planilla_filas ?? 0} filas, $${peso(c.planilla_sin_marcadores_pesos)} sin marcadores. ` +
    `Depósitos etiquetados: ${c.banco_deposito_filas ?? 0} ($${peso(c.banco_deposito_pesos)}). ` +
    `Diferencia: $${peso(c.diferencia_pesos)}. ` +
    `A revisar: ${(data.revisar || []).length}. ` +
    `Egresos del formulario en el rango (sin cierre de caja): ${eg.total}. HG.Cash: ${eg.hg}. ${empresas}.`;
  const lineas = rango ? [...diasTxt, totalTxt] : [totalTxt];
  document.getElementById("cuadre").innerHTML = lineas.map((t) => `<div>${escapeHtml(t)}</div>`).join("");

  pintarChips();
  pintarTablas();

  const fecha = data.desde && data.hasta ? `${data.desde}_${data.hasta}` : (data.fechaDD || data.fecha);
  const cols = data.columnas || [];
  document.getElementById("btnDescBalance").onclick = () =>
    descargarCsv(`balance_${fecha}.csv`, cols, data.filas || []);
  document.getElementById("btnDescRevisar").onclick = () =>
    descargarCsv(`revisar_${fecha}.csv`, cols.concat(["Motivo"]), data.revisar || []);
}

function rangoElegido() {
  const desde = document.getElementById("desde").value;
  const hasta = document.getElementById("hasta").value;
  if (!desde || !hasta) return { error: "Elegí desde y hasta." };
  if (desde > hasta) return { error: "Desde no puede ser posterior a hasta." };
  return { desde, hasta };
}

async function generar(e) {
  e.preventDefault();
  const rango = rangoElegido();
  const input = document.getElementById("bancos");
  const estado = document.getElementById("balanceEstado");
  if (rango.error || !input.files?.length) {
    toast("Falta algo", rango.error || "Elegí al menos un CSV.", "error");
    return;
  }
  const fd = new FormData();
  fd.append("desde", rango.desde);
  fd.append("hasta", rango.hasta);
  for (const file of input.files) fd.append("bancos", file);

  const btn = document.getElementById("btnGenerar");
  btn.disabled = true;
  estado.textContent = "Leyendo planilla de cargas y cruzando egresos…";
  try {
    const data = await api("/api/balance/generar", { method: "POST", body: fd, timeout: 180000 });
    pintarResultado(data);
    estado.textContent = `${(data.filas || []).length} filas de balance.`;
    toast("Listo", `${(data.filas || []).length} filas. Revisá los avisos antes de cargar.`, "success");
  } catch (err) {
    estado.textContent = "";
    toast("No se pudo generar", err.message || "Error", "error");
  } finally {
    btn.disabled = false;
  }
}

async function generarUsdt() {
  const rango = rangoElegido();
  const fecha = rango.hasta;
  const estado = document.getElementById("balanceEstado");
  if (rango.error) {
    toast("Falta el día", "Elegí hasta qué día querés el balance USDT.", "error");
    return;
  }
  const btn = document.getElementById("btnGenerarUsdt");
  btn.disabled = true;
  estado.textContent = "Cruzando movimientos USDT con el cierre del día anterior…";
  try {
    const data = await api("/api/balance/generar-usdt", {
      method: "POST",
      body: { fecha },
      timeout: 60000,
    });
    pintarUsdt(data);
    const n = data.usdt?.cuentas?.length || 0;
    estado.textContent = n ? `${n} cuenta(s) USDT.` : "Sin datos USDT para ese día.";
    toast("Balance USDT", n ? `${n} cuenta(s).` : "No hay movimientos ni cierres USDT.", n ? "success" : "error");
  } catch (err) {
    estado.textContent = "";
    toast("No se pudo generar el USDT", err.message || "Error", "error");
  } finally {
    btn.disabled = false;
  }
}

function descargarUsdt() {
  if (!usdtActual?.filas?.length) {
    toast("Nada para descargar", "Generá el balance USDT primero.", "error");
    return;
  }
  const fecha = usdtActual.fechaDD || usdtActual.fecha || "usdt";
  descargarCsv(`balance_usdt_${fecha}.csv`, COLUMNAS_USDT, usdtActual.filas);
}

async function cargar() {
  if (!balanceActual?.filas?.length) {
    toast("Nada para cargar", "Generá el balance primero.", "error");
    return;
  }
  const n = balanceActual.filas.length;
  const tab = balanceActual.tab || "el mes";
  const ok = window.confirm(
    `¿Cargar ${n} fila(s) en la pestaña "${tab}" del balance mensual?\n\n` +
    `Las que ya estén no se duplican. El CSV de USDT no se carga (queda solo para descarga).`
  );
  if (!ok) return;
  const btn = document.getElementById("btnCargar");
  btn.disabled = true;
  try {
    const data = await api("/api/balance/cargar", {
      method: "POST",
      body: { fecha: balanceActual.fecha, filas: balanceActual.filas },
      timeout: 120000,
    });
    toast("Balance mensual", data.message || "Cargado", "success");
  } catch (err) {
    toast("No se pudo cargar", err.message || "Error", "error");
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!location.pathname.includes("balance.html")) return;
  if (!requireAuth()) return;
  await initCommonUI();
  const u = getUser?.();
  if (u && !["admin", "direccion"].includes(u.role)) {
    toast("Sin acceso", "Esta pantalla es para admin o dirección.", "error");
    setTimeout(() => { window.location.href = "egreso.html"; }, 1200);
    return;
  }
  document.getElementById("desde").value = hoyISO();
  document.getElementById("hasta").value = hoyISO();
  document.getElementById("balanceForm").addEventListener("submit", generar);
  document.getElementById("btnGenerarUsdt").addEventListener("click", generarUsdt);
  document.getElementById("btnDescUsdt").addEventListener("click", descargarUsdt);
  document.getElementById("btnCargar").addEventListener("click", cargar);
  document.addEventListener("click", (ev) => {
    const pop = document.getElementById("filtroPopover");
    if (!pop || pop.style.display === "none") return;
    if (pop.contains(ev.target) || ev.target.classList?.contains("th-filtro")) return;
    cerrarFiltro();
  });
});
