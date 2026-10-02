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
const STORAGE_KEY_SIDEBAR_COLLAPSED = "mm_sidebar_collapsed";
const STORAGE_KEY_REMEMBER_LOGIN = "mm_remember_login";
const STORAGE_KEY_SAVED_LOGIN = "mm_saved_login";
const STORAGE_KEY_NOTIFICATIONS = "mm_notifications_v1";
const NOTIFICATION_HISTORY_MAX = 100;

console.log('API_BASE:', API_BASE);

/* =========================
   DATOS (selects)
   ========================= */
// Fallbacks si /api/options no responde. Origen de verdad: tabla select_options.
const EMPRESAS_SALIDA = ["Telepagos", "Copter", "Palta", "Personal Pay", "Lemoncash", "NaranjaX", "TrustWallet", "Mercado Pago", "Brubank", "Binance", "AstroPay", "DolarApp", "Uala", "Cuenta DNI", "Lohas", "Banco Nacion", "Otra (Especificar en notas)"];

/** Turnos de cierre de caja — única definición del frontend. */
const TURNOS_CIERRE = ["Turno mañana", "Turno tarde", "Turno noche"];

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
  "[Otra] Pago Diseñadora",
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
   OPCIONES DINÁMICAS (desde DB)
   ========================= */
let _optionsLoaded = false;
let _empresasCache = [];
let _etiquetasCache = [];
let _etiquetaFlagsCache = {};

async function loadSelectOptions() {
  if (_optionsLoaded) return;
  try {
    const [empRes, etqRes] = await Promise.all([
      api("/api/options?type=empresa"),
      api("/api/options?type=etiqueta")
    ]);
    _empresasCache = empRes.options.map(o => o.value);
    _etiquetasCache = etqRes.options.map(o => o.value);
    _etiquetaFlagsCache = {};
    etqRes.options.forEach(o => {
      _etiquetaFlagsCache[o.value] = {
        usuario_casino: o.flag_usuario_casino,
        premio_minimo: o.flag_premio_minimo,
        cierre_caja: o.flag_cierre_caja
      };
    });
    _optionsLoaded = true;
  } catch (err) {
    console.warn("Error cargando opciones dinámicas, usando fallback hardcodeado:", err.message);
    _empresasCache = [...EMPRESAS_SALIDA];
    _etiquetasCache = [...ETIQUETAS];
    _etiquetaFlagsCache = {};
    ETIQUETAS.forEach(e => {
      _etiquetaFlagsCache[e] = {
        usuario_casino: ETIQUETAS_CON_USUARIO_CASINO.has(e),
        premio_minimo: ETIQUETAS_PREMIO_MINIMO.has(e),
        cierre_caja: ETIQUETAS_CIERRE_CAJA.has(e)
      };
    });
    _optionsLoaded = true;
  }
}

function getEmpresas() { return _empresasCache.length ? _empresasCache : EMPRESAS_SALIDA; }
function getEtiquetas_dynamic() { return _etiquetasCache.length ? _etiquetasCache : ETIQUETAS; }
function getEtiquetaFlags(value) { return _etiquetaFlagsCache[value] || { usuario_casino: false, premio_minimo: false, cierre_caja: false }; }
function reloadSelectOptions() { _optionsLoaded = false; return loadSelectOptions(); }

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
   ERRORES EN CAMPOS (inline)
   ========================= */
function setFieldError(inputId, message) {
  const input = document.getElementById(inputId);
  const errEl = document.getElementById(`${inputId}_error`);
  if (!input && !errEl) return;

  if (input) {
    if (message) input.classList.add("input-invalid");
    else input.classList.remove("input-invalid");
  }

  if (errEl) {
    errEl.textContent = message || "";
    errEl.style.display = message ? "block" : "none";
  }
}

function clearFieldError(inputId) {
  setFieldError(inputId, "");
}

function clearFieldErrors(inputIds) {
  (inputIds || []).forEach(clearFieldError);
}

/* =========================
   TOAST - Sistema Unificado
   ========================= */
