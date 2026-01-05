/**
 * Script de prueba para ImgBB
 *
 * Uso:
 *   node test-imgbb.js
 *
 * Prueba la subida de archivos a ImgBB
 */

import dotenv from 'dotenv';
dotenv.config();

import { uploadToImgBB, isImgBBConfigured } from '../../src/config/imgbb.js';

console.log('🧪 Probando ImgBB\n');

// Verificar configuración
if (!isImgBBConfigured()) {
  console.error('❌ ImgBB no está configurado\n');
  console.error('Pasos para configurar:');
  console.error('1. Ve a https://api.imgbb.com/');
  console.error('2. Click en "Get API key"');
  console.error('3. Copia tu API Key');
  console.error('4. Agrégala al archivo .env:');
  console.error('   IMGBB_API_KEY=tu_api_key_aqui\n');
  process.exit(1);
}

console.log('✅ ImgBB configurado\n');

// Crear un archivo de prueba (PDF simple)
const testFileName = `test-${Date.now()}`;
const testContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
>>
endobj
xref
0 4
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
trailer
<<
/Size 4
/Root 1 0 R
>>
startxref
190
%%EOF`;

const testBuffer = Buffer.from(testContent, 'utf-8');

console.log(`📝 Archivo de prueba: ${testFileName}.pdf`);
console.log(`📦 Tamaño: ${testBuffer.length} bytes\n`);

async function runTest() {
  try {
    console.log('📤 Subiendo archivo a ImgBB...\n');

    const publicUrl = await uploadToImgBB(testBuffer, testFileName, 'application/pdf');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 ¡ÉXITO! Archivo subido correctamente');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`\n🔗 URL pública: ${publicUrl}`);
    console.log('\n✅ Tu configuración de ImgBB funciona correctamente');
    console.log('✅ Puedes deployar a SeeNode sin problemas\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR durante la prueba:\n');
    console.error('Mensaje:', error.message);
    console.error('\n💡 Posibles causas:');
    console.error('  1. API Key incorrecta');
    console.error('  2. API Key expirada');
    console.error('  3. Límite de uploads excedido');
    console.error('\n🔧 Solución:');
    console.error('  1. Ve a https://api.imgbb.com/');
    console.error('  2. Verifica tu API Key');
    console.error('  3. Genera una nueva si es necesario');
    console.error('  4. Actualiza IMGBB_API_KEY en .env\n');

    process.exit(1);
  }
}

runTest();
