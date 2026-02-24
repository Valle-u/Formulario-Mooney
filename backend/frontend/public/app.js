/* =========================
   CONFIGURACIÓN
   ========================= */
// Detectar API_BASE automáticamente según el entorno
const API_BASE = (() => {
  // Si existe window.ENV_API_BASE (inyectado por servidor), usarlo
  if (typeof window.ENV_API_BASE !== 'undefined') {
    return window.ENV_API_BASE;
  }

  // Detección automática basada en hostname
  const hostname = window.location.hostname;

  // Producción en Seenode o similares (mismo servidor sirve frontend y backend)
  if (hostname.includes('seenode.com') || hostname.includes('render.com') || hostname.includes('railway.app')) {
    return window.location.origin; // Mismo origen, sin puerto adicional
  }

  // Desarrollo local (frontend y backend en puertos diferentes)
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:4000';
  }

  // Fallback: mismo origen que el frontend
  return window.location.origin;
})();

const STORAGE_KEY_TOKEN = "mm_token";
const STORAGE_KEY_USER = "mm_user";

console.log('🔌 API_BASE:', API_BASE);

/* =========================
   DATOS (selects)
   ========================= */
const EMPRESAS_SALIDA = ["Telepagos", "Copter", "Palta", "Personal Pay", "Lemoncash", "NaranjaX", "TrustWallet", "Mercado Pago", "Brubank", "Binance", "AstroPay", "DolarApp", "Uala", "Cuenta DNI", "Lohas", "Otra (Especificar en notas)"];

const ETIQUETAS = [
  // Unidad M
  "[Unidad M] Deposito de cliente",
  "[Unidad M] Premio Pagado",
  "[Unidad M] Premio por Sorteo",
  "[Unidad M] Pago de sueldo",
  "[Unidad M] Pago de Utilidades",
  "[Unidad M] Gasto de cuenta",
  "[Unidad M] Transferencia Rechazada",
  "[Unidad M] IVA",
  "[Unidad M] Adelanto de sueldo",
  "[Unidad M] Redireccion de capital",
  "[Unidad M] Pago de premios duplicado",
  "[Unidad M] Pago LiveChat",
  "[Unidad M]  Prueba Casa",
  "[Unidad M]  Duplicado",
  "[Unidad M]  Error Empleado",
  "[Unidad M]  Devolucion",
  "[Unidad M]  NO ESTA EN FORMULARIO",
  "[Unidad M]  No esta en la planilla empleados",
  "[Unidad M] Pago de Estructura",
  // Programacion
  "[Programacion] Pago de servidor",
  "[Programacion] Pago de fichas",
  "[Programacion] Costo Fijo",
  "[Programacion] Inversion",
  // Publicidad
  "[Publicidad]Gasto Fijo",
  "[Publicidad] Inversion",
  "[Publicidad] Pago Publicista",
  // Unidad CRM
  "[Unidad CRM]Gasto Fijo",
  // Unidad Reca
  "[Unidad Reca]Inversion",
  "[Unidad Reca] Costo Fijo",
  "[Unidad Reca] Cuenta Comprada",
  // Granja
  "[Granja] Costo Fijo",
  "[Granja] Inversion",
  "[Granja] Plan de Datos",
  // Otra
  "[Otra] Cambio a USD",
  "[Otra] Cambio a USDT",
  "[Otra] Cambio a Peso Fisico",
  "[Otra] Gasto Personal Dragon",
  "[Otra] Gasto Personal William",
  "[Otra] Gasto limpieza",
  "[Otra] Gasto de Cocina",
  "[Otra] ROBO",
  "[Otra] Recepcion de USDT",
  "[Otra] Recepcion de USD",
  "[Otra] Recepcion Dolar Fisico",
  "[Otra] Recepcion Peso Fisico",
  "[Otra] Cambio a Pesos",
  "[Otra] Devolucion de Prestamo",
  // Especiales
  "Cierre de Caja",
  "Otro"
];

const ETIQUETAS_CON_USUARIO_CASINO = new Set([
  "[Unidad M] Premio Pagado"
]);

const ETIQUETAS_CIERRE_CAJA = new Set([
  "Cierre de Caja"
]);

const ETIQUETAS_PREMIO_MINIMO = new Set(["[Unidad M] Premio Pagado"]);

/* =========================
   DETECCIÓN DE PÁGINA USD
   ========================= */
// Detectar página actual para determinar moneda y tipo
const IS_USD_PAGE = window.location.pathname.includes('flujo-usd');

// Detectar página de saldos (nueva funcionalidad en tiempo real)
const IS_SALDOS_PAGE = window.location.pathname.includes('saldos.html');

// Handler para cambiar labels según tipo de transacción
function handleTipoTransaccionChange() {
  const tipo = document.getElementById("tipo_transaccion")?.value;

  // Labels de cuentas
  const labelCuentaSalida = document.querySelector('label[for="cuenta_salida"]');
  const labelCuentaReceptora = document.querySelector('label[for="cuenta_receptora"]');

  if (tipo === 'ENTRADA') {
    // Para ENTRADA: invertir semántica
    if (labelCuentaSalida) labelCuentaSalida.textContent = 'TITULAR CUENTA EMISORA (quien envía) *';
    if (labelCuentaReceptora) labelCuentaReceptora.textContent = 'TITULAR CUENTA RECEPTORA (nuestra cuenta) *';

    // ID transferencia opcional para ENTRADA
    const idTransferenciaInput = document.getElementById("id_transferencia");
    if (idTransferenciaInput) idTransferenciaInput.removeAttribute('required');
  } else if (tipo === 'SALIDA') {
    // Para SALIDA: mantener labels originales
    if (labelCuentaSalida) labelCuentaSalida.textContent = 'TITULAR CUENTA SALIDA *';
    if (labelCuentaReceptora) labelCuentaReceptora.textContent = 'TITULAR CUENTA RECEPTORA';

    // ID transferencia requerido para SALIDA
    const idTransferenciaInput = document.getElementById("id_transferencia");
    if (idTransferenciaInput) idTransferenciaInput.setAttribute('required', 'required');
  }
}

/* =========================
   TOAST - Sistema Unificado
   ========================= */
function toast(title, msg, type = "error", duration = null){
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = {
    success: "✅",
    warning: "⚠️",
    error: "❌",
    info: "ℹ️"
  };

  const toastEl = document.createElement("div");
  toastEl.className = `toast ${type}`;

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = icons[type] || icons.info;

  const content = document.createElement("div");
  content.className = "toast-content";

  const titleEl = document.createElement("div");
  titleEl.className = "toast-title";
  titleEl.textContent = title;

  const messageEl = document.createElement("div");
  messageEl.className = "toast-message";
  messageEl.textContent = msg || "";

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Cerrar notificación");
  closeBtn.addEventListener("click", () => toastEl.remove());

  content.appendChild(titleEl);
  content.appendChild(messageEl);

  toastEl.appendChild(icon);
  toastEl.appendChild(content);
  toastEl.appendChild(closeBtn);

  container.appendChild(toastEl);

  // Duración personalizable
  const finalDuration = duration || (type === "error" ? 8000 : type === "success" ? 7000 : 5000);

  setTimeout(() => {
    toastEl.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => toastEl.remove(), 300);
  }, finalDuration);
}

/* =========================
   SANITIZACIÓN XSS
   ========================= */
function escapeHtml(unsafe) {
  if (unsafe === null || unsafe === undefined) return '';
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* =========================
   MOSTRAR/OCULTAR CONTRASEÑA
   ========================= */
function togglePasswordVisibility(inputId, button) {
  const input = document.getElementById(inputId);
  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    button.style.opacity = "1";
    button.textContent = "🙈"; // Cambia a "ocultar"
  } else {
    input.type = "password";
    button.style.opacity = "0.6";
    button.textContent = "👁️"; // Cambia a "mostrar"
  }
}

// Inicializar event listeners para todos los botones de toggle de contraseña
function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach(button => {
    const targetId = button.getAttribute('data-target');
    if (targetId) {
      button.addEventListener('click', function() {
        togglePasswordVisibility(targetId, this);
      });
    }
  });
}

// Ejecutar inmediatamente para que esté disponible en todas las páginas
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPasswordToggles);
} else {
  initPasswordToggles();
}

// Saldo en tiempo real: inicializar
document.addEventListener('DOMContentLoaded', () => {
  // La inicialización completa de saldos vive en initSaldosPage (sección dedicada).
  // Evitar inicializaciones duplicadas en saldos.html.
  if (IS_SALDOS_PAGE) return;

  // Populate filters if present
  if (typeof EMPRESAS_SALIDA !== 'undefined' && document.getElementById('filtro_empresa')) {
    populateSaldosFilters();
  }
  // If on saldos page, load initial saldos
  if (IS_SALDOS_PAGE) {
    cargarSaldos();
    const btn = document.getElementById('btnCargarSaldos');
    if (btn) btn.addEventListener('click', cargarSaldos);
  }
});

/* =========================
   STORAGE / AUTH
   ========================= */
function setToken(t){ localStorage.setItem(STORAGE_KEY_TOKEN, t); }
function getToken(){ return localStorage.getItem(STORAGE_KEY_TOKEN); }
function clearToken(){ localStorage.removeItem(STORAGE_KEY_TOKEN); }

function setUser(u){ localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(u||{})); }
function getUser(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY_USER) || "{}"); }
  catch{ return {}; }
}
function clearUser(){ localStorage.removeItem(STORAGE_KEY_USER); }

// Decodificar JWT sin verificar firma (solo para leer expiración client-side)
function decodeJWTPayload(token){
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch { return null; }
}

// Verificar si el token está expirado (con margen de 60s)
function isTokenExpired(){
  const token = getToken();
  if(!token) return true;
  const payload = decodeJWTPayload(token);
  if(!payload || !payload.exp) return true;
  // Token expirado si faltan menos de 60s
  return (payload.exp * 1000) < (Date.now() + 60000);
}

function requireAuth(){
  if(!getToken() || isTokenExpired()){
    clearToken(); clearUser();
    window.location.href = "index.html";
    return false;
  }
  return true;
}

/* =========================
   TIMEOUT DE SESIÓN POR INACTIVIDAD
   ========================= */
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos
const WARNING_BEFORE_LOGOUT_MS = 2 * 60 * 1000; // Advertir 2 minutos antes
let inactivityTimer = null;
let warningTimer = null;
let warningShown = false;

function resetInactivityTimer(){
  // Limpiar timers existentes
  if(inactivityTimer) clearTimeout(inactivityTimer);
  if(warningTimer) clearTimeout(warningTimer);
  warningShown = false;

  // Timer para mostrar advertencia
  warningTimer = setTimeout(() => {
    if(!warningShown){
      warningShown = true;
      toast("⚠️ Inactividad", "Tu sesión expirará en 2 minutos por inactividad", "warning");
    }
  }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_LOGOUT_MS);

  // Timer para logout automático
  inactivityTimer = setTimeout(() => {
    toast("⏱️ Sesión expirada", "Tu sesión ha expirado por inactividad", "error");
    setTimeout(() => {
      clearToken();
      clearUser();
      window.location.href = "index.html";
    }, 1500);
  }, INACTIVITY_TIMEOUT_MS);
}

function setupInactivityMonitor(){
  // Solo activar en páginas protegidas (no en login)
  if(!getToken()) return;

  // Eventos que resetean el timer
  const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

  events.forEach(event => {
    document.addEventListener(event, resetInactivityTimer, { passive: true });
  });

  // Iniciar el timer
  resetInactivityTimer();

  // Cuando el usuario vuelve a la pestaña (especialmente en mobile), verificar token
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && isTokenExpired()){
      clearToken(); clearUser();
      toast("⏱️ Sesión expirada", "Tu sesión expiró. Volvé a iniciar sesión.", "error");
      setTimeout(() => { window.location.href = "index.html"; }, 1500);
    }
  });

  console.log('🔒 Monitor de inactividad activado (timeout: 30 min)');
}

/* =========================
   API
   ========================= */
async function api(path, {method="GET", body=null, auth=true, timeout=60000} = {}){
  // Verificar token antes de hacer la request (evita perder datos en formularios)
  if(auth && isTokenExpired()){
    clearToken(); clearUser();
    toast("⏱️ Sesión expirada", "Tu sesión expiró. Volvé a iniciar sesión.", "error");
    setTimeout(() => { window.location.href = "index.html"; }, 1500);
    throw new Error("Sesión expirada");
  }

  const headers = {};
  if(!(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if(auth){
    const t = getToken();
    if(t) headers["Authorization"] = `Bearer ${t}`;
  }

  // Crear AbortController para timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(API_BASE + path, {
      method,
      headers,
      body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : null,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if(res.status === 401 && auth){
      clearToken(); clearUser();
      window.location.href = "index.html";
      throw new Error("Sesión expirada. Volvé a iniciar sesión.");
    }

    const contentType = res.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const data = isJson ? await res.json().catch(()=>null) : await res.text().catch(()=>null);

    if(!res.ok){
      let msg = (data && data.message) ? data.message : (data || `Error ${res.status}`);
      if(data && data.detail) msg += ` (${data.detail})`;
      throw new Error(msg);
    }
    return data;
  } catch(err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error("La solicitud tardó demasiado. Verificá tu conexión e intentá nuevamente.");
    }
    throw err;
  }
}

/* =========================
   LOGIN
   ========================= */
