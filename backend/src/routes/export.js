import express from "express";
import { query } from "../config/db.js";
import { apiKeyAuth, requireApiScope } from "../middleware/apiKeyAuth.js";
import { getLegacyEquivalentes } from "../utils/optionsCache.js";
import { toCSV, withBOM } from "../utils/csv.js";
import { montoToCommaString } from "../utils/validators.js";
import { auditLog } from "../utils/audit.js";

const router = express.Router();

const EXPORT_MAX_LIMIT = 500;

function formatFechaDDMMAAAA(fecha) {
  if (!fecha) return null;
  if (fecha instanceof Date) {
    const d = String(fecha.getDate()).padStart(2, "0");
    const m = String(fecha.getMonth() + 1).padStart(2, "0");
    const y = fecha.getFullYear();
    return `${d}/${m}/${y}`;
  }
  const text = String(fecha);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return text;
}

function mapEgreso(row) {
  return {
    id: row.id,
    codigo_operacion: row.codigo_operacion || null,
    fecha: formatFechaDDMMAAAA(row.fecha) || row.fecha,
    hora: row.hora_formatted || row.hora || null,
    turno: row.turno,
    hora_solicitud_cliente: row.hora_solicitud_cliente_formatted || row.hora_solicitud_cliente || null,
    hora_quema_fichas: row.hora_quema_fichas_formatted || row.hora_quema_fichas || null,
    etiqueta: row.etiqueta,
    etiqueta_otro: row.etiqueta_otro,
    monto: Number(row.monto),
    monto_raw: row.monto_raw,
    moneda: row.moneda || "ARS",
    tipo_transaccion: row.tipo_transaccion || "SALIDA",
    cuenta_receptora: row.cuenta_receptora,
    usuario_casino: row.usuario_casino,
    cuenta_salida: row.cuenta_salida,
    empresa_salida: row.empresa_salida,
    id_transferencia: row.id_transferencia,
    comprobante_url: row.comprobante_url,
    notas: row.notas,
    status: row.status || "activo",
    created_by: row.created_by,
    created_by_username: row.created_by_username,
    created_at: row.created_at
  };
}

async function buildFilters(reqQuery) {
  const where = [];
  const params = [];

  if (reqQuery.fecha_desde) {
    params.push(reqQuery.fecha_desde);
    where.push(`e.fecha >= $${params.length}::date`);
  }

  if (reqQuery.fecha_hasta) {
    params.push(reqQuery.fecha_hasta);
    where.push(`e.fecha <= $${params.length}::date`);
  }

  if (reqQuery.empresa_salida) {
    params.push(reqQuery.empresa_salida);
    where.push(`e.empresa_salida = $${params.length}`);
  }

  if (reqQuery.etiqueta) {
    const etiquetasEquivalentes = await getLegacyEquivalentes(reqQuery.etiqueta);
    if (etiquetasEquivalentes.length === 1) {
      params.push(reqQuery.etiqueta);
      where.push(`e.etiqueta = $${params.length}`);
    } else {
      params.push(etiquetasEquivalentes);
      where.push(`e.etiqueta = ANY($${params.length})`);
    }
  }

  if (reqQuery.status) {
    params.push(reqQuery.status);
    where.push(`e.status = $${params.length}`);
  }

  if (reqQuery.moneda) {
    params.push(String(reqQuery.moneda).toUpperCase());
    where.push(`e.moneda = $${params.length}`);
  }

  if (reqQuery.tipo_transaccion) {
    const tipoNorm = String(reqQuery.tipo_transaccion).trim().toUpperCase();
    if (["ENTRADA", "SALIDA"].includes(tipoNorm)) {
      params.push(tipoNorm);
      where.push(`e.tipo_transaccion = $${params.length}`);
    }
  }

  if (reqQuery.usuario_casino) {
    params.push(`%${reqQuery.usuario_casino}%`);
    where.push(`e.usuario_casino ILIKE $${params.length}`);
  }

  if (reqQuery.id_transferencia) {
    params.push(`%${reqQuery.id_transferencia}%`);
    where.push(`e.id_transferencia ILIKE $${params.length}`);
  }

  if (reqQuery.cuenta_salida) {
    params.push(reqQuery.cuenta_salida);
    where.push(`e.cuenta_salida = $${params.length}`);
  }

  return { where, params };
}

