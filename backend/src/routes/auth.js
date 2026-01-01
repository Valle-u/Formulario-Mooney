import express from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { query } from "../config/db.js";
import { auditLog } from "../utils/audit.js";
import { loginLimiter } from "../middleware/rateLimiter.js";
import { auth } from "../middleware/auth.js";
import {
  generateRefreshToken,
  saveRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens
} from "../utils/refreshTokens.js";

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

    // Generar access token (corta duración: 1 hora)
    const accessToken = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" } // REDUCIDO de 12h a 1h para mayor seguridad
    );

    // Generar refresh token (larga duración: 7 días)
    const refreshToken = generateRefreshToken();

    // Guardar refresh token en DB
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'Unknown';

    await saveRefreshToken({
      userId: user.id,
      token: refreshToken,
      ipAddress,
      userAgent,
      expiresInDays: 7
    });

    await auditLog(req, {
      action: "AUTH_LOGIN_SUCCESS",
      entity: "auth",
      success: true,
      status_code: 200,
      details: {
        username: user.username,
        user_id: user.id,
        role: user.role,
        access_token_exp: "1h",
        refresh_token_exp: "7d"
      },
      actor: { id: user.id, username: user.username, role: user.role }
    });

    return res.json({
      token: accessToken, // Mantener "token" para compatibilidad con frontend
      refreshToken,
      user: { id: user.id, username: user.username, role: user.role },
      expiresIn: 3600 // 1 hora en segundos
    });
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

// POST /api/auth/refresh - Renovar access token con refresh token
router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body || {};

  try {
    if (!refreshToken) {
      return res.status(400).json({ message: "Refresh token requerido" });
    }

    // Validar refresh token
    const userData = await validateRefreshToken(refreshToken);

    if (!userData) {
      await auditLog(req, {
        action: "AUTH_REFRESH_FAIL",
        entity: "auth",
        success: false,
        status_code: 401,
        details: { reason: "invalid_or_expired_refresh_token" },
        actor: { id: null, username: null, role: null }
      });
      return res.status(401).json({ message: "Refresh token inválido o expirado" });
    }

    // Generar nuevo access token
    const newAccessToken = jwt.sign(
      { id: userData.id, username: userData.username, role: userData.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    await auditLog(req, {
      action: "AUTH_REFRESH_SUCCESS",
      entity: "auth",
      success: true,
      status_code: 200,
      details: { user_id: userData.id, username: userData.username },
      actor: { id: userData.id, username: userData.username, role: userData.role }
    });

    return res.json({
      token: newAccessToken,
      expiresIn: 3600,
      user: { id: userData.id, username: userData.username, role: userData.role }
    });

  } catch (e) {
    console.error("🔥 Error en /refresh:", e);
    await auditLog(req, {
      action: "AUTH_REFRESH_FAIL",
      entity: "auth",
      success: false,
      status_code: 500,
      details: { reason: "server_error" },
      actor: { id: null, username: null, role: null }
    });
    return res.status(500).json({ message: "Error renovando token" });
  }
});

// POST /api/auth/logout - Revocar refresh token
router.post("/logout", auth, async (req, res) => {
  const { refreshToken } = req.body || {};

  try {
    if (refreshToken) {
      await revokeRefreshToken(refreshToken, req.user.id, 'User logout');
    }

    await auditLog(req, {
      action: "AUTH_LOGOUT",
      entity: "auth",
      success: true,
      status_code: 200,
      details: { user_id: req.user.id, username: req.user.username },
      actor: { id: req.user.id, username: req.user.username, role: req.user.role }
    });

    return res.json({ message: "Logout exitoso" });

  } catch (e) {
    console.error("🔥 Error en /logout:", e);
    return res.status(500).json({ message: "Error en logout" });
  }
});

// POST /api/auth/logout-all - Revocar TODOS los refresh tokens del usuario
router.post("/logout-all", auth, async (req, res) => {
  try {
    const count = await revokeAllUserTokens(
      req.user.id,
      req.user.id,
      'User logout all devices'
    );

    await auditLog(req, {
      action: "AUTH_LOGOUT_ALL",
      entity: "auth",
      success: true,
      status_code: 200,
      details: {
        user_id: req.user.id,
        username: req.user.username,
        tokens_revoked: count
      },
      actor: { id: req.user.id, username: req.user.username, role: req.user.role }
    });

    return res.json({
      message: "Logout exitoso en todos los dispositivos",
      tokensRevoked: count
    });

  } catch (e) {
    console.error("🔥 Error en /logout-all:", e);
    return res.status(500).json({ message: "Error en logout" });
  }
});

export default router;
