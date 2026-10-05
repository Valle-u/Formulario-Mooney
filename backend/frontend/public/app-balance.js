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

function renderTabla(el, filas, columnas) {
  if (!filas.length) {
    el.innerHTML = "<tbody><tr><td class='muted'>Sin filas</td></tr></tbody>";
    return;
  }
  const tope = filas.slice(0, 400);
  const head = `<thead><tr>${columnas.map((c) => `<th>${c.trim()}</th>`).join("")}</tr></thead>`;
  const body = tope.map((f) => `<tr>${columnas.map((c) => `<td>${escapeHtml(f[c] ?? "")}</td>`).join("")}</tr>`).join("");
  const extra = filas.length > tope.length
    ? `<tr><td colspan="${columnas.length}" class="muted">Mostrando ${tope.length} de ${filas.length}. El CSV descargado trae todas.</td></tr>`
    : "";
  el.innerHTML = head + `<tbody>${body}${extra}</tbody>`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function pintarResultado(data) {
  balanceActual = data;
  document.getElementById("resultadoCard").style.display = "";
  const avisos = document.getElementById("avisos");
  avisos.innerHTML = (data.avisos || []).map((a) =>
    `<div class="note" style="margin-bottom:8px"><strong>Aviso.</strong> ${escapeHtml(a.mensaje)}</div>`
  ).join("");

  const c = data.cuadre || {};
  document.getElementById("cuadre").textContent =
    `Cuadre planilla (pestaña ${data.planilla?.tab || "?"}): ${c.planilla_filas ?? 0} filas, ` +
    `$${peso(c.planilla_sin_marcadores_pesos)} sin marcadores. ` +
    `Depósitos etiquetados: ${c.banco_deposito_filas ?? 0} ($${peso(c.banco_deposito_pesos)}). ` +
    `Diferencia: $${peso(c.diferencia_pesos)}. ` +
    `Marcadores $20.000 pendientes: ${c.marcadores_pendientes ?? 0}. ` +
    `A revisar: ${(data.revisar || []).length}. USDT: ${(data.filasUsdt || []).length}.`;

  const resumen = (data.resumen || []).map((r) => `${r.etiqueta}: ${r.cantidad}`).join(" · ");
  document.getElementById("resumen").textContent = resumen
    ? `Etiquetas — ${resumen}. Pestaña destino: ${data.tab || "—"}.`
    : "";

  const cols = data.columnas || [];
  renderTabla(document.getElementById("tablaBalance"), data.filas || [], cols);
  renderTabla(
    document.getElementById("tablaRevisar"),
    data.revisar || [],
    cols.concat(["Motivo"])
  );

  const fecha = data.fechaDD || data.fecha;
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
});
