const ROLES_ARQ = new Set(["admin", "direccion"]);

const estado = {
  resumen: null,
  servicios: [],
  etiquetas: null,
  cuentaDetalle: null,
  detalle: null,
  editandoId: null,
  editandoCuenta: null,
  tarjetaCuenta: null,
  editandoTarjeta: null,
};

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function usd(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `${v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
}

function pesos(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$ ${v.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function claseNum(n) {
  const v = Number(n);
  if (v > 0) return "num-pos";
  if (v < 0) return "num-neg";
  return "";
}

function fechaCorta(iso) {
  const [y, m, d] = String(iso).split("-");
  if (!d) return iso;
  return `${d}/${m}/${y}`;
}

function montoInput(n) {
  return n == null ? "" : String(n).replace(".", ",");
}

function nombreTarjeta(t) {
  const partes = [t.tipo === "global" ? "Global" : "Local"];
  if (t.alias) partes.push(t.alias);
  if (t.ultimos4) partes.push(`•${t.ultimos4}`);
  return partes.join(" ");
}

function cuentas() {
  return estado.resumen?.cuentas || [];
}

function cuentaPorId(id) {
  return cuentas().find((c) => c.id === Number(id)) || null;
}

function opcionesCuentas({ vacio = null, soloActivas = true, excluir = null } = {}) {
  const lista = cuentas().filter((c) => (!soloActivas || c.is_active) && c.id !== excluir);
  const inicio = vacio ? `<option value="">${escapeHtml(vacio)}</option>` : "";
  return inicio + lista.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join("");
}

function abrirModal(id) {
  document.getElementById(id).style.display = "flex";
}

function cerrarModal(id) {
  document.getElementById(id).style.display = "none";
}

/* =========================
   RESUMEN
   ========================= */

function renderAlerta() {
  const r = estado.resumen;
  const partes = [];
  if (r.fondeos_sin_asignar) partes.push(`${r.fondeos_sin_asignar} sin asignar`);
  if (r.fondeos_pendientes) partes.push(`${r.fondeos_pendientes} en pesos sin confirmar los USD`);
  document.getElementById("arqAlerta").innerHTML = partes.length
    ? `<p class="arq-alerta">Hay fondeos a completar: ${partes.join(" y ")}. No suman al saldo hasta que los completes abajo.</p>`
    : "";
}

function renderCuentas() {
  const root = document.getElementById("arqCuentas");
  const lista = cuentas();
  if (!lista.length) {
    root.innerHTML = `<p class="arq-vacio">Todavía no hay cuentas. Creá la primera con "Nueva cuenta".</p>`;
    return;
  }
  root.innerHTML = lista.map((c) => {
    const s = c.saldo || {};
    const transferido = (s.transferido_entrada || 0) - (s.transferido_salida || 0);
    const tarjetas = c.tarjetas.length
      ? c.tarjetas.map((t) => `<button type="button" class="badge${t.is_active ? "" : " no"}" data-accion="editar-tarjeta" data-cuenta="${c.id}" data-id="${t.id}" title="Editar tarjeta">${escapeHtml(nombreTarjeta(t))}</button>`).join("")
      : `<span class="note">Sin tarjetas</span>`;
    const clases = ["arq-cuenta"];
    if (!c.is_active) clases.push("inactiva");
    if (estado.cuentaDetalle === c.id) clases.push("elegida");
    return `<article class="${clases.join(" ")}">
      <div>
        <h3>${escapeHtml(c.nombre)}${c.is_active ? "" : " (inactiva)"}</h3>
        <div class="titular">${escapeHtml([c.titular, c.billetera].filter(Boolean).join(" · "))}</div>
      </div>
      <div class="arq-saldo"><span>Saldo</span><strong class="${claseNum(s.saldo)}">${usd(s.saldo)}</strong></div>
      <div class="arq-mini">
        <div><span>Fondeado</span>${usd(s.fondeado)}</div>
        <div><span>Consumido</span>${usd(s.consumido)}</div>
        <div><span>Transferencias</span><span class="${claseNum(transferido)}" style="font-size:13px;text-transform:none;letter-spacing:0">${usd(transferido)}</span></div>
        <div><span>Ajustes</span>${usd(s.ajustes)}</div>
      </div>
      ${s.fondeos_pendientes ? `<div class="note">${s.fondeos_pendientes} fondeo(s) en pesos sin confirmar</div>` : ""}
      <div class="arq-tarjetas">${tarjetas}</div>
      <div class="row-actions">
        <button type="button" class="btn btn-primary btn-small" data-accion="detalle" data-id="${c.id}">Ver movimientos</button>
        <button type="button" class="btn btn-ghost btn-small" data-accion="nueva-tarjeta" data-id="${c.id}">+ Tarjeta</button>
        <button type="button" class="btn btn-ghost btn-small" data-accion="editar-cuenta" data-id="${c.id}">Editar</button>
      </div>
    </article>`;
  }).join("");
}

function renderSelectsCuentas() {
  const movCuenta = document.getElementById("movCuenta");
  const previa = movCuenta.value;
  movCuenta.innerHTML = opcionesCuentas({ vacio: "Elegí la cuenta" });
  if (previa && cuentaPorId(previa)) movCuenta.value = previa;
  renderSelectTarjetas();
  renderSelectDestino();
  document.getElementById("etiquetaCuenta").innerHTML =
    `<option value="">Genérica: elegir la cuenta en cada egreso</option>` + opcionesCuentas({ soloActivas: false });
}

function renderSelectTarjetas(seleccion) {
  const cuenta = cuentaPorId(document.getElementById("movCuenta").value);
  const sel = document.getElementById("movTarjeta");
  const tarjetas = (cuenta?.tarjetas || []).filter((t) => t.is_active || t.id === seleccion);
  sel.innerHTML = `<option value="">Sin especificar</option>` +
    tarjetas.map((t) => `<option value="${t.id}">${escapeHtml(nombreTarjeta(t))}</option>`).join("");
  if (seleccion) sel.value = String(seleccion);
}

function renderSelectDestino(seleccion) {
  const origen = Number(document.getElementById("movCuenta").value) || null;
  const sel = document.getElementById("movDestino");
  const previa = seleccion ?? sel.value;
  sel.innerHTML = opcionesCuentas({ vacio: "Elegí la cuenta", excluir: origen });
  if (previa && Number(previa) !== origen) sel.value = String(previa);
}

function renderServicios() {
  document.getElementById("servicioLista").innerHTML =
    estado.servicios.map((s) => `<option value="${escapeHtml(s.nombre)}"></option>`).join("");
}

async function cargarResumen() {
  const [resumen, servicios] = await Promise.all([
    api("/api/arq/resumen"),
    api("/api/arq/servicios"),
  ]);
  estado.resumen = resumen;
  estado.servicios = servicios.servicios || [];
  const inicio = fechaCorta(resumen.inicio);
  document.getElementById("arqIntro").textContent =
    `Saldo en USD de cada cuenta desde el ${inicio}: fondeos + transferencias recibidas + ajustes − consumos − transferencias enviadas. Los fondeos salen de los egresos del formulario con una etiqueta de fondeo.`;
  document.getElementById("movFecha").min = resumen.inicio;
  renderAlerta();
  renderCuentas();
  renderSelectsCuentas();
  renderServicios();
}

/* =========================
   CARGA DE MOVIMIENTOS
   ========================= */

function actualizarCamposMovimiento() {
  const tipo = document.getElementById("movTipo").value;
  document.querySelectorAll("#movForm [data-solo]").forEach((el) => {
    el.hidden = el.dataset.solo !== tipo;
  });
  // Solo el consumo puede pagarse en pesos; transferencias y ajustes van en USD.
  if (tipo !== "CONSUMO") document.getElementById("movMoneda").value = "USD";
  const enPesos = document.getElementById("movMoneda").value === "ARS";
  document.getElementById("movOrigenCampo").hidden = !enPesos;
  document.getElementById("movCuentaLabel").textContent = tipo === "TRANSFERENCIA" ? "CUENTA QUE ENVÍA" : "CUENTA";
  document.getElementById("movMontoLabel").textContent = tipo === "AJUSTE"
    ? "MONTO EN USD (NEGATIVO PARA RESTAR)"
    : enPesos ? "USD DESCONTADOS DEL SALDO" : "MONTO EN USD";
  document.getElementById("movNotasLabel").textContent = tipo === "AJUSTE" ? "MOTIVO DEL AJUSTE" : "NOTAS";
}

function datosMovimiento() {
  const tipo = document.getElementById("movTipo").value;
  return {
    tipo,
    cuenta_id: document.getElementById("movCuenta").value,
    cuenta_destino_id: tipo === "TRANSFERENCIA" ? document.getElementById("movDestino").value : null,
    tarjeta_id: tipo === "CONSUMO" ? document.getElementById("movTarjeta").value || null : null,
    servicio: tipo === "CONSUMO" ? document.getElementById("movServicio").value : null,
    fecha: document.getElementById("movFecha").value,
    hora: document.getElementById("movHora").value || null,
    monto_usd: document.getElementById("movMonto").value,
    moneda_origen: tipo === "CONSUMO" ? document.getElementById("movMoneda").value : "USD",
    monto_origen: tipo === "CONSUMO" ? document.getElementById("movOrigen").value || null : null,
    notas: document.getElementById("movNotas").value,
  };
}

function limpiarMovimiento({ mantener = true } = {}) {
  estado.editandoId = null;
  document.getElementById("movTitulo").textContent = "Cargar movimiento";
  document.getElementById("movGuardar").textContent = "Guardar movimiento";
  document.getElementById("movCancelar").style.display = "none";
  ["movServicio", "movHora", "movMonto", "movOrigen", "movNotas"].forEach((id) => {
    document.getElementById(id).value = "";
  });
  if (!mantener) {
    document.getElementById("movTipo").value = "CONSUMO";
    document.getElementById("movMoneda").value = "USD";
    document.getElementById("movFecha").value = hoy();
  }
  actualizarCamposMovimiento();
}

function editarMovimiento(item) {
  estado.editandoId = item.id;
  document.getElementById("movTitulo").textContent = `Editar movimiento #${item.id}`;
  document.getElementById("movGuardar").textContent = "Guardar cambios";
  document.getElementById("movCancelar").style.display = "";
  document.getElementById("movTipo").value = item.tipo;
  document.getElementById("movCuenta").value = String(item.cuenta_id);
  renderSelectTarjetas(item.tarjeta_id);
  renderSelectDestino(item.cuenta_destino_id);
  document.getElementById("movServicio").value = item.servicio || "";
  document.getElementById("movFecha").value = item.fecha;
  document.getElementById("movHora").value = item.hora || "";
  document.getElementById("movMonto").value = montoInput(item.monto_usd);
  document.getElementById("movMoneda").value = item.moneda_origen || "USD";
  document.getElementById("movOrigen").value = montoInput(item.monto_origen);
  document.getElementById("movNotas").value = item.nota || "";
  actualizarCamposMovimiento();
  document.getElementById("movCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function guardarMovimiento(ev) {
  ev.preventDefault();
  const btn = document.getElementById("movGuardar");
  btn.disabled = true;
  try {
    const body = datosMovimiento();
    if (estado.editandoId) {
      await api(`/api/arq/movimientos/${estado.editandoId}`, { method: "PUT", body });
      toast("Listo", "Movimiento actualizado", "success");
    } else {
      await api("/api/arq/movimientos", { method: "POST", body });
      toast("Listo", "Movimiento guardado", "success");
    }
    // Queda el tipo, la cuenta y la fecha para seguir cargando el mismo día.
    limpiarMovimiento();
    await refrescar();
  } catch (e) {
    toast("No se guardó", e.message || "No pude guardar el movimiento", "error");
  } finally {
    btn.disabled = false;
  }
}

async function anularMovimiento(id) {
  const motivo = window.prompt("¿Por qué se anula este movimiento?");
  if (motivo == null) return;
  if (!motivo.trim()) {
    toast("Falta el motivo", "Contá por qué se anula", "warning");
    return;
  }
  try {
    await api(`/api/arq/movimientos/${id}/anular`, { method: "POST", body: { motivo } });
    toast("Listo", "Movimiento anulado", "success");
    if (estado.editandoId === id) limpiarMovimiento();
    await refrescar();
  } catch (e) {
    toast("No se anuló", e.message || "No pude anular el movimiento", "error");
  }
}

/* =========================
   FONDEOS A COMPLETAR
   ========================= */

function filaFondeo(f) {
  const enPesos = String(f.moneda).toUpperCase() === "ARS";
  const monto = enPesos ? pesos(f.monto_egreso) : `${Number(f.monto_egreso).toLocaleString("es-AR", { minimumFractionDigits: 2 })} ${escapeHtml(f.moneda)}`;
  const origen = [f.empresa, f.cuenta_salida].filter(Boolean).join(" · ");
  const usdCampo = enPesos
    ? `<input class="arq-fondeo-usd" data-campo="usd" inputmode="decimal" placeholder="USD" value="${escapeHtml(montoInput(f.monto_usd))}">`
    : `<span class="note">${usd(f.monto_usd)}</span>`;
  return `<tr data-egreso="${f.egreso_id}">
    <td>${fechaCorta(f.fecha)} ${escapeHtml(f.hora || "")}</td>
    <td>${escapeHtml(f.etiqueta)}<div class="note">Egreso #${f.egreso_id}${origen ? ` · ${escapeHtml(origen)}` : ""}${f.nota ? ` · ${escapeHtml(f.nota)}` : ""}</div></td>
    <td>${monto}</td>
    <td><select class="arq-fondeo-cuenta" data-campo="cuenta">${opcionesCuentas({ vacio: "Elegí la cuenta", soloActivas: false })}</select></td>
    <td>${usdCampo}</td>
    <td class="row-actions">
      <button type="button" class="btn btn-primary btn-small" data-accion="guardar-fondeo">Guardar</button>
      <button type="button" class="btn btn-ghost btn-small" data-accion="descartar-fondeo">No es fondeo</button>
    </td>
  </tr>`;
}

async function cargarFondeos() {
  const root = document.getElementById("fondeosLista");
  const [sinAsignar, pendientes] = await Promise.all([
    api("/api/arq/fondeos?estado=sin_asignar"),
    api("/api/arq/fondeos?estado=pendiente"),
  ]);
  const lista = [...sinAsignar.fondeos, ...pendientes.fondeos]
    .sort((a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || "")));
  document.getElementById("fondeosCard").style.display = lista.length ? "" : "none";
  if (!lista.length) {
    root.innerHTML = "";
    return;
  }
  root.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Fecha</th><th>Egreso</th><th>Monto</th><th>Cuenta</th><th>USD acreditados</th><th></th></tr></thead>
    <tbody>${lista.map(filaFondeo).join("")}</tbody>
  </table></div>`;
  for (const f of lista) {
    const sel = root.querySelector(`tr[data-egreso="${f.egreso_id}"] select`);
    if (sel && f.cuenta_id) sel.value = String(f.cuenta_id);
  }
}

async function guardarFondeo(fila, descartado) {
  const egresoId = fila.dataset.egreso;
  const cuenta = fila.querySelector('[data-campo="cuenta"]').value;
  const usdInput = fila.querySelector('[data-campo="usd"]');
  if (!descartado && !cuenta) {
    toast("Falta la cuenta", "Elegí a qué cuenta fue el fondeo", "warning");
    return;
  }
  if (descartado && !window.confirm("¿Este egreso no fue un fondeo de una cuenta ARQ? Deja de aparecer acá y no suma a ningún saldo.")) return;
  try {
    await api(`/api/arq/fondeos/${egresoId}`, {
      method: "PUT",
      body: {
        cuenta_id: cuenta || null,
        monto_usd: usdInput ? usdInput.value || null : null,
        descartado,
      },
    });
    toast("Listo", descartado ? "Egreso descartado" : "Fondeo guardado", "success");
    await refrescar();
  } catch (e) {
    toast("No se guardó", e.message || "No pude guardar el fondeo", "error");
  }
}

/* =========================
   DETALLE DE UNA CUENTA
   ========================= */

function conceptoItem(item) {
  if (item.origen === "fondeo") {
    const pago = String(item.moneda).toUpperCase() === "ARS" ? ` · se pagaron ${pesos(item.monto_egreso)}` : "";
    const pend = item.estado === "pendiente" ? " · falta confirmar los USD" : "";
    return `Fondeo · ${item.etiqueta} · egreso #${item.egreso_id}${pago}${pend}`;
  }
  if (item.tipo === "CONSUMO") {
    const tarjeta = item.tarjeta_tipo ? ` · ${nombreTarjeta({ tipo: item.tarjeta_tipo, alias: item.tarjeta_alias, ultimos4: item.tarjeta_ultimos4 })}` : "";
    const pago = item.moneda_origen === "ARS" && item.monto_origen ? ` · se pagaron ${pesos(item.monto_origen)}` : "";
    return `${item.servicio}${tarjeta}${pago}`;
  }
  if (item.tipo === "TRANSFERENCIA") {
    return item.signo > 0 ? `Transferencia de ${item.cuenta_origen}` : `Transferencia a ${item.cuenta_destino}`;
  }
  return "Ajuste de saldo";
}

