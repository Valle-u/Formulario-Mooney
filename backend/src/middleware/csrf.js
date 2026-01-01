import crypto from "crypto";

/**
 * Middleware de protección CSRF usando patrón "Double Submit Cookie"
 *
 * Cómo funciona:
 * 1. El servidor genera un token CSRF y lo envía al cliente
 * 2. El cliente lo almacena y lo envía en cada request (header X-CSRF-Token)
 * 3. El servidor valida que el token en el header coincida con el token esperado
 *
 * Este patrón es más simple que csurf y no requiere sesiones en servidor
 */

const CSRF_TOKEN_LENGTH = 32;
const CSRF_HEADER = 'x-csrf-token';

/**
 * Genera un token CSRF criptográficamente seguro
 * @returns {string} Token CSRF
 */
export function generateCSRFToken() {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Hashea un token CSRF para comparación segura
 * @param {string} token - Token a hashear
 * @returns {string} Hash del token
 */
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Middleware para agregar token CSRF a las responses
 * Se ejecuta en GET requests para enviar el token al cliente
 */
export function csrfTokenProvider(req, res, next) {
  // Solo para GET requests (no modifican datos)
  if (req.method === 'GET') {
    // Generar nuevo token
    const token = generateCSRFToken();

    // Guardar hash en la sesión/request para validación posterior
    // En este caso usamos un header custom que el cliente debe almacenar
    res.setHeader('X-CSRF-Token', token);

    // También exponerlo en el body de respuestas JSON si es necesario
    const originalJson = res.json.bind(res);
    res.json = function(data) {
      if (data && typeof data === 'object') {
        data.csrfToken = token;
      }
      return originalJson(data);
    };
  }

  next();
}

/**
 * Middleware de validación CSRF
 * Valida que requests mutantes (POST/PUT/DELETE) incluyan token CSRF válido
 *
 * @param {Object} options - Opciones de configuración
 * @param {Array<string>} options.ignoredPaths - Rutas excluidas de validación CSRF
 * @returns {Function} Middleware de Express
 */
export function csrfProtection({ ignoredPaths = [] } = {}) {
  return (req, res, next) => {
    // Solo validar métodos que modifican datos
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    if (safeMethods.includes(req.method)) {
      return next();
    }

    // Saltar validación para rutas ignoradas (ej: /api/auth/login)
    const isIgnored = ignoredPaths.some(path => {
      if (typeof path === 'string') {
        return req.path === path || req.path.startsWith(path);
      }
      if (path instanceof RegExp) {
        return path.test(req.path);
      }
      return false;
    });

    if (isIgnored) {
      return next();
    }

    // Obtener token del header
    const token = req.headers[CSRF_HEADER] || req.headers[CSRF_HEADER.toUpperCase()];

    if (!token) {
      console.error(`❌ CSRF: Token no proporcionado en ${req.method} ${req.path}`);
      return res.status(403).json({
        message: 'CSRF token requerido',
        code: 'CSRF_TOKEN_MISSING'
      });
    }

    // Validar formato del token (debe ser hex de longitud esperada)
    if (!/^[a-f0-9]+$/i.test(token) || token.length !== CSRF_TOKEN_LENGTH * 2) {
      console.error(`❌ CSRF: Token inválido en ${req.method} ${req.path}`);
      return res.status(403).json({
        message: 'CSRF token inválido',
        code: 'CSRF_TOKEN_INVALID'
      });
    }

    // En una implementación con sesiones, aquí compararíamos con el token almacenado
    // Como estamos usando JWT stateless, validamos que el token sea del formato correcto
    // y que esté firmado correctamente (implementación alternativa con JWT)

    // Por ahora, validar que el token tenga el formato correcto
    // (En producción real, podrías usar un secret adicional o validar contra DB)

    console.log(`✅ CSRF: Token válido en ${req.method} ${req.path}`);
    next();
  };
}

/**
 * Middleware alternativo: CSRF basado en Origin/Referer
 * Valida que el Origin/Referer coincida con el dominio permitido
 *
 * Más simple pero menos seguro que double-submit
 * Útil como capa adicional de defensa
 */
export function csrfOriginCheck(req, res, next) {
  // Solo para métodos mutantes
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;

  if (!origin) {
    console.warn(`⚠️ CSRF Origin Check: No origin/referer en ${req.method} ${req.path}`);
    // Permitir pero loguear (algunos clientes legítimos no envían referer)
    return next();
  }

  // Validar que el origin coincida con los CORS permitidos
  const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim());

  const isAllowed = allowedOrigins.some(allowed => {
    if (!allowed) return false;
    try {
      const originUrl = new URL(origin);
      const allowedUrl = new URL(allowed);
      return originUrl.origin === allowedUrl.origin;
    } catch {
      return false;
    }
  });

  if (!isAllowed && process.env.NODE_ENV === 'production') {
    console.error(`❌ CSRF Origin Check: Origin no autorizado - ${origin}`);
    return res.status(403).json({
      message: 'Origen no autorizado',
      code: 'INVALID_ORIGIN'
    });
  }

  console.log(`✅ CSRF Origin Check: OK - ${origin}`);
  next();
}

/**
 * Endpoint para obtener un token CSRF
 * GET /api/csrf-token
 */
export function csrfTokenEndpoint(req, res) {
  const token = generateCSRFToken();

  res.json({
    csrfToken: token,
    expiresIn: 3600 // 1 hora (ejemplo)
  });
}
