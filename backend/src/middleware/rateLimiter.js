import rateLimit from "express-rate-limit";

// Rate limiter para login: muy permisivo (efectivamente desactivado)
// Se mantiene como protección mínima contra ataques de fuerza bruta extremos
// validate: false silencia ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// porque app.set('trust proxy', 1) ya maneja la validación de X-Forwarded-For

export const loginLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // 100 intentos por minuto (muy permisivo)
  message: {
    message: "Demasiados intentos. Esperá un momento."
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  handler: (req, res) => {
    res.status(429).json({
      message: "Demasiados intentos. Esperá un momento.",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Rate limiter general para API: 100 requests por 15 minutos
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    message: "Demasiadas solicitudes. Por favor intentá de nuevo más tarde."
  },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false
});
