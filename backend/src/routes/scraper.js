import express from "express";
import { query } from "../config/db.js";
import { apiKeyAuth, requireApiScope } from "../middleware/apiKeyAuth.js";
import { auditLog } from "../utils/audit.js";
import { HORAS_COLGADO, validarResultado } from "../services/scraperPedidos.js";

// Lo usa el scraper de la PC (con la misma API key de la ingesta de paneles).
const router = express.Router();
router.use(apiKeyAuth, requireApiScope("ingest:paneles"));

// Toma el pedido pendiente más viejo (o uno colgado) y lo marca "corriendo".
router.post("/pedidos/tomar", async (req, res) => {
  try {
    const result = await query(
      `UPDATE scraper_pedidos SET estado = 'corriendo', tomado_at = NOW()
        WHERE id = (
          SELECT id FROM scraper_pedidos
           WHERE estado = 'pendiente'
              OR (estado = 'corriendo' AND tomado_at < NOW() - make_interval(hours => $1))
           ORDER BY created_at
           LIMIT 1
           FOR UPDATE SKIP LOCKED)
        RETURNING id, desde::text AS desde, hasta::text AS hasta, que`,
      [HORAS_COLGADO]
    );
    return res.json({ pedido: result.rows[0] || null });
  } catch (error) {
    console.error("❌ Error tomando pedido del scraper:", error);
    return res.status(500).json({ message: "Error tomando el pedido" });
  }
});

router.post("/pedidos/:id/resultado", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "id inválido" });
  const datos = validarResultado(req.body);
  if (datos.error) return res.status(400).json({ message: datos.error });
  try {
    const devuelto = datos.estado === "pendiente";
    const result = await query(
      `UPDATE scraper_pedidos
          SET estado = $2, resultado = $3,
              terminado_at = CASE WHEN $4 THEN NULL ELSE NOW() END,
              tomado_at = CASE WHEN $4 THEN NULL ELSE tomado_at END
        WHERE id = $1 AND estado = 'corriendo'
        RETURNING id`,
      [id, datos.estado, JSON.stringify(datos.resultado), devuelto]
    );
    if (!result.rows.length) return res.status(404).json({ message: "Pedido no encontrado o no está corriendo" });
    await auditLog(req, {
      action: "SCRAPER_PEDIDO_RESULTADO", entity: "scraper_pedidos", entity_id: id,
      success: true, status_code: 200, details: { estado: datos.estado }
    });
    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Error guardando resultado del scraper:", error);
    return res.status(500).json({ message: "Error guardando el resultado" });
  }
});

export default router;
