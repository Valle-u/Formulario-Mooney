/* =========================
   CIERRES DE CAJA - MODULO GUIADO
   ========================= */

const CIERRE_TURNOS = ["Turno mañana", "Turno tarde", "Turno noche"];
let cierreKpiRowsCache = [];

function toISODateLocal(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function getHoraSistemaNow() {
  const now = new Date();
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function formatISODate(isoDate) {
  if (!isoDate) return "-";
  const [y, m, d] = String(isoDate).split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}/${m}/${y}`;
}

function formatCreatedAt(ts) {
  if (!ts) return "-";
  try {
    return new Date(ts).toLocaleString("es-AR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  } catch {
    return String(ts);
  }
}

function formatMoney(n, moneda) {
  const value = Number(n || 0);
  const symbol = moneda === "USD" ? "US$" : (moneda === "USDT" ? "USDT" : "$ ");
  return `${symbol}${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function setHoraSistemaPreview() {
  const input = document.getElementById("cierre_hora_detectada");
  if (!input) return;
  input.value = `${getHoraSistemaNow()} (automatico)`;
}

function populateEmpresas() {
  const empresaForm = document.getElementById("cierre_empresa_salida");
  const empresaKpi = document.getElementById("kpi_empresa_salida");

  if (empresaForm) {
    empresaForm.innerHTML =
      `<option value="">Seleccionar...</option>` +
      getEmpresas().map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
  }

  if (empresaKpi) {
    empresaKpi.innerHTML =
      `<option value="">Todas</option>` +
      getEmpresas().map((e) => `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`).join("");
  }
}

function recomendarFechaSegunTurno(turno) {
  const now = new Date();
  const suggested = new Date(now.getTime());
  const h = now.getHours();
  let detail = "Fecha sugerida por horario actual.";

  // Turnos: mañana 06-14, tarde 14-22, noche 22-06 (cruza medianoche)
  if (turno === "Turno tarde" && h < 6) {
    // Cerrando turno tarde pasada la medianoche → fue ayer
    suggested.setDate(suggested.getDate() - 1);
    detail = "Turno tarde cerrado pasada la medianoche: se sugiere AYER.";
  } else if (turno === "Turno noche" && h >= 6 && h < 22) {
    // Turno noche arranca a las 22:00. Si cierra entre 06:00 y 21:59, el turno empezó ayer.
    suggested.setDate(suggested.getDate() - 1);
    detail = "Turno noche empezo ayer: se sugiere fecha de AYER.";
  }

  return {
    isoDate: toISODateLocal(suggested),
    detail
  };
}

function markTurnoSelected(turno) {
  const hidden = document.getElementById("cierre_turno");
  if (hidden) hidden.value = turno || "";

  document.querySelectorAll("#turnoPicker .turno-btn").forEach((btn) => {
    const isActive = btn.dataset.turno === turno;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  const turnoAyuda = document.getElementById("turnoAyuda");
  if (turnoAyuda) {
    turnoAyuda.textContent = turno ? `Seleccionado: ${turno}.` : "Primero elegi tu turno para que el sistema te sugiera la fecha correcta.";
  }
}

function applyFechaSuggestion(turno, forceWrite = false) {
  if (!turno) return;
  const fechaInput = document.getElementById("cierre_fecha_operativa");
  const fechaAyuda = document.getElementById("fechaAyuda");
  if (!fechaInput) return;

  const suggestion = recomendarFechaSegunTurno(turno);
  const shouldWrite = forceWrite || !fechaInput.value || fechaInput.dataset.autoSuggested === "1";

  if (shouldWrite) {
    fechaInput.value = suggestion.isoDate;
    fechaInput.dataset.autoSuggested = "1";
  }

  if (fechaAyuda) {
    fechaAyuda.textContent = suggestion.detail;
  }
}

async function cargarCuentasSugeridas() {
  const empresa = document.getElementById("cierre_empresa_salida")?.value || "";
  const moneda = document.getElementById("cierre_moneda")?.value || "";
  const datalist = document.getElementById("cierre_cuentas_sugeridas");
  if (!datalist) return;

  datalist.innerHTML = "";
  if (!empresa) return;

  try {
    const qs = new URLSearchParams({ empresa_salida: empresa });
    if (moneda) qs.set("moneda", moneda);
    const data = await api(`/api/egresos/cuentas?${qs.toString()}`);

    if (!data || !Array.isArray(data.cuentas)) return;

    data.cuentas.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      datalist.appendChild(opt);
    });
  } catch (err) {
    console.error("Error cargando cuentas sugeridas:", err);
  }
}

function updateLiveResumen() {
  const target = document.getElementById("cierreResumenLive");
  if (!target) return;

  const turno = document.getElementById("cierre_turno")?.value || "-";
  const fecha = document.getElementById("cierre_fecha_operativa")?.value || "-";
  const empresa = document.getElementById("cierre_empresa_salida")?.value || "-";
  const cuenta = document.getElementById("cierre_cuenta_salida")?.value?.trim() || "-";
  const moneda = document.getElementById("cierre_moneda")?.value || "-";
  const montoRaw = document.getElementById("cierre_monto")?.value || "";
  const montoNum = parseMontoARSStrict(montoRaw);

  target.innerHTML = `
    <div class="resumen-title">Resumen en vivo</div>
    <div class="resumen-line">${escapeHtml(formatISODate(fecha))} | ${escapeHtml(turno)} | ${escapeHtml(empresa)} | ${escapeHtml(cuenta)} | ${escapeHtml(moneda)}</div>
    <div class="resumen-line strong">Monto: ${montoNum && montoNum > 0 ? escapeHtml(formatMoney(montoNum, moneda)) : "(pendiente)"}</div>
  `;
}

function validateCierreForm() {
  const turno = document.getElementById("cierre_turno")?.value || "";
  const fecha = document.getElementById("cierre_fecha_operativa")?.value || "";
  const empresa = document.getElementById("cierre_empresa_salida")?.value || "";
  const cuenta = document.getElementById("cierre_cuenta_salida")?.value?.trim() || "";
  const moneda = document.getElementById("cierre_moneda")?.value || "";
  const montoRaw = document.getElementById("cierre_monto")?.value || "";
  const comprobante = document.getElementById("cierre_comprobante")?.files?.[0];

  if (!turno || !CIERRE_TURNOS.includes(turno)) {
    throw new Error("Selecciona un turno laboral antes de guardar.");
  }
  if (!fecha) {
    throw new Error("Selecciona la fecha operativa del cierre.");
  }
  if (!empresa) {
    throw new Error("Selecciona la empresa.");
  }
  if (!cuenta) {
    throw new Error("Completa el titular de la cuenta.");
  }
  if (!moneda || !["ARS", "USD", "USDT"].includes(moneda)) {
    throw new Error("Selecciona una moneda valida (ARS, USD o USDT).");
  }

  const montoNum = parseMontoARSStrict(montoRaw);
  if (montoNum === null || montoNum <= 0) {
    throw new Error("Monto invalido. Ingresa un valor mayor a 0.");
  }

  if (!comprobante) {
    throw new Error("Subi el comprobante del cierre.");
  }

  const allowed = ["image/jpeg", "image/png", "application/pdf"];
  if (!allowed.includes(comprobante.type)) {
    throw new Error("Comprobante invalido. Solo JPG, PNG o PDF.");
  }
  if (comprobante.size > 10 * 1024 * 1024) {
    throw new Error("Comprobante muy grande. Maximo 10MB.");
  }

  return {
    turno,
    fecha,
    empresa,
    cuenta,
    moneda,
    montoRaw,
    montoNum,
    comprobante
  };
}

async function handleSubmitCierre(e) {
  e.preventDefault();

  const btn = document.getElementById("btnGuardarCierre");
  const prevText = btn?.textContent || "Guardar cierre de caja";

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Guardando...";
    }

    const valid = validateCierreForm();
    const notas = document.getElementById("cierre_notas")?.value?.trim() || "";
    const horaSistema = getHoraSistemaNow();

    const payload = {
      fecha: valid.fecha,
      hora: horaSistema,
      turno: valid.turno,
      etiqueta: "Cierre de Caja",
      otro_concepto: "",
      monto_transferencia_raw: valid.montoRaw.trim(),
      moneda: valid.moneda,
      tipo_transaccion: "SALIDA",
      cuenta_receptora: "",
      usuario_casino: "",
      cuenta_salida: valid.cuenta,
      empresa_cuenta_salida: valid.empresa,
      id_transferencia: null,
      notas,
      hora_solicitud_cliente: "",
      hora_quema_fichas: ""
    };

    const fd = new FormData();
    fd.append("data", JSON.stringify(payload));
    fd.append("comprobante", valid.comprobante);

    await api("/api/egresos", { method: "POST", body: fd, auth: true });

    toast("Guardado", "Cierre de caja registrado correctamente.", "success", 7000);

    const comprobanteInput = document.getElementById("cierre_comprobante");
    const montoInput = document.getElementById("cierre_monto");
    const notasInput = document.getElementById("cierre_notas");
    if (comprobanteInput) comprobanteInput.value = "";
    if (montoInput) montoInput.value = "";
    if (notasInput) notasInput.value = "";

    setHoraSistemaPreview();
    updateLiveResumen();
    await refreshKPI();
  } catch (err) {
    toast("Error", err.message, "error", 9000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }
}

function renderKPIRows(rows) {
  const container = document.getElementById("cierresKPIList");
  if (!container) return;

  if (!rows || rows.length === 0) {
    container.innerHTML = '<div class="kpi-empty">No hay slots para mostrar con estos filtros.</div>';
    return;
  }

  container.innerHTML = rows.map((row, idx) => {
    const statusClass = row.status === "PENDIENTE"
      ? "pendiente"
      : (row.status === "DUPLICADO" ? "duplicado" : "ok");

    const cierre = row.cierre;
    const detail = cierre
      ? `${formatMoney(cierre.monto, cierre.moneda || "ARS")} | ${escapeHtml(cierre.empresa_salida || "-")} | ${escapeHtml(cierre.cuenta_salida || "-")} | cargado: ${formatCreatedAt(cierre.created_at)}${cierre.created_by_username ? ` | usuario: ${escapeHtml(cierre.created_by_username)}` : ""}`
      : "Sin cierre cargado para este turno.";

    const action = row.status === "PENDIENTE"
      ? `<button type="button" class="btn btn-ghost btn-kpi-usar" data-row-index="${idx}">Usar este slot</button>`
      : "";

    const dupText = row.status === "DUPLICADO" ? `<span class="kpi-dup">${row.count} cierres</span>` : "";
    const subDetail = (row.status === "DUPLICADO" && Array.isArray(row.cierres) && row.cierres.length > 1)
      ? `<div class="kpi-row-subdetail">Ultimo: ${formatMoney(row.cierres[0].monto, row.cierres[0].moneda || "ARS")} | ${escapeHtml(row.cierres[0].empresa_salida || "-")} | ${escapeHtml(row.cierres[0].cuenta_salida || "-")}</div>`
      : "";

    return `
      <article class="kpi-row ${statusClass}">
        <div class="kpi-row-main">
          <div class="kpi-row-top">
            <strong>${escapeHtml(formatISODate(row.fecha))}</strong>
            <span class="kpi-turno">${escapeHtml(row.turno)}</span>
            <span class="kpi-status ${statusClass}">${escapeHtml(row.status)}</span>
            ${dupText}
          </div>
          <div class="kpi-row-detail">${detail}</div>
          ${subDetail}
        </div>
        <div class="kpi-row-actions">${action}</div>
      </article>
    `;
  }).join("");

  container.querySelectorAll(".btn-kpi-usar").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.rowIndex);
      const row = cierreKpiRowsCache[index];
      if (!row) return;
      aplicarSlotAlFormulario(row);
    });
  });
}

