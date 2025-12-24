import express from "express";
import bcrypt from "bcrypt";
import { query } from "../config/db.js";
import { auth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { auditLog } from "../utils/audit.js";
import { validatePasswordStrength } from "../utils/validators.js";

const router = express.Router();

router.post("/", auth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role, full_name } = req.body || {};
    if (!username || !password || !role) {
      await auditLog(req, { action:"USER_CREATE_FAIL", entity:"users", success:false, status_code:400, details:{ reason:"missing_fields", username } });
      return res.status(400).json({ message: "username, password y role son obligatorios" });
    }
    if (!["admin", "empleado"].includes(role)) {
      await auditLog(req, { action:"USER_CREATE_FAIL", entity:"users", success:false, status_code:400, details:{ reason:"invalid_role", username, role } });
      return res.status(400).json({ message: "role inválido" });
    }

    // Validar contraseña fuerte
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      await auditLog(req, { action:"USER_CREATE_FAIL", entity:"users", success:false, status_code:400, details:{ reason:"weak_password", username } });
      return res.status(400).json({ message: passwordError });
    }

    const hash = await bcrypt.hash(password, 12);

    const r = await query(
      `INSERT INTO users (username, password_hash, role, full_name, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id, username, role, full_name, is_active, created_at`,
      [username, hash, role, full_name || null, req.user.id]
    );

    await auditLog(req, {
      action: "USER_CREATE",
      entity: "users",
      entity_id: r.rows[0].id,
      success: true,
      status_code: 201,
      details: { username: r.rows[0].username, role: r.rows[0].role }
    });

    return res.status(201).json({ user: r.rows[0] });
  } catch (e) {
    if (String(e?.message || "").includes("duplicate key")) {
      await auditLog(req, { action:"USER_CREATE_FAIL", entity:"users", success:false, status_code:409, details:{ reason:"duplicate_username" } });
      return res.status(409).json({ message: "Username ya existe" });
    }
    await auditLog(req, { action:"USER_CREATE_FAIL", entity:"users", success:false, status_code:500, details:{ reason:"server_error" } });
    return res.status(500).json({ message: "Error creando usuario" });
  }
});

router.get("/", auth, requireAdmin, async (req, res) => {
  try {
    const r = await query(
      "SELECT id, username, role, full_name, is_active, created_at, created_by FROM users ORDER BY id ASC",
      []
    );

    await auditLog(req, { action:"USER_LIST", entity:"users", success:true, status_code:200, details:{ rows: r.rowCount } });

    return res.json({ users: r.rows });
  } catch {
    return res.status(500).json({ message: "Error listando usuarios" });
  }
});

router.put("/:id", auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "id inválido" });

    const { role, full_name, is_active } = req.body || {};

    if (id === req.user.id) {
      if (typeof is_active === "boolean" && is_active === false) {
        return res.status(400).json({ message: "No podés desactivarte a vos mismo" });
      }
      if (role && role !== req.user.role) {
        return res.status(400).json({ message: "No podés cambiar tu propio rol" });
      }
    }

    if (role && !["admin", "empleado"].includes(role)) {
      return res.status(400).json({ message: "role inválido" });
    }

    const sets = [];
    const params = [];
    let i = 1;

    if (role !== undefined) { sets.push(`role = $${i++}`); params.push(role); }
    if (full_name !== undefined) { sets.push(`full_name = $${i++}`); params.push(full_name || null); }
    if (is_active !== undefined) { sets.push(`is_active = $${i++}`); params.push(!!is_active); }

    if (sets.length === 0) {
      return res.status(400).json({ message: "Nada para actualizar" });
    }

    params.push(id);
    const r = await query(
      `UPDATE users SET ${sets.join(", ")} WHERE id = $${i}
       RETURNING id, username, role, full_name, is_active, created_at`,
      params
    );

    if (r.rowCount === 0) return res.status(404).json({ message: "Usuario no encontrado" });

    await auditLog(req, {
      action: "USER_UPDATE",
      entity: "users",
      entity_id: id,
      success: true,
      status_code: 200,
      details: { role: r.rows[0].role, is_active: r.rows[0].is_active, full_name: r.rows[0].full_name }
    });

    return res.json({ user: r.rows[0] });
  } catch {
    await auditLog(req, { action:"USER_UPDATE_FAIL", entity:"users", success:false, status_code:500, details:{ reason:"server_error" } });
    return res.status(500).json({ message: "Error actualizando usuario" });
  }
});

router.post("/:id/reset-password", auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "id inválido" });

    const { password } = req.body || {};
    if (!password) {
      return res.status(400).json({ message: "password es obligatoria" });
    }

    // Validar contraseña fuerte
    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      return res.status(400).json({ message: passwordError });
    }

    const hash = await bcrypt.hash(password, 12);
    const r = await query(
      `UPDATE users SET password_hash = $1 WHERE id = $2
       RETURNING id, username, role, full_name, is_active, created_at`,
      [hash, id]
    );

    if (r.rowCount === 0) return res.status(404).json({ message: "Usuario no encontrado" });

    await auditLog(req, {
      action: "USER_RESET_PASSWORD",
      entity: "users",
      entity_id: id,
      success: true,
      status_code: 200,
      details: { username: r.rows[0].username }
    });

    return res.json({ user: r.rows[0], message: "Password actualizada" });
  } catch {
    await auditLog(req, { action:"USER_RESET_PASSWORD_FAIL", entity:"users", success:false, status_code:500, details:{ reason:"server_error" } });
    return res.status(500).json({ message: "Error reseteando password" });
  }
});

export default router;
