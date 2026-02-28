/* =========================
   CONSULTA EGRESOS
   ========================= */
let egresosOffset = 0;
const EGRESOS_LIMIT = 50;
let currentFilters = {};

// Toggle de filtros (mostrar/ocultar)
function toggleFiltros(){
  const body = document.getElementById("filtrosBody");
  const icon = document.getElementById("filtrosToggleIcon");

  if(!body || !icon) return;

  const isHidden = body.style.display === "none";

  body.style.display = isHidden ? "" : "none";
  icon.textContent = isHidden ? "▼" : "▲";

  // Guardar preferencia en localStorage
  localStorage.setItem("filtros_visible", isHidden ? "true" : "false");
}

async function populateFiltrosSelects(){
  const selEmpresa = document.getElementById("empresa_salida");
  const selEtiqueta = document.getElementById("etiqueta");
  const selCreatedBy = document.getElementById("created_by");

  if(selEmpresa){
    selEmpresa.innerHTML = `<option value="">Todas</option>` +
      EMPRESAS_SALIDA.map(e => `<option value="${e}">${e}</option>`).join("");
  }

  if(selEtiqueta){
    selEtiqueta.innerHTML = `<option value="">Todas</option>` +
      ETIQUETAS.map(e => `<option value="${e}">${e}</option>`).join("");
  }

  // Cargar lista de usuarios para el filtro "Creado por" según jerarquía
  if(selCreatedBy){
    try{
      const response = await api("/api/users/for-filter");
      const users = response.users || [];
      selCreatedBy.innerHTML = `<option value="">Todos</option>` +
        users.map(u => `<option value="${u.id}">${u.full_name || u.username} (${u.role})</option>`).join("");
    }catch(err){
      console.error("Error cargando usuarios:", err);
      // Fall back: rellenar con el usuario actual si es posible
      selCreatedBy.innerHTML = `<option value="">Todos</option>`;
      try{
        const current = getUser ? getUser() : null;
        if (current && current.id){
          const displayName = current.full_name || current.username || current.id;
          selCreatedBy.innerHTML += `<option value="${current.id}">${escapeHtml(displayName)} (${escapeHtml(current.role) || ""})</option>`;
        }
      }catch(_){
        // ignorar fallback si falla
      }
    }
  }
}

async function buscarEgresos(){
  const tbody = document.getElementById("egresosTbody");
  if(!tbody) return;

  tbody.innerHTML = `<tr><td colspan="11" class="muted">Cargando…</td></tr>`;

  const fecha_desde = document.getElementById("fecha_desde")?.value || "";
  const fecha_hasta = document.getElementById("fecha_hasta")?.value || "";
  const empresa_salida = document.getElementById("empresa_salida")?.value || "";
  const etiqueta = document.getElementById("etiqueta")?.value || "";
  const status = document.getElementById("status")?.value || "";
  const moneda = document.getElementById("moneda")?.value || "";
  const usuario_casino = document.getElementById("usuario_casino")?.value?.trim() || "";
  const id_transferencia = document.getElementById("id_transferencia")?.value?.trim() || "";
  const monto_min = document.getElementById("monto_min")?.value || "";
  const monto_max = document.getElementById("monto_max")?.value || "";
  const turno = document.getElementById("turno")?.value || "";
  const cuenta_receptora = document.getElementById("cuenta_receptora")?.value?.trim() || "";
  const created_by = document.getElementById("created_by")?.value || "";

  currentFilters = {
    fecha_desde, fecha_hasta, empresa_salida, etiqueta, status, moneda,
    usuario_casino, id_transferencia, monto_min, monto_max,
    turno, cuenta_receptora, created_by
  };

  const qs = new URLSearchParams();
  qs.set("limit", String(EGRESOS_LIMIT));
  qs.set("offset", String(egresosOffset));

  if(fecha_desde) qs.set("fecha_desde", fecha_desde);
  if(fecha_hasta) qs.set("fecha_hasta", fecha_hasta);
  if(empresa_salida) qs.set("empresa_salida", empresa_salida);
  if(etiqueta) qs.set("etiqueta", etiqueta);
  if(status) qs.set("status", status);
  // Usar currentFilters.moneda para asegurar que USD forzado se incluya
  if(currentFilters.moneda) qs.set("moneda", currentFilters.moneda);
  if(usuario_casino) qs.set("usuario_casino", usuario_casino);
  if(id_transferencia) qs.set("id_transferencia", id_transferencia);
  if(monto_min) qs.set("monto_min", monto_min);
  if(monto_max) qs.set("monto_max", monto_max);
  if(turno) qs.set("turno", turno);
  if(cuenta_receptora) qs.set("cuenta_receptora", cuenta_receptora);
  if(created_by) qs.set("created_by", created_by);

  try{
    const { egresos, pagination, sumas } = await api(`/api/egresos?${qs.toString()}`);
    renderEgresos(egresos, pagination, sumas);
  }catch(err){
    tbody.innerHTML = `<tr><td colspan="11" class="muted">${err.message}</td></tr>`;
  }
}

