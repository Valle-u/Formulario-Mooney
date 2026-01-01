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
const EMPRESAS_SALIDA = ["Telepagos", "Copter", "Palta"];

const ETIQUETAS = [
  "Premio Pagado","Pago de servidor","Pago de fichas","Pago de sueldo",
  "Gasto de publicidad","Gasto de CRM","Pago de Utilidades",
  "Cambio a USD","Cambio a USDT","Cambio a Peso Fisico",
  "Gasto de cuenta","Transferencia Rechazada",
  "Gasto Personal L","Gasto Personl A",
  "Inversion Publicidad","Pago Programacion","Pago Costo de estructura",
  "Gasto limpieza","Gasto de Cocina","Fondeo de cuenta","Gasto Personal",
  "Adelanto de sueldo","Redireccion de capital","Pago de premios duplicado",
  "Pago LiveChat","Pago LiveChatCelu","Prueba Casa","Duplicado","Error Empleado",
  "Inversion","Rechazada por el banco","Otro"
];

const ETIQUETAS_CON_USUARIO_CASINO = new Set([
  "Premio Pagado","Pago de premios duplicado","Duplicado","Error Empleado"
]);

const ETIQUETAS_PREMIO_MINIMO = new Set(["Premio Pagado"]);

/* =========================
   TOAST
   ========================= */
function toast(title, msg, type = "error", duration = null){
  const el = document.getElementById("toast");
  if(!el) return;

  // Remover clases anteriores
  el.classList.remove("toast-error", "toast-success", "toast-warning", "toast-info");

  // Agregar clase según tipo
  el.classList.add(`toast-${type}`);

  el.querySelector("strong").textContent = title;
  el.querySelector("span").textContent = msg || "";
  el.classList.add("show");

  // Duración personalizable, o por defecto según tipo
  // Success y error ahora duran mucho más para que se puedan apreciar bien
  const finalDuration = duration || (type === "error" ? 8000 : type === "success" ? 7000 : 5000);

  setTimeout(()=> el.classList.remove("show"), finalDuration);
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

function requireAuth(){
  if(!getToken()){
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

  console.log('🔒 Monitor de inactividad activado (timeout: 30 min)');
}

/* =========================
   API
   ========================= */
async function api(path, {method="GET", body=null, auth=true} = {}){
  const headers = {};
  if(!(body instanceof FormData)) headers["Content-Type"] = "application/json";
  if(auth){
    const t = getToken();
    if(t) headers["Authorization"] = `Bearer ${t}`;
  }

  const res = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : null
  });

  if(res.status === 401 && auth){
    clearToken(); clearUser();
    window.location.href = "index.html";
    throw new Error("Sesión expirada. Volvé a iniciar sesión.");
  }

  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");
  const data = isJson ? await res.json().catch(()=>null) : await res.text().catch(()=>null);

  if(!res.ok){
    const msg = (data && data.message) ? data.message : (data || `Error ${res.status}`);
    throw new Error(msg);
  }
  return data;
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

  // Mostrar campos solo si es Premio Pagado, Duplicado, o Error Empleado
  const esPremio = ETIQUETAS_CON_USUARIO_CASINO.has(etiqueta);

  const wrapSolicitud = document.getElementById("wrap_hora_solicitud");
  const inputSolicitud = document.getElementById("hora_solicitud_cliente");
  const wrapQuema = document.getElementById("wrap_hora_quema");
  const inputQuema = document.getElementById("hora_quema_fichas");

  if(wrapSolicitud && inputSolicitud){
    wrapSolicitud.classList.toggle("hidden", !esPremio);
    if(!esPremio) inputSolicitud.value = "";
  }

  if(wrapQuema && inputQuema){
    wrapQuema.classList.toggle("hidden", !esPremio);
    if(!esPremio) inputQuema.value = "";
  }
}

function fileLabel(){
  const f = document.getElementById("comprobante");
  const out = document.getElementById("comprobante_nombre");
  if(!f || !out) return;
  out.textContent = f.files?.[0]?.name ? f.files[0].name : "Ningún archivo seleccionado";
}

