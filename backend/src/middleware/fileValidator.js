import fs from "fs";
import fileTypePkg from "file-type";
const { fileTypeFromFile } = fileTypePkg;

/**
 * Middleware para validar archivos subidos
 * Verifica el MIME type real usando magic numbers, no solo la extensión declarada
 */

const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf"
]);

const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "pdf"
]);

/**
 * Valida que el archivo sea realmente del tipo que dice ser
 * @param {string} filePath - Ruta al archivo a validar
 * @returns {Promise<{valid: boolean, detectedType: string|null, error: string|null}>}
 */
export async function validateFileType(filePath) {
  try {
    // Verificar que el archivo existe
    if (!fs.existsSync(filePath)) {
      return { valid: false, detectedType: null, error: "Archivo no encontrado" };
    }

    // Detectar el tipo real del archivo usando magic numbers
    const fileTypeResult = await fileTypeFromFile(filePath);

    // Si no se puede detectar el tipo, rechazar
    if (!fileTypeResult) {
      return {
        valid: false,
        detectedType: null,
        error: "No se pudo determinar el tipo de archivo"
      };
    }

    const { mime, ext } = fileTypeResult;

    // Validar que el MIME type esté permitido
    if (!ALLOWED_MIMES.has(mime)) {
      return {
        valid: false,
        detectedType: mime,
        error: `Tipo de archivo no permitido: ${mime}. Solo se permiten JPG, PNG y PDF`
      };
    }

    // Validar que la extensión esté permitida
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        detectedType: mime,
        error: `Extensión de archivo no permitida: ${ext}`
      };
    }

    return { valid: true, detectedType: mime, error: null };

  } catch (error) {
    console.error("❌ Error validando archivo:", error);
    return {
      valid: false,
      detectedType: null,
      error: "Error interno al validar archivo"
    };
  }
}

/**
 * Middleware Express para validar archivos subidos con Multer
 * Uso: Agregar después del middleware de Multer
 */
export async function validateUploadedFile(req, res, next) {
  // Si no hay archivo, pasar al siguiente middleware
  if (!req.file) {
    return next();
  }

  const filePath = req.file.path;
  const validation = await validateFileType(filePath);

  if (!validation.valid) {
    // Eliminar el archivo inválido
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error("Error eliminando archivo inválido:", err);
    }

    return res.status(400).json({
      message: validation.error || "Archivo inválido"
    });
  }

  // Guardar el tipo detectado en req.file para uso posterior
  req.file.detectedMimeType = validation.detectedType;

  next();
}
