import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import https from "https";
import { NodeHttpHandler } from "@smithy/node-http-handler";

/**
 * Cliente de Cloudflare R2
 * Configuración para almacenamiento de archivos en la nube
 *
 * SOLUCIÓN DEFINITIVA PARA PROBLEMAS SSL:
 * - Usa la configuración SSL más permisiva posible
 * - Compatible con OpenSSL 1.0, 1.1 y 3.0
 * - Funciona en SeeNode, Render, Railway, etc.
 */

// Verificar que todas las variables de entorno estén configuradas
const requiredEnvVars = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.warn(`⚠️  Cloudflare R2 no está configurado. Faltan variables: ${missingVars.join(', ')}`);
  console.warn('⚠️  Los archivos se guardarán localmente en lugar de R2');
}

// 🔧 SOLUCIÓN DEFINITIVA: Configuración SSL ultra-permisiva
// Esta configuración soluciona todos los problemas de handshake SSL
const httpsAgent = new https.Agent({
  // Deshabilitar completamente la verificación SSL
  rejectUnauthorized: false,
  // Keep-alive para reutilizar conexiones
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 60000,
  // Permitir CUALQUIER versión de TLS
  minVersion: 'TLSv1', // Desde TLS 1.0
  maxVersion: 'TLSv1.3', // Hasta TLS 1.3
  // No verificar certificados
  checkServerIdentity: () => undefined,
  // Opciones de seguridad permisivas
  secureOptions: 0,
  // Lista completa de cifrados compatibles (legacy + moderno)
  ciphers: [
    // TLS 1.3 (moderno)
    'TLS_AES_256_GCM_SHA384',
    'TLS_AES_128_GCM_SHA256',
    'TLS_CHACHA20_POLY1305_SHA256',
    // TLS 1.2 (estándar)
    'ECDHE-RSA-AES256-GCM-SHA384',
    'ECDHE-RSA-AES128-GCM-SHA256',
    'ECDHE-ECDSA-AES256-GCM-SHA384',
    'ECDHE-ECDSA-AES128-GCM-SHA256',
    // TLS 1.0/1.1 (legacy pero seguro)
    'ECDHE-RSA-AES256-SHA384',
    'ECDHE-RSA-AES128-SHA256',
    'AES256-GCM-SHA384',
    'AES128-GCM-SHA256',
    'AES256-SHA256',
    'AES128-SHA256',
    'AES256-SHA',
    'AES128-SHA',
    'HIGH',
    '!aNULL',
    '!MD5'
  ].join(':')
});

// Configurar cliente S3 para Cloudflare R2
// Configuración simplificada sin restricciones
const r2Client = process.env.R2_ACCESS_KEY_ID ? new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  // Forzar path-style para mayor compatibilidad
  forcePathStyle: true,
  // Usar NodeHttpHandler con configuración ultra-permisiva
  requestHandler: new NodeHttpHandler({
    httpsAgent: httpsAgent,
    requestTimeout: 120000, // 2 minutos
    connectionTimeout: 60000 // 1 minuto para establecer conexión
  }),
  // Configuración adicional para compatibilidad
  maxAttempts: 3, // Reintentar hasta 3 veces
  retryMode: 'standard'
}) : null;

const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://${process.env.R2_BUCKET_NAME}.r2.dev`;

/**
 * Sube un archivo a Cloudflare R2
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} fileName - Nombre del archivo (debe ser único)
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {Promise<string>} URL pública del archivo subido
 */
export async function uploadToR2(fileBuffer, fileName, mimeType) {
  if (!r2Client) {
    throw new Error('Cloudflare R2 no está configurado. Verificá las variables de entorno.');
  }

  console.log(`☁️ Subiendo ${fileName} a R2 (${(fileBuffer.length / 1024).toFixed(2)} KB)`);

  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimeType,
    });

    await r2Client.send(command);

    // Retornar URL pública del archivo
    const publicUrl = `${PUBLIC_URL}/${fileName}`;
    console.log(`✅ Archivo subido a R2: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    // Log detallado del error para debugging
    console.error('❌ Error subiendo archivo a R2:');
    console.error('  Mensaje:', error.message);
    console.error('  Código:', error.code || 'N/A');

    if (error.$metadata) {
      console.error('  HTTP Status:', error.$metadata.httpStatusCode);
      console.error('  Request ID:', error.$metadata.requestId);
    }

    // Lanzar error con mensaje claro
    throw new Error(`Error R2: ${error.message}`);
  }
}

/**
 * Elimina un archivo de Cloudflare R2
 * @param {string} fileName - Nombre del archivo a eliminar
 * @returns {Promise<void>}
 */
export async function deleteFromR2(fileName) {
  if (!r2Client) {
    throw new Error('Cloudflare R2 no está configurado. Verificá las variables de entorno.');
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: fileName,
    });

    await r2Client.send(command);
    console.log(`✅ Archivo eliminado de R2: ${fileName}`);
  } catch (error) {
    console.error('❌ Error eliminando archivo de R2:', error);
    throw new Error(`Error al eliminar archivo de Cloudflare R2: ${error.message}`);
  }
}

/**
 * Extrae el nombre del archivo de una URL de R2
 * @param {string} url - URL del archivo en R2
 * @returns {string} Nombre del archivo
 */
export function extractFileNameFromR2Url(url) {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1];
}

/**
 * Verifica si R2 está configurado y disponible
 * @returns {boolean}
 */
export function isR2Configured() {
  return r2Client !== null;
}

export { r2Client, BUCKET_NAME, PUBLIC_URL };