function montoItem(item) {
  if (item.origen === "fondeo" && item.monto_usd == null) return `<span class="note">pendiente</span>`;
  const v = item.signo * Math.abs(Number(item.monto_usd));
  if (item.tipo === "AJUSTE") return `<span class="${claseNum(item.monto_usd)}">${usd(item.monto_usd)}</span>`;
  return `<span class="${claseNum(v)}">${usd(v)}</span>`;
}

function filtrarItems(items) {
  const tarjeta = document.getElementById("detTarjeta").value;
  const servicio = document.getElementById("detServicio").value;
  return items.filter((item) => {
    if (tarjeta && String(item.tarjeta_id) !== tarjeta) return false;
    if (servicio && item.servicio !== servicio) return false;
    return true;
  });
}

function aporteItem(item) {
  if (item.origen === "fondeo") return item.monto_usd == null ? 0 : Number(item.monto_usd);
  if (item.tipo === "AJUSTE") return Number(item.monto_usd);
  return item.signo * Math.abs(Number(item.monto_usd));
}

function renderDetalle() {
  const root = document.getElementById("detalleLista");
  const items = filtrarItems(estado.detalle?.items || []);
  if (!items.length) {
    root.innerHTML = `<p class="arq-vacio">Sin movimientos en este período.</p>`;
    return;
  }
  const dias = new Map();
  for (const item of items) {
    if (!dias.has(item.fecha)) dias.set(item.fecha, []);
    dias.get(item.fecha).push(item);
  }
  let entro = 0;
  let salio = 0;
  const filas = [...dias.entries()].map(([fecha, lista]) => {
    let e = 0;
    let s = 0;
    for (const item of lista) {
      const v = aporteItem(item);
      if (v > 0) e += v; else s -= v;
    }
    entro += e;
    salio += s;
    const id = `arq-dia-${fecha}`;
    const movs = lista.map((item) => {
      const acciones = item.origen === "movimiento"
        ? `<button type="button" class="btn btn-ghost btn-small" data-accion="editar-mov" data-id="${item.id}">Editar</button>
           <button type="button" class="btn btn-danger btn-small" data-accion="anular-mov" data-id="${item.id}">Anular</button>`
        : "";
      const extra = [item.hora, item.nota, item.cargado_por ? `cargó ${item.cargado_por}` : ""].filter(Boolean).join(" · ");
      return `<tr>
        <td>${escapeHtml(conceptoItem(item))}${extra ? `<div class="note">${escapeHtml(extra)}</div>` : ""}</td>
        <td>${montoItem(item)}</td>
        <td class="row-actions">${acciones}</td>
      </tr>`;
    }).join("");
    return `<tr>
      <td><button type="button" class="arq-dia-btn" aria-expanded="false" aria-controls="${id}">${fechaCorta(fecha)}</button></td>
      <td class="${e ? "num-pos" : ""}">${e ? usd(e) : "—"}</td>
      <td class="${s ? "num-neg" : ""}">${s ? usd(s) : "—"}</td>
      <td class="${claseNum(e - s)}">${usd(e - s)}</td>
    </tr>
    <tr id="${id}" class="arq-dia-detalle" hidden>
      <td colspan="4"><table class="table"><tbody>${movs}</tbody></table></td>
    </tr>`;
  }).join("");
  root.innerHTML = `<p class="note">En el período: entró ${usd(entro)}, salió ${usd(salio)}, neto <strong class="${claseNum(entro - salio)}">${usd(entro - salio)}</strong>. Tocá la fecha para ver los movimientos.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Fecha</th><th>Entró</th><th>Salió</th><th>Neto</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>`;
}

