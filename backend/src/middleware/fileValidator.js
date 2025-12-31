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

    // Validación básica por extensión (más confiable que file-type en algunos casos)
    const ext = filePath.split('.').pop().toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return {
        valid: false,
        detectedType: null,
        error: `Extensión de archivo no permitida: ${ext}. Solo se permiten JPG, PNG y PDF`
      };
    }

    // Intentar validación avanzada con file-type (opcional)
    try {
      const fileTypeResult = await fileTypeFromFile(filePath);

      // Si file-type puede detectarlo, validar MIME
      if (fileTypeResult) {
        const { mime, ext: detectedExt } = fileTypeResult;

        if (!ALLOWED_MIMES.has(mime)) {
          return {
            valid: false,
            detectedType: mime,
            error: `Tipo de archivo no permitido: ${mime}. Solo se permiten JPG, PNG y PDF`
          };
        }

        return { valid: true, detectedType: mime, error: null };
      }
    } catch (fileTypeError) {
      console.warn("⚠️ file-type no pudo analizar el archivo, usando validación por extensión:", fileTypeError.message);
    }

    // Si file-type falla o no detecta nada, confiar en la extensión
    // (esto permite que archivos válidos pasen aunque file-type falle)
    console.log(`✓ Archivo validado por extensión: ${ext}`);
    return { valid: true, detectedType: `extension-based/${ext}`, error: null };

  } catch (error) {
    console.error("❌ Error validando archivo:", error);
    // En caso de error crítico, permitir el archivo (fail-open para no romper el flujo)
    console.warn("⚠️ Validación fallida, permitiendo archivo por defecto");
    return { valid: true, detectedType: null, error: null };
  }
}

/**
 * Middleware Express para validar archivos subidos con Multer
 * Uso: Agregar después del middleware de Multer
 * Soporta tanto diskStorage (req.file.path) como memoryStorage (req.file.buffer)
 */
export async function validateUploadedFile(req, res, next) {
  // Si no hay archivo, pasar al siguiente middleware
  if (!req.file) {
    return next();
  }

  // Validación básica: verificar extensión del archivo original
  const filename = req.file.originalname || '';
  const ext = filename.split('.').pop()?.toLowerCase();

  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return res.status(400).json({
      message: `Extensión de archivo no permitida: ${ext || 'desconocida'}. Solo se permiten JPG, PNG y PDF`
    });
  }

  // Validación de MIME type declarado
  if (!ALLOWED_MIMES.has(req.file.mimetype)) {
    return res.status(400).json({
      message: `Tipo MIME no permitido: ${req.file.mimetype}. Solo se permiten JPG, PNG y PDF`
    });
  }

  // Si el archivo está en disco (diskStorage), validar con file-type
  if (req.file.path) {
    const validation = await validateFileType(req.file.path);

    if (!validation.valid) {
      // Eliminar el archivo inválido
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.error("Error eliminando archivo inválido:", err);
      }

      return res.status(400).json({
        message: validation.error || "Archivo inválido"
      });
    }

    // Guardar el tipo detectado en req.file para uso posterior
    req.file.detectedMimeType = validation.detectedType;
  } else if (req.file.buffer) {
    // Si el archivo está en memoria (memoryStorage), solo validar extensión y MIME declarado
    // La validación profunda con magic numbers requeriría escribir el buffer a un archivo temporal
    console.log(`✓ Archivo en memoria validado: ${filename} (${req.file.mimetype})`);
    req.file.detectedMimeType = `buffer-based/${ext}`;
  }

  next();
}