function renderEgresos(egresos, pagination, sumas){
  const tbody = document.getElementById("egresosTbody");
  if(!tbody) return;

  if(egresos.length === 0){
    tbody.innerHTML = `<tr><td colspan="11" class="muted">No se encontraron resultados</td></tr>`;

    const info = document.getElementById("resultadosInfo");
    if(info) info.textContent = "0 resultados";

    const sumaTotalEl = document.getElementById("sumaTotal");
    if(sumaTotalEl) sumaTotalEl.textContent = "—";

    document.getElementById("btnPrev").disabled = true;
    document.getElementById("btnNext").disabled = true;
    document.getElementById("paginacionInfo").textContent = "";
    return;
  }

  tbody.innerHTML = egresos.map(e => {
    const montoFormatted = Number(e.monto).toLocaleString("es-AR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const moneda = e.moneda || 'ARS';
    const monedaBadge = moneda === 'USDT'
      ? '<span style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">₮ USDT</span>'
      : moneda === 'USD'
      ? '<span style="background: #3a3a3a; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">USD</span>'
      : '<span style="background: #5a5a5a; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">ARS</span>';

    const status = e.status || 'activo';
    const statusBadge = status === 'activo'
      ? '<span style="background: #444444; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">ACTIVO</span>'
      : status === 'anulado'
      ? '<span style="background: #2a2a2a; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">ANULADO</span>'
      : status === 'editada'
      ? '<span style="background: #666666; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">EDITADA</span>'
      : '<span style="background: #7a7a7a; color: #ffffff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">PENDIENTE</span>';

    return `
      <tr>
        <td>${e.fecha}</td>
        <td>${e.hora || "-"}</td>
        <td>${e.empresa_salida}</td>
        <td>${e.id_transferencia}</td>
        <td>${e.etiqueta}${e.etiqueta_otro ? ` (${e.etiqueta_otro})` : ""}</td>
        <td>${e.usuario_casino || "-"}</td>
        <td>$${montoFormatted}</td>
        <td>${monedaBadge}</td>
        <td>${statusBadge}</td>
        <td>${e.created_by_username}</td>
        <td>
          <button class="btn btn-small btn-primary" data-ver-detalle="${e.id}">Ver</button>
        </td>
      </tr>
    `;
  }).join("");

  bindVerDetalleButtons(egresos);

  const info = document.getElementById("resultadosInfo");
  if(info) info.textContent = `Total: ${pagination.total} transferencias`;

  // Usar sumas totales del backend (suma de TODAS las páginas con filtros aplicados)
  const sumaARS = sumas?.ars || 0;
  const sumaUSD = sumas?.usd || 0;
  const sumaUSDT = sumas?.usdt || 0;

  const sumaTotalEl = document.getElementById("sumaTotal");
  if(sumaTotalEl) {
    const partes = [];
    if(sumaARS > 0) partes.push(`ARS $${sumaARS.toLocaleString("es-AR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    if(sumaUSD > 0) partes.push(`USD $${sumaUSD.toLocaleString("es-AR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    if(sumaUSDT > 0) partes.push(`USDT $${sumaUSDT.toLocaleString("es-AR", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
    sumaTotalEl.textContent = partes.length > 0 ? partes.join(" | ") : "—";
  }

  document.getElementById("btnPrev").disabled = pagination.offset === 0;
  document.getElementById("btnNext").disabled = !pagination.hasMore;

  const paginacionInfo = document.getElementById("paginacionInfo");
  if(paginacionInfo){
    const desde = pagination.offset + 1;
    const hasta = Math.min(pagination.offset + pagination.limit, pagination.total);
    paginacionInfo.textContent = `Mostrando ${desde}-${hasta} de ${pagination.total}`;
  }
}

function bindVerDetalleButtons(egresos){
  console.log('bindVerDetalleButtons llamada con', egresos.length, 'egresos');
  const buttons = document.querySelectorAll("[data-ver-detalle]");
  console.log('Botones encontrados:', buttons.length);

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      console.log('Click en boton Ver detectado');
      const id = Number(btn.dataset.verDetalle);
      console.log('ID del egreso:', id, 'tipo:', typeof id);
      console.log('Primer egreso del array:', egresos[0]);
      // Buscar comparando flexiblemente (número o string)
      const egreso = egresos.find(e => Number(e.id) === id);
      console.log('Egreso encontrado:', egreso);
      if(egreso) {
        console.log('Llamando a mostrarDetalle...');
        mostrarDetalle(egreso);
      } else {
        console.error('No se encontro el egreso con ID:', id);
        console.error('Todos los IDs en array:', egresos.map(e => e.id));
      }
    });
  });
}

// Variable global para almacenar el egreso actual
let currentEgreso = null;

