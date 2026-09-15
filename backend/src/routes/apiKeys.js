import express from "express";
import { query } from "../config/db.js";
import { auth, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../utils/audit.js";
import { generateApiKey, normalizeScopes } from "../utils/apiKeys.js";

const router = express.Router();

function parseExpiresAt(value) {
  if (value === null || value === undefined || value === "" || value === "never") {
    return null;
  }

  const days = Number(value);
  if (Number.isFinite(days) && days > 0 && days <= 3650) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime()) && parsed > new Date()) {
    return parsed;
  }

  return undefined;
}

function serializeKey(row) {
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    scopes: row.scopes || [],
    created_by: row.created_by,
    created_by_username: row.created_by_username || null,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    is_active: row.is_active && !row.revoked_at,
    status: row.revoked_at
      ? "revocada"
      : (row.expires_at && new Date(row.expires_at) <= new Date() ? "expirada" : "activa")
  };
}

router.get("/", auth, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `SELECT k.id, k.name, k.key_prefix, k.scopes, k.created_by, k.created_at,
              k.last_used_at, k.expires_at, k.revoked_at, k.is_active,
              u.username AS created_by_username
         FROM api_keys k
         LEFT JOIN users u ON u.id = k.created_by
        ORDER BY k.created_at DESC, k.id DESC`
    );

    await auditLog(req, {
      action: "API_KEY_LIST",
      entity: "api_keys",
      success: true,
      status_code: 200,
      details: { rows: result.rowCount }
    });

    return res.json({ api_keys: result.rows.map(serializeKey) });
  } catch (error) {
    console.error("❌ Error listando API keys:", error);
    return res.status(500).json({ message: "Error listando API keys" });
  }
});

router.post("/", auth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim();
    if (!name || name.length < 2 || name.length > 100) {
      return res.status(400).json({ message: "El nombre es obligatorio (2 a 100 caracteres)" });
    }

    const scopes = normalizeScopes(req.body?.scopes);
    const expiresAt = parseExpiresAt(req.body?.expires_in_days ?? req.body?.expires_at);
    if (expiresAt === undefined) {
      return res.status(400).json({ message: "Fecha de expiración inválida" });
    }

    const generated = generateApiKey();

    const result = await query(
      `INSERT INTO api_keys (name, key_prefix, key_hash, scopes, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, key_prefix, scopes, created_by, created_at, last_used_at, expires_at, revoked_at, is_active`,
      [name, generated.prefix, generated.hash, scopes, req.user.id, expiresAt]
    );

    const created = result.rows[0];

    await auditLog(req, {
      action: "API_KEY_CREATE",
      entity: "api_keys",
      entity_id: created.id,
      success: true,
      status_code: 201,
      details: { name, key_prefix: created.key_prefix, scopes, expires_at: created.expires_at }
    });

    return res.status(201).json({
      api_key: serializeKey({ ...created, created_by_username: req.user.username }),
      raw_key: generated.rawKey,
      warning: "Copiá la API key ahora. No se vuelve a mostrar."
    });
  } catch (error) {
    console.error("❌ Error creando API key:", error);
    await auditLog(req, {
      action: "API_KEY_CREATE_FAIL",
      entity: "api_keys",
      success: false,
      status_code: 500,
      details: { reason: "server_error" }
    });
    return res.status(500).json({ message: "Error creando API key" });
  }
});

router.post("/:id/revoke", auth, requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "ID inválido" });
    }

    const result = await query(
      `UPDATE api_keys
          SET revoked_at = NOW(), is_active = false
        WHERE id = $1 AND revoked_at IS NULL
        RETURNING id, name, key_prefix, scopes, created_by, created_at, last_used_at, expires_at, revoked_at, is_active`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "API key no encontrada o ya revocada" });
    }

    await auditLog(req, {
      action: "API_KEY_REVOKE",
      entity: "api_keys",
      entity_id: id,
      success: true,
      status_code: 200,
      details: { name: result.rows[0].name, key_prefix: result.rows[0].key_prefix }
    });

    return res.json({
      message: "API key revocada",
      api_key: serializeKey(result.rows[0])
    });
  } catch (error) {
    console.error("❌ Error revocando API key:", error);
    return res.status(500).json({ message: "Error revocando API key" });
  }
});

export default router;