async function handleLogin(e){
  e.preventDefault();
  const username = document.getElementById("username")?.value?.trim() || "";
  const password = document.getElementById("password")?.value || "";

  if(!username || !password){
    toast("⚠ Faltan datos", "Usuario y contraseña son obligatorios.", "warning");
    return;
  }

  try{
    const data = await api("/api/auth/login", { method:"POST", body:{ username, password }, auth:false });
    setToken(data.token);
    setUser(data.user);
    toast("✅ Sesión iniciada", "Redirigiendo...", "success");
    setTimeout(()=> window.location.href = "egreso.html", 250);
  }catch(err){
    toast("❌ Login fallido", err.message, "error");
  }
}

/* =========================
   TOPBAR
   ========================= */
function hydrateTopbar(){
  const u = getUser();

  // Mapeo de roles en español para mejor UX
  const roleLabels = {
    'admin': 'Admin',
    'direccion': 'Dirección',
    'encargado': 'Encargado',
    'empleado': 'Empleado'
  };

  const el = document.getElementById("whoami");
  if(el) el.textContent = `${u.username || "Usuario"} • ${roleLabels[u.role] || u.role || "—"}`;
  const elMobile = document.getElementById("whoamiMobile");
  if(elMobile) elMobile.textContent = `${u.username || "Usuario"} • ${roleLabels[u.role] || u.role || "—"}`;

  // Ocultar elementos según permisos
  // data-admin-strict="1" -> Solo admin
  document.querySelectorAll("[data-admin-strict='1']")
    .forEach(a => a.style.display = (u.role === "admin") ? "" : "none");

  // data-admin-only="1" -> Solo admin y direccion
  document.querySelectorAll("[data-admin-only='1']")
    .forEach(a => a.style.display = (u.role === "admin" || u.role === "direccion") ? "" : "none");

  // data-requires-encargado="1" -> Admin, direccion y encargado (para logs)
  document.querySelectorAll("[data-requires-encargado='1']")
    .forEach(a => a.style.display = (u.role === "admin" || u.role === "direccion" || u.role === "encargado") ? "" : "none");
}

function logout(){
  clearToken(); clearUser();
  window.location.href = "index.html";
}

/* =========================
   EGRESOS UI HELPERS
   ========================= */
function populateEtiquetas(){
  const sel = document.getElementById("etiqueta");
  if(!sel) return;
  sel.innerHTML = `<option value="">Seleccionar…</option>` +
    ETIQUETAS.map(e => `<option value="${e}">${e}</option>`).join("");
}

function populateEmpresasSalida(){
  const sel = document.getElementById("empresa_salida");
  if(!sel) return;
  sel.innerHTML = `<option value="">Seleccionar…</option>` +
    EMPRESAS_SALIDA.map(x => `<option value="${x}">${x}</option>`).join("");
}

function toggleCasinoUserField(){
  const etiqueta = document.getElementById("etiqueta")?.value || "";
  const wrap = document.getElementById("wrap_usuario_casino");
  const input = document.getElementById("usuario_casino");
  if(!wrap || !input) return;

  const show = ETIQUETAS_CON_USUARIO_CASINO.has(etiqueta);
  wrap.classList.toggle("hidden", !show);
  if(!show) input.value = "";
}

function toggleOtroConcepto(){
  const etiqueta = document.getElementById("etiqueta")?.value || "";
  const wrap = document.getElementById("wrap_otro");
  const input = document.getElementById("otro_concepto");
  if(!wrap || !input) return;

  const show = etiqueta === "Otro";
  wrap.classList.toggle("hidden", !show);
  if(!show) input.value = "";
}

// Campos condicionales para PREMIOS (hora solicitud y hora quema)
function toggleCamposPremio(){
  const etiqueta = document.getElementById("etiqueta")?.value || "";

  // Detectar tipo de etiqueta
  const esPremio = ETIQUETAS_CON_USUARIO_CASINO.has(etiqueta);
  const esCierreCaja = ETIQUETAS_CIERRE_CAJA.has(etiqueta);

  // Campos de premios
  const wrapSolicitud = document.getElementById("wrap_hora_solicitud");
  const inputSolicitud = document.getElementById("hora_solicitud_cliente");
  const wrapQuema = document.getElementById("wrap_hora_quema");
  const inputQuema = document.getElementById("hora_quema_fichas");

  if(wrapSolicitud && inputSolicitud){
    wrapSolicitud.classList.toggle("hidden", !esPremio);
    if(esPremio){
      inputSolicitud.setAttribute("required", "required");
    } else {
      inputSolicitud.removeAttribute("required");
      inputSolicitud.value = "";
    }
  }

  if(wrapQuema && inputQuema){
    wrapQuema.classList.toggle("hidden", !esPremio);
    if(esPremio){
      inputQuema.setAttribute("required", "required");
    } else {
      inputQuema.removeAttribute("required");
      inputQuema.value = "";
    }
  }

  // Campos a ocultar para Cierre de Caja (turno ahora visible)
  // wrap_usuario_casino ahora es manejado por toggleCasinoUserField()
  const camposOcultar = [
    "wrap_id_transferencia",
    "wrap_cuenta_receptora",
    "wrap_notas"
  ];

  camposOcultar.forEach(id => {
    const wrap = document.getElementById(id);
    const input = wrap?.querySelector("input, select, textarea");

    if(wrap){
      wrap.classList.toggle("hidden", esCierreCaja);

      // Remover required si está oculto
      if(input && esCierreCaja){
        input.removeAttribute("required");
        if(input.tagName === 'SELECT'){
          input.value = "";
        } else {
          input.value = "";
        }
      } else if(input && !esCierreCaja){
        // Restaurar required según el campo
        if(id === "wrap_id_transferencia" || id === "wrap_cuenta_receptora"){
          input.setAttribute("required", "required");
        }
      }
    }
  });

  // En flujo USD, también ocultar tipo_transaccion para Cierre de Caja
  if(IS_USD_PAGE){
    const wrapTipoTransaccion = document.getElementById("wrap_tipo_transaccion");
    const selectTipoTransaccion = document.getElementById("tipo_transaccion");

    if(wrapTipoTransaccion && selectTipoTransaccion){
      wrapTipoTransaccion.classList.toggle("hidden", esCierreCaja);

      if(esCierreCaja){
        // Para Cierre de Caja, establecer SALIDA por defecto y quitar required
        selectTipoTransaccion.value = "SALIDA";
        selectTipoTransaccion.removeAttribute("required");
      } else {
        // Restaurar required cuando no es Cierre de Caja
        selectTipoTransaccion.setAttribute("required", "required");
      }
    }
  }
}

function fileLabel(){
  const f = document.getElementById("comprobante");
  const out = document.getElementById("comprobante_nombre");
  if(!f || !out) return;
  const fileName = f.files?.[0]?.name;
  out.textContent = fileName ? fileName : "Ningún archivo seleccionado";
  // Actualizar visual de la dropzone
  const dz = document.getElementById("dropzone_comprobante");
  if(dz) dz.classList.toggle("has-file", !!fileName);
}

function wireDropZone(){
  const dz = document.getElementById("dropzone_comprobante");
  const input = document.getElementById("comprobante");
  if(!dz || !input) return;

  const allowed = ["image/jpeg", "image/png", "application/pdf"];

  // Clic en la zona abre el file picker
  dz.addEventListener("click", (e) => {
    if(e.target !== input) input.click();
  });

  // Prevenir defaults en drag events
  ["dragenter", "dragover", "dragleave", "drop"].forEach(evt => {
    dz.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); });
  });

  // Feedback visual al arrastrar
  ["dragenter", "dragover"].forEach(evt => {
    dz.addEventListener(evt, () => dz.classList.add("drag-over"));
  });
  ["dragleave", "drop"].forEach(evt => {
    dz.addEventListener(evt, () => dz.classList.remove("drag-over"));
  });

  // Drop handler
  dz.addEventListener("drop", (e) => {
    const file = e.dataTransfer?.files?.[0];
    if(!file) return;
    if(!allowed.includes(file.type)){
      toast("Archivo no válido", "Solo se permiten JPG, PNG o PDF.", "error");
      return;
    }
    if(file.size > 10 * 1024 * 1024){
      toast("Archivo muy grande", "El máximo es 10MB.", "error");
      return;
    }
    // Asignar archivo al input
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    fileLabel();
  });
}

function wireIdTransferenciaAlphanumeric(){
  const el = document.getElementById("id_transferencia");
  if(!el) return;
  // Permitir solo letras, números, guiones y guiones bajos
  el.addEventListener("input", ()=> {
    el.value = el.value.replace(/[^a-zA-Z0-9\-_]/g, "");
  });
}

// Checkbox "Sin ID de transferencia": deshabilita el input y lo marca como no obligatorio
function wireSinIdTransferencia(){
  const cb = document.getElementById("sin_id_transferencia");
  const input = document.getElementById("id_transferencia");
  const feedback = document.getElementById("id_transferencia_feedback");
  if(!cb || !input) return;

  cb.addEventListener("change", () => {
    if(cb.checked){
      input.value = "";
      input.disabled = true;
      input.removeAttribute("required");
      input.style.borderColor = "";
      input.style.opacity = "0.5";
      if(feedback){ feedback.textContent = ""; feedback.className = ""; }
    } else {
      input.disabled = false;
      input.style.opacity = "1";
      // Restaurar required solo si no es ENTRADA ni Cierre de Caja
      const etiqueta = document.getElementById("etiqueta")?.value || "";
      const tipo = document.getElementById("tipo_transaccion")?.value || "";
      if(!ETIQUETAS_CIERRE_CAJA.has(etiqueta) && tipo !== "ENTRADA"){
        input.setAttribute("required", "required");
      }
    }
  });
}

function wireFechaValidation(){
  const el = document.getElementById("fecha");
  if(!el) return;

  // Auto-formatear mientras escribe: solo números y /
  el.addEventListener("input", (e) => {
    let value = el.value.replace(/[^\d/]/g, ""); // Solo números y /

    // Auto-agregar / después del día y mes
    if (value.length === 2 && !value.includes("/")) {
      value = value + "/";
    } else if (value.length === 5 && value.split("/").length === 2) {
      value = value + "/";
    }

    // Limitar a 10 caracteres (dd/mm/aaaa)
    if (value.length > 10) {
      value = value.substring(0, 10);
    }

    el.value = value;
  });

  // Validar fecha completa al perder el foco
  el.addEventListener("blur", () => {
    const value = el.value.trim();
    if (!value) return; // Si está vacío, el required lo manejará

    // Validar formato dd/mm/aaaa
    const regex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
    const match = value.match(regex);

    if (!match) {
      el.setCustomValidity("Formato inválido. Usá dd/mm/aaaa");
      return;
    }

    const [_, dia, mes, anio] = match;
    const diaNum = parseInt(dia, 10);
    const mesNum = parseInt(mes, 10);
    const anioNum = parseInt(anio, 10);

    // Validar que sea año 2026
    const anioActual = new Date().getFullYear();
    if (anioNum !== anioActual) {
      el.setCustomValidity(`La fecha debe ser del año ${anioActual}`);
      return;
    }

    // Validar rango de mes
    if (mesNum < 1 || mesNum > 12) {
      el.setCustomValidity("Mes inválido (debe ser 01-12)");
      return;
    }

    // Validar rango de día según el mes
    const diasPorMes = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // 2026 no es bisiesto pero dejamos 29 por seguridad
    const maxDias = diasPorMes[mesNum - 1];
    if (diaNum < 1 || diaNum > maxDias) {
      el.setCustomValidity(`Día inválido para ese mes (debe ser 01-${maxDias})`);
      return;
    }

    // Validar que la fecha sea válida (existe realmente)
    const fecha = new Date(anioNum, mesNum - 1, diaNum);
    if (fecha.getDate() !== diaNum || fecha.getMonth() !== mesNum - 1) {
      el.setCustomValidity("Fecha inválida");
      return;
    }

    // Validar que no sea fecha futura
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fecha.setHours(0, 0, 0, 0);

    if (fecha > hoy) {
      el.setCustomValidity("No se permiten fechas futuras");
      return;
    }

    // Todo válido
    el.setCustomValidity("");
  });

  // Limpiar validación personalizada al empezar a escribir
  el.addEventListener("input", () => {
    el.setCustomValidity("");
  });
}

/* =========================
   SALDOS EN TIEMPO REAL
   ========================= */
// Prototipos de UI para saldos: se cargan en saldos.html
async function cargarSaldos(){
  // Lectura de filtros
  const empresa = document.getElementById('filtro_empresa')?.value || '';
  const moneda = document.getElementById('filtro_moneda')?.value || '';

  const qs = new URLSearchParams();
  if (empresa) qs.set('empresa', empresa);
  if (moneda) qs.set('moneda', moneda);

  // Añadimos filtro de cuenta si está seleccionado
  try {
    const cuenta = document.getElementById('filtro_cuenta')?.value || '';
    if (cuenta) qs.set('cuenta', cuenta);
    const data = await api(`/api/egresos/saldos?${qs.toString()}`);
    renderSaldos(data || {});
  } catch(err){
    console.error('Error cargando saldos:', err);
    toast('❌ Error', err.message, 'error');
  }
}
// Ensure cuentas refresh triggers saldos reload after empresa selection
document.addEventListener('DOMContentLoaded', () => {
  const cuentaSel = document.getElementById('filtro_cuenta');
  if (cuentaSel) cuentaSel.addEventListener('change', () => {
    const emp = document.getElementById('filtro_empresa')?.value || '';
    if (emp) cargarSaldos();
  });
});

