export const EMPRESAS_SALIDA = ["Telepagos", "Copter", "Palta", "Personal Pay"];

export const ETIQUETAS_CON_USUARIO_CASINO = new Set([
  "Premio Pagado",
  "Pago de premios duplicado",
  "Duplicado",
  "Error Empleado"
]);

export const ETIQUETAS_PREMIO_MINIMO = new Set(["Premio Pagado"]);

export function isFutureDateISO(yyyyMmDd) {
  const d = new Date(`${yyyyMmDd}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d > today;
}

// Formato estricto AR: 12000 o 12000,50 (sin puntos, sin $)
export function parseMontoARSStrict(raw) {
  const v = (raw || "").trim();
  const re = /^\d+(,\d{1,2})?$/;
  if (!re.test(v)) return null;
  const num = Number(v.replace(",", "."));
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