function toast(title, msg, type = "error", duration = null){
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const icons = {
    success: "OK",
    warning: "AVISO",
    error: "ERROR",
    info: "INFO"
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
    button.textContent = "OCUL";
  } else {
    input.type = "password";
    button.style.opacity = "0.6";
    button.textContent = "VER";
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

/* =========================
   PARSEO Y NORMALIZACIÓN
   ========================= */
function parseMontoARSStrict(raw){
  let v = String(raw || "").trim();
  if(!v) return null;

  v = v.replace(/\s+/g, "").replace(/^\$/, "");
  if(!/^[0-9.,]+$/.test(v)) return null;

  const hasComma = v.includes(",");
  const hasDot = v.includes(".");
  let normalized = v;

  if(hasComma && hasDot){
    const lastComma = v.lastIndexOf(",");
    const lastDot = v.lastIndexOf(".");
    normalized = (lastComma > lastDot)
      ? v.replace(/\./g, "").replace(",", ".")
      : v.replace(/,/g, "");
  } else if(hasComma){
    const parts = v.split(",");
    if(parts.length > 2){
      if(!/^\d{1,3}(,\d{3})+$/.test(v)) return null;
      normalized = v.replace(/,/g, "");
    } else if(parts[1] && parts[1].length > 2){
      if(!/^\d{1,3}(,\d{3})+$/.test(v)) return null;
      normalized = v.replace(/,/g, "");
    } else {
      normalized = v.replace(",", ".");
    }
  } else if(hasDot){
    const parts = v.split(".");
    if(parts.length > 2){
      if(!/^\d{1,3}(\.\d{3})+$/.test(v)) return null;
      normalized = v.replace(/\./g, "");
    } else if(parts[1] && parts[1].length > 2){
      if(!/^\d{1,3}(\.\d{3})+$/.test(v)) return null;
      normalized = v.replace(/\./g, "");
    }
  }

  if(!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const num = Number(normalized);
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
      toast("Inactividad", "Tu sesion expirara en 2 minutos por inactividad", "warning");
    }
  }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_LOGOUT_MS);

  // Timer para logout automático
  inactivityTimer = setTimeout(() => {
    toast("Sesion expirada", "Tu sesion ha expirado por inactividad", "error");
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
      toast("Sesion expirada", "Tu sesion expiro. Volve a iniciar sesion.", "error");
      setTimeout(() => { window.location.href = "index.html"; }, 1500);
    }
  });

  console.log('Monitor de inactividad activado (timeout: 30 min)');
}

/* =========================
   API
   ========================= */
async function api(path, {method="GET", body=null, auth=true, timeout=60000} = {}){
  // Verificar token antes de hacer la request (evita perder datos en formularios)
  if(auth && isTokenExpired()){
    clearToken(); clearUser();
    toast("Sesion expirada", "Tu sesion expiro. Volve a iniciar sesion.", "error");
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
  const rememberMe = document.getElementById("rememberMe")?.checked;

  clearFieldErrors(["username", "password"]);

  if(!username || !password){
    if (!username) setFieldError("username", "El usuario es obligatorio.");
    if (!password) setFieldError("password", "La contraseña es obligatoria.");
    return;
  }

  try{
    const data = await api("/api/auth/login", { method:"POST", body:{ username, password }, auth:false });
    setToken(data.token);
    setUser(data.user);

    if (rememberMe) {
      localStorage.setItem(STORAGE_KEY_REMEMBER_LOGIN, "1");
      localStorage.setItem(STORAGE_KEY_SAVED_LOGIN, JSON.stringify({ username, password }));
    } else {
      localStorage.removeItem(STORAGE_KEY_REMEMBER_LOGIN);
      localStorage.removeItem(STORAGE_KEY_SAVED_LOGIN);
    }

    toast("Sesion iniciada", "Redirigiendo...", "success");
    setTimeout(()=> window.location.href = "egreso.html", 250);
  }catch(err){
    setFieldError("password", err.message || "No se pudo iniciar sesión.");
  }
}

function initRememberLoginForm() {
  const rememberCheckbox = document.getElementById("rememberMe");
  if (!rememberCheckbox) return;

  const shouldRemember = localStorage.getItem(STORAGE_KEY_REMEMBER_LOGIN) === "1";
  rememberCheckbox.checked = shouldRemember;

  if (!shouldRemember) return;

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED_LOGIN) || "null");
    if (!saved) return;
    const usernameInput = document.getElementById("username");
    const passwordInput = document.getElementById("password");
    if (usernameInput && saved.username) usernameInput.value = saved.username;
    if (passwordInput && saved.password) passwordInput.value = saved.password;
  } catch {
    localStorage.removeItem(STORAGE_KEY_SAVED_LOGIN);
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
   CERRAR MODAL (genérico)
   ========================= */
function cerrarModal(){
  const m = document.getElementById('detalleModal');
  if (m) m.style.display = 'none';
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
    updateThemeIcon("CLARO");
  } else {
    document.documentElement.removeAttribute("data-theme");
    updateThemeIcon("OSCURO");
  }
}