function mostrarDetalle(e){
  currentEgreso = e; // Guardar egreso en variable global
  console.log('mostrarDetalle llamada con egreso:', e);
  const modal = document.getElementById("detalleModal");
  const body = document.getElementById("detalleBody");
  console.log('Modal element:', modal);
  console.log('Body element:', body);

  if(!modal || !body) {
    console.error('ERROR: Modal o body no encontrado!', { modal, body });
    return;
  }

  const montoFormatted = Number(e.monto).toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const isPdf = e.comprobante_mime === "application/pdf";

  // Usar directamente la URL de ImgBB si está disponible, sino usar el endpoint del backend
  const comprobanteUrl = e.comprobante_url && e.comprobante_url.startsWith('http')
    ? e.comprobante_url // URL directa de ImgBB o R2
    : `${API_BASE}/api/egresos/${encodeURIComponent(e.id)}/comprobante`; // Fallback al endpoint del backend

  const comprobantePreview = isPdf
    ? `<a href="${escapeHtml(comprobanteUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Ver PDF en nueva ventana</a>`
    : `<a href="${escapeHtml(comprobanteUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(comprobanteUrl)}" style="max-width: 100%; max-height: 400px; border-radius: 8px;" alt="Comprobante" onerror="this.parentElement.innerHTML='Error cargando imagen'"></a>`;

  // Estado visual
  const status = e.status || 'activo';
  const statusBadge = status === 'activo'
    ? '<span style="background: #444444; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 12px;">ACTIVO</span>'
    : status === 'anulado'
    ? '<span style="background: #2a2a2a; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 12px;">ANULADO</span>'
    : status === 'editada'
    ? '<span style="background: #666666; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 12px;">EDITADA</span>'
    : '<span style="background: #7a7a7a; color: #ffffff; padding: 4px 8px; border-radius: 4px; font-size: 12px;">PENDIENTE</span>';

  const user = getUser();
  // Admin/Direccion pueden editar cualquier egreso, otros usuarios solo los propios
  const isAdminOrDireccion = (user.role === 'admin' || user.role === 'direccion');
  const isOwner = e.created_by === user.id;
  const canEdit = isAdminOrDireccion || isOwner;
  const canDelete = isAdminOrDireccion || isOwner;

  body.innerHTML = `
    <div class="grid">
      <div class="field span12" style="margin-bottom: 16px;">
        <div>${statusBadge}</div>
      </div>

      ${status === 'anulado' && e.motivo_anulacion ? `
      <div class="field span12" style="background: #fee2e2; border-left: 4px solid #ef4444; padding: 12px; border-radius: 4px; margin-bottom: 16px;">
        <label style="color: #991b1b; font-weight: 600;">MOTIVO DE ANULACIÓN</label>
        <div class="note" style="color: #7f1d1d;">${escapeHtml(e.motivo_anulacion)}</div>
        <div class="note" style="color: #991b1b; font-size: 11px; margin-top: 4px;">
          Anulado: ${e.anulado_at ? new Date(e.anulado_at).toLocaleString() : 'N/A'}
        </div>
      </div>` : ''}

      <div class="field span6">
        <label>FECHA</label>
        <div class="note">${escapeHtml(e.fecha)}</div>
      </div>
      <div class="field span6">
        <label>HORA</label>
        <div class="note">${escapeHtml(e.hora || "-")}</div>
      </div>
      <div class="field span6">
        <label>TURNO</label>
        <div class="note">${escapeHtml(e.turno || "-")}</div>
      </div>
      <div class="field span6">
        <label>EMPRESA</label>
        <div class="note">${escapeHtml(e.empresa_salida)}</div>
      </div>
      <div class="field span6">
        <label>ID TRANSFERENCIA</label>
        <div class="note">${escapeHtml(e.id_transferencia)}</div>
      </div>
      <div class="field span6">
        <label>MONTO</label>
        <div class="note">$${escapeHtml(montoFormatted)}</div>
      </div>
      <div class="field span6">
        <label>MONEDA</label>
        <div class="note">${escapeHtml(e.moneda || 'ARS')}</div>
      </div>
      <div class="field span12">
        <label>ETIQUETA</label>
        <div class="note">${escapeHtml(e.etiqueta)}${e.etiqueta_otro ? ` - ${escapeHtml(e.etiqueta_otro)}` : ""}</div>
      </div>
      <div class="field span6">
        <label>CUENTA RECEPTORA</label>
        <div class="note">${escapeHtml(e.cuenta_receptora)}</div>
      </div>
      <div class="field span6">
        <label>CUENTA SALIDA</label>
        <div class="note">${escapeHtml(e.cuenta_salida)}</div>
      </div>
      ${e.usuario_casino ? `
      <div class="field span12">
        <label>USUARIO CASINO</label>
        <div class="note">${escapeHtml(e.usuario_casino)}</div>
      </div>` : ""}
      ${e.hora_solicitud_cliente ? `
      <div class="field span6">
        <label>HORA SOLICITUD CLIENTE</label>
        <div class="note">${escapeHtml(e.hora_solicitud_cliente)}</div>
      </div>` : ""}
      ${e.hora_quema_fichas ? `
      <div class="field span6">
        <label>HORA QUEMA FICHAS</label>
        <div class="note">${escapeHtml(e.hora_quema_fichas)}</div>
      </div>` : ""}
      ${e.notas ? `
      <div class="field span12">
        <label>NOTAS</label>
        <div class="note">${escapeHtml(e.notas)}</div>
      </div>` : ""}
      <div class="field span12">
        <label>CREADO POR</label>
        <div class="note">${escapeHtml(e.created_by_username)} - ${escapeHtml(new Date(e.created_at).toLocaleString())}</div>
      </div>

      ${e.updated_at ? `
      <div class="field span12">
        <label>ÚLTIMA MODIFICACIÓN</label>
        <div class="note">${new Date(e.updated_at).toLocaleString()}</div>
      </div>` : ''}

      <div class="field span12" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
        <label>COMPROBANTE</label>
        <div style="margin-top: 8px;">
          ${comprobantePreview}
        </div>
      </div>

      ${canEdit ? `
      <div class="field span12" style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);">
        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: flex-start;">
          ${status !== 'anulado' ? `
            <button class="btn btn-primary btn-editar-egreso" style="flex: 1; min-width: 140px;">
              Editar
            </button>
            ${canDelete ? `
              <button class="btn btn-eliminar-egreso" data-egreso-id="${e.id}" style="flex: 1; min-width: 140px; background: #ef4444; color: white;">
                Eliminar
              </button>
            ` : ''}
          ` : ''}
          <button class="btn btn-ghost btn-ver-historial" data-egreso-id="${e.id}" style="flex: 1; min-width: 140px;">
            Ver historial
          </button>
        </div>
      </div>` : ''}
    </div>
  `;

  console.log('HTML generado, mostrando modal...');
  console.log('Estado actual del modal:', modal.style.display);
  modal.style.display = "flex";

  console.log('Modal mostrado con display:', modal.style.display);

  // Agregar event listeners a los botones de acción
  setTimeout(() => {
    const btnEditar = document.querySelector('.btn-editar-egreso');
    const btnEliminar = document.querySelector('.btn-eliminar-egreso');
    const btnHistorial = document.querySelector('.btn-ver-historial');

    if (btnEditar) {
      btnEditar.addEventListener('click', () => {
        console.log('Boton Editar clickeado');
        editarEgresoModal();
      });
    }

    if (btnEliminar) {
      btnEliminar.addEventListener('click', () => {
        const egresoId = btnEliminar.dataset.egresoId;
        console.log('Boton Eliminar clickeado, ID:', egresoId);
        mostrarModalEliminar(egresoId);
      });
    }

    if (btnHistorial) {
      btnHistorial.addEventListener('click', () => {
        const egresoId = btnHistorial.dataset.egresoId;
        console.log('Boton Historial clickeado, ID:', egresoId);
        verHistorial(egresoId);
      });
    }
  }, 100);
}

