import crypto from "crypto";
import { query } from "../config/db.js";

/**
 * Genera un refresh token criptográficamente seguro
 * @returns {string} Token aleatorio de 64 caracteres hexadecimales
 */
export function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Hashea un refresh token con SHA-256
 * @param {string} token - Token en texto plano
 * @returns {string} Hash del token
 */
export function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Guarda un refresh token en la base de datos
 * @param {Object} params
 * @param {number} params.userId - ID del usuario
 * @param {string} params.token - Token en texto plano
 * @param {string} params.ipAddress - IP del cliente
 * @param {string} params.userAgent - User agent del navegador
 * @param {number} params.expiresInDays - Días hasta expiración (default: 7)
 * @returns {Promise<void>}
 */
export async function saveRefreshToken({ userId, token, ipAddress, userAgent, expiresInDays = 7 }) {
  const tokenHash = hashRefreshToken(token);

  await query(
    `INSERT INTO refresh_tokens (user_id, token, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '${expiresInDays} days')`,
    [userId, token, tokenHash, ipAddress, userAgent]
  );
}

/**
 * Valida un refresh token
 * @param {string} token - Token a validar
 * @returns {Promise<Object|null>} Usuario si el token es válido, null si no
 */
export async function validateRefreshToken(token) {
  const tokenHash = hashRefreshToken(token);

  const result = await query(
    `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked, u.username, u.role, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    return null; // Token no encontrado
  }

  const tokenData = result.rows[0];

  // Verificar si está revocado
  if (tokenData.revoked) {
    return null;
  }

  // Verificar si expiró
  if (new Date(tokenData.expires_at) < new Date()) {
    return null;
  }

  // Verificar si el usuario está activo
  if (!tokenData.is_active) {
    return null;
  }

  return {
    id: tokenData.user_id,
    username: tokenData.username,
    role: tokenData.role,
    tokenId: tokenData.id
  };
}

/**
 * Revoca un refresh token específico
 * @param {string} token - Token a revocar
 * @param {number} revokedBy - ID del usuario que revoca (opcional)
 * @param {string} reason - Motivo de revocación
 * @returns {Promise<boolean>} true si se revocó, false si no existía
 */
export async function revokeRefreshToken(token, revokedBy = null, reason = 'Manual logout') {
  const tokenHash = hashRefreshToken(token);

  const result = await query(
    `UPDATE refresh_tokens
     SET revoked = true, revoked_at = NOW(), revoked_by = $1, revoke_reason = $2
     WHERE token_hash = $3 AND revoked = false`,
    [revokedBy, reason, tokenHash]
  );

  return result.rowCount > 0;
}

/**
 * Revoca TODOS los refresh tokens de un usuario
 * Útil para "logout en todos los dispositivos"
 * @param {number} userId - ID del usuario
 * @param {number} revokedBy - ID del usuario que revoca
 * @param {string} reason - Motivo de revocación
 * @returns {Promise<number>} Cantidad de tokens revocados
 */
export async function revokeAllUserTokens(userId, revokedBy = null, reason = 'Logout all devices') {
  const result = await query(
    `UPDATE refresh_tokens
     SET revoked = true, revoked_at = NOW(), revoked_by = $1, revoke_reason = $2
     WHERE user_id = $3 AND revoked = false`,
    [revokedBy, reason, userId]
  );

  return result.rowCount;
}

/**
 * Limpia tokens expirados o revocados antiguos (>30 días)
 * Debe ejecutarse periódicamente con cron
 * @returns {Promise<number>} Cantidad de tokens eliminados
 */
export async function cleanupExpiredTokens() {
  const result = await query(
    `DELETE FROM refresh_tokens
     WHERE (expires_at < NOW() - INTERVAL '30 days')
        OR (revoked = true AND revoked_at < NOW() - INTERVAL '30 days')`
  );

  console.log(`🧹 Limpieza: ${result.rowCount} refresh tokens eliminados`);
  return result.rowCount;
}

/**
 * Obtiene estadísticas de refresh tokens (para admin)
 * @returns {Promise<Object>} Estadísticas
 */
export async function getRefreshTokenStats() {
  const result = await query(
    `SELECT
       COUNT(*) as total_tokens,
       COUNT(*) FILTER (WHERE revoked = false AND expires_at > NOW()) as active_tokens,
       COUNT(*) FILTER (WHERE revoked = true) as revoked_tokens,
       COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_tokens,
       COUNT(DISTINCT user_id) FILTER (WHERE revoked = false AND expires_at > NOW()) as active_users
     FROM refresh_tokens`
  );

  return result.rows[0];
}
