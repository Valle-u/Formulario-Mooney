/**
 * Cliente Cloudflare R2 usando FETCH API nativa
 *
 * SOLUCIÓN DEFINITIVA para problemas SSL/OpenSSL:
 * - Usa fetch() nativo de Node.js (sin AWS SDK)
 * - Firma las peticiones manualmente con AWS Signature V4
 * - Compatible con CUALQUIER versión de Node.js >= 18
 * - Funciona en SeeNode, Render, Railway, etc.
 */

import crypto from 'crypto';

// Función para obtener configuración (lazy loading)
function getR2Config() {
  return {
    accountId: process.env.R2_ACCOUNT_ID,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME,
    publicUrl: process.env.R2_PUBLIC_URL
  };
}

// Verificar si está configurado (lazy check)
function checkConfigured() {
  const config = getR2Config();
  return !!(config.accountId && config.accessKeyId && config.secretAccessKey && config.bucketName);
}

/**
 * Genera la firma AWS Signature V4 para autenticar con R2
 * @param {string} method - Método HTTP (PUT, GET, DELETE)
 * @param {string} path - Ruta del objeto (ej: /archivo.pdf)
 * @param {Object} headers - Headers de la petición
 * @param {Buffer} body - Cuerpo de la petición (para PUT)
 * @returns {Object} Headers con Authorization
 */
function signRequest(method, path, headers = {}, body = null) {
  const config = getR2Config();
  const service = 's3';
  const region = 'auto';
  const host = `${config.accountId}.r2.cloudflarestorage.com`;

  // Timestamp en formato ISO
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  // Calcular hash del payload
  const payloadHash = body
    ? crypto.createHash('sha256').update(body).digest('hex')
    : crypto.createHash('sha256').update('').digest('hex');

  // Headers canónicos (ordenados alfabéticamente)
  const canonicalHeaders = {
    'host': host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...headers
  };

  const signedHeaders = Object.keys(canonicalHeaders).sort().join(';');
  const canonicalHeadersString = Object.keys(canonicalHeaders)
    .sort()
    .map(key => `${key}:${canonicalHeaders[key]}\n`)
    .join('');

  // Canonical request
  const canonicalRequest = [
    method,
    path,
    '', // Query string (vacío)
    canonicalHeadersString,
    signedHeaders,
    payloadHash
  ].join('\n');

  // String to sign
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')
  ].join('\n');

  // Signing key
  const kDate = crypto.createHmac('sha256', `AWS4${config.secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();

  // Signature
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  // Authorization header
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    ...canonicalHeaders,
    'Authorization': authorization
  };
}

/**
 * Sube un archivo a Cloudflare R2
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} fileName - Nombre del archivo
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {Promise<string>} URL pública del archivo
 */
export async function uploadToR2(fileBuffer, fileName, mimeType) {
  if (!checkConfigured()) {
    throw new Error('Cloudflare R2 no está configurado. Verifica las variables de entorno.');
  }

  const config = getR2Config();
  console.log(`☁️  Subiendo ${fileName} a R2 (${(fileBuffer.length / 1024).toFixed(2)} KB)...`);

  try {
    const path = `/${config.bucketName}/${fileName}`;
    const host = `${config.accountId}.r2.cloudflarestorage.com`;
    const url = `https://${host}${path}`;

    // Firmar la petición
    const headers = signRequest('PUT', path, {
      'content-type': mimeType,
      'content-length': fileBuffer.length.toString()
    }, fileBuffer);

    // Hacer la petición con fetch nativo
    const response = await fetch(url, {
      method: 'PUT',
      headers: headers,
      body: fileBuffer
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Sin detalles');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    // URL pública del archivo
    const publicUrl = `${config.publicUrl}/${fileName}`;
    console.log(`✅ Archivo subido exitosamente a R2: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error('❌ Error subiendo archivo a R2:');
    console.error('  Mensaje:', error.message);
    console.error('  Código:', error.code || 'N/A');
    console.error('  Causa:', error.cause || 'N/A');
    if (error.cause) {
      console.error('  Detalles de causa:', error.cause.message || error.cause);
    }
    throw new Error(`Error al subir archivo a R2: ${error.message}`);
  }
}

/**
 * Elimina un archivo de Cloudflare R2
 * @param {string} fileName - Nombre del archivo a eliminar
 * @returns {Promise<void>}
 */
export async function deleteFromR2(fileName) {
  if (!checkConfigured()) {
    throw new Error('Cloudflare R2 no está configurado.');
  }

  const config = getR2Config();

  try {
    const path = `/${config.bucketName}/${fileName}`;
    const host = `${config.accountId}.r2.cloudflarestorage.com`;
    const url = `https://${host}${path}`;

    // Firmar la petición DELETE
    const headers = signRequest('DELETE', path);

    const response = await fetch(url, {
      method: 'DELETE',
      headers: headers
    });

    if (!response.ok && response.status !== 404) {
      const errorText = await response.text().catch(() => 'Sin detalles');
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    console.log(`✅ Archivo eliminado de R2: ${fileName}`);
  } catch (error) {
    console.error('❌ Error eliminando archivo de R2:', error);
    throw new Error(`Error al eliminar archivo de R2: ${error.message}`);
  }
}

/**
 * Verifica si R2 está configurado
 * @returns {boolean}
 */
export function isR2Configured() {
  return checkConfigured();
}

/**
 * Extrae el nombre del archivo de una URL de R2
 * @param {string} url - URL del archivo
 * @returns {string|null} Nombre del archivo
 */
export function extractFileNameFromR2Url(url) {
  if (!url) return null;
  const parts = url.split('/');
  return parts[parts.length - 1];
}
