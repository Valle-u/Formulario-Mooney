/* =========================
   SECCIÓN: SALDOS DE CUENTAS
   ========================= */

// Variables globales para modal de saldos
let modalSaldosData = { empresa: '', cuenta: '', moneda: '', egresos: [], inicioCaja: 0 };

// Inicializar página de saldos
async function initSaldosPage() {
  // Poblar selector de mes y año
  poblarSelectorPeriodo();

  // Cargar empresas en el filtro
  await cargarEmpresasFiltroSaldos();

  // Event listeners principales
  const btnCargar = document.getElementById("btnCargarSaldos");
  if (btnCargar) {
    btnCargar.addEventListener("click", cargarSaldos);
  }

  const filtroEmpresa = document.getElementById("filtro_empresa");
  if (filtroEmpresa) {
    filtroEmpresa.addEventListener("change", cargarSaldos);
  }

  const filtroMoneda = document.getElementById("filtro_moneda");
  if (filtroMoneda) {
    filtroMoneda.addEventListener("change", cargarSaldos);
  }

  const filtroMes = document.getElementById("filtro_mes");
  if (filtroMes) {
    filtroMes.addEventListener("change", cargarSaldos);
  }

  const filtroAnio = document.getElementById("filtro_anio");
  if (filtroAnio) {
    filtroAnio.addEventListener("change", cargarSaldos);
  }

  // Event listeners para cerrar modal
  const modalCloseBtn = document.getElementById("modalCloseBtn");
  const modalBackdrop = document.getElementById("modalBackdrop");

  if (modalCloseBtn) {
    modalCloseBtn.addEventListener("click", cerrarModalSaldos);
  }
  if (modalBackdrop) {
    modalBackdrop.addEventListener("click", cerrarModalSaldos);
  }

  // Exportar CSV
  const btnCSV = document.getElementById("btnExportCSV");
  if (btnCSV) {
    btnCSV.addEventListener("click", downloadSaldosCSV);
  }

  // Cerrar modal con Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cerrarModalSaldos();
    }
  });

  // Cargar saldos iniciales
  await cargarSaldos();
}

function poblarSelectorPeriodo() {
  const selMes = document.getElementById("filtro_mes");
  const selAnio = document.getElementById("filtro_anio");
  if (!selMes || !selAnio) return;

  const meses = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];

  const now = new Date();
  const mesActual = now.getMonth() + 1;
  const anioActual = now.getFullYear();

  // Poblar meses
  selMes.innerHTML = meses.map((nombre, i) =>
    `<option value="${i + 1}" ${i + 1 === mesActual ? 'selected' : ''}>${nombre}</option>`
  ).join('');

  // Poblar años (desde 2024 hasta actual)
  selAnio.innerHTML = '';
  for (let y = anioActual; y >= 2024; y--) {
    const opt = document.createElement("option");
    opt.value = y;
    opt.textContent = y;
    if (y === anioActual) opt.selected = true;
    selAnio.appendChild(opt);
  }
}

async function cargarEmpresasFiltroSaldos() {
  const sel = document.getElementById("filtro_empresa");
  if (!sel) return;

  try {
    const data = await api("/api/egresos/distinct-empresas");
    if (data && data.empresas) {
      sel.innerHTML = '<option value="">Todas las empresas</option>';
      data.empresas.forEach(emp => {
        const opt = document.createElement("option");
        opt.value = emp;
        opt.textContent = emp;
        sel.appendChild(opt);
      });
    }
  } catch (e) {
    console.error("Error cargando empresas:", e);
  }
}

// Cargar saldos desde API
async function cargarSaldos() {
  const empresa = document.getElementById("filtro_empresa")?.value || "";
  const moneda = document.getElementById("filtro_moneda")?.value || "";
  const mes = document.getElementById("filtro_mes")?.value || "";
  const anio = document.getElementById("filtro_anio")?.value || "";
  const container = document.getElementById("saldosContainer");

  if (container) {
    container.innerHTML = '<div class="muted" style="text-align: center; padding: 40px;">Cargando saldos...</div>';
  }

  try {
    const qs = new URLSearchParams();
    if (empresa) qs.set("empresa", empresa);
    if (moneda) qs.set("moneda", moneda);
    if (mes) qs.set("mes", mes);
    if (anio) qs.set("anio", anio);

    const data = await api(`/api/egresos/saldos?${qs.toString()}`);
    renderSaldosTarjetas(data, empresa);
  } catch (err) {
    console.error("Error cargando saldos:", err);
    if (container) {
      container.innerHTML = `<div class="muted" style="text-align: center; padding: 40px; color: #ef4444;">Error: ${err.message}</div>`;
    }
  }
}

