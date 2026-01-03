#!/usr/bin/env node

/**
 * Script para Resetear la Base de Datos de Producción
 *
 * Este script limpia toda la información de prueba y deja el sistema
 * listo para ser operado por el negocio desde cero.
 *
 * ¿QUÉ HACE?
 * 1. Crea un backup completo de la BD actual
 * 2. Elimina TODOS los egresos
 * 3. Elimina TODOS los usuarios excepto el admin principal
 * 4. Limpia los logs de auditoría antiguos (opcional)
 * 5. Resetea el usuario admin con credenciales seguras
 *
 * USO:
 *   node scripts/reset-production.js
 *   node scripts/reset-production.js --skip-backup
 *   node scripts/reset-production.js --keep-logs
 *
 * IMPORTANTE: Este script requiere confirmación interactiva
 */

import dotenv from "dotenv";
import bcrypt from "bcrypt";
import { query, pool } from "../src/config/db.js";
import readline from 'readline';

dotenv.config();

// Configuración
const ADMIN_USERNAME = process.env.RESET_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.RESET_ADMIN_PASSWORD || "MooneyAdmin2025!";
const ADMIN_FULLNAME = process.env.RESET_ADMIN_FULLNAME || "Administrador Principal";

// Parsear argumentos de línea de comando
const args = process.argv.slice(2);
const skipBackup = args.includes('--skip-backup');
const keepLogs = args.includes('--keep-logs');

/**
 * Crear interfaz de readline para input del usuario
 */
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Preguntar confirmación al usuario
 */