router.get("/me", apiKeyAuth, async (req, res) => {
  return res.json({
    ok: true,
    api_key: {
      id: req.apiKey.id,
      name: req.apiKey.name,
      scopes: req.apiKey.scopes
    }
  });
});

router.get("/egresos", apiKeyAuth, requireApiScope("export:egresos"), async (req, res) => {
  try {
    const { where, params } = await buildFilters(req.query);
    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";
    const lim = Math.min(Math.max(Number(req.query.limit || 100), 1), EXPORT_MAX_LIMIT);
    const off = Math.max(Number(req.query.offset || 0), 0);
    const wantsCsv = String(req.query.format || "").toLowerCase() === "csv";

    params.push(lim, off);

    const sql = `
      SELECT
        e.*,
        to_char(e.hora, 'HH24:MI') AS hora_formatted,
        to_char(e.hora_solicitud_cliente, 'HH24:MI') AS hora_solicitud_cliente_formatted,
        to_char(e.hora_quema_fichas, 'HH24:MI') AS hora_quema_fichas_formatted,
        to_char((e.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'DD/MM/YYYY HH24:MI:SS') AS created_at_ar,
        u.username AS created_by_username,
        COUNT(*) OVER() AS total_count
      FROM egresos e
      JOIN users u ON u.id = e.created_by
      ${whereClause}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const result = await query(sql, params);
    const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;
    const egresos = result.rows.map(mapEgreso);

    await auditLog(req, {
      action: wantsCsv ? "API_EXPORT_EGRESOS_CSV" : "API_EXPORT_EGRESOS",
      entity: "egresos",
      success: true,
      status_code: 200,
      details: {
        api_key_id: req.apiKey.id,
        api_key_name: req.apiKey.name,
        rows: result.rowCount,
        total,
        filters: req.query
      }
    });

    if (wantsCsv) {
      const columns = [
        "id", "codigo_operacion", "fecha", "hora", "turno",
        "hora_solicitud_cliente", "hora_quema_fichas",
        "empresa_salida", "cuenta_salida", "id_transferencia",
        "cuenta_receptora", "etiqueta", "etiqueta_otro",
        "usuario_casino", "monto", "monto_raw", "moneda", "tipo_transaccion",
        "status", "comprobante_url", "notas", "created_by_username", "created_at"
      ];

      const rows = result.rows.map((x) => ([
        x.id,
        x.codigo_operacion || "",
        formatFechaDDMMAAAA(x.fecha) || x.fecha,
        x.hora_formatted || "",
        x.turno || "",
        x.hora_solicitud_cliente_formatted || "",
        x.hora_quema_fichas_formatted || "",
        x.empresa_salida || "",
        x.cuenta_salida || "",
        x.id_transferencia || "",
        x.cuenta_receptora || "",
        x.etiqueta || "",
        x.etiqueta_otro || "",
        x.usuario_casino || "",
        montoToCommaString(Number(x.monto)),
        x.monto_raw || "",
        x.moneda || "ARS",
        x.tipo_transaccion || "SALIDA",
        x.status || "activo",
        x.comprobante_url || "",
        x.notas || "",
        x.created_by_username || "",
        x.created_at_ar || ""
      ]));

      const csv = withBOM(toCSV({ columns, rows, delimiter: ";" }));
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", 'attachment; filename="egresos-export.csv"');
      return res.send(csv);
    }

    return res.json({
      egresos,
      pagination: {
        total,
        limit: lim,
        offset: off,
        hasMore: off + lim < total
      }
    });
  } catch (error) {
    console.error("🔥 GET /api/export/egresos ERROR:", error);
    return res.status(500).json({ message: "Error exportando egresos" });
  }
});

export default router;
