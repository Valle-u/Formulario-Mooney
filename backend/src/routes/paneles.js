import express from "express";
import { pool, query } from "../config/db.js";
import { auth, requireAdminOrDireccion } from "../middleware/auth.js";
import { apiKeyAuth, requireApiScope } from "../middleware/apiKeyAuth.js";
import { auditLog } from "../utils/audit.js";
import { guardarIngesta, normalizarIngesta } from "../services/panelesIngesta.js";

const router = express.Router();

// El scraper manda los datos de un día. Repetir el envío reemplaza los
// valores de ese día (no duplica).
router.post("/ingesta", apiKeyAuth, requireApiScope("ingest:paneles"), async (req, res) => {
  const datos = normalizarIngesta(req.body);
  if (datos.error) {
    return res.status(400).json({ message: datos.error });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const resultado = await guardarIngesta(client, datos, "scraper");
    await client.query("COMMIT");

    await auditLog(req, {
      action: "PANELES_INGESTA",
      entity: "panel_diario",
      success: true,
      status_code: 200,
      details: { fecha: datos.fecha, guardados: resultado.guardados.length, desconocidos: resultado.desconocidos }
    });

    return res.json({ fecha: datos.fecha, ...resultado });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ Error en ingesta de paneles:", error);
    return res.status(500).json({ message: "Error guardando los datos de paneles" });
  } finally {
    client.release();
  }
});

// Datos diarios de un mes, para revisar lo que llegó (admin y dirección).
router.get("/diario", auth, requireAdminOrDireccion, async (req, res) => {
  const mes = String(req.query.mes || "");
  const match = mes.match(/^(\d{4})-(\d{2})$/);
  const anio = match ? Number(match[1]) : NaN;
  const nroMes = match ? Number(match[2]) : NaN;
  if (!(anio >= 2020 && anio <= 2100 && nroMes >= 1 && nroMes <= 12)) {
    return res.status(400).json({ message: "mes inválido (formato AAAA-MM)" });
  }

  try {
    const result = await query(
      `SELECT d.fecha::text AS fecha, p.nombre, p.tipo,
              d.netwin::text AS netwin, d.entrada::text AS entrada, d.salida::text AS salida,
              d.ops_entrada, d.ops_salida, d.bonos::text AS bonos,
              d.inversion_publicidad::text AS inversion_publicidad, d.fuente, d.updated_at
         FROM panel_diario d
         JOIN paneles p ON p.id = d.panel_id
        WHERE d.fecha >= make_date($1, $2, 1)
          AND d.fecha < make_date($1, $2, 1) + INTERVAL '1 month'
        ORDER BY d.fecha, p.orden, p.nombre`,
      [anio, nroMes]
    );
    return res.json({ mes, filas: result.rows });
  } catch (error) {
    console.error("❌ Error leyendo panel_diario:", error);
    return res.status(500).json({ message: "Error leyendo los datos de paneles" });
  }
});

export default router;