function aplicarSlotAlFormulario(row) {
  const empresa = document.getElementById("cierre_empresa_salida");
  const cuenta = document.getElementById("cierre_cuenta_salida");
  const moneda = document.getElementById("cierre_moneda");
  const fecha = document.getElementById("cierre_fecha_operativa");

  const cierreData = row?.cierre || null;

  if (empresa && cierreData?.empresa_salida) empresa.value = cierreData.empresa_salida;
  if (cuenta && cierreData?.cuenta_salida) cuenta.value = cierreData.cuenta_salida;
  if (moneda && cierreData?.moneda) moneda.value = cierreData.moneda;
  if (fecha) {
    fecha.value = row.fecha || "";
    fecha.dataset.autoSuggested = "0";
  }

  markTurnoSelected(row.turno || "");
  updateLiveResumen();
  cargarCuentasSugeridas();

  window.scrollTo({ top: 0, behavior: "smooth" });
  toast("Slot aplicado", "Completamos el formulario con ese dia y turno.", "info", 4500);
}

function getKpiFilters() {
  return {
    fecha_desde: document.getElementById("kpi_fecha_desde")?.value || "",
    fecha_hasta: document.getElementById("kpi_fecha_hasta")?.value || "",
    empresa_salida: document.getElementById("kpi_empresa_salida")?.value || "",
    moneda: document.getElementById("kpi_moneda")?.value || ""
  };
}

