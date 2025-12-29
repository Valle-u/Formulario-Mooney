import express from "express";
import bcrypt from "bcrypt";
import { query } from "../config/db.js";

const router = express.Router();

/**
 * ENDPOINT TEMPORAL - ELIMINAR DESPUÉS DE CREAR EL ADMIN
 * POST /api/init-admin
 * Crea el usuario admin inicial si no existe
 */
router.post("/init-admin", async (req, res) => {
  try {
    // Verificar si ya existe un admin
    const existing = await query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (existing.rowCount > 0) {
      return res.status(400).json({
        message: "Ya existe un usuario administrador. Endpoint deshabilitado por seguridad."
      });
    }

    // Crear admin con credenciales por defecto
    const username = "admin";
    const password = "MooneyAdmin2025!";
    const fullName = "Administrador";

    const hash = await bcrypt.hash(password, 12);

    const result = await query(
      `INSERT INTO users (username, password_hash, role, full_name, is_active, created_by)
       VALUES ($1, $2, 'admin', $3, true, NULL)
       RETURNING id, username, role, full_name`,
      [username, hash, fullName]
    );

    return res.json({
      success: true,
      message: "Usuario administrador creado exitosamente",
      user: result.rows[0],
      credentials: {
        username: username,
        password: password,
        warning: "⚠️ CAMBIAR CONTRASEÑA INMEDIATAMENTE DESPUÉS DEL PRIMER LOGIN"
      }
    });
  } catch (error) {
    console.error("Error creando admin:", error);
    return res.status(500).json({
      message: "Error al crear administrador",
      error: error.message
    });
  }
});

/**
 * ENDPOINT TEMPORAL - ELIMINAR DESPUÉS DE EJECUTAR
 * POST /api/fix-id-transferencia
 * Ejecuta la migración para permitir IDs alfanuméricos
 */
router.post("/fix-id-transferencia", async (req, res) => {
  try {
    console.log("🔧 Ejecutando fix para id_transferencia...");

    // 1. Eliminar el constraint que solo permite dígitos
    await query(`
      ALTER TABLE egresos
      DROP CONSTRAINT IF EXISTS egresos_id_transferencia_digits_chk;
    `);
    console.log("✅ Constraint antiguo eliminado");

    // 2. Cambiar el tipo de columna a TEXT
    await query(`
      ALTER TABLE egresos
      ALTER COLUMN id_transferencia TYPE TEXT;
    `);
    console.log("✅ Tipo de columna cambiado a TEXT");

    // 3. Agregar nuevo constraint para alfanuméricos
    await query(`
      ALTER TABLE egresos
      ADD CONSTRAINT egresos_id_transferencia_alphanumeric_chk
      CHECK (id_transferencia ~ '^[a-zA-Z0-9\\-_]+$');
    `);
    console.log("✅ Nuevo constraint alfanumérico agregado");

    // 4. Actualizar el comentario de la columna
    await query(`
      COMMENT ON COLUMN egresos.id_transferencia IS 'ID alfanumérico de la transferencia (puede contener letras, números, guiones y guiones bajos)';
    `);
    console.log("✅ Comentario actualizado");

    return res.json({
      success: true,
      message: "Migración ejecutada exitosamente. Ahora podés usar IDs alfanuméricos.",
      changes: [
        "Constraint antiguo eliminado",
        "Tipo de columna cambiado a TEXT",
        "Nuevo constraint alfanumérico agregado",
        "Comentario actualizado"
      ]
    });
  } catch (error) {
    console.error("❌ Error ejecutando fix:", error);
    return res.status(500).json({
      message: "Error al ejecutar migración",
      error: error.message,
      code: error.code,
      detail: error.detail
    });
  }
});

export default router;