function updateThemeIcon(icon) {
  const themeToggleBtn = document.getElementById("themeToggle");
  const themeToggleMobileBtn = document.getElementById("themeToggleMobile");
  if (themeToggleBtn) themeToggleBtn.textContent = icon;
  if (themeToggleMobileBtn) themeToggleMobileBtn.textContent = icon;
}

// ===================================================================
// INDICADOR DE CONEXIÓN
// ===================================================================
const CONN_STATUS = { CONNECTED: 'connected', RECONNECTING: 'reconnecting', OFFLINE: 'offline' };
const CONN_LABELS = { connected: 'Conectado', reconnecting: 'Reconectando…', offline: 'Sin conexión' };

function updateConnectionStatus(status) {
  const dot = document.getElementById('connectionDot');
  if (!dot) return;
  dot.className = status === CONN_STATUS.CONNECTED ? 'conn-ok'
    : status === CONN_STATUS.RECONNECTING ? 'conn-warn'
    : 'conn-off';
  dot.title = CONN_LABELS[status] || status;
}

function initConnectionIndicator() {
  const brand = document.querySelector('.topbar-left .brand');
  if (!brand || document.getElementById('connectionDot')) return;

  const dot = document.createElement('span');
  dot.id = 'connectionDot';
  dot.className = 'conn-warn'; // empieza como "conectando"
  dot.title = 'Conectando…';
  brand.insertAdjacentElement('afterend', dot);

  // Detectar online/offline del navegador
  window.addEventListener('offline', () => updateConnectionStatus(CONN_STATUS.OFFLINE));
  window.addEventListener('online', () => {
    updateConnectionStatus(CONN_STATUS.RECONNECTING);
    // Reconectar SSE al volver online
    connectToNotifications();
  });
}

// ===================================================================
// SISTEMA DE NOTIFICACIONES EN TIEMPO REAL
// ===================================================================

// Variables globales
let notificationEventSource = null;
let notifications = [];
let unreadCount = 0;

function loadNotificationsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_NOTIFICATIONS);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    notifications = parsed.map((n) => ({
      ...n,
      timestamp: new Date(n.timestamp),
      read: !!n.read
    }));
    unreadCount = notifications.filter((n) => !n.read).length;
  } catch {
    notifications = [];
    unreadCount = 0;
  }
}

function persistNotificationsToStorage() {
  try {
    const payload = notifications.slice(0, NOTIFICATION_HISTORY_MAX).map((n) => ({
      ...n,
      timestamp: n.timestamp instanceof Date ? n.timestamp.toISOString() : n.timestamp
    }));
    localStorage.setItem(STORAGE_KEY_NOTIFICATIONS, JSON.stringify(payload));
  } catch {
    // localStorage lleno o bloqueado — no bloquear la UI
  }
}

function notificationBellIconHtml() {
  // Campana SVG inline (sin dependencia de fuentes/emojis; cumple CSP script-src self)
  return `<svg class="notif-bell" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="currentColor" d="M12 22a2.2 2.2 0 0 0 2.2-2.2h-4.4A2.2 2.2 0 0 0 12 22zm7-6.2V11a7 7 0 1 0-14 0v4.8L3.4 17.4a1 1 0 0 0 .7 1.7h15.8a1 1 0 0 0 .7-1.7L19 15.8z"/>
  </svg>`;
}

