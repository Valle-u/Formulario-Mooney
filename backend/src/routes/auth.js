import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { auditLog } from "../utils/audit.js";
import { loginLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Configuración de intentos de login
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MINUTES = 5;

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
      `SELECT id, username, password_hash, role, is_active,
              failed_login_attempts, locked_until, last_failed_login
       FROM users WHERE username = $1`,
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

    // Verificar si la cuenta está bloqueada
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const remainingMinutes = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
      await auditLog(req, {
        action: "AUTH_LOGIN_FAIL",
        entity: "auth",
        success: false,
        status_code: 423,
        details: {
          username,
          user_id: user.id,
          reason: "account_locked",
          locked_until: user.locked_until,
          remaining_minutes: remainingMinutes
        },
        actor: { id: user.id, username: user.username, role: user.role }
      });
      return res.status(423).json({
        message: `Cuenta bloqueada temporalmente. Intente nuevamente en ${remainingMinutes} minuto(s).`,
        locked_until: user.locked_until
      });
    }

    // Si ya pasó el tiempo de bloqueo, resetear contador
    if (user.locked_until && new Date(user.locked_until) <= new Date()) {
      await query(
        `UPDATE users
         SET failed_login_attempts = 0, locked_until = NULL, last_failed_login = NULL
         WHERE id = $1`,
        [user.id]
      );
      user.failed_login_attempts = 0;
      user.locked_until = null;
    }

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
      // Incrementar contador de intentos fallidos
      const newAttempts = (user.failed_login_attempts || 0) + 1;
      const shouldLock = newAttempts >= MAX_LOGIN_ATTEMPTS;

      if (shouldLock) {
        const lockUntil = new Date(Date.now() + LOCK_DURATION_MINUTES * 60000);
        await query(
          `UPDATE users
           SET failed_login_attempts = $1, locked_until = $2, last_failed_login = NOW()
           WHERE id = $3`,
          [newAttempts, lockUntil, user.id]
        );

        await auditLog(req, {
          action: "AUTH_ACCOUNT_LOCKED",
          entity: "auth",
          success: false,
          status_code: 423,
          details: {
            username,
            user_id: user.id,
            reason: "max_attempts_reached",
            attempts: newAttempts,
            locked_until: lockUntil
          },
          actor: { id: user.id, username: user.username, role: user.role }
        });

        return res.status(423).json({
          message: `Cuenta bloqueada por ${LOCK_DURATION_MINUTES} minutos después de ${MAX_LOGIN_ATTEMPTS} intentos fallidos.`,
          locked_until: lockUntil
        });
      } else {
        await query(
          `UPDATE users
           SET failed_login_attempts = $1, last_failed_login = NOW()
           WHERE id = $2`,
          [newAttempts, user.id]
        );

        const remainingAttempts = MAX_LOGIN_ATTEMPTS - newAttempts;

        await auditLog(req, {
          action: "AUTH_LOGIN_FAIL",
          entity: "auth",
          success: false,
          status_code: 401,
          details: {
            username,
            user_id: user.id,
            reason: "invalid_credentials",
            failed_attempts: newAttempts,
            remaining_attempts: remainingAttempts
          },
          actor: { id: user.id, username: user.username, role: user.role }
        });

        return res.status(401).json({
          message: `Credenciales inválidas. ${remainingAttempts} intento(s) restante(s).`,
          remaining_attempts: remainingAttempts
        });
      }
    }

    // Login exitoso: resetear contador de intentos fallidos
    if (user.failed_login_attempts > 0 || user.locked_until) {
      await query(
        `UPDATE users
         SET failed_login_attempts = 0, locked_until = NULL, last_failed_login = NULL
         WHERE id = $1`,
        [user.id]
      );
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
