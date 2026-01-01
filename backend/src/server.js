import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import authRoutes from "./routes/auth.js";
import usersRoutes from "./routes/users.js";
import egresosRoutes from "./routes/egresos.js";
import logsRoutes from "./routes/logs.js";
import initRoutes from "./routes/init.js";
import { runMigrations } from "./migrations/runMigrations.js";
import { validateRequiredEnv } from "./utils/validateEnv.js";
import { csrfOriginCheck } from "./middleware/csrf.js";

dotenv.config();
validateRequiredEnv();

// Log de configuración (sin mostrar valores completos por seguridad)
console.log("🔧 Environment configuration:");
console.log("  - NODE_ENV:", process.env.NODE_ENV || "development");
console.log("  - DATABASE_URL:", process.env.DATABASE_URL ? "✅ Set" : "❌ Missing");
console.log("  - JWT_SECRET:", process.env.JWT_SECRET ? "✅ Set" : "❌ Missing");
console.log("  - PGSSL:", process.env.PGSSL || "not set");
console.log("  - PORT:", process.env.PORT || "not set (will use 4000)");
console.log("  - BASE_URL:", process.env.BASE_URL || "not set");

// Log de configuración de almacenamiento
const r2Configured = !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID &&
                        process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME);
console.log("📦 Storage configuration:");
console.log("  - Mode:", r2Configured ? "☁️  Cloudflare R2 (Cloud)" : "💾 Local Disk");
console.log("  - Upload directory:", process.env.UPLOAD_DIR || "uploads");

const app = express();
const PORT = Number(process.env.PORT || 4000);
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

/* =========================
   SEGURIDAD - Headers con Helmet
   ========================= */
app.use(helmet({
  // Content Security Policy - MEJORADO sin unsafe-inline
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"], // SIN unsafe-inline para mejor seguridad
      styleSrc: ["'self'"], // SIN unsafe-inline para mejor seguridad
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "blob:"], // Permitir blob: para vista previa de PDFs
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"] // Prevenir clickjacking
    }
  },
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // Hide X-Powered-By header
  hidePoweredBy: true,
  // HSTS - Force HTTPS (solo en producción)
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 año
    includeSubDomains: true,
    preload: true
  } : false,
  // Prevent MIME type sniffing
  noSniff: true,
  // Disable client-side caching for sensitive data
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  // XSS Protection (legacy but still useful)
  xssFilter: true
}));

/* =========================
   CORS - CONFIGURACIÓN RESTRICTIVA
   ========================= */
const CORS_ORIGIN = process.env.CORS_ORIGIN || "";

// Función de validación dinámica con logging
const corsOptions = {
  origin: function (origin, callback) {
    // Permitir requests sin origin (ej: Postman, curl, mobile apps)
    if (!origin) {
      console.log('✅ CORS: Request sin origin header (permitido)');
      return callback(null, true);
    }

    // Si CORS_ORIGIN está vacío o es "*", RECHAZAR en producción
    if (!CORS_ORIGIN || CORS_ORIGIN === "*") {
      if (process.env.NODE_ENV === 'production') {
        console.error(`❌ CORS: Rechazado - CORS_ORIGIN no configurado en producción. Origin: ${origin}`);
        return callback(new Error('CORS not configured properly'), false);
      } else {
        // Solo permitir en desarrollo
        console.warn(`⚠️ CORS: Permitido en desarrollo (configurar CORS_ORIGIN para producción). Origin: ${origin}`);
        return callback(null, true);
      }
    }

    // Validar contra whitelist
    const whitelist = CORS_ORIGIN.split(",").map(o => o.trim());

    if (whitelist.includes(origin)) {
      console.log(`✅ CORS: Permitido - ${origin}`);
      callback(null, true);
    } else {
      console.error(`❌ CORS: Rechazado - Origin no autorizado: ${origin}`);
      console.error(`   Whitelist: ${whitelist.join(', ')}`);
      callback(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true, // Permitir cookies/auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'], // Agregado X-CSRF-Token
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400, // Cachear preflight por 24 horas
  preflightContinue: false,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

console.log('🔒 CORS Configurado:');
console.log('  - CORS_ORIGIN:', CORS_ORIGIN || '(no configurado - solo desarrollo)');
console.log('  - Credentials:', corsOptions.credentials);
console.log('  - Métodos:', corsOptions.methods.join(', '));

/* =========================
   CSRF PROTECTION
   ========================= */
// Protección CSRF basada en Origin/Referer
// Valida que requests mutantes vengan de orígenes permitidos
app.use(csrfOriginCheck);
console.log('🛡️ CSRF Protection: Validación de Origin/Referer activada');

app.use(express.json({ limit: "1mb" }));

// Servir archivos estáticos del frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '../frontend/public');

console.log('📁 Frontend path:', frontendPath);
console.log('📄 Index.html exists:', fs.existsSync(path.join(frontendPath, 'index.html')));

// Crear directorio de uploads si no existe
const uploadsPath = path.join(__dirname, '..', UPLOAD_DIR);
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  console.log('📂 Created uploads directory:', uploadsPath);
}

// Servir archivos de uploads (comprobantes)
// Esto permite acceder a los PDFs subidos vía URL
app.use(`/${UPLOAD_DIR}`, express.static(uploadsPath));
console.log(`📤 Serving uploads from: /${UPLOAD_DIR}`);

// Servir archivos estáticos (CSS, JS, imágenes)
app.use(express.static(frontendPath));

// Ruta para servir index.html en la raíz
app.get('/', (req, res) => {
  const indexPath = path.join(frontendPath, 'index.html');
  console.log('🔍 Trying to serve:', indexPath);
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('❌ Error serving index.html:', err);
      res.status(500).json({
        message: 'Error loading frontend',
        frontendPath: frontendPath,
        error: err.message
      });
    }
  });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/egresos", egresosRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api", initRoutes); // Endpoint temporal para inicializar admin

app.get("/health", (req, res) => res.json({ ok: true }));

app.use((err, req, res, next) => {
  console.error("🔥 ERROR GLOBAL:", err);
  res.status(500).json({ message: "Error interno" });
});

// 🚀 Arranque con migraciones
async function start() {
  try {
    await runMigrations();
    app.listen(PORT, () => {
      console.log(`API running on ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
    });
  } catch (e) {
    console.error("❌ Server NOT started due to migration error");
    process.exit(1);
  }
}

start();