function ensureNotificationUI() {
  const topbarRight = document.querySelector(".topbar-right.nav-desktop");
  if (topbarRight && !document.getElementById("notificationBtn")) {
    const btn = document.createElement("button");
    btn.id = "notificationBtn";
    btn.type = "button";
    btn.className = "btn-notification";
    btn.setAttribute("aria-label", "Notificaciones");
    btn.setAttribute("title", "Historial de notificaciones");
    btn.innerHTML = `${notificationBellIconHtml()}<span class="notif-label">Avisos</span><span id="notificationBadge" class="notification-badge" style="display:none">0</span>`;
    topbarRight.insertBefore(btn, topbarRight.firstChild);
  }

  const mobileActions = document.querySelector(".mobile-actions");
  if (mobileActions && !document.getElementById("notificationBtnMobile")) {
    const btnMobile = document.createElement("button");
    btnMobile.id = "notificationBtnMobile";
    btnMobile.type = "button";
    btnMobile.className = "btn-notification";
    btnMobile.setAttribute("aria-label", "Notificaciones");
    btnMobile.setAttribute("title", "Historial de notificaciones");
    btnMobile.innerHTML = `${notificationBellIconHtml()}<span class="notif-label">Avisos</span>`;
    mobileActions.insertBefore(btnMobile, mobileActions.firstChild);
  }

  if (!document.getElementById("notificationPanel")) {
    const panel = document.createElement("div");
    panel.id = "notificationPanel";
    panel.className = "notification-panel";
    panel.style.display = "none";
    panel.innerHTML = `
      <div class="notification-panel-header">
        <h3>Notificaciones</h3>
        <button id="closeNotificationPanel" type="button" class="close-notification-panel" aria-label="Cerrar">X</button>
      </div>
      <div id="notificationList" class="notification-list">
        <div class="notification-empty">No hay notificaciones</div>
      </div>
      <div class="notification-panel-footer">
        <button id="clearAllNotifications" type="button" class="btn-clear-notifications">Limpiar historial</button>
      </div>
    `;
    document.body.appendChild(panel);
  }

  if (!document.getElementById("toastContainer")) {
    const toastContainer = document.createElement("div");
    toastContainer.id = "toastContainer";
    toastContainer.className = "toast-container";
    document.body.appendChild(toastContainer);
  }
}