function buildCierresQueryParams(filters) {
  const qs = new URLSearchParams();
  if (filters.fecha_desde) qs.set("fecha_desde", filters.fecha_desde);
  if (filters.fecha_hasta) qs.set("fecha_hasta", filters.fecha_hasta);
  if (filters.empresa_salida) qs.set("empresa_salida", filters.empresa_salida);
  if (filters.moneda) qs.set("moneda", filters.moneda);
  return qs;
}

async function downloadCierresCSV() {
  const btn = document.getElementById("btnDownloadCierresCSV");
  const prevText = btn?.textContent || "Descargar CSV";

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Descargando...";
    }

    const token = getToken();
    if (!token) {
      throw new Error("Sesion expirada. Volve a iniciar sesion.");
    }

    const qs = buildCierresQueryParams(getKpiFilters());
    const url = `${API_BASE}/api/egresos/cierres/csv${qs.toString() ? `?${qs.toString()}` : ""}`;

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      const contentType = res.headers.get("content-type") || "";
      const data = contentType.includes("application/json")
        ? await res.json().catch(() => null)
        : await res.text().catch(() => null);
      const msg = (data && data.message) ? data.message : (typeof data === "string" && data ? data : `Error ${res.status}`);
      throw new Error(msg);
    }

    const blob = await res.blob();
    const disposition = res.headers.get("content-disposition") || "";
    const match = disposition.match(/filename="?([^";]+)"?/i);
    const filename = (match && match[1]) ? match[1] : "cierres_caja.csv";

    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(blobUrl);

    toast("Descarga lista", "CSV de cierres descargado correctamente.", "success", 4500);
  } catch (err) {
    toast("Error", err.message || "No se pudo descargar el CSV", "error", 9000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prevText;
    }
  }
}

