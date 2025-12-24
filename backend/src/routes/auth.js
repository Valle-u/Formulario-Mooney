import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { auditLog } from "../utils/audit.js";
import { loginLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Aplicar rate limiting al endpoint de login
router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  try {
    if (!username || !password) {
      await auditLog(req, {
        action: "AUTH_LOGIN_FAIL",
        entity: "auth",
        success: false,
        status_code: 400,
        details: { username: username || null, reason: "missing_fields" },
        actor: { id: null, username: username || null, role: null }
      });
      return res.status(400).json({ message: "username y password son obligatorios" });
    }

    const r = await query(
      "SELECT id, username, password_hash, role, is_active FROM users WHERE username = $1",
      [username]
    );

    if (r.rowCount === 0) {
      await auditLog(req, {
        action: "AUTH_LOGIN_FAIL",
        entity: "auth",
        success: false,
        status_code: 401,
        details: { username, reason: "invalid_credentials" },
        actor: { id: null, username, role: null }
      });
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const user = r.rows[0];

    if (!user.is_active) {
      await auditLog(req, {
        action: "AUTH_LOGIN_FAIL",
        entity: "auth",
        success: false,
        status_code: 403,
        details: { username, user_id: user.id, reason: "inactive" },
        actor: { id: user.id, username: user.username, role: user.role }
      });
      return res.status(403).json({ message: "Usuario desactivado" });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      await auditLog(req, {
        action: "AUTH_LOGIN_FAIL",
        entity: "auth",
        success: false,
        status_code: 401,
        details: { username, user_id: user.id, reason: "invalid_credentials" },
        actor: { id: user.id, username: user.username, role: user.role }
      });
      return res.status(401).json({ message: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    await auditLog(req, {
      action: "AUTH_LOGIN_SUCCESS",
      entity: "auth",
      success: true,
      status_code: 200,
      details: { username: user.username, user_id: user.id, role: user.role },
      actor: { id: user.id, username: user.username, role: user.role }
    });

    return res.json({ token, user: { id: user.id, username: user.username, role: user.role } });
  } catch (e) {
    await auditLog(req, {
      action: "AUTH_LOGIN_FAIL",
      entity: "auth",
      success: false,
      status_code: 500,
      details: { username: username || null, reason: "server_error" },
      actor: { id: null, username: username || null, role: null }
    });
    return res.status(500).json({ message: "Error en login" });
  }
});

export default router;
