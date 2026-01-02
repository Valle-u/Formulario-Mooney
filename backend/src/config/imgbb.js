/**
 * Cliente ImgBB para almacenamiento de archivos
 *
 * ImgBB es un servicio gratuito de hosting de imágenes y archivos
 * - Gratis hasta 10GB/mes
 * - API super simple (solo 1 API Key)
 * - Soporta imágenes (JPG, PNG) y PDFs
 * - Sin problemas SSL
 * - URLs públicas instantáneas
 *
 * Documentación: https://api.imgbb.com/
 */

/**
 * Verifica si ImgBB está configurado
 * @returns {boolean}
 */
export function isImgBBConfigured() {
  return !!process.env.IMGBB_API_KEY;
}

/**
 * Sube un archivo a ImgBB
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} fileName - Nombre del archivo (sin extensión)
 * @param {string} mimeType - Tipo MIME del archivo
 * @returns {Promise<string>} URL pública del archivo
 */
export async function uploadToImgBB(fileBuffer, fileName, mimeType) {
  if (!isImgBBConfigured()) {
    throw new Error('ImgBB no está configurado. Verifica que IMGBB_API_KEY esté en las variables de entorno.');
  }

  const apiKey = process.env.IMGBB_API_KEY;

  console.log(`☁️  Subiendo ${fileName} a ImgBB (${(fileBuffer.length / 1024).toFixed(2)} KB)...`);

  try {
    // ImgBB requiere el archivo en base64
    const base64File = fileBuffer.toString('base64');

    // Crear el cuerpo de la petición (application/x-www-form-urlencoded)
    const formBody = new URLSearchParams({
      key: apiKey,
      image: base64File,
      name: fileName
    }).toString();

    // Hacer la petición a ImgBB
    const response = await fetch('https://api.imgbb.com/1/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formBody
    });

    // Verificar respuesta
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Sin detalles' }));
      throw new Error(`HTTP ${response.status}: ${errorData.error?.message || 'Error desconocido'}`);
    }

    const data = await response.json();

    // ImgBB devuelve varias URLs, usamos la directa
    const publicUrl = data.data.url;

    console.log(`✅ Archivo subido exitosamente a ImgBB: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error('❌ Error subiendo archivo a ImgBB:');
    console.error('  Mensaje:', error.message);

    if (error.message.includes('403')) {
      throw new Error('ImgBB API Key inválida o expirada. Genera una nueva en https://api.imgbb.com/');
    }

    if (error.message.includes('413')) {
      throw new Error('Archivo demasiado grande. ImgBB tiene un límite de 32MB por archivo.');
    }

    throw new Error(`Error al subir archivo a ImgBB: ${error.message}`);
  }
}

/**
 * Elimina un archivo de ImgBB
 *
 * NOTA: ImgBB no tiene API pública para eliminar archivos.
 * Los archivos se mantienen para siempre (o según la política de ImgBB).
 *
 * Para eliminar archivos, debes:
 * 1. Iniciar sesión en imgbb.com
 * 2. Ir a "My images"
 * 3. Eliminar manualmente
 *
 * O usar la cuenta premium que sí permite eliminación via API.
 *
 * @param {string} fileUrl - URL del archivo en ImgBB
 * @returns {Promise<void>}
 */
export async function deleteFromImgBB(fileUrl) {
  console.warn('⚠️  ImgBB no soporta eliminación de archivos via API en el plan gratuito.');
  console.warn('   Los archivos permanecerán en ImgBB hasta que los elimines manualmente.');
  console.warn('   URL del archivo:', fileUrl);

  // No hacemos nada, solo advertimos
  // En el futuro, si actualizas a plan premium, puedes implementar la eliminación aquí
}

/**
 * Extrae el ID del archivo de una URL de ImgBB
 * @param {string} url - URL del archivo
 * @returns {string|null} ID del archivo
 */
export function extractFileIdFromImgBBUrl(url) {
  if (!url) return null;

  // URLs de ImgBB tienen formato:
  // https://i.ibb.co/xxxxx/filename.ext
  const match = url.match(/i\.ibb\.co\/([^\/]+)\//);
  return match ? match[1] : null;
}
