#!/usr/bin/env node

/**
 * Script de limpieza de archivos antiguos
 *
 * Elimina comprobantes de más de 12 meses para liberar espacio en disco.
 * Se recomienda ejecutar mensualmente mediante un cron job.
 *
 * IMPORTANTE: Antes de ejecutar, asegurate de tener backups de los archivos.
 *
 * Uso:
 *   node backend/scripts/cleanup-old-files.js [--dry-run] [--months=12]
 *
 * Opciones:
 *   --dry-run: Muestra qué archivos se eliminarían sin borrarlos
 *   --months=N: Cantidad de meses a retener (default: 12)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuración
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const uploadPath = path.join(__dirname, "..", "..", UPLOAD_DIR);

// Parsear argumentos
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const monthsArg = args.find(a => a.startsWith("--months="));
const monthsToKeep = monthsArg ? parseInt(monthsArg.split("=")[1]) : 12;

// Validar
if (isNaN(monthsToKeep) || monthsToKeep < 1) {
  console.error("❌ Error: --months debe ser un número positivo");
  process.exit(1);
}

// Calcular fecha límite
const cutoffDate = new Date();
cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);

console.log("🧹 Iniciando limpieza de archivos antiguos...");
console.log(`📁 Directorio: ${uploadPath}`);
console.log(`📅 Retener archivos desde: ${cutoffDate.toISOString()}`);
console.log(`🔧 Modo: ${isDryRun ? "DRY RUN (simulación)" : "ELIMINAR archivos"}`);
console.log("");

// Verificar que el directorio existe
if (!fs.existsSync(uploadPath)) {
  console.error(`❌ Error: El directorio ${uploadPath} no existe`);
  process.exit(1);
}

// Leer archivos
const files = fs.readdirSync(uploadPath);
let deletedCount = 0;
let deletedSize = 0;
let skippedCount = 0;

console.log(`📊 Total de archivos encontrados: ${files.length}\n`);

for (const file of files) {
  const filePath = path.join(uploadPath, file);

  try {
    const stats = fs.statSync(filePath);

    // Solo procesar archivos (no directorios)
    if (!stats.isFile()) {
      skippedCount++;
      continue;
    }

    // Verificar si el archivo es más antiguo que el límite
    if (stats.mtime < cutoffDate) {
      const fileAgeMonths = Math.floor((Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      console.log(`🗑️  ${file}`);
      console.log(`   Antigüedad: ${fileAgeMonths} meses | Tamaño: ${fileSizeMB} MB | Fecha: ${stats.mtime.toISOString()}`);

      if (!isDryRun) {
        fs.unlinkSync(filePath);
        console.log(`   ✅ Eliminado`);
      } else {
        console.log(`   ⚠️  Se eliminaría (dry-run)`);
      }

      deletedCount++;
      deletedSize += stats.size;
      console.log("");
    }
  } catch (err) {
    console.error(`❌ Error procesando ${file}:`, err.message);
  }
}

const totalSizeMB = (deletedSize / (1024 * 1024)).toFixed(2);

console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("📈 RESUMEN");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log(`Total de archivos: ${files.length}`);
console.log(`Archivos ${isDryRun ? "a eliminar" : "eliminados"}: ${deletedCount}`);
console.log(`Archivos omitidos: ${skippedCount}`);
console.log(`Espacio ${isDryRun ? "a liberar" : "liberado"}: ${totalSizeMB} MB`);
console.log("");

if (isDryRun && deletedCount > 0) {
  console.log("💡 TIP: Ejecutá sin --dry-run para eliminar los archivos realmente");
}

if (!isDryRun && deletedCount > 0) {
  console.log("✅ Limpieza completada exitosamente");
}

if (deletedCount === 0) {
  console.log("✅ No hay archivos antiguos para eliminar");
}