function toggleNotificationPanel(forceOpen) {
  const panel = document.getElementById("notificationPanel");
  if (!panel) return;

  const shouldOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : panel.style.display !== "flex";

  panel.style.display = shouldOpen ? "flex" : "none";

  if (shouldOpen) {
    markAllAsRead();
    updateNotificationPanel();
  }
}

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
    console.log("Conectado a notificaciones en tiempo real");
    updateConnectionStatus(CONN_STATUS.CONNECTED);
  };

  notificationEventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);

      if (data.type === "connected") {
        updateConnectionStatus(CONN_STATUS.CONNECTED);
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
    updateConnectionStatus(CONN_STATUS.RECONNECTING);

    // Reconectar después de 5 segundos
    setTimeout(() => {
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
  if (notifications.length > NOTIFICATION_HISTORY_MAX) {
    notifications.length = NOTIFICATION_HISTORY_MAX;
  }
  unreadCount++;

  persistNotificationsToStorage();

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
    success: "OK",
    warning: "AVISO",
    error: "ERROR",
    info: "INFO"
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
      <div class="notification-item ${n.read ? "" : "unread"} ${escapeHtml(n.category)}" data-id="${escapeHtml(n.id)}">
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
    persistNotificationsToStorage();
    updateNotificationBadge();
    updateNotificationPanel();
  }
}

// Marcar todas como leídas
function markAllAsRead() {
  notifications.forEach(n => n.read = true);
  unreadCount = 0;
  persistNotificationsToStorage();
  updateNotificationBadge();
  updateNotificationPanel();
}

// Limpiar todas las notificaciones
function clearAllNotifications() {
  notifications = [];
  unreadCount = 0;
  persistNotificationsToStorage();
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

/* =========================
   INIT COMMON UI
   (setup común de todas las páginas autenticadas)
   ========================= */
async function initCommonUI() {
  ensureNotificationUI();
  loadNotificationsFromStorage();
  updateNotificationBadge();
  updateNotificationPanel();

  // Cargar opciones dinámicas de la DB
  await loadSelectOptions();

  // Activar monitor de inactividad
  setupInactivityMonitor();

  // Indicador de conexión en topbar
  initConnectionIndicator();

  // Inicializar toggles de contraseña (usuarios, reset password, etc.)
  initPasswordToggles();

  // Inicializar tema claro/oscuro
  initThemeToggle();

  // Sidebar colapsable en desktop
  initSidebarCollapse();

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

  // Event listeners para el panel de notificaciones
  const notificationPanel = document.getElementById("notificationPanel");
  const closePanel = document.getElementById("closeNotificationPanel");
  const clearAllBtn = document.getElementById("clearAllNotifications");

  const bindNotificationToggle = (btn) => {
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleNotificationPanel();
    });
  };

  bindNotificationToggle(document.getElementById("notificationBtn"));
  bindNotificationToggle(document.getElementById("notificationBtnMobile"));

  if (closePanel) {
    closePanel.addEventListener("click", () => toggleNotificationPanel(false));
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => {
      clearAllNotifications();
    });
  }

  // Cerrar panel al hacer click fuera
  document.addEventListener("click", (e) => {
    if (notificationPanel && notificationPanel.style.display === "flex") {
      const desktopBtn = document.getElementById("notificationBtn");
      const mobileBtn = document.getElementById("notificationBtnMobile");
      const clickedTrigger = (desktopBtn && desktopBtn.contains(e.target))
        || (mobileBtn && mobileBtn.contains(e.target));
      if (!notificationPanel.contains(e.target) && !clickedTrigger) {
        toggleNotificationPanel(false);
      }
    }
  });

  // Conectar a notificaciones si hay un token
  if (getToken()) {
    connectToNotifications();
  }
}

/* =========================
   SIDEBAR COLLAPSE (desktop)
   ========================= */
function initSidebarCollapse() {
  const appShell = document.querySelector('.app-nosidebar');
  const topbarLeft = document.querySelector('.app-nosidebar .topbar-left');
  if (!appShell || !topbarLeft) return;

  const root = document.documentElement;
  const isDesktop = window.matchMedia('(min-width: 901px)').matches;

  const applyState = (collapsed) => {
    root.classList.toggle('sidebar-collapsed', !!collapsed);
    document.body.classList.toggle('sidebar-collapsed', !!collapsed);
  };

  const saved = localStorage.getItem(STORAGE_KEY_SIDEBAR_COLLAPSED) === '1';
  if (isDesktop) applyState(saved);

  let btn = document.getElementById('sidebarCollapseBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'sidebarCollapseBtn';
    btn.type = 'button';
    btn.className = 'sidebar-collapse-btn';
    btn.setAttribute('aria-label', 'Colapsar barra lateral');
    btn.textContent = 'COLAPSAR';
    topbarLeft.appendChild(btn);
  }

  btn.addEventListener('click', () => {
    const collapsed = !root.classList.contains('sidebar-collapsed');
    applyState(collapsed);
    localStorage.setItem(STORAGE_KEY_SIDEBAR_COLLAPSED, collapsed ? '1' : '0');
  });

  const mq = window.matchMedia('(max-width: 900px)');
  const onMobileChange = (e) => {
    if (e.matches) {
      root.classList.remove('sidebar-collapsed');
      document.body.classList.remove('sidebar-collapsed');
    } else {
      const persisted = localStorage.getItem(STORAGE_KEY_SIDEBAR_COLLAPSED) === '1';
      applyState(persisted);
    }
  };

  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', onMobileChange);
  } else if (typeof mq.addListener === 'function') {
    mq.addListener(onMobileChange);
  }
}

/* =========================
   DOMCONTENTLOADED - Login page only
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("loginForm");
  if(loginForm){
    loginForm.addEventListener("submit", handleLogin);
    initPasswordToggles();
    initRememberLoginForm();
    ["username", "password"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", () => clearFieldError(id));
    });
    return;
  }
  if(!requireAuth()) return;
});
