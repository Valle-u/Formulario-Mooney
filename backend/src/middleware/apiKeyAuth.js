import { query } from "../config/db.js";
import { hashApiKey, looksLikeApiKey, hasScope } from "../utils/apiKeys.js";

function extractApiKey(req) {
  const headerKey = req.headers["x-api-key"];
  if (headerKey && String(headerKey).trim()) {
    return String(headerKey).trim();
  }

  const auth = req.headers.authorization || "";
  const parts = auth.split(" ");
  if (parts.length === 2 && /^Bearer$/i.test(parts[0]) && looksLikeApiKey(parts[1])) {
    return parts[1].trim();
  }

  return null;
}

export async function apiKeyAuth(req, res, next) {
  const rawKey = extractApiKey(req);

  if (!rawKey) {
    return res.status(401).json({ message: "API key no proporcionada. Usá el header X-API-Key." });
  }

  if (!looksLikeApiKey(rawKey)) {
    return res.status(401).json({ message: "API key inválida" });
  }

  try {
    const keyHash = hashApiKey(rawKey);
    const result = await query(
      `SELECT id, name, scopes, created_by, revoked_at, expires_at, is_active
         FROM api_keys
        WHERE key_hash = $1
        LIMIT 1`,
      [keyHash]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ message: "API key inválida" });
    }

    const key = result.rows[0];

    if (!key.is_active || key.revoked_at) {
      return res.status(401).json({ message: "API key revocada" });
    }

    if (key.expires_at && new Date(key.expires_at) <= new Date()) {
      return res.status(401).json({ message: "API key expirada" });
    }

    req.apiKey = {
      id: key.id,
      name: key.name,
      scopes: key.scopes || [],
      created_by: key.created_by
    };

    req.user = {
      id: key.created_by,
      username: `apikey:${key.name}`,
      role: "api_key",
      is_active: true,
      api_key_id: key.id
    };

    query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [key.id]
    ).catch((err) => {
      console.warn("⚠️  No se pudo actualizar last_used_at de API key:", err.message);
    });

    return next();
  } catch (error) {
    console.error("❌ Error en apiKeyAuth:", error);
    return res.status(500).json({ message: "Error validando API key" });
  }
}

export function requireApiScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({ message: "API key no autenticada" });
    }
    if (!hasScope(req.apiKey.scopes, scope)) {
      return res.status(403).json({
        message: `La API key no tiene el permiso ${scope}`
      });
    }
    return next();
  };
}