async function refreshKPI() {
  const filtros = getKpiFilters();

  const list = document.getElementById("cierresKPIList");
  if (list) list.innerHTML = '<div class="kpi-loading">Cargando estado de cierres...</div>';

  try {
    const qs = buildCierresQueryParams(filtros);

    const data = await api(`/api/egresos/cierres/kpi${qs.toString() ? `?${qs.toString()}` : ""}`);
    cierreKpiRowsCache = Array.isArray(data?.rows) ? data.rows : [];

    const pendientes = Number(data?.summary?.pendientes || 0);
    const ok = Number(data?.summary?.ok || 0);
    const duplicados = Number(data?.summary?.duplicados || 0);

    const pendingEl = document.getElementById("kpiPendientes");
    const okEl = document.getElementById("kpiOk");
    const dupEl = document.getElementById("kpiDuplicados");
    if (pendingEl) pendingEl.textContent = String(pendientes);
    if (okEl) okEl.textContent = String(ok);
    if (dupEl) dupEl.textContent = String(duplicados);

    renderKPIRows(cierreKpiRowsCache);
  } catch (err) {
    if (list) list.innerHTML = `<div class="kpi-empty">Error cargando KPI: ${escapeHtml(err.message)}</div>`;
  }
}

function setDefaultRange() {
  const now = new Date();
  const hoy = toISODateLocal(now);
  const desdeDate = new Date(now.getTime());
  desdeDate.setDate(desdeDate.getDate() - 2);
  const desde = toISODateLocal(desdeDate);

  const desdeInput = document.getElementById("kpi_fecha_desde");
  const hastaInput = document.getElementById("kpi_fecha_hasta");
  if (desdeInput && !desdeInput.value) desdeInput.value = desde;
  if (hastaInput && !hastaInput.value) hastaInput.value = hoy;

  const fechaOperativa = document.getElementById("cierre_fecha_operativa");
  if (fechaOperativa && !fechaOperativa.value) {
    fechaOperativa.value = hoy;
    fechaOperativa.dataset.autoSuggested = "1";
  }
}

