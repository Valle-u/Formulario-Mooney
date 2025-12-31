import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

/**
 * Cliente de Cloudflare R2
 * Configuración para almacenamiento de archivos en la nube
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

// Configurar cliente S3 para Cloudflare R2
// Configuración optimizada y compatible con SSL/TLS estándar
const r2Client = process.env.R2_ACCESS_KEY_ID ? new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  // Configuración correcta para Cloudflare R2
  forcePathStyle: false, // R2 usa virtual-hosted-style URLs
  // Timeouts razonables (30 segundos es suficiente)
  requestHandler: {
    requestTimeout: 30000,
    httpsAgent: undefined // Usar el agente HTTPS por defecto de Node.js
  }
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