function renderSaldos(data){
  const tableARS = document.getElementById('saldosTableARS').getElementsByTagName('tbody')[0];
  const tableUSD = document.getElementById('saldosTableUSD').getElementsByTagName('tbody')[0];
  if(!tableARS || !tableUSD) return;

  const rowsARS = (data?.saldos || []).filter(r => String(r.moneda || 'ARS') === 'ARS');
  const rowsUSD = (data?.saldos || []).filter(r => String(r.moneda || 'ARS') === 'USD');
  const rowsUSDT = (data?.saldos || []).filter(r => String(r.moneda || 'ARS') === 'USDT');

  const toRow = (r) => {
    const saldo = Number(r.saldo) || 0;
    const color = saldo >= 0 ? '#1f8f3b' : '#d64545';
    const ultima = r.ultima_transaccion ? new Date(r.ultima_transaccion).toLocaleString() : '';
    return `<tr data-empresa="${r.empresa_salida}" data-cuenta="${r.cuenta_salida}" data-moneda="${r.moneda}">
              <td>${escapeHtml(r.empresa_salida || '')}</td>
              <td>${escapeHtml(r.cuenta_salida || '')}</td>
              <td style="color:${color}; font-weight:600;">${Number(saldo).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})} ${r.moneda}</td>
              <td>${escapeHtml(ultima)}</td>
              <td>${Number(r.total_transacciones || 0)}</td>
            </tr>`;
  };

  tableARS.innerHTML = rowsARS.length
    ? rowsARS.map(toRow).join('')
    : '<tr><td colspan="5" class="muted">Sin saldos</td></tr>';

  tableUSD.innerHTML = rowsUSD.length
    ? rowsUSD.map(toRow).join('')
    : '<tr><td colspan="5" class="muted">Sin saldos</td></tr>';

  const tableUSDT = document.getElementById('saldosTableUSDT')?.getElementsByTagName('tbody')[0];
  if (tableUSDT) {
    tableUSDT.innerHTML = rowsUSDT.length
      ? rowsUSDT.map(toRow).join('')
      : '<tr><td colspan="5" class="muted">Sin saldos</td></tr>';
  }

  // Totales
  const totalARS = Number(data?.totales?.ARS || 0);
  const totalUSD = Number(data?.totales?.USD || 0);
  const totalUSDT = Number(data?.totales?.USDT || 0);
  const elTotalARS = document.getElementById('totalARS');
  const elTotalUSD = document.getElementById('totalUSD');
  const elTotalUSDT = document.getElementById('totalUSDT');
  if (elTotalARS) elTotalARS.textContent = `Total ARS: ${totalARS.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`;
  if (elTotalUSD) elTotalUSD.textContent = `Total USD: ${totalUSD.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`;
  if (elTotalUSDT) elTotalUSDT.textContent = `Total USDT: ${totalUSDT.toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2})}`;

  // Detalle por cuenta (clic en fila)
  const rows = tableARS.querySelectorAll('tr');
  rows.forEach(r => r.style.cursor = 'pointer');
  tableARS.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const empresa = tr.dataset.empresa;
      const cuenta = tr.dataset.cuenta;
      const moneda = tr.dataset.moneda;
      if (empresa && cuenta && moneda) verDetalleCuenta(empresa, cuenta, moneda);
    });
  });

  tableUSD.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => {
      const empresa = tr.dataset.empresa;
      const cuenta = tr.dataset.cuenta;
      const moneda = tr.dataset.moneda;
      if (empresa && cuenta && moneda) verDetalleCuenta(empresa, cuenta, moneda);
    });
  });

  if (tableUSDT) {
    tableUSDT.querySelectorAll('tr').forEach(tr => {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        const empresa = tr.dataset.empresa;
        const cuenta = tr.dataset.cuenta;
        const moneda = tr.dataset.moneda;
        if (empresa && cuenta && moneda) verDetalleCuenta(empresa, cuenta, moneda);
      });
    });
  }
}

async function verDetalleCuenta(empresa, cuenta, moneda){
  const url = `/api/egresos?empresa_salida=${encodeURIComponent(empresa)}&cuenta_salida=${encodeURIComponent(cuenta)}&moneda=${encodeURIComponent(moneda)}&limit=20`;
  try {
    const data = await api(url);
    const egresos = data?.egresos || [];
    const body = document.getElementById('detalleBody');
    const title = document.getElementById('detalleModalTitle');
    if (title) title.textContent = `Detalle – ${empresa} / ${cuenta} [${moneda}]`;
    if (body){
      if (egresos.length === 0){ body.innerHTML = '<div class="muted">No hay movimientos para esta cuenta.</div>'; }
      else {
        const html = egresos.map(e => `
          <div style="padding:6px 0; border-bottom:1px solid var(--border);">
            <strong>${e.fecha} ${e.hora}</strong> - ${e.etiqueta} • ${e.monto} ${e.moneda} • ${e.id_transferencia || ''}
          </div>`).join('');
        body.innerHTML = html;
      }
    }
    // Mostrar modal
    const modal = document.getElementById('detalleModal');
    if (modal){ modal.style.display = 'block'; }
  } catch(err){
    console.error('Error obteniendo detalle de cuenta:', err);
    toast('❌ Error', 'No se pudo obtener el detalle de la cuenta', 'error');
  }
}

function cerrarModal(){
  const m = document.getElementById('detalleModal');
  if (m) m.style.display = 'none';
}

// Toggle resumen de cuenta en la tabla de saldos
function toggleResumen(key){
  const el = document.getElementById(`summary-${key}`);
  if (!el) return;
  const isHidden = el.style.display === 'none' || el.style.display === '';
  el.style.display = isHidden ? 'table-row' : 'none';
}

/* =========================
   POBLAR FILTROS SALDOS (INICIAL)
   ========================= */
async function loadDistinctEmpresas(){
  try {
    const res = await api('/api/egresos/distinct-empresas');
    return res?.empresas || [];
  } catch (e) {
    console.error('Error cargando empresas distintas:', e);
    return [];
  }
}

async function populateSaldosFilters(){
  const sel = document.getElementById('filtro_empresa');
  const cuentaSel = document.getElementById('filtro_cuenta');
  if(!sel) return;

  // Llenar empresas: usar constante si disponible, sino llamar a API
  const empresas = (typeof EMPRESAS_SALIDA !== 'undefined' && Array.isArray(EMPRESAS_SALIDA) && EMPRESAS_SALIDA.length > 0)
    ? EMPRESAS_SALIDA
    : await loadDistinctEmpresas();

  // Limpiar y poblar
  sel.innerHTML = `<option value="">Seleccionar…</option>` + empresas.map(x => `<option value="${x}">${x}</option>`).join('');
  // Habilitar/Deshabilitar cuenta según empresa
  sel.addEventListener('change', async (e) => {
    const val = e.target.value;
    if (!cuentaSel) return;
    cuentaSel.innerHTML = `<option value="">Todas</option>`;
    cuentaSel.disabled = !val;
    if (val) {
      try {
        const data = await api(`/api/egresos/cuentas?empresa_salida=${encodeURIComponent(val)}`);
        const cuentas = data?.cuentas || [];
        cuentas.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c;
          opt.text = c;
          cuentaSel.appendChild(opt);
        });
      } catch(err) {
        console.error('Error cargando cuentas para empresa', val, err);
      }
    }
  });
}

/**
 * Calcula el turno según la hora del comprobante
 * - Turno noche: 00:00 - 07:59 (12am a 8am)
 * - Turno mañana: 08:00 - 15:59 (8am a 4pm)
 * - Turno tarde: 16:00 - 23:59 (4pm a 12am)
 */
function calcularTurnoSegunHora(horaStr) {
  if (!horaStr) return null;

  const match = horaStr.match(/^(\d{2}):(\d{2})/);
  if (!match) return null;

  const hora = parseInt(match[1], 10);

  if (hora >= 0 && hora < 8) {
    return "Turno noche";
  } else if (hora >= 8 && hora < 16) {
    return "Turno mañana";
  } else if (hora >= 16 && hora < 24) {
    return "Turno tarde";
  }

  return null;
}

/**
 * Actualiza el turno automáticamente cuando cambia la hora
 */
function autoCalcularTurno() {
  const horaInput = document.getElementById("hora");
  const turnoSelect = document.getElementById("turno");
  const turnoSugerido = document.getElementById("turno_sugerido");

  if (!horaInput || !turnoSelect) return;

  // No auto-calcular si está en modo manual (Cierre de Caja)
  if (!turnoSelect.disabled) return;

  const hora = horaInput.value;
  const turno = calcularTurnoSegunHora(hora);

  if (turno) {
    turnoSelect.value = turno;
    if (turnoSugerido) {
      turnoSugerido.textContent = `✓ ${turno} (${hora})`;
      turnoSugerido.style.color = "#28a745";
    }
  } else {
    turnoSelect.value = "";
    if (turnoSugerido) {
      turnoSugerido.textContent = "Se calcula automáticamente según la hora";
      turnoSugerido.style.color = "";
    }
  }
}

/**
 * Maneja el modo del turno según la etiqueta seleccionada
 * Para "Cierre de Caja": turno manual, sin hora
 * Para otras etiquetas: turno automático según hora
 */
function toggleModoTurnoCierreCaja() {
  const etiquetaSelect = document.getElementById("etiqueta");
  const horaField = document.getElementById("hora");
  const horaWrapper = horaField?.closest(".field");
  const turnoSelect = document.getElementById("turno");
  const turnoLabel = document.querySelector("#wrap_turno label");
  const turnoSugerido = document.getElementById("turno_sugerido");

  if (!etiquetaSelect || !turnoSelect) return;

  const esCierreCaja = etiquetaSelect.value === "Cierre de Caja";

  if (esCierreCaja) {
    // Modo manual: ocultar hora, habilitar turno manual
    if (horaWrapper) {
      horaWrapper.classList.add("hidden");
      horaField.removeAttribute("required");
    }

    turnoSelect.disabled = false;
    turnoSelect.classList.remove("turno-auto");
    turnoSelect.value = ""; // Reset para que elija

    if (turnoLabel) {
      turnoLabel.innerHTML = 'TURNO * <span style="color: #6c757d; font-size: 0.85em;">(Manual)</span>';
    }
    if (turnoSugerido) {
      turnoSugerido.textContent = "Seleccioná el turno del cierre";
      turnoSugerido.style.color = "";
    }
  } else {
    // Modo automático: mostrar hora, deshabilitar turno
    if (horaWrapper) {
      horaWrapper.classList.remove("hidden");
      horaField.setAttribute("required", "required");
    }

    turnoSelect.disabled = true;
    turnoSelect.classList.add("turno-auto");

    if (turnoLabel) {
      turnoLabel.innerHTML = 'TURNO * <span style="color: #6c757d; font-size: 0.85em;">(Automático)</span>';
    }

    // Recalcular turno según hora actual
    autoCalcularTurno();
  }
}

// =============================================================================
// Sistema de "Recordar valores" con localStorage
// =============================================================================

const STORAGE_KEYS = {
  FECHA: 'egreso_recordar_fecha',
  FECHA_CHECK: 'egreso_recordar_fecha_check',
  EMPRESA: 'egreso_recordar_empresa',
  EMPRESA_CHECK: 'egreso_recordar_empresa_check',
  CUENTA_SALIDA: 'egreso_recordar_cuenta_salida',
  CUENTA_SALIDA_CHECK: 'egreso_recordar_cuenta_salida_check',
  ETIQUETA: 'egreso_recordar_etiqueta',
  ETIQUETA_CHECK: 'egreso_recordar_etiqueta_check'
};

/**
 * Guarda un valor en localStorage si el checkbox está marcado
 */
function guardarValorSiRecordado(inputId, checkboxId, storageKey, storageCheckKey) {
  const checkbox = document.getElementById(checkboxId);
  const input = document.getElementById(inputId);

  if (!checkbox || !input) return;

  // Guardar estado del checkbox
  localStorage.setItem(storageCheckKey, checkbox.checked ? 'true' : 'false');

  // Guardar valor solo si está marcado
  if (checkbox.checked) {
    localStorage.setItem(storageKey, input.value);
  } else {
    localStorage.removeItem(storageKey);
  }
}

/**
 * Restaura valores guardados al cargar la página
 */
