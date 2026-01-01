#!/usr/bin/env node

/**
 * Script de Limpieza Automática de Audit Logs
 *
 * Elimina registros de auditoría antiguos según retención configurada
 *
 * Uso:
 *   node scripts/cleanup-audit-logs.js [--dry-run] [--months=6]
 *
 * Opciones:
 *   --dry-run    : Mostrar qué se eliminaría sin ejecutar la eliminación
 *   --months=N   : Retención en meses (default: 6 desde AUDIT_RETENTION_MONTHS)
 *
 * Ejemplos:
 *   node scripts/cleanup-audit-logs.js --dry-run
 *   node scripts/cleanup-audit-logs.js --months=3
 *
 * Para automatizar, agregar a crontab:
 *   # Ejecutar todos los domingos a las 3 AM
 *   0 3 * * 0 cd /ruta/al/proyecto/backend && node scripts/cleanup-audit-logs.js
 */

import dotenv from "dotenv";
import { query } from "../src/config/db.js";
import { cleanupExpiredTokens } from "../src/utils/refreshTokens.js";

dotenv.config();

// Parsear argumentos
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const monthsArg = args.find(arg => arg.startsWith('--months='));
const retentionMonths = monthsArg
  ? parseInt(monthsArg.split('=')[1])
  : parseInt(process.env.AUDIT_RETENTION_MONTHS || '6');

console.log('🧹 ===============================================');
console.log('   LIMPIEZA AUTOMÁTICA DE AUDIT LOGS');
console.log('   ===============================================');
console.log('');
console.log(`📅 Retención configurada: ${retentionMonths} meses`);
console.log(`🔍 Modo: ${isDryRun ? 'DRY RUN (simulación)' : 'EJECUCIÓN REAL'}`);
console.log('');

async function cleanupAuditLogs() {
  try {
    // 1. Analizar cuántos logs hay antes
    console.log('📊 Analizando logs actuales...');

    const statsResult = await query(`
      SELECT
        COUNT(*) as total_logs,
        COUNT(*) FILTER (WHERE created_at < NOW() - INTERVAL '${retentionMonths} months') as logs_to_delete,
        MIN(created_at) as oldest_log,
        MAX(created_at) as newest_log,
        pg_size_pretty(pg_total_relation_size('audit_logs')) as table_size
      FROM audit_logs
    `);

    const stats = statsResult.rows[0];

    console.log('');
    console.log('📈 Estadísticas Actuales:');
    console.log(`   • Total de logs: ${stats.total_logs.toLocaleString()}`);
    console.log(`   • Logs a eliminar: ${stats.logs_to_delete.toLocaleString()}`);
    console.log(`   • Log más antiguo: ${stats.oldest_log}`);
    console.log(`   • Log más reciente: ${stats.newest_log}`);
    console.log(`   • Tamaño de tabla: ${stats.table_size}`);
    console.log('');

    if (stats.logs_to_delete === '0') {
      console.log('✅ No hay logs antiguos para eliminar.');
      return;
    }

    // 2. Mostrar muestra de logs que se eliminarán
    console.log(`📋 Muestra de logs que se eliminarán (primeros 10):`);

    const sampleResult = await query(`
      SELECT id, action, actor_username, created_at
      FROM audit_logs
      WHERE created_at < NOW() - INTERVAL '${retentionMonths} months'
      ORDER BY created_at ASC
      LIMIT 10
    `);

    sampleResult.rows.forEach(log => {
      console.log(`   [${log.id}] ${log.created_at.toISOString().slice(0, 10)} - ${log.action} - ${log.actor_username || 'N/A'}`);
    });

    console.log('');

    // 3. Eliminar logs (si no es dry-run)
    if (!isDryRun) {
      console.log('🗑️  Eliminando logs antiguos...');

      const deleteResult = await query(`
        DELETE FROM audit_logs
        WHERE created_at < NOW() - INTERVAL '${retentionMonths} months'
      `);

      console.log(`✅ ${deleteResult.rowCount.toLocaleString()} logs eliminados correctamente`);

      // 4. VACUUM para liberar espacio en disco
      console.log('');
      console.log('🔧 Optimizando tabla (VACUUM)...');
      await query('VACUUM ANALYZE audit_logs');
      console.log('✅ Tabla optimizada');

      // 5. Estadísticas después
      const statsAfterResult = await query(`
        SELECT
          COUNT(*) as total_logs,
          pg_size_pretty(pg_total_relation_size('audit_logs')) as table_size
        FROM audit_logs
      `);

      const statsAfter = statsAfterResult.rows[0];

      console.log('');
      console.log('📊 Estadísticas Después:');
      console.log(`   • Total de logs: ${statsAfter.total_logs.toLocaleString()}`);
      console.log(`   • Tamaño de tabla: ${statsAfter.table_size}`);
    } else {
      console.log('ℹ️  DRY RUN: No se eliminó nada. Ejecutar sin --dry-run para confirmar.');
    }

    console.log('');

  } catch (error) {
    console.error('');
    console.error('❌ ERROR durante limpieza:');
    console.error(error);
    process.exit(1);
  }
}

async function cleanupRefreshTokens() {
  try {
    console.log('🔑 Limpiando refresh tokens expirados...');

    const deleted = await cleanupExpiredTokens();

    if (deleted > 0) {
      console.log(`✅ ${deleted} refresh tokens eliminados`);
    } else {
      console.log('✅ No hay refresh tokens expirados');
    }

    console.log('');

  } catch (error) {
    console.error('❌ Error limpiando refresh tokens:', error.message);
    // No salir con error, continuar con limpieza de logs
  }
}

async function main() {
  try {
    // Limpiar refresh tokens
    await cleanupRefreshTokens();

    // Limpiar audit logs
    await cleanupAuditLogs();

    console.log('✅ Limpieza completada exitosamente');
    console.log('🧹 ===============================================');
    console.log('');

    process.exit(0);

  } catch (error) {
    console.error('');
    console.error('❌ ERROR FATAL:');
    console.error(error);
    console.log('');
    process.exit(1);
  }
}

main();
