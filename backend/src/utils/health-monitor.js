import { pool } from "../config/db.js";

// Estado interno
let lastStatus = 'ok';
let okCounter = 0;
const pendingBuffer = []; // Buffer para cuando la DB está caída
const CHECK_INTERVAL_MS = 60_000; // 1 minuto
const SLOW_THRESHOLD_MS = 2000;
const OK_LOG_EVERY = 5; // Loguear 'ok' solo 1 de cada 5 checks
const RETENTION_DAYS = 7;

/**
 * Mide latencia de la DB con SELECT 1
 * @returns {{ ok: boolean, ms: number, error?: string }}
 */
async function pingDB() {
  const start = Date.now();
  try {
    await pool.query("SELECT 1");
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err.message };
  }
}

/**
 * Inserta un registro en health_log
 */
async function logHealth(status, responseTimeMs, errorMessage = null) {
  const memoryMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  try {
    await pool.query(
      `INSERT INTO health_log (status, response_time_ms, memory_used_mb, error_message)
       VALUES ($1, $2, $3, $4)`,
      [status, responseTimeMs, memoryMb, errorMessage]
    );
  } catch {
    // DB caída — guardar en buffer
    pendingBuffer.push({
      status,
      response_time_ms: responseTimeMs,
      memory_used_mb: memoryMb,
      error_message: errorMessage,
      created_at: new Date().toISOString()
    });
  }
}

/**
 * Flushea el buffer de incidentes pendientes a la DB
 */
async function flushBuffer() {
  while (pendingBuffer.length > 0) {
    const entry = pendingBuffer[0];
    try {
      await pool.query(
        `INSERT INTO health_log (status, response_time_ms, memory_used_mb, error_message, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [entry.status, entry.response_time_ms, entry.memory_used_mb, entry.error_message, entry.created_at]
      );
      pendingBuffer.shift(); // Eliminar solo si se guardó
    } catch {
      break; // DB sigue caída, parar
    }
  }
}

/**
 * Limpia registros de más de RETENTION_DAYS días
 */
async function cleanOldLogs() {
  try {
    await pool.query(
      `DELETE FROM health_log WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'`
    );
  } catch {
    // No es crítico, se reintenta en el próximo ciclo
  }
}

/**
 * Ejecuta un ciclo de health check
 */
async function runCheck() {
  const ping = await pingDB();

  if (!ping.ok) {
    // DB caída
    console.error(`🔴 Health check: DB error (${ping.ms}ms) - ${ping.error}`);
    await logHealth('db_error', ping.ms, ping.error);
    lastStatus = 'db_error';
    okCounter = 0;
    return;
  }

  // DB respondió
  if (lastStatus === 'db_error') {
    // Recuperación — flushear buffer primero
    console.log(`🟢 Health check: DB recovered (${ping.ms}ms)`);
    await flushBuffer();
    await logHealth('recovered', ping.ms);
    lastStatus = 'ok';
    okCounter = 0;
    return;
  }

  if (ping.ms > SLOW_THRESHOLD_MS) {
    // DB lenta
    console.warn(`🟡 Health check: DB slow (${ping.ms}ms)`);
    await logHealth('db_slow', ping.ms);
    lastStatus = 'db_slow';
    okCounter = 0;
    return;
  }

  // Todo OK — loguear solo 1 de cada OK_LOG_EVERY
  lastStatus = 'ok';
  okCounter++;
  if (okCounter >= OK_LOG_EVERY) {
    await logHealth('ok', ping.ms);
    okCounter = 0;
  }
}

/**
 * Inicia el monitor de salud. Llamar después de migraciones.
 */
export function startHealthMonitor() {
  console.log(`🏥 Health monitor iniciado (cada ${CHECK_INTERVAL_MS / 1000}s)`);

  // Primer check inmediato
  runCheck();

  // Checks periódicos
  const interval = setInterval(runCheck, CHECK_INTERVAL_MS);

  // Limpieza diaria de logs viejos (cada 6 horas)
  setInterval(cleanOldLogs, 6 * 60 * 60 * 1000);

  return interval;
}

/**
 * Consulta resumen de salud para el endpoint
 */
export async function getHealthSummary(hours = 24, limit = 200) {
  const result = await pool.query(
    `SELECT * FROM health_log
     WHERE created_at > NOW() - INTERVAL '1 hour' * $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [hours, limit]
  );

  const stats = await pool.query(
    `SELECT
       COUNT(*) as total_checks,
       COUNT(*) FILTER (WHERE status = 'db_error') as errors,
       COUNT(*) FILTER (WHERE status = 'db_slow') as slow,
       COUNT(*) FILTER (WHERE status = 'recovered') as recoveries,
       ROUND(AVG(response_time_ms)) as avg_response_ms,
       MAX(response_time_ms) as max_response_ms
     FROM health_log
     WHERE created_at > NOW() - INTERVAL '1 hour' * $1`,
    [hours]
  );

  return {
    period_hours: hours,
    summary: stats.rows[0],
    logs: result.rows
  };
}