async function downloadSaldosCSV() {
  try {
    const empresa = document.getElementById("filtro_empresa")?.value || "";
    const moneda = document.getElementById("filtro_moneda")?.value || "";
    const mes = document.getElementById("filtro_mes")?.value || "";
    const anio = document.getElementById("filtro_anio")?.value || "";

    const qs = new URLSearchParams();
    if (empresa) qs.set("empresa", empresa);
    if (moneda) qs.set("moneda", moneda);
    if (mes) qs.set("mes", mes);
    if (anio) qs.set("anio", anio);

    const token = getToken();
    const res = await fetch(`${API_BASE}/api/egresos/saldos/csv?${qs.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });

    if (!res.ok) {
      let msg = `Error ${res.status}`;
      try {
        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          const data = await res.json();
          msg = data?.message || msg;
        } else {
          msg = (await res.text()) || msg;
        }
      } catch {}
      throw new Error(msg);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;

    const mesStr = String(mes || (new Date().getMonth() + 1)).padStart(2, "0");
    const anioStr = String(anio || new Date().getFullYear());
    a.download = `saldos_${mesStr}_${anioStr}.csv`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    toast("CSV descargado", "Saldos exportados correctamente", "success");
  } catch (err) {
    console.error("Error descargando CSV de saldos:", err);
    toast("Error", err.message || "No se pudo descargar el CSV", "error");
  }
}

// Renderizar saldos como tarjetas por titular
function renderSaldosTarjetas(data, empresaFiltro) {
  const { saldos, totales } = data;
  const container = document.getElementById("saldosContainer");

  // Actualizar totales generales
  const totalARSEl = document.getElementById("totalARS");
  const totalUSDEl = document.getElementById("totalUSD");

  if (totalARSEl) {
    const color = totales.ARS >= 0 ? "#10b981" : "#ef4444";
    totalARSEl.style.color = color;
    totalARSEl.textContent = `$${Number(totales.ARS).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (totalUSDEl) {
    const color = totales.USD >= 0 ? "#3b82f6" : "#ef4444";
    totalUSDEl.style.color = color;
    totalUSDEl.textContent = `$${Number(totales.USD).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const totalUSDTEl = document.getElementById("totalUSDT");
  if (totalUSDTEl) {
    const color = (totales.USDT || 0) >= 0 ? "#f59e0b" : "#ef4444";
    totalUSDTEl.style.color = color;
    totalUSDTEl.textContent = `$${Number(totales.USDT || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (!container) return;

  if (saldos.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--muted);">
        <div style="font-size: 3rem; margin-bottom: 16px;">--</div>
        <div>No hay cuentas registradas con los filtros seleccionados</div>
      </div>`;
    return;
  }

  // Agrupar por empresa
  const porEmpresa = {};
  saldos.forEach(s => {
    const emp = s.empresa_salida || "Sin empresa";
    if (!porEmpresa[emp]) porEmpresa[emp] = [];
    porEmpresa[emp].push(s);
  });

  let html = '';

  // Para cada empresa, crear una sección con tarjetas de titulares
  Object.keys(porEmpresa).sort().forEach(empresa => {
    const cuentas = porEmpresa[empresa];

    // Calcular total de la empresa
    const totalEmpresa = cuentas.reduce((sum, c) => sum + Number(c.saldo), 0);
    const balanceClass = totalEmpresa >= 0 ? '' : 'negative';
    const totalFormatted = Math.abs(totalEmpresa).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    html += `
      <div class="empresa-section">
        <div class="empresa-header">
          <h3>${escapeHtml(empresa)}</h3>
          <span class="empresa-balance ${balanceClass}">${totalEmpresa >= 0 ? '+' : '-'}$${totalFormatted}</span>
        </div>
        <div class="titulares-grid">
    `;

    // Tarjeta por cada titular/cuenta
    cuentas.forEach(c => {
      const inicioCaja = Number(c.inicio_caja || 0);
      const entradas = Number(c.total_entradas || 0);
      const salidas = Number(c.total_salidas || 0);
      const balance = Number(c.saldo || 0);
      const balanceClass = balance >= 0 ? 'positive' : 'negative';
      const inicioCajaClass = inicioCaja >= 0 ? 'positive' : 'negative';
      const monedaClass = c.moneda === 'ARS' ? 'ars' : c.moneda === 'USDT' ? 'usdt' : 'usd';

      const fechaUltima = c.ultima_transaccion
        ? new Date(c.ultima_transaccion).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
        : "Sin transacciones";

      const fmtNum = (n) => Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Badge sin cierre previo
      const sinCierreHTML = (!c.tiene_cierre_previo && inicioCaja === 0)
        ? ' <span class="badge-sin-cierre">Sin cierre previo</span>'
        : '';

      // Comparación mes a mes
      let compHTML = '';
      if (c.saldo_anterior !== null && c.saldo_anterior !== undefined) {
        const diff = c.diferencia || 0;
        const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
        const color = diff > 0 ? '#10b981' : diff < 0 ? '#ef4444' : 'var(--muted)';
        const pct = c.diferencia_pct !== null ? ` (${c.diferencia_pct > 0 ? '+' : ''}${c.diferencia_pct}%)` : '';
        compHTML = `
            <div class="stat-row" style="border-top: 1px dashed var(--border); padding-top: 4px; margin-top: 2px;">
              <span class="stat-label" style="font-size: 0.75rem;">vs mes anterior</span>
              <span style="font-size: 0.8rem; font-weight: 600; color: ${color};">
                ${arrow} ${diff >= 0 ? '+' : ''}$${fmtNum(diff)}${pct}
              </span>
            </div>`;
      }

      // Desglose por etiqueta (top 3)
      let etiqHTML = '';
      if (c.desglose_etiquetas && c.desglose_etiquetas.length > 0) {
        const topEtiq = c.desglose_etiquetas.slice(0, 3).map(e => {
          return `<div style="display: flex; justify-content: space-between; font-size: 0.78rem; padding: 2px 0;">
            <span style="color: var(--muted); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(e.etiqueta)}">${escapeHtml(e.etiqueta)}</span>
            <span style="font-weight: 600;">$${fmtNum(e.total)}</span>
          </div>`;
        }).join('');
        const masHTML = c.desglose_etiquetas.length > 3
          ? `<div style="font-size: 0.7rem; color: var(--muted); margin-top: 2px;">+${c.desglose_etiquetas.length - 3} más...</div>`
          : '';
        etiqHTML = `
          <div style="padding: 8px 16px; border-top: 1px solid var(--border);">
            <div style="font-size: 0.7rem; color: var(--muted); margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px;">Top etiquetas</div>
            ${topEtiq}
            ${masHTML}
          </div>`;
      }

      html += `
        <div class="titular-card">
          <div class="titular-card-header">
            <h4 title="${escapeHtml(c.cuenta_salida || "Sin titular")}">${escapeHtml(c.cuenta_salida || "Sin titular")}</h4>
            <div style="display: flex; gap: 6px; align-items: center;">
              <span class="moneda-tag ${monedaClass}">${c.moneda}</span>${sinCierreHTML}
            </div>
          </div>
          <div class="titular-stats">
            <div class="stat-row" style="border-bottom: 1px dashed var(--border); padding-bottom: 6px; margin-bottom: 6px;">
              <span class="stat-label">Inicio de caja</span>
              <span class="stat-value ${inicioCajaClass}" style="font-weight: 700;">${inicioCaja >= 0 ? '' : '-'}$${fmtNum(inicioCaja)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Entradas</span>
              <span class="stat-value entrada">+$${fmtNum(entradas)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">Salidas</span>
              <span class="stat-value salida">-$${fmtNum(salidas)}</span>
            </div>
            <div class="stat-row" style="border-top: 1px solid var(--border); padding-top: 6px; margin-top: 6px;">
              <span class="stat-label">Balance</span>
              <span class="stat-value balance ${balanceClass}" style="font-weight: 700;">${balance >= 0 ? '+' : ''}$${balance.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>${compHTML}
          </div>${etiqHTML}
          <div class="titular-card-footer">
            <div class="meta-info">
              <span>${c.total_transacciones} operaciones</span>
              <span>Última: ${fechaUltima}</span>
            </div>
            <button class="btn btn-small btn-primary btn-ver-operaciones"
                    data-empresa="${escapeHtml(c.empresa_salida)}"
                    data-cuenta="${escapeHtml(c.cuenta_salida)}"
                    data-moneda="${c.moneda}">
              Ver más
            </button>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind eventos de "Ver más"
  bindVerOperacionesButtons();
}

// Bind botones de "Más info"
function bindVerOperacionesButtons() {
  document.querySelectorAll(".btn-ver-operaciones").forEach(btn => {
    btn.addEventListener("click", () => {
      const empresa = btn.dataset.empresa;
      const cuenta = btn.dataset.cuenta;
      const moneda = btn.dataset.moneda;
      verOperacionesCuenta(empresa, cuenta, moneda);
    });
  });
}

// Ver todas las operaciones de una cuenta (modal)
async function verOperacionesCuenta(empresa, cuenta, moneda) {
  const modal = document.getElementById("detalleModal");
  const modalTitle = document.getElementById("modalTitle");
  const detalleBody = document.getElementById("detalleBody");

  if (!modal || !detalleBody) return;

  // Guardar datos para filtros
  modalSaldosData.empresa = empresa;
  modalSaldosData.cuenta = cuenta;
  modalSaldosData.moneda = moneda;

  // Obtener período seleccionado
  const mes = document.getElementById("filtro_mes")?.value || (new Date().getMonth() + 1);
  const anio = document.getElementById("filtro_anio")?.value || new Date().getFullYear();
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

  modalTitle.textContent = `${cuenta} - ${empresa} (${moneda}) - ${meses[mes - 1]} ${anio}`;
  detalleBody.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--muted);">Cargando operaciones...</div>';
  modal.style.display = "flex";

  try {
    // Obtener inicio de caja para esta cuenta
    const qsSaldos = new URLSearchParams();
    qsSaldos.set("empresa", empresa);
    qsSaldos.set("cuenta", cuenta);
    qsSaldos.set("moneda", moneda);
    qsSaldos.set("mes", mes);
    qsSaldos.set("anio", anio);
    const saldoData = await api(`/api/egresos/saldos?${qsSaldos.toString()}`);
    const cuentaSaldo = saldoData.saldos && saldoData.saldos[0];
    modalSaldosData.inicioCaja = cuentaSaldo ? Number(cuentaSaldo.inicio_caja || 0) : 0;

    // Buscar egresos de esta cuenta del mes seleccionado
    const qs = new URLSearchParams();
    qs.set("empresa_salida", empresa);
    qs.set("moneda", moneda);
    qs.set("limit", "500");

    const { egresos } = await api(`/api/egresos?${qs.toString()}`);

    // Filtrar por cuenta_salida y por mes/año
    const mesNum = parseInt(mes);
    const anioNum = parseInt(anio);
    modalSaldosData.egresos = egresos.filter(e => {
      if (e.cuenta_salida !== cuenta) return false;
      if (e.etiqueta === 'Cierre de Caja') return false;
      // Filtrar por mes/año usando fecha dd/mm/yyyy
      if (e.fecha) {
        const partes = e.fecha.split("/");
        if (partes.length === 3) {
          const m = parseInt(partes[1]);
          const y = parseInt(partes[2]);
          return m === mesNum && y === anioNum;
        }
      }
      return false;
    });

    // Extraer etiquetas únicas para el filtro
    const etiquetasUnicas = [...new Set(modalSaldosData.egresos.map(e => e.etiqueta).filter(Boolean))].sort();

    // Renderizar contenido inicial
    renderModalOperaciones(modalSaldosData.egresos, etiquetasUnicas);

  } catch (err) {
    console.error("Error cargando operaciones:", err);
    detalleBody.innerHTML = `<div style="padding: 40px; text-align: center; color: #ef4444;">Error: ${err.message}</div>`;
  }
}

// Renderizar contenido del modal con filtros
function renderModalOperaciones(egresos, etiquetasUnicas = []) {
  const detalleBody = document.getElementById("detalleBody");
  if (!detalleBody) return;

  // Calcular resumen (solo activos)
  const inicioCaja = modalSaldosData.inicioCaja || 0;
  let totalEntradas = 0, totalSalidas = 0;
  egresos.forEach(e => {
    if (e.status !== 'anulado') {
      if (e.tipo_transaccion === 'ENTRADA') totalEntradas += Number(e.monto);
      else totalSalidas += Number(e.monto);
    }
  });
  const balance = inicioCaja + totalEntradas - totalSalidas;

  const fmtMoney = (n) => Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: 2 });

  // Generar opciones de etiquetas
  const etiquetaOptions = etiquetasUnicas.map(et => `<option value="${escapeHtml(et)}">${escapeHtml(et)}</option>`).join('');

  detalleBody.innerHTML = `
    <!-- FILTROS -->
    <div class="modal-filters">
      <div class="filters-grid">
        <div class="filter-group">
          <label>Tipo</label>
          <select id="modalFiltroTipo">
            <option value="">Todos</option>
            <option value="ENTRADA">Entradas</option>
            <option value="SALIDA">Salidas</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Estado</label>
          <select id="modalFiltroEstado">
            <option value="">Todos</option>
            <option value="activo">Activo</option>
            <option value="editada">Editado</option>
            <option value="anulado">Anulado</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Etiqueta</label>
          <select id="modalFiltroEtiqueta">
            <option value="">Todas</option>
            ${etiquetaOptions}
          </select>
        </div>
        <div class="filter-group">
          <label>Monto mín</label>
          <input type="number" id="modalFiltroMontoMin" placeholder="0" min="0" step="0.01">
        </div>
        <div class="filter-group">
          <label>Monto máx</label>
          <input type="number" id="modalFiltroMontoMax" placeholder="∞" min="0" step="0.01">
        </div>
      </div>
      <div class="filter-actions">
        <button class="btn btn-primary btn-small" id="btnAplicarFiltrosModal">Filtrar</button>
        <button class="btn btn-ghost btn-small" id="btnLimpiarFiltrosModal">Limpiar</button>
      </div>
    </div>

    <!-- RESUMEN -->
    <div class="modal-summary">
      <div class="summary-card" style="border-left: 3px solid #6366f1;">
        <div class="summary-label">Inicio de Caja</div>
        <div class="summary-value" style="color: #6366f1; font-weight: 700;">${inicioCaja >= 0 ? '' : '-'}$${fmtMoney(inicioCaja)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Entradas</div>
        <div class="summary-value entrada">+$${fmtMoney(totalEntradas)}</div>
      </div>
      <div class="summary-card">
        <div class="summary-label">Salidas</div>
        <div class="summary-value salida">-$${fmtMoney(totalSalidas)}</div>
      </div>
      <div class="summary-card" style="border-left: 3px solid ${balance >= 0 ? '#10b981' : '#ef4444'};">
        <div class="summary-label">Balance Final</div>
        <div class="summary-value balance ${balance >= 0 ? 'positive' : 'negative'}" style="font-weight: 700;">${balance >= 0 ? '+' : ''}$${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</div>
      </div>
    </div>

    <!-- TABLA DE OPERACIONES -->
    <div class="table-wrap" style="max-height: 300px; overflow-y: auto;">
      <table class="table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Hora</th>
            <th>Tipo</th>
            <th>Etiqueta</th>
            <th style="text-align: right;">Monto</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody id="modalOperacionesBody">
          ${renderFilasOperaciones(egresos)}
        </tbody>
      </table>
    </div>
    <div style="margin-top: 12px; font-size: 0.8rem; color: var(--muted);">
      Mostrando ${egresos.length} operación(es)
    </div>
  `;

  // Bind eventos de filtros
  bindFiltrosModal(etiquetasUnicas);
}

// Renderizar filas de la tabla de operaciones
function renderFilasOperaciones(egresos) {
  if (egresos.length === 0) {
    return '<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--muted);">No hay operaciones con estos filtros</td></tr>';
  }

  return egresos.map(e => {
    const monto = Number(e.monto).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const tipoColor = e.tipo_transaccion === "ENTRADA" ? "#10b981" : "#ef4444";
    const tipoIcon = e.tipo_transaccion === "ENTRADA" ? "IN" : "OUT";

    let statusBadge = '';
    if (e.status === 'activo') {
      statusBadge = '<span style="background: #10b981; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Activo</span>';
    } else if (e.status === 'anulado') {
      statusBadge = '<span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Anulado</span>';
    } else {
      statusBadge = '<span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px; font-size: 11px;">Editado</span>';
    }

    const rowStyle = e.status === 'anulado' ? 'opacity: 0.5;' : '';

    return `
      <tr style="${rowStyle}">
        <td>${escapeHtml(e.fecha || "-")}</td>
        <td>${escapeHtml(e.hora || "-")}</td>
        <td style="color: ${tipoColor}; font-weight: 600;">${tipoIcon} ${e.tipo_transaccion}</td>
        <td>${escapeHtml(e.etiqueta || "-")}</td>
        <td style="text-align: right; font-weight: 600; color: ${tipoColor};">
          ${e.tipo_transaccion === "ENTRADA" ? "+" : "-"}$${monto}
        </td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join("");
}

// Bind eventos de filtros del modal
function bindFiltrosModal(etiquetasUnicas) {
  const btnAplicar = document.getElementById("btnAplicarFiltrosModal");
  const btnLimpiar = document.getElementById("btnLimpiarFiltrosModal");

  if (btnAplicar) {
    btnAplicar.addEventListener("click", () => aplicarFiltrosModal(etiquetasUnicas));
  }

  if (btnLimpiar) {
    btnLimpiar.addEventListener("click", () => {
      // Limpiar todos los filtros
      document.getElementById("modalFiltroTipo").value = "";
      document.getElementById("modalFiltroEstado").value = "";
      document.getElementById("modalFiltroEtiqueta").value = "";
      document.getElementById("modalFiltroMontoMin").value = "";
      document.getElementById("modalFiltroMontoMax").value = "";
      // Aplicar sin filtros
      aplicarFiltrosModal(etiquetasUnicas);
    });
  }
}

// Aplicar filtros en el modal
function aplicarFiltrosModal(etiquetasUnicas) {
  const tipo = document.getElementById("modalFiltroTipo")?.value || "";
  const estado = document.getElementById("modalFiltroEstado")?.value || "";
  const etiqueta = document.getElementById("modalFiltroEtiqueta")?.value || "";
  const montoMin = parseFloat(document.getElementById("modalFiltroMontoMin")?.value) || 0;
  const montoMax = parseFloat(document.getElementById("modalFiltroMontoMax")?.value) || Infinity;

  // Filtrar egresos
  let filtrados = modalSaldosData.egresos.filter(e => {
    if (tipo && e.tipo_transaccion !== tipo) return false;
    if (estado && e.status !== estado) return false;
    if (etiqueta && e.etiqueta !== etiqueta) return false;

    const monto = Number(e.monto);
    if (monto < montoMin) return false;
    if (montoMax !== Infinity && monto > montoMax) return false;

    return true;
  });

  // Actualizar resumen y tabla
  const inicioCaja = modalSaldosData.inicioCaja || 0;
  let totalEntradas = 0, totalSalidas = 0;
  filtrados.forEach(e => {
    if (e.status !== 'anulado') {
      if (e.tipo_transaccion === 'ENTRADA') totalEntradas += Number(e.monto);
      else totalSalidas += Number(e.monto);
    }
  });
  const balance = inicioCaja + totalEntradas - totalSalidas;

  const fmtMoney = (n) => Math.abs(n).toLocaleString("es-AR", { minimumFractionDigits: 2 });

  // Actualizar resumen visual (4 cards: inicio, entradas, salidas, balance)
  const summaryCards = document.querySelectorAll(".summary-card .summary-value");
  if (summaryCards[0]) summaryCards[0].textContent = `${inicioCaja >= 0 ? '' : '-'}$${fmtMoney(inicioCaja)}`;
  if (summaryCards[1]) summaryCards[1].textContent = `+$${fmtMoney(totalEntradas)}`;
  if (summaryCards[2]) summaryCards[2].textContent = `-$${fmtMoney(totalSalidas)}`;
  if (summaryCards[3]) {
    summaryCards[3].textContent = `${balance >= 0 ? '+' : ''}$${balance.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
    summaryCards[3].className = `summary-value balance ${balance >= 0 ? 'positive' : 'negative'}`;
  }

  // Actualizar tabla
  const tbody = document.getElementById("modalOperacionesBody");
  if (tbody) {
    tbody.innerHTML = renderFilasOperaciones(filtrados);
  }

  // Actualizar contador
  const contador = document.querySelector(".modal-body > div:last-child");
  if (contador) {
    contador.textContent = `Mostrando ${filtrados.length} operación(es)`;
  }
}

// Convertir fecha dd/mm/yyyy a Date
function convertirFechaADate(fechaStr) {
  if (!fechaStr) return null;
  const partes = fechaStr.split("/");
  if (partes.length === 3) {
    return new Date(partes[2], partes[1] - 1, partes[0]);
  }
  return null;
}

// Cerrar modal de saldos
function cerrarModalSaldos() {
  const modal = document.getElementById("detalleModal");
  if (modal) {
    modal.style.display = "none";
    // Limpiar datos
    modalSaldosData = { empresa: '', cuenta: '', moneda: '', egresos: [], inicioCaja: 0 };
  }
}

/* =========================
   DOMCONTENTLOADED - Saldos page
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  if(!location.pathname.includes("saldos.html")) return;
  if(!requireAuth()) return;
  initCommonUI();
  initSaldosPage();
  const cuentaSel = document.getElementById('filtro_cuenta');
  if(cuentaSel) cuentaSel.addEventListener('change', () => {
    const emp = document.getElementById('filtro_empresa')?.value || '';
    if(emp) cargarSaldos();
  });
});