function restaurarValoresRecordados() {
  // Restaurar FECHA
  const recordarFecha = localStorage.getItem(STORAGE_KEYS.FECHA_CHECK) === 'true';
  const checkboxFecha = document.getElementById('recordar_fecha');
  const inputFecha = document.getElementById('fecha');

  if (checkboxFecha) {
    checkboxFecha.checked = recordarFecha;
  }

  if (recordarFecha && inputFecha) {
    const valorGuardado = localStorage.getItem(STORAGE_KEYS.FECHA);
    if (valorGuardado) {
      inputFecha.value = valorGuardado;
    }
  }

  // Restaurar EMPRESA
  const recordarEmpresa = localStorage.getItem(STORAGE_KEYS.EMPRESA_CHECK) === 'true';
  const checkboxEmpresa = document.getElementById('recordar_empresa');
  const inputEmpresa = document.getElementById('empresa_salida');

  if (checkboxEmpresa) {
    checkboxEmpresa.checked = recordarEmpresa;
  }

  if (recordarEmpresa && inputEmpresa) {
    const valorGuardado = localStorage.getItem(STORAGE_KEYS.EMPRESA);
    if (valorGuardado) {
      inputEmpresa.value = valorGuardado;
    }
  }

  // Restaurar CUENTA SALIDA
  const recordarCuentaSalida = localStorage.getItem(STORAGE_KEYS.CUENTA_SALIDA_CHECK) === 'true';
  const checkboxCuentaSalida = document.getElementById('recordar_cuenta_salida');
  const inputCuentaSalida = document.getElementById('cuenta_salida');

  if (checkboxCuentaSalida) {
    checkboxCuentaSalida.checked = recordarCuentaSalida;
  }

  if (recordarCuentaSalida && inputCuentaSalida) {
    const valorGuardado = localStorage.getItem(STORAGE_KEYS.CUENTA_SALIDA);
    if (valorGuardado) {
      inputCuentaSalida.value = valorGuardado;
    }
  }

  // Restaurar ETIQUETA
  const recordarEtiqueta = localStorage.getItem(STORAGE_KEYS.ETIQUETA_CHECK) === 'true';
  const checkboxEtiqueta = document.getElementById('recordar_etiqueta');
  const inputEtiqueta = document.getElementById('etiqueta');

  if (checkboxEtiqueta) {
    checkboxEtiqueta.checked = recordarEtiqueta;
  }

  if (recordarEtiqueta && inputEtiqueta) {
    const valorGuardado = localStorage.getItem(STORAGE_KEYS.ETIQUETA);
    if (valorGuardado) {
      inputEtiqueta.value = valorGuardado;
      // Disparar eventos para actualizar campos condicionales
      toggleCasinoUserField();
      toggleOtroConcepto();
      toggleCamposPremio();
    }
  }
}

/**
 * Conecta los event listeners para guardar valores cuando cambian
 */
function conectarRecordarValores() {
  // Event listeners para FECHA
  const inputFecha = document.getElementById('fecha');
  const checkboxFecha = document.getElementById('recordar_fecha');

  if (inputFecha && checkboxFecha) {
    inputFecha.addEventListener('change', () => {
      guardarValorSiRecordado('fecha', 'recordar_fecha', STORAGE_KEYS.FECHA, STORAGE_KEYS.FECHA_CHECK);
    });

    checkboxFecha.addEventListener('change', () => {
      guardarValorSiRecordado('fecha', 'recordar_fecha', STORAGE_KEYS.FECHA, STORAGE_KEYS.FECHA_CHECK);
    });
  }

  // Event listeners para EMPRESA
  const inputEmpresa = document.getElementById('empresa_salida');
  const checkboxEmpresa = document.getElementById('recordar_empresa');

  if (inputEmpresa && checkboxEmpresa) {
    inputEmpresa.addEventListener('change', () => {
      guardarValorSiRecordado('empresa_salida', 'recordar_empresa', STORAGE_KEYS.EMPRESA, STORAGE_KEYS.EMPRESA_CHECK);
    });

    checkboxEmpresa.addEventListener('change', () => {
      guardarValorSiRecordado('empresa_salida', 'recordar_empresa', STORAGE_KEYS.EMPRESA, STORAGE_KEYS.EMPRESA_CHECK);
    });
  }

  // Event listeners para CUENTA SALIDA
  const inputCuentaSalida = document.getElementById('cuenta_salida');
  const checkboxCuentaSalida = document.getElementById('recordar_cuenta_salida');

  if (inputCuentaSalida && checkboxCuentaSalida) {
    inputCuentaSalida.addEventListener('change', () => {
      guardarValorSiRecordado('cuenta_salida', 'recordar_cuenta_salida', STORAGE_KEYS.CUENTA_SALIDA, STORAGE_KEYS.CUENTA_SALIDA_CHECK);
    });

    inputCuentaSalida.addEventListener('blur', () => {
      guardarValorSiRecordado('cuenta_salida', 'recordar_cuenta_salida', STORAGE_KEYS.CUENTA_SALIDA, STORAGE_KEYS.CUENTA_SALIDA_CHECK);
    });

    checkboxCuentaSalida.addEventListener('change', () => {
      guardarValorSiRecordado('cuenta_salida', 'recordar_cuenta_salida', STORAGE_KEYS.CUENTA_SALIDA, STORAGE_KEYS.CUENTA_SALIDA_CHECK);
    });
  }

  // Event listeners para ETIQUETA
  const inputEtiqueta = document.getElementById('etiqueta');
  const checkboxEtiqueta = document.getElementById('recordar_etiqueta');

  if (inputEtiqueta && checkboxEtiqueta) {
    inputEtiqueta.addEventListener('change', () => {
      guardarValorSiRecordado('etiqueta', 'recordar_etiqueta', STORAGE_KEYS.ETIQUETA, STORAGE_KEYS.ETIQUETA_CHECK);
    });

    checkboxEtiqueta.addEventListener('change', () => {
      guardarValorSiRecordado('etiqueta', 'recordar_etiqueta', STORAGE_KEYS.ETIQUETA, STORAGE_KEYS.ETIQUETA_CHECK);
    });
  }
}

/**
 * Limpia el formulario pero mantiene valores "recordados"
 */
function limpiarFormularioConRecordar() {
  const form = document.getElementById('egresoForm');
  if (!form) return;

  // Guardar valores que deben recordarse ANTES de limpiar
  const valoresRecordados = {
    fecha: {
      recordar: document.getElementById('recordar_fecha')?.checked,
      valor: document.getElementById('fecha')?.value
    },
    empresa: {
      recordar: document.getElementById('recordar_empresa')?.checked,
      valor: document.getElementById('empresa_salida')?.value
    },
    cuentaSalida: {
      recordar: document.getElementById('recordar_cuenta_salida')?.checked,
      valor: document.getElementById('cuenta_salida')?.value
    },
    etiqueta: {
      recordar: document.getElementById('recordar_etiqueta')?.checked,
      valor: document.getElementById('etiqueta')?.value
    }
  };

  // Resetear formulario
  form.reset();

  // Restaurar estado del input ID transferencia (form.reset unchecks pero no re-enables)
  const idTransInput = document.getElementById("id_transferencia");
  if(idTransInput){ idTransInput.disabled = false; idTransInput.style.opacity = "1"; }

  // Restaurar valores recordados
  if (valoresRecordados.fecha.recordar) {
    const inputFecha = document.getElementById('fecha');
    const checkboxFecha = document.getElementById('recordar_fecha');
    if (inputFecha) inputFecha.value = valoresRecordados.fecha.valor;
    if (checkboxFecha) checkboxFecha.checked = true;
  }

  if (valoresRecordados.empresa.recordar) {
    const inputEmpresa = document.getElementById('empresa_salida');
    const checkboxEmpresa = document.getElementById('recordar_empresa');
    if (inputEmpresa) inputEmpresa.value = valoresRecordados.empresa.valor;
    if (checkboxEmpresa) checkboxEmpresa.checked = true;
  }

  if (valoresRecordados.cuentaSalida.recordar) {
    const inputCuentaSalida = document.getElementById('cuenta_salida');
    const checkboxCuentaSalida = document.getElementById('recordar_cuenta_salida');
    if (inputCuentaSalida) inputCuentaSalida.value = valoresRecordados.cuentaSalida.valor;
    if (checkboxCuentaSalida) checkboxCuentaSalida.checked = true;
  }

  if (valoresRecordados.etiqueta.recordar) {
    const inputEtiqueta = document.getElementById('etiqueta');
    const checkboxEtiqueta = document.getElementById('recordar_etiqueta');
    if (inputEtiqueta) inputEtiqueta.value = valoresRecordados.etiqueta.valor;
    if (checkboxEtiqueta) checkboxEtiqueta.checked = true;
  }

  // Restablecer estados visuales
  fileLabel();
  toggleCasinoUserField();
  toggleOtroConcepto();
  toggleCamposPremio();
}

// Validación en tiempo real de ID de transferencia duplicado
let validationTimeout = null;
async function checkIdTransferenciaDuplicado() {
  const idInput = document.getElementById("id_transferencia");
  const empresaInput = document.getElementById("empresa_salida");
  const feedbackDiv = document.getElementById("id_transferencia_feedback");

  if (!idInput || !empresaInput) return;

  const idValue = idInput.value.trim();
  const empresaValue = empresaInput.value;

  // Limpiar feedback
  if (feedbackDiv) {
    feedbackDiv.textContent = "";
    feedbackDiv.className = "";
  }

  // Si no hay valor o empresa, no validar
  if (!idValue || !empresaValue) return;

  try {
    const token = getToken();
    if (!token) return;

    const url = `${API_BASE}/api/egresos/check-id-transferencia?empresa_salida=${encodeURIComponent(empresaValue)}&id_transferencia=${encodeURIComponent(idValue)}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      console.error("Error validando ID:", response.status);
      return;
    }

    const data = await response.json();

    if (data.exists && feedbackDiv) {
      feedbackDiv.className = "validation-error";
      feedbackDiv.textContent = `⚠️ Este ID ya existe en ${empresaValue} (Egreso #${data.egreso.id} - ${data.egreso.etiqueta} - $${data.egreso.monto} ${data.egreso.moneda})`;
      idInput.style.borderColor = "#dc3545";
    } else if (feedbackDiv) {
      feedbackDiv.className = "validation-success";
      feedbackDiv.textContent = "✓ ID disponible";
      idInput.style.borderColor = "#28a745";
    }

  } catch (error) {
    console.error("Error al validar ID de transferencia:", error);
  }
}

function wireIdTransferenciaValidation() {
  const idInput = document.getElementById("id_transferencia");
  const empresaInput = document.getElementById("empresa_salida");

  if (!idInput || !empresaInput) return;

  // Validar cuando cambia el ID (con debounce)
  idInput.addEventListener("input", () => {
    if (validationTimeout) clearTimeout(validationTimeout);

    // Resetear estilos mientras escribe
    idInput.style.borderColor = "";
    const feedbackDiv = document.getElementById("id_transferencia_feedback");
    if (feedbackDiv) {
      feedbackDiv.textContent = "";
      feedbackDiv.className = "";
    }

    // Esperar 800ms después de que deje de escribir
    validationTimeout = setTimeout(() => {
      checkIdTransferenciaDuplicado();
    }, 800);
  });

  // Validar también cuando cambia la empresa
  empresaInput.addEventListener("change", () => {
    if (validationTimeout) clearTimeout(validationTimeout);
    validationTimeout = setTimeout(() => {
      checkIdTransferenciaDuplicado();
    }, 300);
  });
}

/* =========================
   VALIDACIÓN DE NOMBRES (solo letras y espacios)
   ========================= */
