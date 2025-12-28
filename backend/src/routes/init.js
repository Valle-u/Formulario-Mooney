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

export default router;