function limpiarFiltros(){
  document.getElementById("fecha_desde").value = "";
  document.getElementById("fecha_hasta").value = "";
  document.getElementById("empresa_salida").value = "";
  document.getElementById("etiqueta").value = "";
  document.getElementById("usuario_casino").value = "";
  document.getElementById("id_transferencia").value = "";
  document.getElementById("monto_min").value = "";
  document.getElementById("monto_max").value = "";
  egresosOffset = 0;
  currentFilters = {};

  const tbody = document.getElementById("egresosTbody");
  if(tbody) tbody.innerHTML = `<tr><td colspan="9" class="muted">Usá los filtros para buscar transferencias</td></tr>`;

  const info = document.getElementById("resultadosInfo");
  if(info) info.textContent = "—";

  document.getElementById("btnPrev").disabled = true;
  document.getElementById("btnNext").disabled = true;
  document.getElementById("paginacionInfo").textContent = "";
}

function egresosPrev(){
  egresosOffset = Math.max(egresosOffset - EGRESOS_LIMIT, 0);
  buscarEgresos();
}

function egresosNext(){
  egresosOffset += EGRESOS_LIMIT;
  buscarEgresos();
}

async function handleFiltrosSubmit(e){
  e.preventDefault();
  egresosOffset = 0;
  buscarEgresos();
}

/* =========================
   CSV CON FILTROS
   ========================= */