function wireNombresValidation() {
  const cuentaSalidaInput = document.getElementById("cuenta_salida");
  const cuentaReceptoraInput = document.getElementById("cuenta_receptora");

  // Regex: solo letras (incluyendo á, é, í, ó, ú, ñ), espacios y algunos caracteres comunes en nombres
  const regexNombres = /^[a-záéíóúñüA-ZÁÉÍÓÚÑÜ\s'-]*$/;

  function validarNombre(input) {
    if (!input) return;

    input.addEventListener("input", (e) => {
      const valor = e.target.value;

      // Verificar si contiene caracteres no permitidos
      if (!regexNombres.test(valor)) {
        // Remover caracteres no permitidos
        e.target.value = valor.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ\s'-]/g, "");

        // Mostrar feedback temporal
        e.target.style.borderColor = "#dc3545";

        // Resetear después de 1 segundo
        setTimeout(() => {
          e.target.style.borderColor = "";
        }, 1000);
      }
    });

    // Validar al perder foco
    input.addEventListener("blur", (e) => {
      const valor = e.target.value.trim();
      if (valor && !regexNombres.test(valor)) {
        e.target.value = valor.replace(/[^a-záéíóúñüA-ZÁÉÍÓÚÑÜ\s'-]/g, "");
      }
    });
  }

  validarNombre(cuentaSalidaInput);
  validarNombre(cuentaReceptoraInput);
}

function parseMontoARSStrict(raw){
  const v = (raw || "").trim();
  const re = /^\d+(,\d{1,2})?$/;
  if(!re.test(v)) return null;
  const num = Number(v.replace(",", "."));
  if(!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

function normalizeHoraTextOptional(raw){
  const v = String(raw || "").trim();
  if(!v) return "";
  if(!/^\d{2}:\d{2}(:\d{2})?$/.test(v)) return null;

  const [HH, MM, SS] = v.split(":");
  const hh = Number(HH), mm = Number(MM), ss = (SS === undefined ? 0 : Number(SS));
  if(![hh, mm, ss].every(Number.isFinite)) return null;
  if(hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;

  return `${HH.padStart(2,"0")}:${MM.padStart(2,"0")}`;
}

/* =========================
   VALIDACIÓN EN TIEMPO REAL
   ========================= */
function mostrarError(inputId, mensaje){
  const input = document.getElementById(inputId);
  if(!input) return;

  // Remover mensajes anteriores
  const parent = input.parentElement;
  const errorAnterior = parent.querySelector('.field-error');
  const successAnterior = parent.querySelector('.field-success');
  if(errorAnterior) errorAnterior.remove();
  if(successAnterior) successAnterior.remove();

  // Agregar clase error y mensaje
  input.classList.add('error');
  input.classList.remove('success');

  if(mensaje){
    const errorMsg = document.createElement('small');
    errorMsg.className = 'field-error';
    errorMsg.textContent = mensaje;
    parent.appendChild(errorMsg);
  }
}

function mostrarExito(inputId){
  const input = document.getElementById(inputId);
  if(!input) return;

  // Remover mensajes anteriores
  const parent = input.parentElement;
  const errorAnterior = parent.querySelector('.field-error');
  const successAnterior = parent.querySelector('.field-success');
  if(errorAnterior) errorAnterior.remove();
  if(successAnterior) successAnterior.remove();

  // Agregar clase success
  input.classList.remove('error');
  input.classList.add('success');
}

function limpiarValidacion(inputId){
  const input = document.getElementById(inputId);
  if(!input) return;

  input.classList.remove('error', 'success');
  const parent = input.parentElement;
  const errorMsg = parent.querySelector('.field-error');
  const successMsg = parent.querySelector('.field-success');
  if(errorMsg) errorMsg.remove();
  if(successMsg) successMsg.remove();
}

// Validar campo específico
function validarCampo(campo){
  const valor = document.getElementById(campo)?.value?.trim() || "";

  switch(campo){
    case 'fecha':
      if(!valor){
        mostrarError(campo, 'La fecha es obligatoria');
        return false;
      }
      if(isFutureDateISO(valor)){
        mostrarError(campo, 'No podés usar una fecha futura');
        return false;
      }
      mostrarExito(campo);
      return true;

    case 'hora':
      if(!valor){
        mostrarError(campo, 'La hora es obligatoria');
        return false;
      }
      mostrarExito(campo);
      return true;

    case 'turno':
      if(!valor){
        mostrarError(campo, 'Seleccioná un turno');
        return false;
      }
      mostrarExito(campo);
      return true;

    case 'monto':
      const montoNum = parseMontoARSStrict(valor);
      if(montoNum === null || montoNum <= 0){
        mostrarError(campo, 'Ingresá un monto válido (ej: 12000 o 12000,50)');
        return false;
      }
      mostrarExito(campo);
      return true;

    case 'cuenta_receptora':
      if(!valor){
        mostrarError(campo, 'La cuenta receptora es obligatoria');
        return false;
      }
      mostrarExito(campo);
      return true;

    case 'cuenta_salida':
      if(!valor){
        mostrarError(campo, 'La cuenta de salida es obligatoria');
        return false;
      }
      mostrarExito(campo);
      return true;

    case 'empresa_salida':
      if(!valor){
        mostrarError(campo, 'Seleccioná una empresa');
        return false;
      }
      mostrarExito(campo);
      return true;

    case 'id_transferencia':
      // Si el checkbox "Sin ID" está marcado, siempre válido
      if(document.getElementById("sin_id_transferencia")?.checked){
        mostrarExito(campo);
        return true;
      }
      if(!valor){
        mostrarError(campo, 'El ID de transferencia es obligatorio');
        return false;
      }
      if(!/^[a-zA-Z0-9\-_]+$/.test(valor)){
        mostrarError(campo, 'Solo letras, números, guiones y guiones bajos');
        return false;
      }
      mostrarExito(campo);
      return true;

    case 'etiqueta':
      if(!valor){
        mostrarError(campo, 'Seleccioná una etiqueta');
        return false;
      }
      mostrarExito(campo);
      return true;

    default:
      return true;
  }
}

// Conectar validaciones a los campos
function conectarValidacionTiempoReal(){
  const campos = [
    'fecha', 'hora', 'turno', 'monto', 'cuenta_receptora',
    'cuenta_salida', 'empresa_salida', 'id_transferencia', 'etiqueta'
  ];

  campos.forEach(campo => {
    const input = document.getElementById(campo);
    if(input){
      // Validar al perder foco (blur)
      input.addEventListener('blur', () => validarCampo(campo));

      // Limpiar error al empezar a escribir
      input.addEventListener('input', () => {
        if(input.classList.contains('error')){
          limpiarValidacion(campo);
        }
      });
    }
  });
}

/* =========================
   EGRESOS SUBMIT
   ========================= */
// Variable global para guardar los datos del formulario validados
let datosEgresoValidados = null;

async function handleEgresoSubmit(e){
  e.preventDefault();

  const submitBtn = e.target.querySelector("button[type='submit']");
  const prevText = submitBtn ? submitBtn.textContent : "";
  if(submitBtn){ submitBtn.disabled = true; submitBtn.textContent = "Validando…"; }

  try{
    const montoRaw = document.getElementById("monto").value;
    const montoNum = parseMontoARSStrict(montoRaw);

    // Habilitar temporalmente el select de turno para poder leer su valor
    const turnoSelect = document.getElementById("turno");
    const turnoDisabled = turnoSelect?.disabled;
    if (turnoSelect && turnoDisabled) {
      turnoSelect.disabled = false;
    }

    // Determine if cierre de caja
    const etiquetaActual = document.getElementById("etiqueta").value;
    const esCierreCajaActual = ETIQUETAS_CIERRE_CAJA.has(etiquetaActual);
    // Hora: si cierre de caja, usar hora actual
    let horaValue = document.getElementById("hora")?.value || "";
    if (esCierreCajaActual) {
      const now = new Date();
      horaValue = now.toTimeString().slice(0,5);
    }
    // Si es cierre de caja, desactivar required de hora para evitar validaciones innecesarias
    const horaEl = document.getElementById("hora");
    if (horaEl) {
      if (esCierreCajaActual) {
        horaEl.removeAttribute('required');
      } else {
        horaEl.setAttribute('required', 'required');
      }
    }

    const payload = {
      fecha: document.getElementById("fecha").value,
      hora: horaValue,
      turno: document.getElementById("turno").value,
      hora_solicitud_cliente: document.getElementById("hora_solicitud_cliente")?.value || "",
      hora_quema_fichas: document.getElementById("hora_quema_fichas")?.value || "",
      monto_transferencia_raw: (montoRaw || "").trim(),
      moneda: IS_USD_PAGE ? (document.getElementById("moneda_usd_page")?.value || "USDT") : (document.getElementById("moneda")?.value || "ARS"),
      tipo_transaccion: IS_USD_PAGE
        ? document.getElementById("tipo_transaccion")?.value
        : (etiquetaActual === "[Unidad M] Deposito de cliente" ? "ENTRADA" : "SALIDA"),
      cuenta_receptora: document.getElementById("cuenta_receptora").value.trim(),
      usuario_casino: document.getElementById("usuario_casino").value.trim(),
      cuenta_salida: document.getElementById("cuenta_salida").value.trim(),
      empresa_cuenta_salida: document.getElementById("empresa_salida").value,
      id_transferencia: document.getElementById("sin_id_transferencia")?.checked
        ? null
        : document.getElementById("id_transferencia").value.trim(),
      etiqueta: etiquetaActual,
      otro_concepto: document.getElementById("otro_concepto").value.trim(),
      notas: document.getElementById("notas").value.trim()
    };

    // Validación de tipo_transaccion en página USD
    if (IS_USD_PAGE) {
      const tipo = document.getElementById("tipo_transaccion")?.value;
      if (!tipo || !['ENTRADA', 'SALIDA'].includes(tipo)) {
        throw new Error("Debe seleccionar tipo de transacción (Entrada o Salida)");
      }
    }

    // Detectar si es cierre de caja
    const esCierreCaja = ETIQUETAS_CIERRE_CAJA.has(payload.etiqueta);

    // Validaciones básicas
    if(!payload.fecha) throw new Error("Completá FECHA.");
    if(!payload.hora) throw new Error("Completá HORA.");
    if(!payload.turno) throw new Error("Seleccioná TURNO.");
    if(montoNum === null || montoNum <= 0) throw new Error("Monto inválido. Debe ser mayor a 0.");

    // Para cierre de caja, cuenta_receptora e id_transferencia NO son obligatorios
    const sinIdChecked = document.getElementById("sin_id_transferencia")?.checked;
    if(!esCierreCaja) {
      if(!payload.cuenta_receptora) throw new Error("Completá CUENTA RECEPTORA.");
      if(!sinIdChecked) {
        if(!payload.id_transferencia) throw new Error("Completá ID TRANSFERENCIA.");
        if(!/^[a-zA-Z0-9\-_]+$/.test(payload.id_transferencia)) {
          throw new Error("ID TRANSFERENCIA: solo letras, números, guiones y guiones bajos.");
        }
      }
    }

    if(!payload.cuenta_salida) throw new Error("Completá CUENTA DE SALIDA.");
    if(!payload.empresa_cuenta_salida) throw new Error("Seleccioná EMPRESA DE SALIDA.");
    if(!payload.etiqueta) throw new Error("Seleccioná ETIQUETA.");

    if(ETIQUETAS_CON_USUARIO_CASINO.has(payload.etiqueta) && !payload.usuario_casino){
      throw new Error("Para ese concepto, completá USUARIO DEL CASINO.");
    }
    if(payload.etiqueta === "Otro" && !payload.otro_concepto){
      throw new Error("Si elegís 'Otro', completá el detalle.");
    }
    // Validación de monto mínimo solo para transferencias en ARS (pesos)
    if(ETIQUETAS_PREMIO_MINIMO.has(payload.etiqueta) && payload.moneda === 'ARS' && montoNum < 3000){
      throw new Error("Para Premio Pagado en ARS el monto debe ser >= $3000.");
    }

    const hs = normalizeHoraTextOptional(payload.hora_solicitud_cliente);
    if(hs === null) throw new Error("Hora solicitud cliente inválida (HH:MM).");
    payload.hora_solicitud_cliente = hs;

    const hq = normalizeHoraTextOptional(payload.hora_quema_fichas);
    if(hq === null) throw new Error("Hora quema fichas inválida (HH:MM).");
    payload.hora_quema_fichas = hq;

    const file = document.getElementById("comprobante").files?.[0];
    if(!file) throw new Error("Subí el comprobante.");
    const allowed = ["image/jpeg","image/png","application/pdf"];
    if(!allowed.includes(file.type)) throw new Error("Comprobante inválido (solo JPG/PNG/PDF).");
    if(file.size > 10 * 1024 * 1024) throw new Error("Comprobante muy grande (máx 10MB).");

    // Guardar datos validados globalmente
    datosEgresoValidados = {
      payload,
      montoNum,
      file
    };

    // Mostrar modal de confirmación
    mostrarModalConfirmacion(payload, montoNum, file);

  }catch(err){
    toast("❌ Error", err.message, "error");
  }finally{
    if(submitBtn){ submitBtn.disabled = false; submitBtn.textContent = prevText || "Guardar"; }
    // Restaurar estado disabled del select de turno
    if (turnoSelect && turnoDisabled) {
      turnoSelect.disabled = true;
    }
  }
}

// Mostrar modal con resumen de datos
function mostrarModalConfirmacion(payload, montoNum, file){
  const modal = document.getElementById("modalConfirmacion");
  const body = document.getElementById("confirmacionBody");

  if(!modal || !body) return;

  const montoFormatted = montoNum.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

  // Detectar si es cierre de caja
  const esCierreCaja = ETIQUETAS_CIERRE_CAJA.has(payload.etiqueta);

  body.innerHTML = `
    <p style="margin-bottom:16px; color:var(--muted);">
      Revisá que todos los datos sean correctos antes de confirmar:
    </p>
    <div class="grid">
      <div class="field span6">
        <label>FECHA</label>
        <div class="note">${escapeHtml(payload.fecha)}</div>
      </div>
      <div class="field span6">
        <label>HORA</label>
        <div class="note">${escapeHtml(payload.hora)}</div>
      </div>
      <div class="field span6">
        <label>TURNO</label>
        <div class="note">${escapeHtml(payload.turno)}</div>
      </div>
      <div class="field span6">
        <label>EMPRESA</label>
        <div class="note">${escapeHtml(payload.empresa_cuenta_salida)}</div>
      </div>
      ${!esCierreCaja && payload.id_transferencia ? `
      <div class="field span6">
        <label>ID TRANSFERENCIA</label>
        <div class="note"><strong>${escapeHtml(payload.id_transferencia)}</strong></div>
      </div>
      ` : ''}
      <div class="field span6">
        <label>MONTO</label>
        <div class="note"><strong style="color:var(--green); font-size:18px;">$ ${escapeHtml(montoFormatted)}</strong></div>
      </div>
      ${!esCierreCaja && payload.cuenta_receptora ? `
      <div class="field span6">
        <label>CUENTA RECEPTORA</label>
        <div class="note">${escapeHtml(payload.cuenta_receptora)}</div>
      </div>
      ` : ''}
      <div class="field span6">
        <label>CUENTA SALIDA</label>
        <div class="note">${escapeHtml(payload.cuenta_salida)}</div>
      </div>
      <div class="field span6">
        <label>ETIQUETA</label>
        <div class="note">${escapeHtml(payload.etiqueta)}</div>
      </div>
      ${payload.usuario_casino ? `
      <div class="field span6">
        <label>USUARIO CASINO</label>
        <div class="note">${escapeHtml(payload.usuario_casino)}</div>
      </div>
      ` : ''}
      ${payload.otro_concepto ? `
      <div class="field span12">
        <label>OTRO CONCEPTO</label>
        <div class="note">${escapeHtml(payload.otro_concepto)}</div>
      </div>
      ` : ''}
      ${payload.hora_solicitud_cliente ? `
      <div class="field span6">
        <label>HORA SOLICITUD CLIENTE</label>
        <div class="note">${escapeHtml(payload.hora_solicitud_cliente)}</div>
      </div>
      ` : ''}
      ${payload.hora_quema_fichas ? `
      <div class="field span6">
        <label>HORA QUEMA FICHAS</label>
        <div class="note">${escapeHtml(payload.hora_quema_fichas)}</div>
      </div>
      ` : ''}
      <div class="field span12">
        <label>COMPROBANTE</label>
        <div class="note" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <span>📎 ${escapeHtml(file.name)} (${escapeHtml(fileSizeMB)} MB)</span>
          <button type="button" class="btn-ver-comprobante-preview" style="padding: 6px 12px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
            👁️ Ver Comprobante
          </button>
        </div>
      </div>
      ${payload.notas ? `
      <div class="field span12">
        <label>NOTAS</label>
        <div class="note">${escapeHtml(payload.notas)}</div>
      </div>
      ` : ''}
    </div>
  `;

  modal.style.display = "flex";

  // Focus en el primer botón y agregar event listener al botón de ver comprobante
  setTimeout(() => {
    const btnConfirmar = document.getElementById("btnConfirmarEgreso");
    if(btnConfirmar) btnConfirmar.focus();

    // Agregar event listener al botón de ver comprobante
    const btnVerComprobante = document.querySelector('.btn-ver-comprobante-preview');
    if(btnVerComprobante){
      btnVerComprobante.addEventListener('click', verComprobantePreview);
      console.log('✅ Event listener agregado al botón Ver Comprobante');
    }
  }, 100);
}

// Cerrar modal
function cerrarModalConfirmacion(){
  const modal = document.getElementById("modalConfirmacion");
  if(modal) modal.style.display = "none";

  // Restaurar focus al botón submit del formulario
  const submitBtn = document.querySelector("#egresoForm button[type='submit']");
  if(submitBtn) submitBtn.focus();
}

// Ver comprobante en preview antes de confirmar
function verComprobantePreview(){
  if(!datosEgresoValidados || !datosEgresoValidados.file){
    toast("⚠️ Error", "No hay comprobante para visualizar", "error", 3000);
    return;
  }

  const file = datosEgresoValidados.file;

  // Crear URL temporal del archivo
  const fileURL = URL.createObjectURL(file);

  // Abrir en nueva ventana/pestaña
  const newWindow = window.open(fileURL, '_blank');

  if(!newWindow){
    toast("⚠️ Popups Bloqueados", "Por favor permite popups para ver el comprobante", "warning", 4000);
  } else {
    // Liberar el objeto URL después de un tiempo para evitar memory leaks
    // La nueva ventana ya tiene acceso al blob, así que es seguro liberarlo
    setTimeout(() => {
      URL.revokeObjectURL(fileURL);
    }, 1000);
  }
}

// Manejar tecla ESC para cerrar modal
function handleModalEscape(e){
  if(e.key === "Escape"){
    const modal = document.getElementById("modalConfirmacion");
    if(modal && modal.style.display === "flex"){
      cerrarModalConfirmacion();
    }
  }
}

// Registrar event listener para ESC al cargar la página
document.addEventListener("keydown", handleModalEscape);

// Confirmar y enviar el egreso
async function confirmarYEnviarEgreso(){
  if(!datosEgresoValidados) return;

  const { payload, file } = datosEgresoValidados;
  const modal = document.getElementById("modalConfirmacion");

  // Función helper para rehabilitar botones
  const rehabilitarBotones = () => {
    const btnConfirmar = document.querySelector("#modalConfirmacion .btn-primary");
    const btnCancelar = document.querySelector("#modalConfirmacion .btn-ghost");

    if(btnConfirmar){
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "✓ Confirmar y Guardar";
    }
    if(btnCancelar){
      btnCancelar.disabled = false;
    }
  };

  try{
    const btnConfirmar = document.querySelector("#modalConfirmacion .btn-primary");
    const btnCancelar = document.querySelector("#modalConfirmacion .btn-ghost");

    if(btnConfirmar){
      btnConfirmar.disabled = true;
      btnConfirmar.textContent = "Guardando...";
    }
    if(btnCancelar){
      btnCancelar.disabled = true;
    }

    const fd = new FormData();
    fd.append("data", JSON.stringify({
      fecha: payload.fecha,
      hora: payload.hora,
      turno: payload.turno,
      hora_solicitud_cliente: payload.hora_solicitud_cliente,
      hora_quema_fichas: payload.hora_quema_fichas,
      etiqueta: payload.etiqueta,
      otro_concepto: payload.otro_concepto,
      monto_transferencia_raw: payload.monto_transferencia_raw,
      moneda: payload.moneda,
      tipo_transaccion: payload.tipo_transaccion,
      cuenta_receptora: payload.cuenta_receptora,
      usuario_casino: payload.usuario_casino,
      cuenta_salida: payload.cuenta_salida,
      empresa_cuenta_salida: payload.empresa_cuenta_salida,
      id_transferencia: payload.id_transferencia,
      notas: payload.notas
    }));
    fd.append("comprobante", file);

    await api("/api/egresos", { method:"POST", body: fd, auth:true });

    // Rehabilitar botones inmediatamente después del éxito
    rehabilitarBotones();

    // Mostrar mensaje de éxito con duración extendida (8 segundos)
    toast("✅ Guardado", "Egreso registrado correctamente.", "success", 8000);

    // Cerrar modal después de un delay para que se vea el mensaje
    setTimeout(() => {
      cerrarModalConfirmacion();
      limpiarFormularioConRecordar(); // Limpia pero mantiene valores recordados

      // Limpiar datos validados
      datosEgresoValidados = null;
    }, 2500); // Esperar 2.5 segundos antes de cerrar modal y resetear

  }catch(err){
    // Rehabilitar botones inmediatamente en caso de error
    rehabilitarBotones();

    toast("❌ Error", err.message, "error", 10000);
  }
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

    console.log("🔍 URL CSV:", url);
    console.log("🔍 Filtros aplicados:", { fecha_desde, fecha_hasta, empresa_salida, etiqueta, moneda, usuario_casino, id_transferencia, monto_min, monto_max, turno, cuenta_receptora, created_by });

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

    toast("✅ CSV descargado", "Archivo exportado exitosamente", "success", 5000);
  }catch(err){
    toast("Error CSV", err.message);
  }
}

/* =========================
   USUARIOS (admin)
   ========================= */
async function loadUsers(){
  const tbody = document.getElementById("usersTbody");
  if(!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="muted">Cargando…</td></tr>`;

  try{
    const { users } = await api("/api/users");
    renderUsers(users);
  }catch(err){
    tbody.innerHTML = `<tr><td colspan="7" class="muted">${err.message}</td></tr>`;
  }
}

function renderUsers(users){
  const tbody = document.getElementById("usersTbody");
  if(!tbody) return;

  // Verificar si el usuario actual es admin
  const currentUser = getUser();
  const isCurrentUserAdmin = currentUser && currentUser.role === "admin";

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>
        ${isCurrentUserAdmin
          ? `<input data-edit-username="${u.id}" value="${escapeHtml(u.username ?? '')}" placeholder="username">`
          : escapeHtml(u.username ?? u.full_name ?? '')
        }
      </td>
      <td><input data-edit-name="${u.id}" value="${escapeHtml(u.full_name||"")}" placeholder="Nombre completo"></td>
      <td>
        <select data-edit-role="${u.id}">
          <option value="empleado" ${u.role==="empleado"?"selected":""}>Empleado</option>
          <option value="encargado" ${u.role==="encargado"?"selected":""}>Encargado</option>
          <option value="direccion" ${u.role==="direccion"?"selected":""}>Dirección</option>
          <option value="admin" ${u.role==="admin"?"selected":""}>Admin</option>
        </select>
      </td>
      <td><input type="checkbox" data-edit-active="${u.id}" ${u.is_active?"checked":""}></td>
      <td>${u.created_at ? new Date(u.created_at).toLocaleString() : ""}</td>
      <td class="row-actions">
        <button class="btn btn-small" data-save-user="${u.id}">Guardar</button>
        <button class="btn btn-small btn-danger" data-reset-pass="${u.id}">Reset pass</button>
      </td>
    </tr>
  `).join("");

  bindUserRowActions();
}

function bindUserRowActions(){
  document.querySelectorAll("[data-save-user]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.saveUser;

      // Obtener valores del formulario
      const usernameInput = document.querySelector(`[data-edit-username="${id}"]`);
      const full_name = document.querySelector(`[data-edit-name="${id}"]`)?.value ?? "";
      const role = document.querySelector(`[data-edit-role="${id}"]`)?.value ?? "empleado";
      const is_active = !!document.querySelector(`[data-edit-active="${id}"]`)?.checked;

      // Construir body - solo incluir username si el input existe (admin)
      const body = { full_name, role, is_active };
      if (usernameInput) {
        const username = usernameInput.value.trim();
        if (!username) {
          toast("⚠️ Username vacío", "El username no puede estar vacío", "warning");
          return;
        }
        body.username = username;
      }

      try{
        await api(`/api/users/${id}`, { method:"PUT", body });
        toast("✅ Guardado","Usuario actualizado correctamente", "success");
        // Recargar la lista de usuarios para mostrar los cambios
        loadUsers();
      }catch(err){
        toast("❌ Error", err.message, "error");
      }
    });
  });

  // Variable para guardar el ID del usuario a resetear
  let resetUserId = null;

  document.querySelectorAll("[data-reset-pass]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = btn.dataset.resetPass;
      resetUserId = id;

      // Mostrar modal
      const modal = document.getElementById("resetPasswordModal");
      const input = document.getElementById("reset_password");
      if(modal && input) {
        modal.style.display = "flex";
        input.value = "";
        input.focus();
      }
    });
  });

  // Cerrar modal
  const closeResetModal = () => {
    const modal = document.getElementById("resetPasswordModal");
    if(modal) modal.style.display = "none";
    resetUserId = null;
  };

  document.getElementById("btnCloseResetModal")?.addEventListener("click", closeResetModal);
  document.getElementById("btnCancelReset")?.addEventListener("click", closeResetModal);

  // Confirmar reset
  document.getElementById("btnConfirmReset")?.addEventListener("click", async ()=>{
    const pass = document.getElementById("reset_password")?.value || "";
    if(!pass || !resetUserId) return;

    try{
      await api(`/api/users/${resetUserId}/reset-password`, { method:"POST", body:{ password: pass } });
      toast("✅ Guardado","Contraseña actualizada correctamente", "success");
      closeResetModal();
    }catch(err){
      toast("❌ Error", err.message, "error");
    }
  });

  // Cerrar modal al hacer click fuera
  document.getElementById("resetPasswordModal")?.addEventListener("click", (e)=>{
    if(e.target.id === "resetPasswordModal") closeResetModal();
  });
}