function wireIdTransferenciaAlphanumeric(){
  const el = document.getElementById("id_transferencia");
  if(!el) return;
  // Permitir solo letras, números, guiones y guiones bajos
  el.addEventListener("input", ()=> {
    el.value = el.value.replace(/[^a-zA-Z0-9\-_]/g, "");
  });
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

    const payload = {
      fecha: document.getElementById("fecha").value,
      hora: document.getElementById("hora").value,
      turno: document.getElementById("turno").value,
      hora_solicitud_cliente: document.getElementById("hora_solicitud_cliente")?.value || "",
      hora_quema_fichas: document.getElementById("hora_quema_fichas")?.value || "",
      monto_transferencia_raw: (montoRaw || "").trim(),
      moneda: document.getElementById("moneda").value || "ARS",
      cuenta_receptora: document.getElementById("cuenta_receptora").value.trim(),
      usuario_casino: document.getElementById("usuario_casino").value.trim(),
      cuenta_salida: document.getElementById("cuenta_salida").value.trim(),
      empresa_cuenta_salida: document.getElementById("empresa_salida").value,
      id_transferencia: document.getElementById("id_transferencia").value.trim(),
      etiqueta: document.getElementById("etiqueta").value,
      otro_concepto: document.getElementById("otro_concepto").value.trim(),
      notas: document.getElementById("notas").value.trim()
    };

    // Validaciones básicas
    if(!payload.fecha) throw new Error("Completá FECHA.");
    if(!payload.hora) throw new Error("Completá HORA.");
    if(!payload.turno) throw new Error("Seleccioná TURNO.");
    if(montoNum === null || montoNum <= 0) throw new Error("Monto inválido. Debe ser mayor a 0.");
    if(!payload.cuenta_receptora) throw new Error("Completá CUENTA RECEPTORA.");
    if(!payload.cuenta_salida) throw new Error("Completá CUENTA DE SALIDA.");
    if(!payload.empresa_cuenta_salida) throw new Error("Seleccioná EMPRESA DE SALIDA.");
    if(!payload.id_transferencia) throw new Error("Completá ID TRANSFERENCIA.");
    if(!/^[a-zA-Z0-9\-_]+$/.test(payload.id_transferencia)) {
      throw new Error("ID TRANSFERENCIA: solo letras, números, guiones y guiones bajos.");
    }
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

  // Generar vista previa del comprobante
  // Liberar URL anterior si existe
  if(currentFileURL){
    URL.revokeObjectURL(currentFileURL);
  }
  currentFileURL = URL.createObjectURL(file);
  const fileURL = currentFileURL;
  const isPDF = file.type === 'application/pdf';
  const isImage = file.type.startsWith('image/');

  let previewHTML = '';
  if (isImage) {
    previewHTML = `
      <div style="margin-top:8px; border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; max-height:300px; display:flex; align-items:center; justify-content:center; background:var(--bg-alt);">
        <img src="${fileURL}" alt="Vista previa" style="max-width:100%; max-height:300px; object-fit:contain;">
      </div>
    `;
  } else if (isPDF) {
    previewHTML = `
      <div style="margin-top:12px; padding:16px; border:1px solid var(--border); border-radius:var(--radius); background:var(--bg-alt); text-align:center;">
        <div style="margin-bottom:12px; color:var(--muted); font-size:14px;">
          📄 Archivo PDF adjunto
        </div>
        <a href="${fileURL}" target="_blank" class="btn btn-primary" style="display:inline-block; text-decoration:none;">
          Ver PDF en nueva pestaña
        </a>
      </div>
    `;
  }

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
      <div class="field span6">
        <label>ID TRANSFERENCIA</label>
        <div class="note"><strong>${escapeHtml(payload.id_transferencia)}</strong></div>
      </div>
      <div class="field span6">
        <label>MONTO</label>
        <div class="note"><strong style="color:var(--green); font-size:18px;">$ ${escapeHtml(montoFormatted)}</strong></div>
      </div>
      <div class="field span6">
        <label>CUENTA RECEPTORA</label>
        <div class="note">${escapeHtml(payload.cuenta_receptora)}</div>
      </div>
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
        <div class="note">📎 ${escapeHtml(file.name)} (${escapeHtml(fileSizeMB)} MB)</div>
        ${previewHTML}
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

  // Focus en el primer botón
  setTimeout(() => {
    const btnConfirmar = document.getElementById("btnConfirmarEgreso");
    if(btnConfirmar) btnConfirmar.focus();
  }, 100);
}

