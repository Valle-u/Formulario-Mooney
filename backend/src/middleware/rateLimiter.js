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