async function createUser(){
  const u = document.getElementById("u_username")?.value?.trim() || "";
  const p = document.getElementById("u_password")?.value || "";
  const pConfirm = document.getElementById("u_password_confirm")?.value || "";
  const r = document.getElementById("u_role")?.value || "empleado";
  const n = document.getElementById("u_fullname")?.value?.trim() || "";

  if(!u || !p){
    toast("⚠ Faltan datos","Username y contraseña son obligatorios", "warning");
    return;
  }

  if(p !== pConfirm){
    toast("⚠ Contraseñas no coinciden","Las contraseñas deben ser idénticas", "warning");
    return;
  }

  try{
    await api("/api/users", { method:"POST", body:{ username:u, password:p, role:r, full_name:n } });
    toast("✅ Usuario creado","El nuevo usuario ya puede iniciar sesión", "success");
    document.getElementById("u_username").value = "";
    document.getElementById("u_password").value = "";
    document.getElementById("u_password_confirm").value = "";
    document.getElementById("u_fullname").value = "";
    loadUsers();
  }catch(err){
    toast("❌ Error", err.message, "error");
  }
}

// Validación en tiempo real de coincidencia de contraseñas
function setupPasswordMatchValidation(){
  const passInput = document.getElementById("u_password");
  const passConfirmInput = document.getElementById("u_password_confirm");
  const indicator = document.getElementById("password_match_indicator");

  if(!passInput || !passConfirmInput || !indicator) return;

  function checkMatch(){
    const pass = passInput.value;
    const passConfirm = passConfirmInput.value;

    if(!passConfirm){
      indicator.textContent = "Las contraseñas deben coincidir";
      indicator.style.color = "var(--muted)";
      return;
    }

    if(pass === passConfirm){
      indicator.textContent = "✓ Las contraseñas coinciden";
      indicator.style.color = "#10b981";
    } else {
      indicator.textContent = "✗ Las contraseñas NO coinciden";
      indicator.style.color = "#ef4444";
    }
  }

  passInput.addEventListener("input", checkMatch);
  passConfirmInput.addEventListener("input", checkMatch);
}

/* =========================
   LOGS (admin)
   ========================= */
let logsOffset = 0;
const LOGS_LIMIT = 20;