function renderFiltrosDetalle() {
  const cuenta = cuentaPorId(estado.cuentaDetalle);
  const items = estado.detalle?.items || [];
  const tarjetaSel = document.getElementById("detTarjeta");
  const servicioSel = document.getElementById("detServicio");
  const tPrev = tarjetaSel.value;
  const sPrev = servicioSel.value;
  tarjetaSel.innerHTML = `<option value="">Todas</option>` +
    (cuenta?.tarjetas || []).map((t) => `<option value="${t.id}">${escapeHtml(nombreTarjeta(t))}</option>`).join("");
  const servicios = [...new Set(items.map((i) => i.servicio).filter(Boolean))].sort();
  servicioSel.innerHTML = `<option value="">Todos</option>` +
    servicios.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
  if ([...tarjetaSel.options].some((o) => o.value === tPrev)) tarjetaSel.value = tPrev;
  if ([...servicioSel.options].some((o) => o.value === sPrev)) servicioSel.value = sPrev;
}

async function cargarDetalle() {
  if (!estado.cuentaDetalle) return;
  const desde = document.getElementById("detDesde").value;
  const hasta = document.getElementById("detHasta").value;
  const params = new URLSearchParams();
  if (desde) params.set("desde", desde);
  if (hasta) params.set("hasta", hasta);
  estado.detalle = await api(`/api/arq/cuentas/${estado.cuentaDetalle}/detalle?${params}`);
  document.getElementById("detalleTitulo").textContent = `Movimientos de ${estado.detalle.cuenta.nombre}`;
  document.getElementById("detalleCard").style.display = "";
  renderFiltrosDetalle();
  renderDetalle();
}

