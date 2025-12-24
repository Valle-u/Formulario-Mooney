import express from "express";
import { query } from "../config/db.js";
import { auth } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

// GET /api/alerts - Listar alertas (solo admin)
router.get("/", auth, requireAdmin, async (req, res) => {
  try {
    const {
      status,
      severity,
      limit = 50,
      offset = 0
    } = req.query;

    const where = [];
    const params = [];

    if (status) {
      params.push(status);
      where.push(`status = $${params.length}`);
    }

    if (severity) {
      params.push(severity);
      where.push(`severity = $${params.length}`);
    }

    const lim = Math.min(Number(limit), 200);
    const off = Math.max(Number(offset), 0);

    params.push(lim);
    params.push(off);

    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

    const sql = `
      SELECT
        a.*,
        to_char(a.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at_formatted,
        to_char(a.acknowledged_at, 'YYYY-MM-DD HH24:MI:SS') AS acknowledged_at_formatted,
        to_char(a.resolved_at, 'YYYY-MM-DD HH24:MI:SS') AS resolved_at_formatted,
        ack_user.username AS acknowledged_by_username,
        COUNT(*) OVER() AS total_count
      FROM alerts a
      LEFT JOIN users ack_user ON ack_user.id = a.acknowledged_by
      ${whereClause}
      ORDER BY
        CASE a.status
          WHEN 'pending' THEN 1
          WHEN 'acknowledged' THEN 2
          WHEN 'resolved' THEN 3
          WHEN 'false_positive' THEN 4
        END,
        a.severity DESC,
        a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const r = await query(sql, params);
    const total = r.rows.length > 0 ? Number(r.rows[0].total_count) : 0;

    return res.json({
      alerts: r.rows,
      pagination: {
        total,
        limit: lim,
        offset: off,
        hasMore: off + lim < total
      }
    });

  } catch (error) {
    console.error("🔥 Error listando alertas:", error);
    return res.status(500).json({ message: "Error listando alertas" });
  }
});

// GET /api/alerts/stats - Estadísticas de alertas (solo admin)
router.get("/stats", auth, requireAdmin, async (req, res) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'acknowledged') AS acknowledged,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE severity = 'critical') AS critical,
        COUNT(*) FILTER (WHERE severity = 'high') AS high,
        COUNT(*) FILTER (WHERE severity = 'medium') AS medium,
        COUNT(*) FILTER (WHERE severity = 'low') AS low,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d
      FROM alerts
    `);

    return res.json(stats.rows[0]);

  } catch (error) {
    console.error("🔥 Error obteniendo estadísticas:", error);
    return res.status(500).json({ message: "Error obteniendo estadísticas" });
  }
});

// POST /api/alerts/:id/acknowledge - Marcar alerta como vista (solo admin)
router.post("/:id/acknowledge", auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `UPDATE alerts
       SET status = 'acknowledged',
           acknowledged_by = $1,
           acknowledged_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND status = 'pending'
       RETURNING id`,
      [req.user.id, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Alerta no encontrada o ya procesada" });
    }

    return res.json({ message: "Alerta marcada como vista" });

  } catch (error) {
    console.error("🔥 Error marcando alerta:", error);
    return res.status(500).json({ message: "Error procesando alerta" });
  }
});

// POST /api/alerts/:id/resolve - Resolver alerta (solo admin)
router.post("/:id/resolve", auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, is_false_positive } = req.body;

    const newStatus = is_false_positive ? 'false_positive' : 'resolved';

    const result = await query(
      `UPDATE alerts
       SET status = $1,
           resolution_notes = $2,
           acknowledged_by = COALESCE(acknowledged_by, $3),
           acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP),
           resolved_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING id`,
      [newStatus, notes, req.user.id, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Alerta no encontrada" });
    }

    return res.json({ message: "Alerta resuelta" });

  } catch (error) {
    console.error("🔥 Error resolviendo alerta:", error);
    return res.status(500).json({ message: "Error resolviendo alerta" });
  }
});

// GET /api/alerts/config - Obtener configuración de alertas (solo admin)
router.get("/config", auth, requireAdmin, async (req, res) => {
  try {
    const config = await query(
      `SELECT * FROM alert_config ORDER BY alert_type`
    );

    return res.json({ config: config.rows });

  } catch (error) {
    console.error("🔥 Error obteniendo configuración:", error);
    return res.status(500).json({ message: "Error obteniendo configuración" });
  }
});

// PUT /api/alerts/config/:id - Actualizar configuración (solo admin)
router.put("/config/:id", auth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled, threshold_value, config_json } = req.body;

    const result = await query(
      `UPDATE alert_config
       SET enabled = COALESCE($1, enabled),
           threshold_value = COALESCE($2, threshold_value),
           config_json = COALESCE($3, config_json),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [enabled, threshold_value, config_json, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Configuración no encontrada" });
    }

    return res.json({
      message: "Configuración actualizada",
      config: result.rows[0]
    });

  } catch (error) {
    console.error("🔥 Error actualizando configuración:", error);
    return res.status(500).json({ message: "Error actualizando configuración" });
  }
});

export default router;