function wireEvents() {
  document.querySelectorAll("#turnoPicker .turno-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const turno = btn.dataset.turno || "";
      markTurnoSelected(turno);
      applyFechaSuggestion(turno, false);
      updateLiveResumen();
    });
  });

  document.getElementById("btnFechaHoy")?.addEventListener("click", () => {
    const el = document.getElementById("cierre_fecha_operativa");
    if (!el) return;
    el.value = toISODateLocal(new Date());
    el.dataset.autoSuggested = "0";
    updateLiveResumen();
  });

  document.getElementById("btnFechaAyer")?.addEventListener("click", () => {
    const el = document.getElementById("cierre_fecha_operativa");
    if (!el) return;
    const d = new Date();
    d.setDate(d.getDate() - 1);
    el.value = toISODateLocal(d);
    el.dataset.autoSuggested = "0";
    updateLiveResumen();
  });

  document.getElementById("cierre_fecha_operativa")?.addEventListener("input", (e) => {
    e.target.dataset.autoSuggested = "0";
    updateLiveResumen();
  });

  ["cierre_empresa_salida", "cierre_moneda"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", async () => {
      await cargarCuentasSugeridas();

      const empresaForm = document.getElementById("cierre_empresa_salida")?.value || "";
      const monedaForm = document.getElementById("cierre_moneda")?.value || "";
      const kpiEmpresa = document.getElementById("kpi_empresa_salida");
      const kpiMoneda = document.getElementById("kpi_moneda");
      if (kpiEmpresa) kpiEmpresa.value = empresaForm;
      if (kpiMoneda) kpiMoneda.value = monedaForm;

      updateLiveResumen();
      refreshKPI();
    });
  });

  ["cierre_monto", "cierre_notas"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updateLiveResumen);
  });

  let formCuentaTimer = null;
  document.getElementById("cierre_cuenta_salida")?.addEventListener("input", () => {
    updateLiveResumen();

    if (formCuentaTimer) clearTimeout(formCuentaTimer);
    formCuentaTimer = setTimeout(cargarCuentasSugeridas, 320);
  });

  document.getElementById("cierreForm")?.addEventListener("submit", handleSubmitCierre);

  document.getElementById("btnRefreshCierresKPI")?.addEventListener("click", refreshKPI);
  document.getElementById("btnDownloadCierresCSV")?.addEventListener("click", downloadCierresCSV);

  ["kpi_fecha_desde", "kpi_fecha_hasta", "kpi_empresa_salida", "kpi_moneda"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", refreshKPI);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!location.pathname.includes("cierres-caja.html")) return;
  if (!requireAuth()) return;

  await initCommonUI();

  populateEmpresas();
  setDefaultRange();
  setHoraSistemaPreview();
  setInterval(setHoraSistemaPreview, 30000);

  wireEvents();
  await cargarCuentasSugeridas();

  markTurnoSelected("");
  updateLiveResumen();
  await refreshKPI();
});