async function loadLogs(){
  const tbody = document.getElementById("logsTbody");
  if(!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" class="muted">Cargando…</td></tr>`;

  const username = document.getElementById("logUsername")?.value?.trim() || "";
  const action = document.getElementById("logAction")?.value?.trim() || "";
  const from = document.getElementById("logFrom")?.value || "";
  const to = document.getElementById("logTo")?.value || "";

  const qs = new URLSearchParams();
  qs.set("limit", String(LOGS_LIMIT));
  qs.set("offset", String(logsOffset));
  if(username) qs.set("username", username);
  if(action) qs.set("action", action);
  if(from) qs.set("from", from);
  if(to) qs.set("to", to);

  try{
    const { logs, total, limit, offset } = await api(`/api/logs?${qs.toString()}`);

    const rows = logs.map(l => {
      const dt = l.created_at ? new Date(l.created_at).toLocaleString() : "";
      const ok = l.success ? "✅" : "❌";
      const detail = l.details ? JSON.stringify(l.details) : "";
      return `
        <tr>
          <td>${dt}</td>
          <td>${l.actor_username || "-"}</td>
          <td>${l.actor_role || "-"}</td>
          <td>${l.action}</td>
          <td>${l.entity || "-"}</td>
          <td>${l.entity_id || "-"}</td>
          <td>${ok}</td>
          <td>${l.ip || "-"}</td>
          <td style="max-width:360px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${detail.replace(/"/g,"&quot;")}">
            ${detail}
          </td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = rows || `<tr><td colspan="9" class="muted">Sin resultados</td></tr>`;

    // Actualizar info de paginación
    const info = document.getElementById("logsPageInfo");
    if(info){
      const start = offset + 1;
      const end = Math.min(offset + logs.length, total);
      info.textContent = `Mostrando ${start}-${end} de ${total} logs`;
    }

    // Deshabilitar botones según corresponda
    const btnPrev = document.getElementById("btnPrevLogs");
    const btnNext = document.getElementById("btnNextLogs");
    if(btnPrev) btnPrev.disabled = offset === 0;
    if(btnNext) btnNext.disabled = offset + logs.length >= total;

  }catch(err){
    tbody.innerHTML = `<tr><td colspan="9" class="muted">${err.message}</td></tr>`;
  }
}

function logsPrev(){
  logsOffset = Math.max(logsOffset - LOGS_LIMIT, 0);
  loadLogs();
}
function logsNext(){
  logsOffset += LOGS_LIMIT;
  loadLogs();
}
function clearLogsFilters(){
  document.getElementById("logUsername").value = "";
  document.getElementById("logAction").value = "";
  document.getElementById("logFrom").value = "";
  document.getElementById("logTo").value = "";
  logsOffset = 0;
  loadLogs();
}

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
      ? '<span style="background: #059669; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">💵 USD</span>'
      : '<span style="background: #0891b2; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">💵 ARS</span>';

    const status = e.status || 'activo';
    const statusBadge = status === 'activo'
      ? '<span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">✓ ACTIVO</span>'
      : status === 'anulado'
      ? '<span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">✗ ANULADO</span>'
      : status === 'editada'
      ? '<span style="background: #3b82f6; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">✏️ EDITADA</span>'
      : '<span style="background: #f59e0b; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">⏳ PENDIENTE</span>';

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
          <button class="btn btn-small btn-primary" data-ver-detalle="${e.id}">👁️ Ver</button>
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
    sumaTotalEl.textContent = partes.length > 0 ? `💰 ${partes.join(" | ")}` : "—";
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
  console.log('🔍 bindVerDetalleButtons llamada con', egresos.length, 'egresos');
  const buttons = document.querySelectorAll("[data-ver-detalle]");
  console.log('🔍 Botones encontrados:', buttons.length);

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      console.log('👁️ Click en botón Ver detectado');
      const id = Number(btn.dataset.verDetalle);
      console.log('🔍 ID del egreso:', id, 'tipo:', typeof id);
      console.log('🔍 Primer egreso del array:', egresos[0]);
      // Buscar comparando flexiblemente (número o string)
      const egreso = egresos.find(e => Number(e.id) === id);
      console.log('🔍 Egreso encontrado:', egreso);
      if(egreso) {
        console.log('✅ Llamando a mostrarDetalle...');
        mostrarDetalle(egreso);
      } else {
        console.error('❌ No se encontró el egreso con ID:', id);
        console.error('❌ Todos los IDs en array:', egresos.map(e => e.id));
      }
    });
  });
}

// Variable global para almacenar el egreso actual
let currentEgreso = null;

function mostrarDetalle(e){
  currentEgreso = e; // Guardar egreso en variable global
  console.log('📋 mostrarDetalle llamada con egreso:', e);
  const modal = document.getElementById("detalleModal");
  const body = document.getElementById("detalleBody");
  console.log('🔍 Modal element:', modal);
  console.log('🔍 Body element:', body);

  if(!modal || !body) {
    console.error('❌ ERROR: Modal o body no encontrado!', { modal, body });
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
    ? `<a href="${escapeHtml(comprobanteUrl)}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">📄 Ver PDF en nueva ventana</a>`
    : `<a href="${escapeHtml(comprobanteUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(comprobanteUrl)}" style="max-width: 100%; max-height: 400px; border-radius: 8px;" alt="Comprobante" onerror="this.parentElement.innerHTML='❌ Error cargando imagen'"></a>`;

  // Estado visual
  const status = e.status || 'activo';
  const statusBadge = status === 'activo'
    ? '<span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">✓ ACTIVO</span>'
    : status === 'anulado'
    ? '<span style="background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">✗ ANULADO</span>'
    : status === 'editada'
    ? '<span style="background: #3b82f6; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">✏️ EDITADA</span>'
    : '<span style="background: #f59e0b; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">⏳ PENDIENTE</span>';

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
              ✏️ Editar
            </button>
            ${canDelete ? `
              <button class="btn btn-eliminar-egreso" data-egreso-id="${e.id}" style="flex: 1; min-width: 140px; background: #ef4444; color: white;">
                🗑️ Eliminar
              </button>
            ` : ''}
          ` : ''}
          <button class="btn btn-ghost btn-ver-historial" data-egreso-id="${e.id}" style="flex: 1; min-width: 140px;">
            📜 Ver Historial
          </button>
        </div>
      </div>` : ''}
    </div>
  `;

  console.log('✅ HTML generado, mostrando modal...');
  console.log('🔍 Estado actual del modal:', modal.style.display);
  modal.style.display = "flex";

  console.log('✅ Modal mostrado con display:', modal.style.display);

  // Agregar event listeners a los botones de acción
  setTimeout(() => {
    const btnEditar = document.querySelector('.btn-editar-egreso');
    const btnEliminar = document.querySelector('.btn-eliminar-egreso');
    const btnHistorial = document.querySelector('.btn-ver-historial');

    if (btnEditar) {
      btnEditar.addEventListener('click', () => {
        console.log('🖊️ Botón Editar clickeado');
        editarEgresoModal();
      });
    }

    if (btnEliminar) {
      btnEliminar.addEventListener('click', () => {
        const egresoId = btnEliminar.dataset.egresoId;
        console.log('🗑️ Botón Eliminar clickeado, ID:', egresoId);
        mostrarModalEliminar(egresoId);
      });
    }

    if (btnHistorial) {
      btnHistorial.addEventListener('click', () => {
        const egresoId = btnHistorial.dataset.egresoId;
        console.log('📜 Botón Historial clickeado, ID:', egresoId);
        verHistorial(egresoId);
      });
    }
  }, 100);
}

function cerrarModal(){
  console.log('🚪 cerrarModal llamada');
  const modal = document.getElementById("detalleModal");
  if(modal) {
    modal.style.display = "none";
    console.log('✅ Modal cerrado');
  }
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
      <h3 style="margin: 0 0 8px 0;">✏️ Editar Transferencia</h3>
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
        <label>ID TRANSFERENCIA ${esCierreCaja ? '' : '*'}</label>
        <input type="text" id="edit_id_transferencia" value="${escapeHtml(egreso.id_transferencia || '')}" ${esCierreCaja ? '' : 'required'}>
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
        <button type="submit" class="btn btn-primary" id="btnGuardarEdicion">✓ Guardar Cambios</button>
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
      if(inputIdTransferencia) inputIdTransferencia.required = !esCierreCajaNuevo;
      if(inputCuentaReceptora) inputCuentaReceptora.required = !esCierreCajaNuevo;
    });
  }

  // Manejar submit del formulario
  document.getElementById('formEditarEgreso').addEventListener('submit', async (e) => {
    e.preventDefault();

    const submitBtn = document.getElementById('btnGuardarEdicion');
    const originalText = submitBtn?.textContent || '✓ Guardar Cambios';

    // Deshabilitar botón y mostrar loading
    if(submitBtn){
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      const motivo = document.getElementById('edit_motivo').value.trim();
      if(!motivo){
        toast("⚠️ Falta motivo", "Debés especificar el motivo del cambio", "warning");
        return;
      }

      // Validar fecha
      const fechaValue = document.getElementById('edit_fecha').value.trim();
      const fechaRegex = /^(\d{2})\/(\d{2})\/(\d{4})$/;
      const fechaMatch = fechaValue.match(fechaRegex);

      if(!fechaMatch){
        toast("⚠️ Fecha inválida", "Formato debe ser dd/mm/aaaa", "warning");
        return;
      }

      const [_, dia, mes, anio] = fechaMatch;
      const anioNum = parseInt(anio, 10);
      const anioActual = new Date().getFullYear();

      if(anioNum !== anioActual){
        toast("⚠️ Año inválido", `La fecha debe ser del año ${anioActual}`, "warning");
        return;
      }

      const montoValue = document.getElementById('edit_monto').value;
      const montoParsed = parseMontoARSStrict(montoValue);

      // Validar monto
      if(!montoParsed || montoParsed <= 0){
        toast("⚠️ Monto inválido", "Ingresá un monto válido (ej: 12000 o 12000,50)", "warning");
        return;
      }

      const etiquetaEdit = document.getElementById('edit_etiqueta').value;
      const esCierreCajaEdit = ETIQUETAS_CIERRE_CAJA.has(etiquetaEdit);
      const monedaRaw = document.getElementById('edit_moneda').value;
      const monedaEdit = (monedaRaw === 'USD' || monedaRaw === 'ARS')
        ? monedaRaw
        : (String(monedaRaw || '').toUpperCase().includes('USD') ? 'USD' : 'ARS');
      const idTransferenciaEdit = document.getElementById('edit_id_transferencia')?.value?.trim() || null;
      const cuentaReceptoraEdit = document.getElementById('edit_cuenta_receptora')?.value?.trim() || null;

      if(!esCierreCajaEdit && (!idTransferenciaEdit || !cuentaReceptoraEdit)){
        toast("⚠️ Faltan datos", "Completá ID TRANSFERENCIA y CUENTA RECEPTORA", "warning");
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
      toast("✅ Actualizado", "Egreso modificado correctamente. Estado cambiado a EDITADA.", "success");
      cerrarModal();
      buscarEgresos(); // Recargar listado
    } catch(err) {
      toast("❌ Error", err.message, "error");
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
async function actualizarEgreso(id, updates){
  try{
    await api(`/api/egresos/${id}`, { method: 'PUT', body: updates });
    toast("✅ Actualizado", "Egreso modificado correctamente", "success");
    cerrarModal();
    buscarEgresos(); // Recargar listado
  }catch(err){
    toast("❌ Error", err.message, "error");
  }
}

function mostrarModalEliminar(id){
  const confirmacion = confirm(`⚠️ ¿Estás seguro que querés ELIMINAR el egreso #${id}?\n\nEsta acción NO se puede deshacer.\nEl egreso será eliminado permanentemente de la base de datos.`);

  if(!confirmacion) return;

  eliminarEgreso(id);
}

async function eliminarEgreso(id){
  try{
    await api(`/api/egresos/${id}`, { method: 'DELETE' });
    toast("✅ Eliminado", "Egreso eliminado correctamente", "success", 5000);
    cerrarModal();
    buscarEgresos(); // Recargar listado
  }catch(err){
    toast("❌ Error", err.message, "error");
  }
}

async function verHistorial(id){
  try{
    const data = await api(`/api/egresos/${id}/history`);

    if(!data.changes || data.changes.length === 0){
      toast("ℹ️ Sin cambios", "Este egreso no tiene historial de modificaciones", "info");
      return;
    }

    mostrarHistorialModal(id, data.changes);

  }catch(err){
    toast("❌ Error", err.message, "error");
  }
}

function mostrarHistorialModal(egresoId, changes){
  const modal = document.getElementById("detalleModal");
  const body = document.getElementById("detalleBody");
  if(!modal || !body) return;

  const rows = changes.map(c => {
    const changeTypeLabel = {
      'CREATE': '🆕 Creado',
      'UPDATE': '✏️ Modificado',
      'ANULAR': '✗ Anulado',
      'REACTIVAR': '↻ Reactivado',
      'DELETE': '🗑️ Eliminado'
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
      <h3 style="margin: 0 0 8px 0;">📜 Historial de Cambios</h3>
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
   TEMA CLARO/OSCURO
   ========================= */
function initThemeToggle() {
  const themeToggleBtn = document.getElementById("themeToggle");
  const themeToggleMobileBtn = document.getElementById("themeToggleMobile");

  // Cargar tema guardado desde localStorage (por defecto: oscuro)
  const savedTheme = localStorage.getItem("theme") || "dark";
  applyTheme(savedTheme);

  // Event listeners para ambos botones (desktop y mobile)
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
  }
  if (themeToggleMobileBtn) {
    themeToggleMobileBtn.addEventListener("click", toggleTheme);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
  const newTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(newTheme);
  localStorage.setItem("theme", newTheme);
}

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
    updateThemeIcon("☀️");
  } else {
    document.documentElement.removeAttribute("data-theme");
    updateThemeIcon("🌙");
  }
}

function updateThemeIcon(icon) {
  const themeToggleBtn = document.getElementById("themeToggle");
  const themeToggleMobileBtn = document.getElementById("themeToggleMobile");
  if (themeToggleBtn) themeToggleBtn.textContent = icon;
  if (themeToggleMobileBtn) themeToggleMobileBtn.textContent = icon;
}

/* =========================
   BOOTSTRAP
   ========================= */
document.addEventListener("DOMContentLoaded", ()=>{
  // Login
  const loginForm = document.getElementById("loginForm");
  if(loginForm){
    loginForm.addEventListener("submit", handleLogin);
    return;
  }

  // Protected
  if(!requireAuth()) return;

  // Activar monitor de inactividad
  setupInactivityMonitor();

  // Inicializar tema claro/oscuro
  initThemeToggle();

  hydrateTopbar();
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("logoutBtnMobile")?.addEventListener("click", logout);

  // Mobile Menu Logic
  const hamburgerBtn = document.getElementById("hamburgerBtn");
  const mobileDrawer = document.getElementById("mobileDrawer");
  const closeDrawerBtn = document.getElementById("closeDrawerBtn");
  const drawerOverlay = document.getElementById("drawerOverlay");

  function toggleMenu(){
    if(!mobileDrawer) return;
    const isClosed = !mobileDrawer.classList.contains("open");
    mobileDrawer.classList.toggle("open", isClosed);
    if(drawerOverlay) drawerOverlay.classList.toggle("show", isClosed);
    mobileDrawer.setAttribute("aria-hidden", !isClosed);
    if(hamburgerBtn) hamburgerBtn.setAttribute("aria-expanded", isClosed);
  }

  if(hamburgerBtn) hamburgerBtn.addEventListener("click", toggleMenu);
  if(closeDrawerBtn) closeDrawerBtn.addEventListener("click", toggleMenu);
  if(drawerOverlay) drawerOverlay.addEventListener("click", toggleMenu);

  // Egreso
  if(document.getElementById("egresoForm")){
    populateEtiquetas();
    populateEmpresasSalida();
    toggleCasinoUserField();
    toggleOtroConcepto();
    fileLabel();
    wireIdTransferenciaAlphanumeric();
    wireSinIdTransferencia(); // Checkbox "Sin ID de transferencia"
    wireFechaValidation(); // Validación de formato dd/mm/aaaa
    wireIdTransferenciaValidation(); // Validación de ID duplicado en tiempo real
    wireNombresValidation(); // Validación de nombres (solo letras y espacios)
    conectarValidacionTiempoReal(); // Validación en tiempo real

    // Sistema de recordar valores (con pequeño delay para asegurar que los selects estén poblados)
    setTimeout(() => {
      restaurarValoresRecordados();
    }, 100);
    conectarRecordarValores();

    // Auto-calcular turno según la hora
    const horaInput = document.getElementById("hora");
    if (horaInput) {
      horaInput.addEventListener("change", autoCalcularTurno);
      horaInput.addEventListener("input", autoCalcularTurno);
    }

    document.getElementById("etiqueta")?.addEventListener("change", ()=>{
      toggleCasinoUserField();
      toggleOtroConcepto();
      toggleCamposPremio();
      toggleModoTurnoCierreCaja();
    });

    // Listener para tipo_transaccion en páginas USD
    if (IS_USD_PAGE) {
      const tipoSelect = document.getElementById("tipo_transaccion");
      if (tipoSelect) {
        tipoSelect.addEventListener('change', handleTipoTransaccionChange);
      }
    }

    const inputComprobante = document.getElementById("comprobante");
    if (inputComprobante) {
      inputComprobante.addEventListener("change", fileLabel);
    }
    wireDropZone();
    document.getElementById("egresoForm")?.addEventListener("submit", handleEgresoSubmit);

    // Event listeners para el modal de confirmación
    document.getElementById("btnCerrarModal")?.addEventListener("click", cerrarModalConfirmacion);
    document.getElementById("btnCancelarEgreso")?.addEventListener("click", cerrarModalConfirmacion);
    document.getElementById("btnConfirmarEgreso")?.addEventListener("click", confirmarYEnviarEgreso);
    document.getElementById("modalBackdrop")?.addEventListener("click", cerrarModalConfirmacion);
  }

  // Usuarios
  if(document.getElementById("usersTable")){
    setupPasswordMatchValidation();
    document.getElementById("btnCreateUser")?.addEventListener("click", createUser);
    document.getElementById("btnReloadUsers")?.addEventListener("click", loadUsers);
    loadUsers();
  }

  // Logs
  if(document.getElementById("logsTable")){
    document.getElementById("btnLoadLogs")?.addEventListener("click", ()=>{ logsOffset = 0; loadLogs(); });
    document.getElementById("btnClearLogsFilters")?.addEventListener("click", clearLogsFilters);
    document.getElementById("btnPrevLogs")?.addEventListener("click", logsPrev);
    document.getElementById("btnNextLogs")?.addEventListener("click", logsNext);
    loadLogs();
  }

  // Consulta Egresos
  if(document.getElementById("egresosTable")){
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
  }


});

// ===================================================================
// SISTEMA DE NOTIFICACIONES EN TIEMPO REAL
// ===================================================================

// Variables globales
let notificationEventSource = null;
let notifications = [];
let unreadCount = 0;

// Conectar a SSE (Server-Sent Events)
function connectToNotifications() {
  const token = getToken();
  if (!token) return;

  // Cerrar conexión anterior si existe
  if (notificationEventSource) {
    notificationEventSource.close();
  }

  const url = `${API_BASE}/api/notifications/stream`;
  notificationEventSource = new EventSource(url + `?token=${encodeURIComponent(token)}`);

  notificationEventSource.onopen = () => {
    console.log("📡 Conectado a notificaciones en tiempo real");
  };

  notificationEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log("📨 Notificación recibida:", data);

      if (data.type === "connected") {
        console.log("✅ Conexión SSE establecida");
        return;
      }

      // Agregar notificación
      handleNewNotification(data);

    } catch (error) {
      console.error("Error procesando notificación:", error);
    }
  };

  notificationEventSource.onerror = (error) => {
    console.error("Error en SSE:", error);
    notificationEventSource.close();

    // Reconectar después de 5 segundos
    setTimeout(() => {
      console.log("🔄 Reintentando conexión a notificaciones...");
      connectToNotifications();
    }, 5000);
  };
}

// Manejar nueva notificación
function handleNewNotification(data) {
  const notification = {
    id: Date.now(),
    type: data.type,
    title: data.title,
    message: data.message,
    category: data.category || "info",
    timestamp: new Date(data.timestamp || Date.now()),
    read: false,
    data: data.data || {}
  };

  // Agregar a la lista
  notifications.unshift(notification);
  unreadCount++;

  // Actualizar UI
  updateNotificationBadge();
  updateNotificationPanel();

  // Mostrar toast
  showToast(notification);
}

// Mostrar toast notification (para notificaciones en tiempo real)
function showToast(notification) {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = {
    success: "✅",
    warning: "⚠️",
    error: "❌",
    info: "ℹ️"
  };

  const toastEl = document.createElement("div");
  toastEl.className = `toast ${notification.category}`;

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = icons[notification.category] || icons.info;

  const content = document.createElement("div");
  content.className = "toast-content";

  const titleEl = document.createElement("div");
  titleEl.className = "toast-title";
  titleEl.textContent = notification.title;

  const messageEl = document.createElement("div");
  messageEl.className = "toast-message";
  messageEl.textContent = notification.message;

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "Cerrar notificación");
  closeBtn.addEventListener("click", () => toastEl.remove());

  content.appendChild(titleEl);
  content.appendChild(messageEl);

  toastEl.appendChild(icon);
  toastEl.appendChild(content);
  toastEl.appendChild(closeBtn);

  container.appendChild(toastEl);

  // Auto-remover después de 5 segundos
  setTimeout(() => {
    toastEl.style.animation = "slideOut 0.3s ease-out";
    setTimeout(() => toastEl.remove(), 300);
  }, 5000);
}

// Actualizar badge de notificaciones
function updateNotificationBadge() {
  const badge = document.getElementById("notificationBadge");
  if (!badge) return;

  if (unreadCount > 0) {
    badge.textContent = unreadCount > 99 ? "99+" : unreadCount;
    badge.style.display = "block";
  } else {
    badge.style.display = "none";
  }
}

// Actualizar panel de notificaciones
function updateNotificationPanel() {
  const list = document.getElementById("notificationList");
  if (!list) return;

  if (notifications.length === 0) {
    list.innerHTML = '<div class="notification-empty">No hay notificaciones</div>';
    return;
  }

  list.innerHTML = notifications.map(n => {
    const timeAgo = getTimeAgo(n.timestamp);
    return `
      <div class="notification-item ${n.read ? "" : "unread"} ${n.category}" data-id="${n.id}">
        <div class="notification-title">${escapeHtml(n.title)}</div>
        <div class="notification-message">${escapeHtml(n.message)}</div>
        <div class="notification-time">${timeAgo}</div>
      </div>
    `;
  }).join("");

  // Agregar event listeners
  list.querySelectorAll(".notification-item").forEach(item => {
    item.addEventListener("click", () => {
      const id = parseInt(item.dataset.id);
      markNotificationAsRead(id);
    });
  });
}

// Marcar notificación como leída
function markNotificationAsRead(id) {
  const notification = notifications.find(n => n.id === id);
  if (notification && !notification.read) {
    notification.read = true;
    unreadCount = Math.max(0, unreadCount - 1);
    updateNotificationBadge();
    updateNotificationPanel();
  }
}

// Marcar todas como leídas
function markAllAsRead() {
  notifications.forEach(n => n.read = true);
  unreadCount = 0;
  updateNotificationBadge();
  updateNotificationPanel();
}

// Limpiar todas las notificaciones
function clearAllNotifications() {
  notifications = [];
  unreadCount = 0;
  updateNotificationBadge();
  updateNotificationPanel();
}

// Obtener tiempo relativo (hace X tiempo)
function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return "Hace un momento";
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86400) return `Hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 604800) return `Hace ${Math.floor(seconds / 86400)} días`;

  return date.toLocaleDateString();
}

// Event listeners para el panel de notificaciones
document.addEventListener("DOMContentLoaded", () => {
  const notificationBtn = document.getElementById("notificationBtn");
  const notificationPanel = document.getElementById("notificationPanel");
  const closePanel = document.getElementById("closeNotificationPanel");
  const clearAllBtn = document.getElementById("clearAllNotifications");

  if (notificationBtn) {
    notificationBtn.addEventListener("click", () => {
      const isVisible = notificationPanel.style.display === "flex";
      notificationPanel.style.display = isVisible ? "none" : "flex";

      if (!isVisible) {
        // Marcar todas como leídas al abrir el panel
        markAllAsRead();
      }
    });
  }

  if (closePanel) {
    closePanel.addEventListener("click", () => {
      notificationPanel.style.display = "none";
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => {
      clearAllNotifications();
    });
  }

  // Cerrar panel al hacer click fuera
  document.addEventListener("click", (e) => {
    if (notificationPanel && notificationPanel.style.display === "flex") {
      if (!notificationPanel.contains(e.target) && !notificationBtn.contains(e.target)) {
        notificationPanel.style.display = "none";
      }
    }
  });

  // Conectar a notificaciones si hay un token
  if (getToken()) {
    connectToNotifications();
  }
});

/* =========================
   SECCIÓN: SALDOS DE CUENTAS
   ========================= */

// Variables globales para modal de saldos
let modalSaldosData = { empresa: '', cuenta: '', moneda: '', egresos: [], inicioCaja: 0 };

// Inicializar página de saldos
if (location.pathname.includes("saldos.html")) {
  document.addEventListener("DOMContentLoaded", initSaldosPage);
}

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

    toast("✅ CSV descargado", "Saldos exportados correctamente", "success");
  } catch (err) {
    console.error("Error descargando CSV de saldos:", err);
    toast("❌ Error", err.message || "No se pudo descargar el CSV", "error");
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
        <div style="font-size: 3rem; margin-bottom: 16px;">📭</div>
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
              <span class="stat-label">🏦 Inicio de Caja</span>
              <span class="stat-value ${inicioCajaClass}" style="font-weight: 700;">${inicioCaja >= 0 ? '' : '-'}$${fmtNum(inicioCaja)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">📥 Entradas</span>
              <span class="stat-value entrada">+$${fmtNum(entradas)}</span>
            </div>
            <div class="stat-row">
              <span class="stat-label">📤 Salidas</span>
              <span class="stat-value salida">-$${fmtNum(salidas)}</span>
            </div>
            <div class="stat-row" style="border-top: 1px solid var(--border); padding-top: 6px; margin-top: 6px;">
              <span class="stat-label">💰 Balance</span>
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
        <button class="btn btn-primary btn-small" id="btnAplicarFiltrosModal">🔍 Filtrar</button>
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
    const tipoIcon = e.tipo_transaccion === "ENTRADA" ? "📥" : "📤";

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