async function verDetalle(id) {
  estado.cuentaDetalle = id;
  document.getElementById("detTarjeta").value = "";
  document.getElementById("detServicio").value = "";
  renderCuentas();
  try {
    await cargarDetalle();
    document.getElementById("detalleCard").scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (e) {
    toast("Error", e.message || "No pude leer los movimientos", "error");
  }
}

/* =========================
   ETIQUETAS DE FONDEO
   ========================= */

function renderEtiquetas() {
  const data = estado.etiquetas;
  const root = document.getElementById("etiquetasLista");
  root.innerHTML = data.etiquetas.length
    ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Etiqueta</th><th>Cuenta</th><th></th></tr></thead>
        <tbody>${data.etiquetas.map((e) => `<tr>
          <td>${escapeHtml(e.etiqueta)}</td>
          <td>${e.cuenta ? escapeHtml(e.cuenta) : `<span class="note">Genérica</span>`}</td>
          <td><button type="button" class="btn btn-ghost btn-small" data-accion="quitar-etiqueta" data-etiqueta="${escapeHtml(e.etiqueta)}">Quitar</button></td>
        </tr>`).join("")}</tbody>
      </table></div>`
    : `<p class="arq-vacio">Todavía no hay etiquetas de fondeo. Sin etiquetas no entra ningún fondeo.</p>`;
  document.getElementById("etiquetaValor").innerHTML = `<option value="">Elegí la etiqueta</option>` +
    data.disponibles.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
}

async function cargarEtiquetas() {
  estado.etiquetas = await api("/api/arq/etiquetas");
  renderEtiquetas();
}

async function guardarEtiqueta(ev) {
  ev.preventDefault();
  const etiqueta = document.getElementById("etiquetaValor").value;
  if (!etiqueta) {
    toast("Falta la etiqueta", "Elegí la etiqueta del formulario", "warning");
    return;
  }
  try {
    await api("/api/arq/etiquetas", {
      method: "PUT",
      body: { etiqueta, cuenta_id: document.getElementById("etiquetaCuenta").value || null },
    });
    toast("Listo", "Etiqueta de fondeo guardada", "success");
    await Promise.all([cargarEtiquetas(), refrescar()]);
  } catch (e) {
    toast("No se guardó", e.message || "No pude guardar la etiqueta", "error");
  }
}

async function quitarEtiqueta(etiqueta) {
  if (!window.confirm(`¿Quitar "${etiqueta}" de las etiquetas de fondeo? Sus egresos dejan de sumar al saldo de las cuentas.`)) return;
  try {
    await api(`/api/arq/etiquetas/${encodeURIComponent(etiqueta)}`, { method: "DELETE" });
    toast("Listo", "Etiqueta quitada", "success");
    await Promise.all([cargarEtiquetas(), refrescar()]);
  } catch (e) {
    toast("No se quitó", e.message || "No pude quitar la etiqueta", "error");
  }
}

/* =========================
   CUENTAS Y TARJETAS (modales)
   ========================= */

const CAMPOS_CUENTA = { cuNombre: "nombre", cuTitular: "titular", cuBilletera: "billetera", cuAlias: "alias", cuWallet: "wallet", cuTelefono: "telefono", cuNotas: "notas" };

function abrirCuenta(id) {
  const c = id ? cuentaPorId(id) : null;
  estado.editandoCuenta = c ? c.id : null;
  document.getElementById("cuentaModalTitulo").textContent = c ? `Editar ${c.nombre}` : "Nueva cuenta";
  for (const [campo, clave] of Object.entries(CAMPOS_CUENTA)) {
    document.getElementById(campo).value = c?.[clave] || (clave === "billetera" ? "ARQ" : "");
  }
  document.getElementById("cuActivaCampo").hidden = !c;
  document.getElementById("cuActiva").checked = c ? !!c.is_active : true;
  abrirModal("cuentaModal");
  document.getElementById("cuNombre").focus();
}

async function guardarCuenta(ev) {
  ev.preventDefault();
  const body = {};
  for (const [campo, clave] of Object.entries(CAMPOS_CUENTA)) body[clave] = document.getElementById(campo).value;
  try {
    if (estado.editandoCuenta) {
      body.is_active = document.getElementById("cuActiva").checked;
      await api(`/api/arq/cuentas/${estado.editandoCuenta}`, { method: "PUT", body });
    } else {
      await api("/api/arq/cuentas", { method: "POST", body });
    }
    cerrarModal("cuentaModal");
    toast("Listo", "Cuenta guardada", "success");
    await Promise.all([refrescar(), cargarEtiquetas()]);
  } catch (e) {
    toast("No se guardó", e.message || "No pude guardar la cuenta", "error");
  }
}

function abrirTarjeta(cuentaId, tarjetaId) {
  const cuenta = cuentaPorId(cuentaId);
  const t = tarjetaId ? cuenta?.tarjetas.find((x) => x.id === Number(tarjetaId)) : null;
  estado.tarjetaCuenta = cuenta?.id || null;
  estado.editandoTarjeta = t ? t.id : null;
  document.getElementById("tarjetaModalTitulo").textContent = t ? `Editar tarjeta de ${cuenta.nombre}` : `Nueva tarjeta de ${cuenta?.nombre || ""}`;
  document.getElementById("taTipo").value = t?.tipo || "global";
  document.getElementById("taUltimos4").value = t?.ultimos4 || "";
  document.getElementById("taAlias").value = t?.alias || "";
  document.getElementById("taActivaCampo").hidden = !t;
  document.getElementById("taActiva").checked = t ? !!t.is_active : true;
  abrirModal("tarjetaModal");
}

async function guardarTarjeta(ev) {
  ev.preventDefault();
  const body = {
    tipo: document.getElementById("taTipo").value,
    ultimos4: document.getElementById("taUltimos4").value,
    alias: document.getElementById("taAlias").value,
  };
  try {
    if (estado.editandoTarjeta) {
      body.is_active = document.getElementById("taActiva").checked;
      await api(`/api/arq/tarjetas/${estado.editandoTarjeta}`, { method: "PUT", body });
    } else {
      body.cuenta_id = estado.tarjetaCuenta;
      await api("/api/arq/tarjetas", { method: "POST", body });
    }
    cerrarModal("tarjetaModal");
    toast("Listo", "Tarjeta guardada", "success");
    await refrescar();
  } catch (e) {
    toast("No se guardó", e.message || "No pude guardar la tarjeta", "error");
  }
}

/* =========================
   ARRANQUE
   ========================= */

async function refrescar() {
  await Promise.all([cargarResumen(), cargarFondeos()]);
  if (estado.cuentaDetalle) await cargarDetalle();
}

function manejarClick(ev) {
  const btn = ev.target.closest("[data-accion], [data-cerrar], .arq-dia-btn");
  if (!btn) return;
  if (btn.dataset.cerrar) {
    cerrarModal(btn.dataset.cerrar);
    return;
  }
  if (btn.classList.contains("arq-dia-btn")) {
    const fila = document.getElementById(btn.getAttribute("aria-controls"));
    if (!fila) return;
    const abrir = fila.hidden;
    fila.hidden = !abrir;
    btn.setAttribute("aria-expanded", String(abrir));
    return;
  }
  const id = Number(btn.dataset.id);
  switch (btn.dataset.accion) {
    case "detalle": verDetalle(id); break;
    case "editar-cuenta": abrirCuenta(id); break;
    case "nueva-tarjeta": abrirTarjeta(id); break;
    case "editar-tarjeta": abrirTarjeta(Number(btn.dataset.cuenta), id); break;
    case "editar-mov": {
      const item = estado.detalle?.items.find((i) => i.origen === "movimiento" && i.id === id);
      if (item) editarMovimiento(item);
      break;
    }
    case "anular-mov": anularMovimiento(id); break;
    case "guardar-fondeo": guardarFondeo(btn.closest("tr"), false); break;
    case "descartar-fondeo": guardarFondeo(btn.closest("tr"), true); break;
    case "quitar-etiqueta": quitarEtiqueta(btn.dataset.etiqueta); break;
    default: break;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  await initCommonUI();
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);
  if (!ROLES_ARQ.has(getUser().role)) {
    window.location.replace("egreso.html");
    return;
  }

  document.addEventListener("click", manejarClick);
  document.getElementById("movTipo").addEventListener("change", actualizarCamposMovimiento);
  document.getElementById("movMoneda").addEventListener("change", actualizarCamposMovimiento);
  document.getElementById("movCuenta").addEventListener("change", () => {
    renderSelectTarjetas();
    renderSelectDestino();
  });
  document.getElementById("movForm").addEventListener("submit", guardarMovimiento);
  document.getElementById("movCancelar").addEventListener("click", () => limpiarMovimiento());
  document.getElementById("detalleForm").addEventListener("submit", (ev) => {
    ev.preventDefault();
    cargarDetalle().catch((e) => toast("Error", e.message || "No pude leer los movimientos", "error"));
  });
  document.getElementById("detTarjeta").addEventListener("change", renderDetalle);
  document.getElementById("detServicio").addEventListener("change", renderDetalle);
  document.getElementById("etiquetaForm").addEventListener("submit", guardarEtiqueta);
  document.getElementById("btnNuevaCuenta").addEventListener("click", () => abrirCuenta(null));
  document.getElementById("cuentaForm").addEventListener("submit", guardarCuenta);
  document.getElementById("tarjetaForm").addEventListener("submit", guardarTarjeta);

  limpiarMovimiento({ mantener: false });
  try {
    await refrescar();
    await cargarEtiquetas();
  } catch (e) {
    document.getElementById("arqCuentas").innerHTML = `<p class="arq-vacio">${escapeHtml(e.message || "No pude cargar las cuentas ARQ")}</p>`;
  }
});
