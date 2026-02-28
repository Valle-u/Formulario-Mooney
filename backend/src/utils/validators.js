export const EMPRESAS_SALIDA = ["Telepagos", "Copter", "Palta", "Personal Pay", "Lemoncash", "NaranjaX", "TrustWallet", "Mercado Pago", "Brubank", "Binance", "AstroPay", "DolarApp", "Uala", "Cuenta DNI", "Lohas", "Otra (Especificar en notas)"];

export const ETIQUETAS_CON_USUARIO_CASINO = new Set([
  "[Unidad M] Premio Pagado"
]);

export const ETIQUETAS_PREMIO_MINIMO = new Set(["[Unidad M] Premio Pagado"]);

export const ETIQUETAS_CIERRE_CAJA = new Set([
  "Cierre de Caja"
]);

// Mapa de equivalencias: etiquetas legacy <-> etiquetas nuevas con prefijo
// Permite buscar por cualquiera de las dos versiones y encontrar ambas
export const ETIQUETAS_LEGACY_MAP = {
  // Legacy -> Nueva
  "Deposito de cliente": "[Unidad M] Deposito de cliente",
  "Premio Pagado": "[Unidad M] Premio Pagado",
  "Pago de sueldo": "[Unidad M] Pago de sueldo",
  "Pago de Utilidades": "[Unidad M] Pago de Utilidades",
  "Gasto de cuenta": "[Unidad M] Gasto de cuenta",
  "Transferencia Rechazada": "[Unidad M] Transferencia Rechazada",
  "IVA": "[Unidad M] IVA",
  "Adelanto de sueldo": "[Unidad M] Adelanto de sueldo",
  "Redireccion de capital": "[Unidad M] Redireccion de capital",
  "Pago de premios duplicado": "[Unidad M] Pago de premios duplicado",
  "Pago LiveChat": "[Unidad M] Pago LiveChat",
  "Pago de Estructura": "[Unidad M] Pago de Estructura",
  "Pago de servidor": "[Programacion] Pago de servidor",
  "Pago de fichas": "[Programacion] Pago de fichas",
  "Costo Fijo": "[Programacion] Costo Fijo",
  "Gasto Fijo": "[Publicidad]Gasto Fijo",
  "Inversion": "[Publicidad] Inversion"
};

// Función para obtener etiquetas equivalentes (retorna array con la original y su equivalente si existe)
export function getEtiquetasEquivalentes(etiqueta) {
  if (!etiqueta) return [];

  const equivalentes = [etiqueta];

  // Buscar si es una etiqueta legacy
  if (ETIQUETAS_LEGACY_MAP[etiqueta]) {
    equivalentes.push(ETIQUETAS_LEGACY_MAP[etiqueta]);
  }

  // Buscar si es una etiqueta nueva (buscar en valores del mapa)
  for (const [legacy, nueva] of Object.entries(ETIQUETAS_LEGACY_MAP)) {
    if (nueva === etiqueta) {
      equivalentes.push(legacy);
      break;
    }
  }

  return equivalentes;
}

export function isFutureDateISO(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d > today;
}

// Parseo robusto de monto.
// Acepta:
// - 12000
// - 12000,50
// - 12000.50
// - 12.000,50
// - 12,000.50
export function parseMontoARSStrict(raw) {
  let v = String(raw || "").trim();
  if (!v) return null;

  v = v.replace(/\s+/g, "").replace(/^\$/, "");
  if (!/^[0-9.,]+$/.test(v)) return null;

  const hasComma = v.includes(",");
  const hasDot = v.includes(".");
  let normalized = v;

  if (hasComma && hasDot) {
    const lastComma = v.lastIndexOf(",");
    const lastDot = v.lastIndexOf(".");

    // 12.000,50 => decimal con coma
    if (lastComma > lastDot) {
      normalized = v.replace(/\./g, "").replace(",", ".");
    } else {
      // 12,000.50 => decimal con punto
      normalized = v.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = v.split(",");
    if (parts.length > 2) {
      if (!/^\d{1,3}(,\d{3})+$/.test(v)) return null;
      normalized = v.replace(/,/g, "");
    } else if (parts[1] && parts[1].length > 2) {
      if (!/^\d{1,3}(,\d{3})+$/.test(v)) return null;
      normalized = v.replace(/,/g, "");
    } else {
      normalized = v.replace(",", ".");
    }
  } else if (hasDot) {
    const parts = v.split(".");
    if (parts.length > 2) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(v)) return null;
      normalized = v.replace(/\./g, "");
    } else if (parts[1] && parts[1].length > 2) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(v)) return null;
      normalized = v.replace(/\./g, "");
    }
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100) / 100;
}

export function montoToCommaString(num) {
  const s = num.toFixed(2);      // "12000.50"
  return s.replace(".", ",");    // "12000,50"
}

export function requireNonEmpty(field, name) {
  if (!field || String(field).trim() === "") {
    return `${name} es obligatorio`;
  }
  return null;
}

// ✅ NUEVO: solo dígitos (para id_transferencia)
export function isDigitsOnly(value) {
  const v = String(value ?? "").trim();
  return v.length > 0 && /^[0-9]+$/.test(v);
}

// Validación de contraseña fuerte
export function validatePasswordStrength(password) {
  const pwd = String(password || "");

  if (pwd.length < 8) {
    return "La contraseña debe tener al menos 8 caracteres";
  }

  if (!/[A-Z]/.test(pwd)) {
    return "La contraseña debe tener al menos una mayúscula";
  }

  if (!/[a-z]/.test(pwd)) {
    return "La contraseña debe tener al menos una minúscula";
  }

  if (!/[0-9]/.test(pwd)) {
    return "La contraseña debe tener al menos un número";
  }

  if (!/[!@#$%^&*(),.?":{}|<>_\-]/.test(pwd)) {
    return "La contraseña debe tener al menos un carácter especial (!@#$%^&*(),.?\":{}|<>_-)";
  }

  // Validar contra contraseñas comunes
  const commonPasswords = [
    "password", "12345678", "qwerty123", "abc123456", "password1",
    "admin123", "letmein1", "welcome1", "monkey123", "dragon123"
  ];

  if (commonPasswords.includes(pwd.toLowerCase())) {
    return "Esta contraseña es demasiado común. Por favor elegí una más segura";
  }

  return null; // Contraseña válida
}
