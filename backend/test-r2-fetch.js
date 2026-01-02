/**
 * Script de prueba para el cliente R2 con FETCH API
 *
 * Uso:
 *   node test-r2-fetch.js
 *
 * Prueba la subida y eliminación de archivos usando fetch() nativo
 */

import dotenv from 'dotenv';

// IMPORTANTE: Cargar .env ANTES de importar r2-fetch
dotenv.config();

import { uploadToR2, deleteFromR2, isR2Configured } from './src/config/r2-fetch.js';

console.log('🧪 Probando cliente R2 con FETCH API\n');
console.log('📋 Configuración cargada:');
console.log(`  - Account ID: ${process.env.R2_ACCOUNT_ID}`);
console.log(`  - Access Key: ${process.env.R2_ACCESS_KEY_ID?.substring(0, 8)}...`);
console.log(`  - Bucket: ${process.env.R2_BUCKET_NAME}`);
console.log(`  - Public URL: ${process.env.R2_PUBLIC_URL}\n`);

// Verificar configuración
if (!isR2Configured()) {
  console.error('❌ R2 no está configurado correctamente');
  console.error('   Verifica las variables de entorno en .env\n');
  process.exit(1);
}

console.log('✅ Configuración de R2 detectada\n');

// Crear un archivo de prueba
const testFileName = `test-${Date.now()}.txt`;
const testContent = 'Este es un archivo de prueba para Cloudflare R2\n';
const testBuffer = Buffer.from(testContent, 'utf-8');

console.log(`📝 Archivo de prueba: ${testFileName}`);
console.log(`📦 Tamaño: ${testBuffer.length} bytes\n`);

async function runTest() {
  try {
    console.log('📤 Subiendo archivo a R2...\n');

    const publicUrl = await uploadToR2(testBuffer, testFileName, 'text/plain');

    console.log('\n✅ ¡ÉXITO! Archivo subido correctamente');
    console.log(`🔗 URL pública: ${publicUrl}\n`);

    // Esperar 2 segundos
    console.log('⏳ Esperando 2 segundos antes de eliminar...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('🗑️  Eliminando archivo de prueba...\n');
    await deleteFromR2(testFileName);

    console.log('✅ Archivo eliminado correctamente\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 ¡PRUEBA COMPLETADA CON ÉXITO!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\n✅ Tu configuración de R2 funciona correctamente');
    console.log('✅ Puedes deployar a SeeNode sin problemas\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR durante la prueba:\n');
    console.error('Mensaje:', error.message);
    console.error('\n💡 Posibles causas:');
    console.error('  1. Credenciales incorrectas (ACCESS_KEY_ID o SECRET_ACCESS_KEY)');
    console.error('  2. Bucket no existe o nombre incorrecto');
    console.error('  3. Permisos insuficientes en el bucket');
    console.error('  4. Account ID incorrecto');
    console.error('\n🔧 Solución:');
    console.error('  1. Ve a Cloudflare Dashboard → R2');
    console.error('  2. Verifica que el bucket existe');
    console.error('  3. Genera nuevas API tokens');
    console.error('  4. Actualiza las variables en .env\n');

    process.exit(1);
  }
}

runTest();
