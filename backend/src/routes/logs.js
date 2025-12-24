import express from "express";
import { query } from "../config/db.js";
import { auth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

/**
 * GET /api/logs
 * Filtros:
 * - user_id
 * - username (ilike)
 * - action
 * - entity
 * - success (true/false)
 * - from (YYYY-MM-DD)
 * - to   (YYYY-MM-DD)
 * - limit (default 200, max 500)
 * - offset (default 0)
 */
router.get("/", auth, requireAdmin, async (req, res) => {
  try {
    const {
      user_id,
      username,
      action,
      entity,
      success,
      from,
      to,
      limit,
      offset
    } = req.query;

    const where = [];
    const params = [];

    if (user_id) { params.push(Number(user_id)); where.push(`actor_user_id = $${params.length}`); }
    if (username) { params.push(`%${username}%`); where.push(`actor_username ILIKE $${params.length}`); }
    if (action) { params.push(action); where.push(`action = $${params.length}`); }
    if (entity) { params.push(entity); where.push(`entity = $${params.length}`); }

    if (success === "true" || success === "false") {
      params.push(success === "true");
      where.push(`success = $${params.length}`);
    }

    if (from) { params.push(from); where.push(`created_at >= $${params.length}::date`); }
    if (to) { params.push(to); where.push(`created_at < ($${params.length}::date + interval '1 day')`); }

    const lim = Math.min(Number(limit || 200), 500);
    const off = Math.max(Number(offset || 0), 0);

    params.push(lim);
    params.push(off);

    const sql = `
      SELECT *, COUNT(*) OVER() as total_count
      FROM audit_logs
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY created_at DESC, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const r = await query(sql, params);
    const total = r.rows[0]?.total_count || 0;

    return res.json({ logs: r.rows, total: Number(total), limit: lim, offset: off });
  } catch {
    return res.status(500).json({ message: "Error listando logs" });
  }
});

export default router;
