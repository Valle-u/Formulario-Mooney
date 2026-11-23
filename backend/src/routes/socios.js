import express from "express";
import { query } from "../config/db.js";
import { auth, requireAdminOrDireccion } from "../middleware/auth.js";
import { auditLog } from "../utils/audit.js";
import { calcularReparto, mesValido, validarConfigPanel, validarSocioMes } from "../services/socios.js";

const router = express.Router();
router.use(auth, requireAdminOrDireccion);

// Configuración vigente de cada socio para el mes: la del mes o, si no hay,
// la del último mes anterior (marcada como heredada).
async function configsDelMes(inicio) {
  const result = await query(
    `SELECT DISTINCT ON (c.panel_id) c.*, (c.mes <> $1::date) AS heredada, n.nombre AS nexo_nombre
       FROM panel_config_mes c
       LEFT JOIN paneles n ON n.id = c.nexo_panel_id
      WHERE c.mes <= $1::date
      ORDER BY c.panel_id, c.mes DESC`,
    [inicio]
  );
  const configs = {};
  for (const row of result.rows) configs[row.panel_id] = row;
  return configs;
}

// Datos del mes: factura y cotización solo del propio mes; los % pactados
// se heredan del último mes cargado.
async function socioMesDe(inicio) {
  const result = await query(
    `SELECT mes::text AS mes, factura_usd, cotizacion, pct_fichas_pactado, pct_cef_socio
       FROM socios_mes
      WHERE mes <= $1::date
      ORDER BY mes DESC
      LIMIT 1`,
    [inicio]
  );
  const row = result.rows[0];
  if (!row) return { mes: inicio, factura_usd: null, cotizacion: null, pct_fichas_pactado: 0.18, pct_cef_socio: 0.0225, heredado: true };
  if (row.mes !== inicio) return { ...row, mes: inicio, factura_usd: null, cotizacion: null, heredado: true };
  return { ...row, heredado: false };
}

router.get("/reparto", async (req, res) => {
  const mes = mesValido(req.query.mes);
  if (!mes) return res.status(400).json({ message: "mes inválido (formato AAAA-MM)" });

  try {
    const [paneles, totales, dias, configs, socioMes] = await Promise.all([
      query(`SELECT id, nombre, tipo, orden, is_active FROM paneles ORDER BY orden, nombre`),
      query(
        `SELECT panel_id,
                SUM(netwin)::float8 AS netwin, SUM(entrada)::float8 AS entrada, SUM(salida)::float8 AS salida,
                SUM(ops_entrada)::int AS ops_entrada, SUM(ops_salida)::int AS ops_salida,
                SUM(bonos)::float8 AS bonos, SUM(inversion_publicidad)::float8 AS inversion_publicidad
           FROM panel_diario
          WHERE fecha >= $1::date AND fecha < $1::date + INTERVAL '1 month'
          GROUP BY panel_id`,
        [mes.inicio]
      ),
      query(
        `SELECT COUNT(DISTINCT fecha)::int AS dias, MAX(fecha)::text AS ultima, MAX(updated_at) AS actualizado
           FROM panel_diario
          WHERE fecha >= $1::date AND fecha < $1::date + INTERVAL '1 month'`,
        [mes.inicio]
      ),
      configsDelMes(mes.inicio),
      socioMesDe(mes.inicio)
    ]);

    const porPanel = {};
    for (const row of totales.rows) porPanel[row.panel_id] = row;

    const reparto = calcularReparto({ paneles: paneles.rows, totales: porPanel, configs, socioMes });

    const configLista = paneles.rows
      .filter((p) => p.tipo === "socio")
      .map((p) => {
        const c = configs[p.id];
        return {
          panel_id: p.id,
          nombre: p.nombre,
          is_active: p.is_active,
          heredada: c ? Boolean(c.heredada) : true,
          nexo_panel_id: c?.nexo_panel_id ?? null,
          pct_ggr_socio: Number(c?.pct_ggr_socio ?? 0.5),
          pct_ggr_casa: Number(c?.pct_ggr_casa ?? 0.5),
          pct_ggr_nexo: Number(c?.pct_ggr_nexo ?? 0),
          pct_costos_socio: Number(c?.pct_costos_socio ?? 0.5),
          pct_costos_casa: Number(c?.pct_costos_casa ?? 0.5),
          pct_costos_nexo: Number(c?.pct_costos_nexo ?? 0),
          empleados: Number(c?.empleados ?? 0),
          costo_estructura: [1, 2, 3, 4, 5].map((i) => Number(c?.[`costo_estructura_s${i}`] ?? 0))
        };
      });

    return res.json({
      mes: `${mes.anio}-${String(mes.mes).padStart(2, "0")}`,
      datos: dias.rows[0],
      socio_mes: {
        factura_usd: socioMes.factura_usd === null ? null : Number(socioMes.factura_usd),
        cotizacion: socioMes.cotizacion === null ? null : Number(socioMes.cotizacion),
        pct_fichas_pactado: Number(socioMes.pct_fichas_pactado),
        pct_cef_socio: Number(socioMes.pct_cef_socio),
        heredado: socioMes.heredado
      },
      config: configLista,
      ...reparto
    });
  } catch (error) {
    console.error("❌ Error armando el reparto de socios:", error);
    return res.status(500).json({ message: "Error armando el reparto de socios" });
  }
});

