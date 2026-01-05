/**
 * Script de prueba para verificar la conexión con Cloudflare R2
 *
 * Uso:
 *   node test-r2-connection.js
 *
 * Este script NO sube archivos reales, solo verifica que:
 * 1. Las credenciales estén configuradas
 * 2. El cliente S3 se pueda inicializar correctamente
 * 3. La configuración SSL funcione
 */

import dotenv from 'dotenv';
import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import https from 'https';
import { NodeHttpHandler } from '@smithy/node-http-handler';

// Cargar variables de entorno
dotenv.config();

console.log('🔧 Verificando configuración de Cloudflare R2...\n');

// Verificar variables de entorno
const requiredVars = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME'
];

const missing = requiredVars.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.error('❌ Faltan variables de entorno:', missing.join(', '));
  console.error('\nConfigura estas variables en tu archivo .env\n');
  process.exit(1);
}

console.log('✅ Variables de entorno configuradas correctamente\n');

// Mostrar configuración (ocultando credenciales)
console.log('📋 Configuración actual:');
console.log(`  - Account ID: ${process.env.R2_ACCOUNT_ID}`);
console.log(`  - Access Key: ${process.env.R2_ACCESS_KEY_ID.substring(0, 8)}...`);
console.log(`  - Bucket: ${process.env.R2_BUCKET_NAME}`);
console.log(`  - Public URL: ${process.env.R2_PUBLIC_URL || 'No configurada'}`);
console.log('');

// Crear agente HTTPS permisivo (igual que en r2.js)
const httpsAgent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  minVersion: 'TLSv1.2',
  checkServerIdentity: () => undefined
});

console.log('🔐 Agente HTTPS configurado (SSL permisivo para SeeNode)\n');

// Crear cliente S3
const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
console.log(`🌐 Endpoint: ${endpoint}\n`);

const client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: false,
  requestHandler: new NodeHttpHandler({
    httpsAgent,
    requestTimeout: 60000,
    connectionTimeout: 30000
  })
});

console.log('✅ Cliente S3 inicializado correctamente\n');

// Intentar listar buckets (prueba de conexión)
console.log('🔍 Probando conexión con Cloudflare R2...\n');

try {
  const command = new ListBucketsCommand({});
  const response = await client.send(command);

  console.log('✅ ¡CONEXIÓN EXITOSA! 🎉\n');
  console.log(`📦 Buckets encontrados: ${response.Buckets?.length || 0}`);

  if (response.Buckets && response.Buckets.length > 0) {
    console.log('\nLista de buckets:');
    response.Buckets.forEach(bucket => {
      const isCurrent = bucket.Name === process.env.R2_BUCKET_NAME;
      const marker = isCurrent ? '✓' : ' ';
      console.log(`  [${marker}] ${bucket.Name} (creado: ${bucket.CreationDate})`);
    });
  }

  console.log('\n✅ Tu configuración de R2 está funcionando correctamente');
  console.log('✅ Puedes deployar a SeeNode sin problemas\n');

  process.exit(0);
} catch (error) {
  console.error('❌ ERROR al conectar con R2:\n');
  console.error('Mensaje:', error.message);

  if (error.name === 'NetworkingError') {
    console.error('\n⚠️  Error de red. Posibles causas:');
    console.error('  - Firewall bloqueando conexiones a Cloudflare');
    console.error('  - Problema con las credenciales de R2');
    console.error('  - Problema de SSL/TLS (debería estar solucionado con esta configuración)');
  }

  if (error.$metadata) {
    console.error('\nMetadata del error:');
    console.error('  - HTTP Status:', error.$metadata.httpStatusCode || 'N/A');
    console.error('  - Request ID:', error.$metadata.requestId || 'N/A');
  }

  console.error('\n💡 Sugerencias:');
  console.error('  1. Verifica que las credenciales R2 sean correctas');
  console.error('  2. Verifica que el bucket exista en Cloudflare');
  console.error('  3. Verifica tu conexión a internet');
  console.error('  4. En SeeNode, asegúrate de configurar NODE_TLS_REJECT_UNAUTHORIZED=0');
  console.error('');

  process.exit(1);
}