function askConfirmation(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase() === 's' || answer.toLowerCase() === 'si' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Mostrar resumen de lo que se hará
 */
async function showSummary() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🔄 RESETEO DE BASE DE DATOS DE PRODUCCIÓN');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Obtener estadísticas actuales
  const egresosCount = await query('SELECT COUNT(*) as count FROM egresos');
  const usersCount = await query('SELECT COUNT(*) as count FROM users');
  const logsCount = await query('SELECT COUNT(*) as count FROM audit_logs');

  console.log('📊 ESTADO ACTUAL:');
  console.log(`   Egresos: ${egresosCount.rows[0].count}`);
  console.log(`   Usuarios: ${usersCount.rows[0].count}`);
  console.log(`   Logs de auditoría: ${logsCount.rows[0].count}`);

  console.log('\n⚙️  ACCIONES A REALIZAR:');
  console.log(`   ${skipBackup ? '⏭️' : '✅'}  Crear backup de la BD actual`);
  console.log('   🗑️  Eliminar TODOS los egresos');
  console.log('   🗑️  Eliminar TODOS los usuarios (excepto admin)');
  console.log(`   ${keepLogs ? '⏭️' : '🗑️'}  Limpiar logs de auditoría`);
  console.log('   👤  Resetear credenciales del admin');

  console.log('\n📝 CREDENCIALES DEL ADMIN:');
  console.log(`   Username: ${ADMIN_USERNAME}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);
  console.log(`   Nombre: ${ADMIN_FULLNAME}`);

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

/**
 * Crear backup usando pg_dump
 */
async function createBackup() {
  if (skipBackup) {
    console.log('⏭️  Saltando backup (--skip-backup)\n');
    return;
  }

  console.log('💾 Creando backup de seguridad...');
  console.log('   NOTA: Si pg_dump no está instalado, este paso fallará.');
  console.log('   Puedes usar --skip-backup para omitir este paso.\n');

  try {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    // Crear directorio de backups
    const { promises: fs } = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const backupDir = path.join(__dirname, '../backups');

    await fs.mkdir(backupDir, { recursive: true });

    // Generar nombre de archivo
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .substring(0, 19);
    const filename = `backup_before_reset_${timestamp}.sql.gz`;
    const filePath = path.join(backupDir, filename);

    // Parsear DATABASE_URL
    const dbUrl = new URL(process.env.DATABASE_URL);
    const config = {
      host: dbUrl.hostname,
      port: dbUrl.port || '5432',
      database: dbUrl.pathname.substring(1),
      user: dbUrl.username,
      password: dbUrl.password
    };

    // Construir comando
    const command = `pg_dump -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database} --no-password --format=plain --no-owner --no-acl | gzip > "${filePath}"`;

    // Ejecutar
    const env = { ...process.env, PGPASSWORD: config.password };
    await execAsync(command, { env, shell: true });

    // Verificar
    const stats = await fs.stat(filePath);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

    console.log(`✅ Backup creado: ${filename} (${sizeMB} MB)\n`);

  } catch (error) {
    console.warn('⚠️  No se pudo crear el backup:', error.message);
    console.warn('   Continuando sin backup...\n');
  }
}

/**
 * Limpiar todos los egresos
 */
async function cleanEgresos() {
  console.log('🗑️  Eliminando todos los egresos...');

  const result = await query('DELETE FROM egresos');
  console.log(`✅ ${result.rowCount} egresos eliminados\n`);
}

/**
 * Limpiar usuarios excepto admin
 */
async function cleanUsers() {
  console.log('🗑️  Eliminando usuarios de prueba...');

  // Primero, verificar si existe el admin
  const adminCheck = await query(
    'SELECT id FROM users WHERE username = $1',
    [ADMIN_USERNAME]
  );

  let adminId;

  if (adminCheck.rowCount === 0) {
    console.log('   ⚠️  Usuario admin no existe, será creado');
    adminId = null;
  } else {
    adminId = adminCheck.rows[0].id;
    console.log(`   ℹ️  Usuario admin encontrado (ID: ${adminId})`);
  }

  // Eliminar todos los usuarios excepto el admin
  if (adminId) {
    const result = await query('DELETE FROM users WHERE id != $1', [adminId]);
    console.log(`✅ ${result.rowCount} usuarios eliminados\n`);
  } else {
    const result = await query('DELETE FROM users');
    console.log(`✅ ${result.rowCount} usuarios eliminados\n`);
  }
}

/**
 * Limpiar logs de auditoría
 */
async function cleanLogs() {
  if (keepLogs) {
    console.log('⏭️  Manteniendo logs de auditoría (--keep-logs)\n');
    return;
  }

  console.log('🗑️  Limpiando logs de auditoría...');

  const result = await query('DELETE FROM audit_logs');
  console.log(`✅ ${result.rowCount} logs eliminados\n`);
}

/**
 * Resetear o crear usuario admin
 */
async function resetAdmin() {
  console.log('👤 Configurando usuario admin...');

  // Verificar si existe
  const existing = await query(
    'SELECT id FROM users WHERE username = $1',
    [ADMIN_USERNAME]
  );

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);

  if (existing.rowCount > 0) {
    // Actualizar
    await query(
      `UPDATE users
       SET password_hash = $1,
           role = 'admin',
           full_name = $2,
           is_active = true
       WHERE username = $3`,
      [passwordHash, ADMIN_FULLNAME, ADMIN_USERNAME]
    );
    console.log(`✅ Usuario admin actualizado: ${ADMIN_USERNAME}\n`);
  } else {
    // Crear
    await query(
      `INSERT INTO users (username, password_hash, role, full_name, is_active, created_by)
       VALUES ($1, $2, 'admin', $3, true, NULL)`,
      [ADMIN_USERNAME, passwordHash, ADMIN_FULLNAME]
    );
    console.log(`✅ Usuario admin creado: ${ADMIN_USERNAME}\n`);
  }
}

/**
 * Mostrar resumen final
 */
async function showFinalSummary() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ RESETEO COMPLETADO EXITOSAMENTE');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Obtener estadísticas finales
  const egresosCount = await query('SELECT COUNT(*) as count FROM egresos');
  const usersCount = await query('SELECT COUNT(*) as count FROM users');
  const logsCount = await query('SELECT COUNT(*) as count FROM audit_logs');

  console.log('📊 ESTADO FINAL:');
  console.log(`   Egresos: ${egresosCount.rows[0].count}`);
  console.log(`   Usuarios: ${usersCount.rows[0].count}`);
  console.log(`   Logs de auditoría: ${logsCount.rows[0].count}`);

  console.log('\n🔑 CREDENCIALES DE ACCESO:');
  console.log(`   URL: ${process.env.BASE_URL || 'https://tu-app.seenode.com'}`);
  console.log(`   Username: ${ADMIN_USERNAME}`);
  console.log(`   Password: ${ADMIN_PASSWORD}`);

  console.log('\n📝 PRÓXIMOS PASOS:');
  console.log('   1. Accede al sistema con las credenciales de admin');
  console.log('   2. Ve a "Gestión de Usuarios" y crea cuentas para:');
  console.log('      - Empleados (rol: empleado)');
  console.log('      - Encargados (rol: encargado)');
  console.log('      - Directivos (rol: direccion)');
  console.log('   3. Entrega las credenciales a cada usuario');
  console.log('   4. ¡El sistema está listo para operar!');

  console.log('\n⚠️  IMPORTANTE:');
  console.log('   - Cambia la contraseña del admin después del primer login');
  console.log('   - Guarda las credenciales en un lugar seguro');
  console.log('   - No compartas las credenciales de admin con empleados');

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

/**
 * Función principal
 */
async function main() {
  try {
    // Mostrar resumen
    await showSummary();

    // Pedir confirmación
    const confirmed = await askConfirmation(
      '⚠️  ¿Estás ABSOLUTAMENTE SEGURO de que querés resetear la base de datos?\n' +
      '   Esta acción eliminará TODOS los egresos y usuarios.\n' +
      '   Escribí "si" o "s" para confirmar: '
    );

    if (!confirmed) {
      console.log('\n❌ Operación cancelada por el usuario.\n');
      rl.close();
      await pool.end();
      process.exit(0);
    }

    console.log('\n🚀 Iniciando reseteo...\n');

    // Ejecutar pasos
    await createBackup();
    await cleanEgresos();
    await cleanUsers();
    await cleanLogs();
    await resetAdmin();

    // Mostrar resumen final
    await showFinalSummary();

  } catch (error) {
    console.error('\n❌ ERROR FATAL:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

// Ejecutar script
main();
