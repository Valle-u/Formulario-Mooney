#!/usr/bin/env node

/**
 * Script de Backup Automático de Base de Datos
 *
 * Uso:
 *   node scripts/backup-database.js
 *   node scripts/backup-database.js --output=/path/to/backups
 *   node scripts/backup-database.js --keep-days=30
 *
 * Variables de entorno necesarias:
 *   DATABASE_URL o (DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD)
 */

import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backups');
const KEEP_DAYS = parseInt(process.env.BACKUP_KEEP_DAYS || '30', 10);
const COMPRESSION = process.env.BACKUP_COMPRESSION !== 'false'; // Por defecto true

// Parsear argumentos de línea de comando
const args = process.argv.slice(2);
const cliArgs = {};
args.forEach(arg => {
  if (arg.startsWith('--')) {
    const [key, value] = arg.substring(2).split('=');
    cliArgs[key] = value || true;
  }
});

const outputDir = cliArgs.output || BACKUP_DIR;
const keepDays = parseInt(cliArgs['keep-days'] || KEEP_DAYS, 10);

/**
 * Parsear DATABASE_URL para obtener credenciales
 */
function parseDatabaseUrl(url) {
  if (!url) return null;

  try {
    // Formato: postgresql://usuario:contraseña@host:puerto/database
    const urlObj = new URL(url);

    return {
      host: urlObj.hostname,
      port: urlObj.port || '5432',
      database: urlObj.pathname.substring(1), // Remover /
      user: urlObj.username,
      password: urlObj.password
    };
  } catch (error) {
    console.error('❌ Error parseando DATABASE_URL:', error.message);
    return null;
  }
}

/**
 * Obtener configuración de la base de datos
 */
function getDatabaseConfig() {
  // Intentar desde DATABASE_URL primero
  if (process.env.DATABASE_URL) {
    const config = parseDatabaseUrl(process.env.DATABASE_URL);
    if (config) return config;
  }

  // Fallback a variables individuales
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || '5432',
    database: process.env.DB_NAME || 'mooney_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  };
}

/**
 * Crear directorio de backups si no existe
 */
async function ensureBackupDir() {
  try {
    await fs.mkdir(outputDir, { recursive: true });
    console.log(`✅ Directorio de backups: ${outputDir}`);
  } catch (error) {
    console.error('❌ Error creando directorio de backups:', error.message);
    process.exit(1);
  }
}

/**
 * Generar nombre de archivo de backup
 */
function getBackupFilename() {
  const now = new Date();
  const timestamp = now.toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .substring(0, 19);

  const extension = COMPRESSION ? 'sql.gz' : 'sql';
  return `backup_${timestamp}.${extension}`;
}

/**
 * Ejecutar pg_dump para crear backup
 */
function createBackup(config, filename) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(outputDir, filename);

    // Construir comando pg_dump
    let command = `pg_dump -h ${config.host} -p ${config.port} -U ${config.user} -d ${config.database}`;

    // Opciones de pg_dump
    command += ' --no-password'; // No preguntar password (usamos PGPASSWORD)
    command += ' --verbose';
    command += ' --format=plain'; // SQL plano
    command += ' --no-owner'; // No incluir comandos de ownership
    command += ' --no-acl'; // No incluir ACLs

    // Comprimir si está habilitado
    if (COMPRESSION) {
      command += ` | gzip > "${filePath}"`;
    } else {
      command += ` > "${filePath}"`;
    }

    // Establecer PGPASSWORD como variable de entorno
    const env = { ...process.env, PGPASSWORD: config.password };

    console.log(`\n🔄 Ejecutando backup de ${config.database}...`);
    console.log(`📦 Archivo: ${filename}`);

    const startTime = Date.now();

    exec(command, { env, shell: true }, async (error, stdout, stderr) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (error) {
        console.error(`\n❌ Error ejecutando pg_dump:`, error.message);
        console.error('stderr:', stderr);
        reject(error);
        return;
      }

      try {
        // Verificar que el archivo existe y tiene contenido
        const stats = await fs.stat(filePath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

        console.log(`\n✅ Backup completado exitosamente`);
        console.log(`   Tamaño: ${sizeMB} MB`);
        console.log(`   Duración: ${duration}s`);
        console.log(`   Ruta: ${filePath}`);

        resolve({ filePath, size: stats.size, duration });

      } catch (statError) {
        console.error(`❌ Error verificando archivo de backup:`, statError.message);
        reject(statError);
      }
    });
  });
}

/**
 * Limpiar backups antiguos
 */
async function cleanOldBackups() {
  try {
    console.log(`\n🧹 Limpiando backups mayores a ${keepDays} días...`);

    const files = await fs.readdir(outputDir);
    const backupFiles = files.filter(f => f.startsWith('backup_') && (f.endsWith('.sql') || f.endsWith('.sql.gz')));

    if (backupFiles.length === 0) {
      console.log('   No hay backups para limpiar');
      return;
    }

    const now = Date.now();
    const maxAge = keepDays * 24 * 60 * 60 * 1000; // días a milisegundos

    let deletedCount = 0;
    let freedSpace = 0;

    for (const file of backupFiles) {
      const filePath = path.join(outputDir, file);
      const stats = await fs.stat(filePath);
      const age = now - stats.mtimeMs;

      if (age > maxAge) {
        await fs.unlink(filePath);
        deletedCount++;
        freedSpace += stats.size;
        console.log(`   🗑️  Eliminado: ${file} (${(age / (24 * 60 * 60 * 1000)).toFixed(1)} días)`);
      }
    }

    if (deletedCount > 0) {
      const freedMB = (freedSpace / (1024 * 1024)).toFixed(2);
      console.log(`\n✅ ${deletedCount} backup(s) antiguo(s) eliminado(s)`);
      console.log(`   Espacio liberado: ${freedMB} MB`);
    } else {
      console.log('   No hay backups antiguos para eliminar');
    }

  } catch (error) {
    console.error('⚠️  Error limpiando backups antiguos:', error.message);
  }
}

/**
 * Función principal
 */
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('🗄️  BACKUP AUTOMÁTICO DE BASE DE DATOS');
  console.log('═══════════════════════════════════════════════════\n');

  // 1. Obtener configuración
  const dbConfig = getDatabaseConfig();
  console.log('📊 Configuración:');
  console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
  console.log(`   Database: ${dbConfig.database}`);
  console.log(`   Usuario: ${dbConfig.user}`);
  console.log(`   Compresión: ${COMPRESSION ? 'Sí (gzip)' : 'No'}`);
  console.log(`   Retención: ${keepDays} días`);

  // 2. Crear directorio de backups
  await ensureBackupDir();

  // 3. Crear backup
  const filename = getBackupFilename();

  try {
    await createBackup(dbConfig, filename);
  } catch (error) {
    console.error('\n❌ BACKUP FALLÓ');
    process.exit(1);
  }

  // 4. Limpiar backups antiguos
  await cleanOldBackups();

  console.log('\n═══════════════════════════════════════════════════');
  console.log('✅ PROCESO COMPLETADO');
  console.log('═══════════════════════════════════════════════════\n');
}

// Ejecutar script
main().catch(error => {
  console.error('\n❌ Error fatal:', error);
  process.exit(1);
});
