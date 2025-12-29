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

const app = express();
const PORT = Number(process.env.PORT || 4000);
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

/* =========================
   SEGURIDAD - Headers con Helmet
   ========================= */
app.use(helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline necesario para scripts inline
      styleSrc: ["'self'", "'unsafe-inline'"], // unsafe-inline necesario para estilos inline
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
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
   CORS
   ========================= */
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const corsOptions =
  CORS_ORIGIN === "*"
    ? {
        origin: true,
        credentials: false,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      }
    : {
        origin: CORS_ORIGIN.split(",").map(o => o.trim()),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      };

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

// Servir archivos estáticos del frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '../frontend/public');

console.log('📁 Frontend path:', frontendPath);
console.log('📄 Index.html exists:', fs.existsSync(path.join(frontendPath, 'index.html')));

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
