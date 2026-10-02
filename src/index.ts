import { env, AUTH_TOKENS, GATE_CLIENTS, clientScopeSummary } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { logCapabilities } from "./gate/capabilities.js";
import { buildServer } from "./http/server.js";
import { cleanupExpiredReceipts } from "./pipeline/process-scan.js";
import "./db/index.js"; // inicializa SQLite (anti-duplicado)

// En production exigimos auth: sin tokens, el gate quedaría abierto a internet.
if (env.NODE_ENV === "production" && AUTH_TOKENS.length === 0) {
  logger.fatal("RECEIPT_GATE_TOKENS vacío en production: abortando (el /scan quedaría sin auth).");
  process.exit(1);
}

if (env.NODE_ENV === "production" && !env.RECEIPT_VIEW_SECRET) {
  logger.fatal("RECEIPT_VIEW_SECRET vacío en production: abortando (links de vista inseguros).");
  process.exit(1);
}

void logCapabilities();

const app = buildServer();
app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      auth: AUTH_TOKENS.length > 0,
      clients: GATE_CLIENTS.map((c) => c.label),
    },
    "GATE escuchando",
  );

  // Qué puede cada token. Se loguea porque el default de `RECEIPT_GATE_SCOPES` es permisivo (una
  // etiqueta sin entrada queda COMPLETO), así que un token que debía ser acotado y quedó full es un
  // error silencioso: esto lo hace visible en el arranque.
  const resumen = clientScopeSummary();
  logger.info({ scopes: resumen }, "GATE: alcance de cada token");
  const full = resumen.filter((r) => r.scopes === "COMPLETO").map((r) => r.label);
  if (env.NODE_ENV === "production" && full.length > 0) {
    logger.warn(
      { clients: full },
      "GATE: tokens con acceso COMPLETO en production (sin entrada en RECEIPT_GATE_SCOPES)",
    );
  }
});

// G4: limpieza periódica de comprobantes expirados (libera disco + BD).
if (env.RECEIPT_CLEANUP_INTERVAL_MIN > 0) {
  const runCleanup = (): void => {
    try {
      cleanupExpiredReceipts();
    } catch (e) {
      logger.warn({ err: e instanceof Error ? e.message : String(e) }, "cleanup: falló corrida");
    }
  };
  runCleanup(); // una pasada al arrancar
  const timer = setInterval(runCleanup, env.RECEIPT_CLEANUP_INTERVAL_MIN * 60_000);
  timer.unref?.();
}
