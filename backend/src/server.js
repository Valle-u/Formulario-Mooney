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
import notificationsRoutes from "./routes/notifications.js";
import checkMigrationsRoutes from "./routes/check-migrations.js";
import runMigrationsRoutes from "./routes/run-migrations.js";
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

// Log de configuración de almacenamiento
console.log("📦 Storage: ImgBB (principal) + Local Disk (fallback)");

const app = express();
const PORT = Number(process.env.PORT || 4000);
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";

// Trust proxy: necesario en Seenode (k8s) para que express-rate-limit
// y req.ip funcionen correctamente detrás del proxy reverso
app.set('trust proxy', 1);

/* =========================
   SEGURIDAD - Headers con Helmet
   ========================= */
app.use(helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://i.ibb.co", "https://*.ibb.co"],
      connectSrc: ["'self'", "https://api.imgbb.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "blob:"]
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

// Cache-busting automático: reemplaza ?v=AUTO con ?v={mtime} en HTML
const htmlCache = new Map();
function serveHtmlWithCacheBusting(req, res, next) {
  // Solo interceptar requests a archivos .html (o raíz)
  let htmlFile = req.path;
  if (htmlFile === '/') htmlFile = '/index.html';
  if (!htmlFile.endsWith('.html')) return next();

  const filePath = path.join(frontendPath, htmlFile);
  if (!fs.existsSync(filePath)) return next();

  try {
    const stat = fs.statSync(filePath);
    const cacheKey = `${filePath}:${stat.mtimeMs}`;

    // Usar caché en memoria si el HTML no cambió
    if (htmlCache.has(cacheKey)) {
      res.type('html').send(htmlCache.get(cacheKey));
      return;
    }

    let html = fs.readFileSync(filePath, 'utf8');

    // Reemplazar ?v=AUTO (o cualquier ?v=...) con ?v={mtime del archivo referenciado}
    html = html.replace(/((?:src|href)=["'])([^"']+\.(?:js|css))\?v=[^"']*(["'])/g, (match, pre, assetPath, post) => {
      try {
        const assetFile = path.join(frontendPath, assetPath);
        const assetStat = fs.statSync(assetFile);
        return `${pre}${assetPath}?v=${Math.floor(assetStat.mtimeMs)}${post}`;
      } catch {
        return match; // Si no encuentra el archivo, dejar como está
      }
    });

    // Cachear resultado (limpiar cache vieja del mismo archivo)
    for (const [k] of htmlCache) {
      if (k.startsWith(filePath + ':')) htmlCache.delete(k);
    }
    htmlCache.set(cacheKey, html);

    res.type('html').send(html);
  } catch (err) {
    next(); // Fallback a express.static si hay error
  }
}

// Middleware de cache-busting ANTES de express.static
app.use(serveHtmlWithCacheBusting);

// Servir archivos estáticos (CSS, JS, imágenes)
app.use(express.static(frontendPath));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/egresos", egresosRoutes);
app.use("/api/logs", logsRoutes);
app.use("/api/notifications", notificationsRoutes); // Notificaciones en tiempo real (SSE)
app.use("/api", initRoutes); // Endpoint temporal para inicializar admin
app.use("/api", checkMigrationsRoutes); // Endpoint temporal para verificar migraciones
app.use("/api", runMigrationsRoutes); // Endpoint temporal para ejecutar migraciones

// Health check endpoint mejorado
import { query } from "./config/db.js";

app.get("/health", async (req, res) => {
  try {
    // Verificar conexión a la base de datos
    const dbCheck = await query("SELECT NOW() as time");

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database: 'connected',
      dbTime: dbCheck.rows[0].time,
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
      }
    });
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
      database: 'disconnected',
      error: error.message
    });
  }
});

app.use((err, req, res, next) => {
  console.error("🔥 ERROR GLOBAL:", err);
  res.status(500).json({ message: "Error interno" });
});

// 🚀 Arranque: HTTP primero, migraciones después (resiliente a DB caída temporal)
let server;
let dbReady = false;

async function start() {
  // 1) Arrancar HTTP inmediatamente para que Seenode vea el servidor vivo
  server = app.listen(PORT, () => {
    console.log(`✅ API running on ${process.env.BASE_URL || `http://localhost:${PORT}`}`);
    console.log(`🏥 Health check: ${process.env.BASE_URL || `http://localhost:${PORT}`}/health`);
  });

  // 2) Correr migraciones con reintentos (la DB puede tardar en estar disponible)
  try {
    await runMigrations();
    dbReady = true;
    console.log("✅ Database ready, all systems operational");
  } catch (e) {
    console.error("❌ Migrations failed after retries:", e.message);
    console.error("⚠️  Server running but database unavailable. Requests will fail until DB recovers.");
    // NO hacer process.exit(1) — dejar el servidor vivo para que Seenode no entre en loop de reinicios
    // Las rutas que necesiten DB devolverán 500 naturalmente
  }
}

// Graceful shutdown: cerrar conexiones limpiamente cuando el proceso termina
async function gracefulShutdown(signal) {
  console.log(`\n🛑 ${signal} recibido, cerrando servidor...`);

  // Dejar de aceptar nuevas conexiones
  if (server) {
    server.close(() => {
      console.log('✅ Servidor HTTP cerrado');
    });
  }

  try {
    // Cerrar pool de PostgreSQL
    const { pool } = await import('./config/db.js');
    await pool.end();
    console.log('✅ Pool de PostgreSQL cerrado');

    process.exit(0);
  } catch (err) {
    console.error('❌ Error durante graceful shutdown:', err);
    process.exit(1);
  }
}

// Manejar señales del sistema operativo
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Manejar errores no capturados
process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception:', err);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // No terminar el proceso por promesas rechazadas, solo logear
});

start();