// Variable global para almacenar la URL del comprobante
let currentFileURL = null;

// Cerrar modal
function cerrarModalConfirmacion(){
  const modal = document.getElementById("modalConfirmacion");
  if(modal) modal.style.display = "none";

  // Liberar la URL del objeto para evitar memory leaks
  if(currentFileURL){
    URL.revokeObjectURL(currentFileURL);
    currentFileURL = null;
  }

  // Restaurar focus al botón submit del formulario
  const submitBtn = document.querySelector("#egresoForm button[type='submit']");
  if(submitBtn) submitBtn.focus();
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
      cuenta_receptora: payload.cuenta_receptora,
      usuario_casino: payload.usuario_casino,
      cuenta_salida: payload.cuenta_salida,
      empresa_cuenta_salida: payload.empresa_cuenta_salida,
      id_transferencia: payload.id_transferencia,
      notas: payload.notas
    }));
    fd.append("comprobante", file);

    await api("/api/egresos", { method:"POST", body: fd, auth:true });

    // Mostrar mensaje de éxito con duración extendida (8 segundos)
    toast("✅ Guardado", "Egreso registrado correctamente.", "success", 8000);

    // Cerrar modal después de un delay para que se vea el mensaje
    setTimeout(() => {
      cerrarModalConfirmacion();
      document.getElementById("egresoForm").reset();
      fileLabel();
      toggleCasinoUserField();
      toggleOtroConcepto();

      // Limpiar datos validados
      datosEgresoValidados = null;
    }, 2500); // Esperar 2.5 segundos antes de cerrar modal y resetear

  }catch(err){
    toast("❌ Error", err.message, "error", 10000);

    // Re-habilitar botones inmediatamente en caso de error
    const btnConfirmar = document.querySelector("#modalConfirmacion .btn-primary");
    const btnCancelar = document.querySelector("#modalConfirmacion .btn-ghost");

    if(btnConfirmar){
      btnConfirmar.disabled = false;
      btnConfirmar.textContent = "✓ Confirmar y Guardar";
    }
    if(btnCancelar){
      btnCancelar.disabled = false;
    }
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

    const qs = new URLSearchParams();

    if(fecha_desde) qs.set("fecha_desde", fecha_desde);
    if(fecha_hasta) qs.set("fecha_hasta", fecha_hasta);
    if(empresa_salida) qs.set("empresa_salida", empresa_salida);
    if(etiqueta) qs.set("etiqueta", etiqueta);
    if(usuario_casino) qs.set("usuario_casino", usuario_casino);
    if(id_transferencia) qs.set("id_transferencia", id_transferencia);
    if(monto_min) qs.set("monto_min", monto_min);
    if(monto_max) qs.set("monto_max", monto_max);

    const queryString = qs.toString();
    const url = queryString
      ? `${API_BASE}/api/egresos/csv?${queryString}`
      : `${API_BASE}/api/egresos/csv`;

    console.log("🔍 URL CSV:", url);
    console.log("🔍 Filtros aplicados:", { fecha_desde, fecha_hasta, empresa_salida, etiqueta, usuario_casino, id_transferencia, monto_min, monto_max });

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

    toast("CSV descargado", "Archivo exportado exitosamente");
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

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${u.username}</td>
      <td><input data-edit-name="${u.id}" value="${u.full_name||""}"></td>
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
      const full_name = document.querySelector(`[data-edit-name="${id}"]`)?.value ?? "";
      const role = document.querySelector(`[data-edit-role="${id}"]`)?.value ?? "empleado";
      const is_active = !!document.querySelector(`[data-edit-active="${id}"]`)?.checked;

      try{
        await api(`/api/users/${id}`, { method:"PUT", body:{ full_name, role, is_active } });
        toast("✅ Guardado","Usuario actualizado correctamente", "success");
      }catch(err){
        toast("❌ Error", err.message, "error");
      }
    });
  });

  document.querySelectorAll("[data-reset-pass]").forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      const id = btn.dataset.resetPass;
      const pass = prompt("Nueva contraseña (mín 4):");
      if(!pass) return;

      try{
        await api(`/api/users/${id}/reset-password`, { method:"POST", body:{ password: pass } });
        toast("✅ Guardado","Contraseña actualizada correctamente", "success");
      }catch(err){
        toast("❌ Error", err.message, "error");
      }
    });
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

