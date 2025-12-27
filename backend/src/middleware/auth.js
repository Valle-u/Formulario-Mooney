import jwt from "jsonwebtoken";
import { query } from "../config/db.js";

/**
 * Middleware de autenticación mejorado
 * - Valida formato del token
 * - Verifica firma y expiración
 * - Valida que el usuario siga activo en la BD
 * - Protege contra tokens robados de usuarios desactivados
 */
export async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const parts = header.split(" ");

  // Validar formato "Bearer <token>"
  if (parts.length !== 2 || parts[0] !== "Bearer") {
    return res.status(401).json({ message: "Formato de token inválido" });
  }

  const token = parts[1];

  // Validar que el token no esté vacío
  if (!token || token.trim() === "") {
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  // Validar longitud mínima del token (JWT típico tiene >100 chars)
  if (token.length < 20) {
    return res.status(401).json({ message: "Token inválido" });
  }

  try {
    // Verificar firma y expiración del token
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'], // Solo permitir HS256
      maxAge: '24h' // Doble verificación de expiración
    });

    // Validar estructura del payload
    if (!payload.id || !payload.username || !payload.role) {
      return res.status(401).json({ message: "Token malformado" });
    }

    // Verificar que el usuario sigue existiendo y está activo
    const userCheck = await query(
      `SELECT id, username, role, is_active
       FROM users
       WHERE id = $1`,
      [payload.id]
    );

    if (userCheck.rows.length === 0) {
      return res.status(401).json({ message: "Usuario no encontrado" });
    }

    const user = userCheck.rows[0];

    // Verificar que el usuario sigue activo
    if (!user.is_active) {
      return res.status(401).json({ message: "Usuario desactivado" });
    }

    // Verificar que el username y role coincidan (protección contra manipulación)
    if (user.username !== payload.username || user.role !== payload.role) {
      return res.status(401).json({ message: "Token inconsistente" });
    }

    // Adjuntar usuario validado al request
    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      is_active: user.is_active
    };

    return next();

  } catch (error) {
    // Manejar errores específicos de JWT
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expirado" });
    }
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ message: "Token inválido" });
    }
    if (error.name === "NotBeforeError") {
      return res.status(401).json({ message: "Token aún no válido" });
    }

    // Error de base de datos u otro
    console.error("❌ Error en auth middleware:", error);
    return res.status(500).json({ message: "Error de autenticación" });
  }
}

/**
 * Middleware: Solo Admin y Dirección
 * Permite: admin, direccion
 */
export function requireAdminOrDireccion(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "No autenticado" });
  }

  if (req.user.role !== 'admin' && req.user.role !== 'direccion') {
    return res.status(403).json({ message: "Acceso denegado. Se requiere rol de Admin o Dirección" });
  }

  return next();
}

/**
 * Middleware: Admin, Dirección y Encargado
 * Permite: admin, direccion, encargado
 * Uso: Para ver logs
 */
export function requireAdminOrDireccionOrEncargado(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "No autenticado" });
  }

  const allowedRoles = ['admin', 'direccion', 'encargado'];
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ message: "Acceso denegado. Permisos insuficientes" });
  }

  return next();
}

/**
 * Middleware: Solo Admin (único)
 * Permite: solo admin
 * Uso: Para operaciones críticas exclusivas del admin
 */
export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "No autenticado" });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: "Acceso denegado. Solo administradores" });
  }

  return next();
}
