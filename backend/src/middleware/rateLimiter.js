import crypto from "crypto";
import rateLimit from "express-rate-limit";

// validate: false silencia ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// porque app.set('trust proxy', 1) ya maneja X-Forwarded-For.

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false,
    message: { message },
    handler: (req, res) => {
      const retryAfter = req.rateLimit?.resetTime
        ? Math.ceil(req.rateLimit.resetTime / 1000)
        : undefined;
      res.status(429).json({ message, retryAfter });
    }
  });
}

/** Login: estricto. Suficiente para uso normal, frena fuerza bruta por IP. */
export const loginLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: "Demasiados intentos de login. Esperá un momento."
});

/**
 * Lectura general de la API. Generoso: un turno de carga con filtros y
 * paginación no debería toparse con esto.
 */
export const apiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: "Demasiadas solicitudes. Intentá de nuevo en un momento."
});

/** Altas, ediciones, anulaciones y borrados. */
export const writeLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: "Demasiadas escrituras. Esperá un momento."
});

/** Exportaciones CSV (más pesadas). */
export const exportLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Demasiadas exportaciones. Intentá de nuevo más tarde."
});

// Rate limiter para export por API key: 120 requests por minuto
export const exportLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: {
    message: "Demasiadas solicitudes de export. Esperá un momento."
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    const headerKey = req.headers["x-api-key"];
    if (headerKey) {
      const digest = crypto.createHash("sha256").update(String(headerKey)).digest("hex").slice(0, 16);
      return `apikey:${digest}`;
    }
    return req.ip;
  },
  handler: (req, res) => {
    res.status(429).json({
      message: "Demasiadas solicitudes de export. Esperá un momento.",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});
