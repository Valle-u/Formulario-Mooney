import rateLimit from "express-rate-limit";

// Rate limiter para login: máximo 5 intentos cada 15 minutos
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Máximo 5 intentos
  message: {
    message: "Demasiados intentos de login. Por favor intentá de nuevo en 15 minutos."
  },
  standardHeaders: true, // Retorna info de rate limit en headers `RateLimit-*`
  legacyHeaders: false, // Deshabilita headers `X-RateLimit-*`
  // Handler cuando se excede el límite
  handler: (req, res) => {
    res.status(429).json({
      message: "Demasiados intentos de login. Por favor intentá de nuevo en 15 minutos.",
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
  legacyHeaders: false
});
