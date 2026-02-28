/* =========================
   EGRESOS UI HELPERS
   ========================= */
function populateEtiquetas(){
  const sel = document.getElementById("etiqueta");
  if(!sel) return;

  // Cierre de Caja se gestiona en el modulo dedicado cierres-caja.html
  const etiquetasFormulario = ETIQUETAS.filter(e => e !== "Cierre de Caja");

  sel.innerHTML = `<option value="">Seleccionar…</option>` +
    etiquetasFormulario.map(e => `<option value="${e}">${e}</option>`).join("");
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
    const optionExists = valorGuardado
      ? Array.from(inputEtiqueta.options).some(opt => opt.value === valorGuardado)
      : false;

    if (valorGuardado && optionExists) {
      inputEtiqueta.value = valorGuardado;
      // Disparar eventos para actualizar campos condicionales
      toggleCasinoUserField();
      toggleOtroConcepto();
      toggleCamposPremio();
    } else if (valorGuardado && !optionExists) {
      localStorage.removeItem(STORAGE_KEYS.ETIQUETA);
      if (document.getElementById('recordar_etiqueta')) {
        document.getElementById('recordar_etiqueta').checked = false;
      }
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
      feedbackDiv.textContent = `Este ID ya existe en ${empresaValue} (Egreso #${data.egreso.id} - ${data.egreso.etiqueta} - $${data.egreso.monto} ${data.egreso.moneda})`;
      idInput.style.borderColor = "#dc3545";
    } else if (feedbackDiv) {
      feedbackDiv.className = "validation-success";
      feedbackDiv.textContent = "ID disponible";
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
      turnoSugerido.textContent = `${turno} (${hora})`;
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
    toast("Error", err.message, "error");
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
          <span>Archivo: ${escapeHtml(file.name)} (${escapeHtml(fileSizeMB)} MB)</span>
          <button type="button" class="btn-ver-comprobante-preview" style="padding: 6px 12px; background: var(--primary); color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 13px;">
            Ver comprobante
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
      console.log('Event listener agregado al boton Ver Comprobante');
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
    toast("Error", "No hay comprobante para visualizar", "error", 3000);
    return;
  }

  const file = datosEgresoValidados.file;

  // Crear URL temporal del archivo
  const fileURL = URL.createObjectURL(file);

  // Abrir en nueva ventana/pestaña
  const newWindow = window.open(fileURL, '_blank');

  if(!newWindow){
    toast("Popups bloqueados", "Por favor permite popups para ver el comprobante", "warning", 4000);
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
      btnConfirmar.textContent = "Confirmar y guardar";
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
    toast("Guardado", "Egreso registrado correctamente.", "success", 8000);

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

    toast("Error", err.message, "error", 10000);
  }
}

/* =========================
   DOMCONTENTLOADED - Egreso page
   ========================= */
document.addEventListener("DOMContentLoaded", () => {
  if(!document.getElementById("egresoForm")) return;
  if(!requireAuth()) return;
  initCommonUI();

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
});