async function downloadCSVFiltrado(){
  try{
    const token = getToken();
    if(!token){ toast("Sin sesión","Iniciá sesión"); return; }

    // Leer los filtros directamente del formulario
    const fecha_desde = document.getElementById("fecha_desde")?.value || "";
    const fecha_hasta = document.getElementById("fecha_hasta")?.value || "";
    const empresa_salida = document.getElementById("empresa_salida")?.value || "";
    const etiqueta = document.getElementById("etiqueta")?.value || "";
    const usuario_casino = document.getElementById("usuario_casino")?.value?.trim() || "";
    const id_transferencia = document.getElementById("id_transferencia")?.value?.trim() || "";
    const monto_min = document.getElementById("monto_min")?.value || "";
    const monto_max = document.getElementById("monto_max")?.value || "";
    const turno = document.getElementById("turno")?.value || "";
    const cuenta_receptora = document.getElementById("cuenta_receptora")?.value?.trim() || "";
    const created_by = document.getElementById("created_by")?.value || "";
    let moneda = document.getElementById("moneda")?.value || "";

    const qs = new URLSearchParams();

    if(fecha_desde) qs.set("fecha_desde", fecha_desde);
    if(fecha_hasta) qs.set("fecha_hasta", fecha_hasta);
    if(empresa_salida) qs.set("empresa_salida", empresa_salida);
    if(etiqueta) qs.set("etiqueta", etiqueta);
    if(usuario_casino) qs.set("usuario_casino", usuario_casino);
    if(id_transferencia) qs.set("id_transferencia", id_transferencia);
    if(monto_min) qs.set("monto_min", monto_min);
    if(monto_max) qs.set("monto_max", monto_max);
    if(turno) qs.set("turno", turno);
    if(cuenta_receptora) qs.set("cuenta_receptora", cuenta_receptora);
    if(created_by) qs.set("created_by", created_by);
    if(moneda) qs.set("moneda", moneda);

    const queryString = qs.toString();
    const url = queryString
      ? `${API_BASE}/api/egresos/csv?${queryString}`
      : `${API_BASE}/api/egresos/csv`;

    console.log("URL CSV:", url);
    console.log("Filtros aplicados:", { fecha_desde, fecha_hasta, empresa_salida, etiqueta, moneda, usuario_casino, id_transferencia, monto_min, monto_max, turno, cuenta_receptora, created_by });

    const res = await fetch(url,{
      method:"GET",
      headers:{ Authorization:`Bearer ${token}` }
    });

    if(!res.ok){
      const txt = await res.text().catch(()=> "");
      throw new Error(txt || `Error ${res.status}`);
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = "egresos.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);

    toast("CSV descargado", "Archivo exportado exitosamente", "success", 5000);
  }catch(err){
    toast("Error CSV", err.message);
  }
}

/* =========================
   EDICIÓN Y ANULACIÓN DE EGRESOS
   ========================= */
function editarEgresoModal(){
  const egreso = currentEgreso;
  if(!egreso) return;
  const modal = document.getElementById("detalleModal");
  const body = document.getElementById("detalleBody");
  if(!modal || !body) return;

  // Determinar si es un premio o cierre de caja (para campos condicionales)
  const esPremio = ETIQUETAS_CON_USUARIO_CASINO.has(egreso.etiqueta);
  const esCierreCaja = ETIQUETAS_CIERRE_CAJA.has(egreso.etiqueta);

  // Formulario de edición con TODOS los campos
  body.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px 0;">Editar transferencia</h3>
      <div class="note">Egreso #${egreso.id} - Modificá todos los campos necesarios</div>
    </div>

    <form id="formEditarEgreso" class="grid">
      <!-- FECHA Y HORA -->
      <div class="field span4">
        <label>FECHA *</label>
        <input type="text" id="edit_fecha" value="${escapeHtml(egreso.fecha)}" placeholder="dd/mm/aaaa" pattern="\\d{2}/\\d{2}/\\d{4}" maxlength="10" required>
      </div>

      <div class="field span4">
        <label>HORA *</label>
        <input type="time" id="edit_hora" value="${escapeHtml(egreso.hora || '')}" required>
      </div>

      <div class="field span4">
        <label>TURNO *</label>
        <select id="edit_turno" required>
          <option value="Turno mañana" ${egreso.turno === 'Turno mañana' ? 'selected' : ''}>Turno mañana</option>
          <option value="Turno tarde" ${egreso.turno === 'Turno tarde' ? 'selected' : ''}>Turno tarde</option>
          <option value="Turno noche" ${egreso.turno === 'Turno noche' ? 'selected' : ''}>Turno noche</option>
        </select>
      </div>

      <!-- ETIQUETA Y MONEDA -->
      <div class="field span6">
        <label>CONCEPTO/ETIQUETA *</label>
        <select id="edit_etiqueta" required>
          ${ETIQUETAS.map(et => `<option value="${et}" ${egreso.etiqueta === et ? 'selected' : ''}>${et}</option>`).join('')}
        </select>
      </div>

      <div class="field span6 ${egreso.etiqueta === 'Otro' ? '' : 'hidden'}" id="edit_wrap_otro">
        <label>OTRO CONCEPTO</label>
        <input type="text" id="edit_etiqueta_otro" value="${escapeHtml(egreso.etiqueta_otro || '')}">
      </div>

      <div class="field span6">
        <label>MONEDA *</label>
        <select id="edit_moneda" required>
          <option value="ARS" ${egreso.moneda === 'ARS' ? 'selected' : ''}>ARS (Pesos)</option>
          <option value="USD" ${egreso.moneda === 'USD' ? 'selected' : ''}>USD (Dólares)</option>
          <option value="USDT" ${egreso.moneda === 'USDT' ? 'selected' : ''}>USDT (Tether)</option>
        </select>
      </div>

      <div class="field span6">
        <label>MONTO *</label>
        <input type="text" id="edit_monto" value="${escapeHtml(egreso.monto_raw)}" placeholder="Ej: 12000 o 12000,50" required>
      </div>

      <!-- CAMPOS DE PREMIOS (condicionales) -->
      <div class="field span6 ${esPremio ? '' : 'hidden'}" id="edit_wrap_usuario_casino">
        <label>USUARIO CASINO ${esPremio ? '*' : ''}</label>
        <input type="text" id="edit_usuario_casino" value="${escapeHtml(egreso.usuario_casino || '')}" ${esPremio ? 'required' : ''}>
      </div>

      <div class="field span6 ${esPremio ? '' : 'hidden'}" id="edit_wrap_hora_solicitud">
        <label>HORA SOLICITUD CLIENTE ${esPremio ? '*' : ''}</label>
        <input type="text" id="edit_hora_solicitud_cliente" value="${escapeHtml(egreso.hora_solicitud_cliente || '')}" placeholder="HH:MM" ${esPremio ? 'required' : ''}>
      </div>

      <div class="field span6 ${esPremio ? '' : 'hidden'}" id="edit_wrap_hora_quema">
        <label>HORA QUEMA DE FICHAS ${esPremio ? '*' : ''}</label>
        <input type="time" id="edit_hora_quema_fichas" value="${escapeHtml(egreso.hora_quema_fichas || '')}" ${esPremio ? 'required' : ''}>
      </div>

      <!-- EMPRESA Y CUENTAS -->
      <div class="field span6">
        <label>EMPRESA SALIDA *</label>
        <select id="edit_empresa_salida" required>
          ${EMPRESAS_SALIDA.map(emp => `<option value="${emp}" ${egreso.empresa_salida === emp ? 'selected' : ''}>${emp}</option>`).join('')}
        </select>
      </div>

      <div class="field span6">
        <label>CUENTA SALIDA *</label>
        <input type="text" id="edit_cuenta_salida" value="${escapeHtml(egreso.cuenta_salida)}" required>
      </div>

      <div class="field span6 ${esCierreCaja ? 'hidden' : ''}" id="edit_wrap_id_transferencia">
        <label>ID TRANSFERENCIA</label>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
          <input type="checkbox" id="edit_sin_id_transferencia" ${!egreso.id_transferencia ? 'checked' : ''} style="width:auto;margin:0;">
          <label for="edit_sin_id_transferencia" style="font-weight:normal;font-size:13px;margin:0;cursor:pointer;">Sin ID de transferencia</label>
        </div>
        <input type="text" id="edit_id_transferencia" value="${escapeHtml(egreso.id_transferencia || '')}" placeholder="ID de transferencia" ${!egreso.id_transferencia ? 'style="display:none"' : ''}>
      </div>

      <div class="field span6 ${esCierreCaja ? 'hidden' : ''}" id="edit_wrap_cuenta_receptora">
        <label>CUENTA RECEPTORA ${esCierreCaja ? '' : '*'}</label>
        <input type="text" id="edit_cuenta_receptora" value="${escapeHtml(egreso.cuenta_receptora || '')}" ${esCierreCaja ? '' : 'required'}>
      </div>

      <!-- NOTAS -->
      <div class="field span12">
        <label>NOTAS</label>
        <textarea id="edit_notas" rows="3">${escapeHtml(egreso.notas || '')}</textarea>
      </div>

      <!-- MOTIVO DEL CAMBIO -->
      <div class="field span12" style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px; border-radius: 4px;">
        <label style="color: #92400e; font-weight: 600;">MOTIVO DEL CAMBIO *</label>
        <input type="text" id="edit_motivo" placeholder="Ej: Corrección de monto erróneo" required style="margin-top: 8px;">
        <div class="note" style="color: #78350f; margin-top: 4px;">Obligatorio: Explicá por qué estás modificando este egreso</div>
      </div>

      <!-- BOTONES -->
      <div class="actions span12" style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 16px;">
        <button type="button" class="btn btn-ghost" id="btnCancelarEdicion">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="btnGuardarEdicion">Guardar cambios</button>
      </div>
    </form>
  `;

  // Toggle campos condicionales cuando cambia etiqueta
  const editEtiquetaSelect = document.getElementById('edit_etiqueta');
  if(editEtiquetaSelect){
    editEtiquetaSelect.addEventListener('change', () => {
      const etiquetaValue = editEtiquetaSelect.value;
      const wrapOtro = document.getElementById('edit_wrap_otro');
      const wrapUsuario = document.getElementById('edit_wrap_usuario_casino');
      const wrapHoraSolicitud = document.getElementById('edit_wrap_hora_solicitud');
      const wrapHoraQuema = document.getElementById('edit_wrap_hora_quema');

      // Mostrar/ocultar campo "Otro concepto"
      if(wrapOtro){
        wrapOtro.classList.toggle('hidden', etiquetaValue !== 'Otro');
      }

      // Mostrar/ocultar campos de premios
      const esPremioNuevo = ETIQUETAS_CON_USUARIO_CASINO.has(etiquetaValue);
      if(wrapUsuario) wrapUsuario.classList.toggle('hidden', !esPremioNuevo);
      if(wrapHoraSolicitud) wrapHoraSolicitud.classList.toggle('hidden', !esPremioNuevo);
      if(wrapHoraQuema) wrapHoraQuema.classList.toggle('hidden', !esPremioNuevo);

      // Actualizar required para premios
      const inputUsuario = document.getElementById('edit_usuario_casino');
      const inputHoraSolicitud = document.getElementById('edit_hora_solicitud_cliente');
      const inputHoraQuema = document.getElementById('edit_hora_quema_fichas');

      if(inputUsuario) inputUsuario.required = esPremioNuevo;
      if(inputHoraSolicitud) inputHoraSolicitud.required = esPremioNuevo;
      if(inputHoraQuema) inputHoraQuema.required = esPremioNuevo;

      // Mostrar/ocultar campos para Cierre de Caja
      const esCierreCajaNuevo = ETIQUETAS_CIERRE_CAJA.has(etiquetaValue);
      const wrapIdTransferencia = document.getElementById('edit_wrap_id_transferencia');
      const wrapCuentaReceptora = document.getElementById('edit_wrap_cuenta_receptora');
      const inputIdTransferencia = document.getElementById('edit_id_transferencia');
      const inputCuentaReceptora = document.getElementById('edit_cuenta_receptora');

      if(wrapIdTransferencia) wrapIdTransferencia.classList.toggle('hidden', esCierreCajaNuevo);
      if(wrapCuentaReceptora) wrapCuentaReceptora.classList.toggle('hidden', esCierreCajaNuevo);

      // Actualizar required para Cierre de Caja
      const sinIdCheckboxOnEtiquetaChange = document.getElementById('edit_sin_id_transferencia');
      if(inputIdTransferencia) inputIdTransferencia.required = !esCierreCajaNuevo && !(sinIdCheckboxOnEtiquetaChange?.checked);
      if(inputCuentaReceptora) inputCuentaReceptora.required = !esCierreCajaNuevo;
    });
  }

  // Toggle input de id_transferencia según checkbox "Sin ID"
  const sinIdCheckbox = document.getElementById('edit_sin_id_transferencia');
  if(sinIdCheckbox){
    sinIdCheckbox.addEventListener('change', () => {
      const inputIdTransf = document.getElementById('edit_id_transferencia');
      if(!inputIdTransf) return;
      if(sinIdCheckbox.checked){
        inputIdTransf.style.display = 'none';
        inputIdTransf.required = false;
        inputIdTransf.value = '';
      } else {
        inputIdTransf.style.display = '';
        inputIdTransf.required = true;
      }
    });
  }

  // Manejar submit del formulario
  document.getElementById('formEditarEgreso').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('btnGuardarEdicion');
    const originalText = submitBtn?.textContent || 'Guardar cambios';

    // Deshabilitar botón y mostrar loading
    if(submitBtn){
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      const motivo = document.getElementById('edit_motivo').value.trim();
      if(!motivo){
        toast("Falta motivo", "Debes especificar el motivo del cambio", "warning");
        return;
      }

      // Validar fecha
      const fechaValue = document.getElementById('edit_fecha').value.trim();
      const fechaRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      const fechaMatch = fechaValue.match(fechaRegex);

      if(!fechaMatch){
        toast("Fecha invalida", "Formato debe ser dd/mm/aaaa", "warning");
        return;
      }

      const [_, dia, mes, anio] = fechaMatch;
      const diaNum = parseInt(dia, 10);
      const mesNum = parseInt(mes, 10);
      const anioNum = parseInt(anio, 10);
      const fechaObj = new Date(anioNum, mesNum - 1, diaNum);

      if(
        fechaObj.getFullYear() !== anioNum ||
        (fechaObj.getMonth() + 1) !== mesNum ||
        fechaObj.getDate() !== diaNum
      ){
        toast("Fecha invalida", "La fecha ingresada no existe", "warning");
        return;
      }

      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      fechaObj.setHours(0, 0, 0, 0);
      if(fechaObj > hoy){
        toast("Fecha invalida", "No se permiten fechas futuras", "warning");
        return;
      }

      const montoValue = document.getElementById('edit_monto').value;
      const montoParsed = parseMontoARSStrict(montoValue);

      // Validar monto
      if(!montoParsed || montoParsed <= 0){
        toast("Monto invalido", "Ingresa un monto valido (ej: 12000 o 12000,50)", "warning");
        return;
      }

      const etiquetaEdit = document.getElementById('edit_etiqueta').value;
      const esCierreCajaEdit = ETIQUETAS_CIERRE_CAJA.has(etiquetaEdit);
      const monedaRaw = document.getElementById('edit_moneda').value;
      const monedaEdit = ['ARS', 'USD', 'USDT'].includes(monedaRaw) ? monedaRaw : 'ARS';
      const sinIdEdit = document.getElementById('edit_sin_id_transferencia')?.checked ?? false;
      const idTransferenciaEdit = sinIdEdit ? null : (document.getElementById('edit_id_transferencia')?.value?.trim() || null);
      const cuentaReceptoraEdit = document.getElementById('edit_cuenta_receptora')?.value?.trim() || null;

      if(!esCierreCajaEdit && !cuentaReceptoraEdit){
        toast("Faltan datos", "Completa CUENTA RECEPTORA", "warning");
        return;
      }
      if(!esCierreCajaEdit && !sinIdEdit && !idTransferenciaEdit){
        toast("Faltan datos", "Completa ID TRANSFERENCIA o marca 'Sin ID de transferencia'", "warning");
        return;
      }

      const updates = {
        fecha: fechaValue,
        hora: document.getElementById('edit_hora').value,
        turno: document.getElementById('edit_turno').value,
        etiqueta: etiquetaEdit,
        etiqueta_otro: document.getElementById('edit_etiqueta_otro')?.value || null,
        moneda: monedaEdit,
        monto_raw: montoValue,
        monto: montoParsed,
        usuario_casino: document.getElementById('edit_usuario_casino')?.value || null,
        hora_solicitud_cliente: document.getElementById('edit_hora_solicitud_cliente')?.value || null,
        hora_quema_fichas: document.getElementById('edit_hora_quema_fichas')?.value || null,
        empresa_salida: document.getElementById('edit_empresa_salida').value,
        cuenta_salida: document.getElementById('edit_cuenta_salida').value,
        id_transferencia: esCierreCajaEdit ? null : idTransferenciaEdit,
        cuenta_receptora: esCierreCajaEdit ? null : cuentaReceptoraEdit,
        notas: document.getElementById('edit_notas').value,
        change_reason: motivo
      };

      await api(`/api/egresos/${egreso.id}`, { method: 'PUT', body: updates });
      toast("Actualizado", "Egreso modificado correctamente. Estado cambiado a EDITADA.", "success");
      cerrarModal();
      buscarEgresos(); // Recargar listado
    } catch(err) {
      toast("Error", err.message, "error");
      console.error('Error editando egreso:', err);
    } finally {
      // Rehabilitar botón
      if(submitBtn){
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }
  });

  // Event listener para botón Cancelar
  setTimeout(() => {
    const btnCancelar = document.getElementById("btnCancelarEdicion");
    if(btnCancelar) btnCancelar.addEventListener("click", () => mostrarDetalle(currentEgreso));
  }, 0);

  modal.style.display = "flex";
}

function mostrarModalEliminar(id){
  const confirmacion = confirm(`Estas seguro que queres ELIMINAR el egreso #${id}?\n\nEsta accion NO se puede deshacer.\nEl egreso sera eliminado permanentemente de la base de datos.`);

  if(!confirmacion) return;

  eliminarEgreso(id);
}

async function eliminarEgreso(id){
  try{
    await api(`/api/egresos/${id}`, { method: 'DELETE' });
    toast("Eliminado", "Egreso eliminado correctamente", "success", 5000);
    cerrarModal();
    buscarEgresos(); // Recargar listado
  }catch(err){
    toast("Error", err.message, "error");
  }
}

async function verHistorial(id){
  try{
    const data = await api(`/api/egresos/${id}/history`);

    if(!data.changes || data.changes.length === 0){
      toast("Sin cambios", "Este egreso no tiene historial de modificaciones", "info");
      return;
    }

    mostrarHistorialModal(id, data.changes);

  }catch(err){
    toast("Error", err.message, "error");
  }
}

function mostrarHistorialModal(egresoId, changes){
  const modal = document.getElementById("detalleModal");
  const body = document.getElementById("detalleBody");
  if(!modal || !body) return;

  const rows = changes.map(c => {
    const changeTypeLabel = {
      'CREATE': 'Creado',
      'UPDATE': 'Modificado',
      'ANULAR': 'Anulado',
      'REACTIVAR': 'Reactivado',
      'DELETE': 'Eliminado'
    }[c.change_type] || c.change_type;

    const fieldLabel = {
      'monto': 'Monto',
      'status': 'Estado',
      'fecha': 'Fecha',
      'etiqueta': 'Etiqueta',
      'cuenta_receptora': 'Cuenta Receptora',
      'notas': 'Notas'
    }[c.field_name] || c.field_name;

    return `
      <div style="border-left: 3px solid var(--primary); padding: 12px; margin-bottom: 12px; background: var(--bg-alt); border-radius: 4px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <strong>${changeTypeLabel}</strong>
          <span class="note">${c.created_at_formatted}</span>
        </div>
        <div class="note" style="margin-bottom: 4px;">
          <strong>Por:</strong> ${escapeHtml(c.changed_by_username)} (${c.changed_by_role})
        </div>
        ${c.field_name ? `
          <div class="note" style="margin-bottom: 4px;">
            <strong>Campo:</strong> ${fieldLabel}
          </div>
          <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 8px; align-items: center; margin-top: 8px;">
            <div style="background: #fee2e2; padding: 8px; border-radius: 4px;">
              <span class="note" style="color: #991b1b; font-size: 11px;">ANTES</span>
              <div style="color: #7f1d1d; font-weight: 500;">${escapeHtml(c.old_value || '-')}</div>
            </div>
            <div style="text-align: center;">→</div>
            <div style="background: #d1fae5; padding: 8px; border-radius: 4px;">
              <span class="note" style="color: #065f46; font-size: 11px;">DESPUÉS</span>
              <div style="color: #047857; font-weight: 500;">${escapeHtml(c.new_value || '-')}</div>
            </div>
          </div>
        ` : ''}
        ${c.change_reason ? `
          <div class="note" style="margin-top: 8px; font-style: italic; color: var(--muted);">
            "${escapeHtml(c.change_reason)}"
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  body.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h3 style="margin: 0 0 8px 0;">Historial de cambios</h3>
      <div class="note">Egreso #${egresoId} - ${changes.length} cambio(s) registrado(s)</div>
    </div>
    <div style="max-height: 500px; overflow-y: auto;">
      ${rows}
    </div>
    <div style="margin-top: 16px; text-align: right;">
      <button class="btn btn-ghost" id="btnCerrarHistorial">Cerrar</button>
    </div>
  `;

  modal.style.display = "block";

  // Agregar event listener al botón Cerrar
  setTimeout(() => {
    const btnCerrar = document.getElementById("btnCerrarHistorial");
    if(btnCerrar) btnCerrar.addEventListener("click", cerrarModal);
  }, 0);
}

/* =========================
   DOMCONTENTLOADED - Historial page
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  if(!document.getElementById("egresosTable")) return;
  if(!requireAuth()) return;
  initCommonUI();

  populateFiltrosSelects();

  document.getElementById("filtrosForm")?.addEventListener("submit", handleFiltrosSubmit);
  document.getElementById("btnLimpiar")?.addEventListener("click", limpiarFiltros);
  document.getElementById("btnPrev")?.addEventListener("click", egresosPrev);
  document.getElementById("btnNext")?.addEventListener("click", egresosNext);
  document.getElementById("btnCerrarModal")?.addEventListener("click", cerrarModal);
  document.getElementById("btnDescargarCsvFiltrado")?.addEventListener("click", downloadCSVFiltrado);

  // Toggle de filtros
  document.getElementById("btnToggleFiltros")?.addEventListener("click", (e) => {
    e.stopPropagation(); // Evitar que se dispare el click del header
    toggleFiltros();
  });
  document.getElementById("filtrosHeader")?.addEventListener("click", toggleFiltros);

  // Restaurar estado de filtros desde localStorage
  const filtrosVisible = localStorage.getItem("filtros_visible");
  if(filtrosVisible === "false"){
    const body = document.getElementById("filtrosBody");
    const icon = document.getElementById("filtrosToggleIcon");
    if(body) body.style.display = "none";
    if(icon) icon.textContent = "▲";
  }

  // Cerrar modal al hacer click en el backdrop
  document.querySelector(".modal-backdrop")?.addEventListener("click", cerrarModal);

  // IMPORTANTE: Cargar egresos al iniciar la página
  buscarEgresos();
});
