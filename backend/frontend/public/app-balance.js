let balanceActual = null;

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
  const body = tope.map((f) => `<tr>${columnas.map((c) => `<td>${escapeHtml(f[c] ?? "")}</td>`).join("")}</tr>`).join("");
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
}

function pintarUsdt(data) {
  const box = document.getElementById("usdtCuadre");
  const tabla = document.getElementById("tablaUsdt");
  const usdt = data.usdt || { cuentas: [] };
  if (!usdt.cuentas.length) {
    box.textContent = "No hay movimientos ni cierres USDT en el formulario para este día ni para el día anterior.";
    tabla.innerHTML = "";
    return;
  }
  const lineas = usdt.cuentas.map((c) => {
    const ant = c.cierre_anterior == null ? "sin cierre del día anterior" : peso(c.cierre_anterior);
    const hoy = c.cierre_dia == null ? "sin cierre de hoy" : peso(c.cierre_dia);
    const dif = c.diferencia == null ? "no se puede cerrar" : peso(c.diferencia);
    const estado = c.cuadra ? "cuadra" : "discrepancia";
    return `${c.empresa} / ${c.cuenta}: cierre anterior ${ant}, entradas ${peso(c.entradas)}, salidas ${peso(c.salidas)}, saldo ${c.saldo_calculado == null ? "—" : peso(c.saldo_calculado)}, cierre de hoy ${hoy}, diferencia ${dif} (${estado}).`;
  });
  box.textContent = lineas.join(" ");
  const movs = usdt.cuentas.flatMap((c) => c.movimientos.map((m) => ({
    Empresa: c.empresa,
    Cuenta: c.cuenta,
    Hora: m.hora,
    Tipo: m.tipo,
    Etiqueta: m.etiqueta,
    Monto: peso(m.monto),
    Contraparte: m.cuenta_receptora,
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
  document.getElementById("cuadre").textContent =
    `Cuadre planilla (pestaña ${data.planilla?.tab || "?"}): ${c.planilla_filas ?? 0} filas, ` +
    `$${peso(c.planilla_sin_marcadores_pesos)} sin marcadores. ` +
    `Depósitos etiquetados: ${c.banco_deposito_filas ?? 0} ($${peso(c.banco_deposito_pesos)}). ` +
    `Diferencia: $${peso(c.diferencia_pesos)}. ` +
    `A revisar: ${(data.revisar || []).length}. ` +
    `Egresos del formulario ese día (sin cierre de caja): ${eg.total}. HG.Cash: ${eg.hg}. ${empresas}.`;

  const resumen = document.getElementById("resumen");
  const chips = data.resumen || [];
  resumen.innerHTML = chips.map((r) =>
    `<button type="button" class="btn chip" data-etiqueta="${escapeHtml(r.etiqueta)}">${escapeHtml(r.etiqueta)}: ${r.cantidad}</button>`
  ).join("") + `<span class="note" style="align-self:center">Pestaña destino: ${escapeHtml(data.tab || "—")}. Tocá una etiqueta para filtrar el balance.</span>`;
  resumen.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const et = btn.getAttribute("data-etiqueta");
      etiquetaActiva = etiquetaActiva === et ? "" : et;
      resumen.querySelectorAll(".chip").forEach((b) => b.classList.toggle("activo", b.getAttribute("data-etiqueta") === etiquetaActiva));
      pintarTablas();
    });
  });

  pintarUsdt(data);
  pintarTablas();

  const fecha = data.fechaDD || data.fecha;
  const cols = data.columnas || [];
  document.getElementById("btnDescBalance").onclick = () =>
    descargarCsv(`balance_${fecha}.csv`, cols, data.filas || []);
  document.getElementById("btnDescRevisar").onclick = () =>
    descargarCsv(`revisar_${fecha}.csv`, cols.concat(["Motivo"]), data.revisar || []);
  document.getElementById("btnDescUsdt").onclick = () =>
    descargarCsv(`balance_usdt_${fecha}.csv`, cols, data.filasUsdt || []);
}

async function generar(e) {
  e.preventDefault();
  const fecha = document.getElementById("fecha").value;
  const input = document.getElementById("bancos");
  const estado = document.getElementById("balanceEstado");
  if (!fecha || !input.files?.length) {
    toast("Falta algo", "Elegí el día y al menos un CSV.", "error");
    return;
  }
  const fd = new FormData();
  fd.append("fecha", fecha);
  for (const file of input.files) fd.append("bancos", file);

  const btn = document.getElementById("btnGenerar");
  btn.disabled = true;
  estado.textContent = "Leyendo planilla de cargas y cruzando egresos…";
  try {
    const data = await api("/api/balance/generar", { method: "POST", body: fd, timeout: 120000 });
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
  if (u && !["admin", "direccion", "encargado"].includes(u.role)) {
    toast("Sin acceso", "Esta pantalla es para admin, dirección o encargado.", "error");
    setTimeout(() => { window.location.href = "egreso.html"; }, 1200);
    return;
  }
  document.getElementById("fecha").value = hoyISO();
  document.getElementById("balanceForm").addEventListener("submit", generar);
  document.getElementById("btnCargar").addEventListener("click", cargar);
  document.addEventListener("click", (ev) => {
    const pop = document.getElementById("filtroPopover");
    if (!pop || pop.style.display === "none") return;
    if (pop.contains(ev.target) || ev.target.classList?.contains("th-filtro")) return;
    cerrarFiltro();
  });
});