router.put("/mes", async (req, res) => {
  const datos = validarSocioMes(req.body);
  if (datos.error) return res.status(400).json({ message: datos.error });
  try {
    await query(
      `INSERT INTO socios_mes (mes, factura_usd, cotizacion, pct_fichas_pactado, pct_cef_socio, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (mes) DO UPDATE SET
         factura_usd = EXCLUDED.factura_usd, cotizacion = EXCLUDED.cotizacion,
         pct_fichas_pactado = EXCLUDED.pct_fichas_pactado, pct_cef_socio = EXCLUDED.pct_cef_socio,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [datos.mes, datos.factura_usd, datos.cotizacion, datos.pct_fichas_pactado, datos.pct_cef_socio, req.user.id]
    );
    await auditLog(req, { action: "SOCIOS_MES_UPDATE", entity: "socios_mes", success: true, status_code: 200, details: datos });
    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Error guardando datos del mes:", error);
    return res.status(500).json({ message: "Error guardando los datos del mes" });
  }
});

router.put("/config", async (req, res) => {
  const d = validarConfigPanel(req.body);
  if (d.error) return res.status(400).json({ message: d.error });
  try {
    const existen = await query(
      `SELECT id, tipo FROM paneles WHERE id = ANY($1::bigint[])`,
      [[d.panel_id, d.nexo_panel_id].filter(Boolean)]
    );
    const panel = existen.rows.find((p) => Number(p.id) === d.panel_id);
    if (!panel || panel.tipo !== "socio") return res.status(400).json({ message: "El panel no es un socio" });
    if (d.nexo_panel_id && !existen.rows.some((p) => Number(p.id) === d.nexo_panel_id)) {
      return res.status(400).json({ message: "El nexo no existe" });
    }

    await query(
      `INSERT INTO panel_config_mes (mes, panel_id, pct_ggr_socio, pct_ggr_casa, pct_ggr_nexo,
          pct_costos_socio, pct_costos_casa, pct_costos_nexo, nexo_panel_id, empleados,
          costo_estructura_s1, costo_estructura_s2, costo_estructura_s3, costo_estructura_s4, costo_estructura_s5,
          updated_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW())
       ON CONFLICT (mes, panel_id) DO UPDATE SET
         pct_ggr_socio = EXCLUDED.pct_ggr_socio, pct_ggr_casa = EXCLUDED.pct_ggr_casa, pct_ggr_nexo = EXCLUDED.pct_ggr_nexo,
         pct_costos_socio = EXCLUDED.pct_costos_socio, pct_costos_casa = EXCLUDED.pct_costos_casa,
         pct_costos_nexo = EXCLUDED.pct_costos_nexo, nexo_panel_id = EXCLUDED.nexo_panel_id,
         empleados = EXCLUDED.empleados,
         costo_estructura_s1 = EXCLUDED.costo_estructura_s1, costo_estructura_s2 = EXCLUDED.costo_estructura_s2,
         costo_estructura_s3 = EXCLUDED.costo_estructura_s3, costo_estructura_s4 = EXCLUDED.costo_estructura_s4,
         costo_estructura_s5 = EXCLUDED.costo_estructura_s5,
         updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [d.mes, d.panel_id, d.pct_ggr_socio, d.pct_ggr_casa, d.pct_ggr_nexo,
        d.pct_costos_socio, d.pct_costos_casa, d.pct_costos_nexo, d.nexo_panel_id, d.empleados,
        d.costo_estructura_s1, d.costo_estructura_s2, d.costo_estructura_s3, d.costo_estructura_s4, d.costo_estructura_s5,
        req.user.id]
    );
    await auditLog(req, { action: "SOCIOS_CONFIG_UPDATE", entity: "panel_config_mes", entity_id: d.panel_id, success: true, status_code: 200, details: d });
    return res.json({ ok: true });
  } catch (error) {
    console.error("❌ Error guardando configuración del socio:", error);
    return res.status(500).json({ message: "Error guardando la configuración del socio" });
  }
});

export default router;