function populateFiltrosSelects(){
  const selEmpresa = document.getElementById("empresa_salida");
  const selEtiqueta = document.getElementById("etiqueta");

  if(selEmpresa){
    selEmpresa.innerHTML = `<option value="">Todas</option>` +
      EMPRESAS_SALIDA.map(e => `<option value="${e}">${e}</option>`).join("");
  }

  if(selEtiqueta){
    selEtiqueta.innerHTML = `<option value="">Todas</option>` +
      ETIQUETAS.map(e => `<option value="${e}">${e}</option>`).join("");
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

  currentFilters = {
    fecha_desde, fecha_hasta, empresa_salida, etiqueta, status, moneda,
    usuario_casino, id_transferencia, monto_min, monto_max
  };

  const qs = new URLSearchParams();
  qs.set("limit", String(EGRESOS_LIMIT));
  qs.set("offset", String(egresosOffset));

  if(fecha_desde) qs.set("fecha_desde", fecha_desde);
  if(fecha_hasta) qs.set("fecha_hasta", fecha_hasta);
  if(empresa_salida) qs.set("empresa_salida", empresa_salida);
  if(etiqueta) qs.set("etiqueta", etiqueta);
  if(status) qs.set("status", status);
  if(moneda) qs.set("moneda", moneda);
  if(usuario_casino) qs.set("usuario_casino", usuario_casino);
  if(id_transferencia) qs.set("id_transferencia", id_transferencia);
  if(monto_min) qs.set("monto_min", monto_min);
  if(monto_max) qs.set("monto_max", monto_max);

  try{
    const { egresos, pagination } = await api(`/api/egresos?${qs.toString()}`);
    renderEgresos(egresos, pagination);
  }catch(err){
    tbody.innerHTML = `<tr><td colspan="11" class="muted">${err.message}</td></tr>`;
  }
}

function renderEgresos(egresos, pagination){
  const tbody = document.getElementById("egresosTbody");
  if(!tbody) return;

  if(egresos.length === 0){
    tbody.innerHTML = `<tr><td colspan="11" class="muted">No se encontraron resultados</td></tr>`;

    const info = document.getElementById("resultadosInfo");
    if(info) info.textContent = "0 resultados";

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
    const monedaBadge = moneda === 'USD'
      ? '<span style="background: #059669; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">💵 USD</span>'
      : '<span style="background: #0891b2; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">💵 ARS</span>';

    const status = e.status || 'activo';
    const statusBadge = status === 'activo'
      ? '<span style="background: #10b981; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">✓ ACTIVO</span>'
      : status === 'anulado'
      ? '<span style="background: #ef4444; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">✗ ANULADO</span>'
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

function mostrarDetalle(e){
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
  // Agregar token JWT a la URL para autenticación en nueva pestaña
  const token = getToken(); // Usar la función correcta que obtiene mm_token
  const comprobanteUrl = `${API_BASE}/api/egresos/${encodeURIComponent(e.id)}/comprobante?token=${encodeURIComponent(token)}`;
  const comprobantePreview = isPdf
    ? `<a href="${escapeHtml(comprobanteUrl)}" target="_blank" class="btn btn-primary">📄 Ver PDF</a>`
    : `<a href="${escapeHtml(comprobanteUrl)}" target="_blank"><img src="${escapeHtml(comprobanteUrl)}" style="max-width: 100%; max-height: 400px; border-radius: 8px;" alt="Comprobante" onerror="this.parentElement.innerHTML='❌ Error cargando imagen'"></a>`;

  // Estado visual
  const status = e.status || 'activo';
  const statusBadge = status === 'activo'
    ? '<span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">✓ ACTIVO</span>'
    : status === 'anulado'
    ? '<span style="background: #ef4444; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">✗ ANULADO</span>'
    : '<span style="background: #f59e0b; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">⏳ PENDIENTE</span>';

  const user = getUser();
  const canEdit = (user.role === 'admin' || user.role === 'direccion');

  body.innerHTML = `
    <div class="grid">
      <div class="field span12" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
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
        <label>COMPROBANTE</label>
        ${comprobantePreview}
      </div>
      <div class="field span12">
        <label>CREADO POR</label>
        <div class="note">${escapeHtml(e.created_by_username)} - ${escapeHtml(new Date(e.created_at).toLocaleString())}</div>
      </div>

      ${e.updated_at ? `
      <div class="field span12">
        <label>ÚLTIMA MODIFICACIÓN</label>
        <div class="note">${new Date(e.updated_at).toLocaleString()}</div>
      </div>` : ''}
    </div>
  `;

  console.log('✅ HTML generado, mostrando modal...');
  console.log('🔍 Estado actual del modal:', modal.style.display);
  modal.style.display = "flex";
  console.log('✅ Modal mostrado con display:', modal.style.display);
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
function editarEgreso(egreso){
  // TODO: Implementar modal de edición completo
  const motivo = prompt(`Vas a editar el egreso #${egreso.id}\n\n¿Motivo del cambio?`);
  if(!motivo) return;

  const nuevoMonto = prompt(`Monto actual: $${egreso.monto}\n\nNuevo monto (dejar vacío para no cambiar):`, egreso.monto);
  const nuevaCuenta = prompt(`Cuenta receptora actual: ${egreso.cuenta_receptora}\n\nNueva cuenta (dejar vacío para no cambiar):`, egreso.cuenta_receptora);

  const updates = {};
  if(nuevoMonto && parseFloat(nuevoMonto) !== parseFloat(egreso.monto)){
    updates.monto = parseFloat(nuevoMonto);
    updates.monto_raw = nuevoMonto;
  }
  if(nuevaCuenta && nuevaCuenta !== egreso.cuenta_receptora){
    updates.cuenta_receptora = nuevaCuenta;
  }

  if(Object.keys(updates).length === 0){
    toast("Sin cambios", "No se realizaron modificaciones", "info");
    return;
  }

  updates.change_reason = motivo;

  actualizarEgreso(egreso.id, updates);
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

function mostrarModalAnular(id){
  const motivo = prompt(`⚠️ Vas a ANULAR el egreso #${id}\n\nEsta acción no se puede deshacer.\n\nMotivo de anulación (obligatorio):`);

  if(!motivo || motivo.trim() === ""){
    toast("⚠️ Cancelado", "El motivo es obligatorio", "warning");
    return;
  }

  const confirmacion = confirm(`¿Confirmas que deseas anular este egreso?\n\nMotivo: ${motivo}`);
  if(!confirmacion) return;

  anularEgreso(id, motivo);
}

async function anularEgreso(id, motivo){
  try{
    await api(`/api/egresos/${id}/anular`, { method: 'POST', body: { motivo } });
    toast("✅ Anulado", "Egreso anulado correctamente", "success");
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
      <button class="btn btn-ghost" onclick="cerrarModal()">Cerrar</button>
    </div>
  `;

  modal.style.display = "block";
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
    conectarValidacionTiempoReal(); // Validación en tiempo real

    document.getElementById("etiqueta")?.addEventListener("change", ()=>{
      toggleCasinoUserField();
      toggleOtroConcepto();
      toggleCamposPremio();
    });
    document.getElementById("comprobante")?.addEventListener("change", fileLabel);
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

    // Cerrar modal al hacer click en el backdrop
    document.querySelector(".modal-backdrop")?.addEventListener("click", cerrarModal);

    // IMPORTANTE: Cargar egresos al iniciar la página
    buscarEgresos();
  }


});
