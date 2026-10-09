import express from "express";
import { auth } from "../middleware/auth.js";
import { query } from "../config/db.js";
import { armarFlujoCaja, ingresosArsDesdeBalance, periodoMes } from "../services/flujoCaja.js";
import { leerBalanceMensual } from "../services/sheetsBalance.js";

const router = express.Router();
const ROLES = new Set(["admin", "direccion", "encargado"]);

function requireConciliador(req, res, next) {
  if (!ROLES.has(req.user?.role)) {
    return res.status(403).json({ message: "Solo admin, dirección o encargado" });
  }
  return next();
}

function periodoValido(anio, mes) {
  return Number.isInteger(anio) && anio >= 2020 && anio <= 2100
    && Number.isInteger(mes) && mes >= 1 && mes <= 12;
}

async function ultimosCierres(filtroFecha, params) {
  const result = await query(
    `SELECT DISTINCT ON (empresa_salida, cuenta_salida, COALESCE(moneda, 'ARS'))
        empresa_salida,
        cuenta_salida,
        COALESCE(moneda, 'ARS') AS moneda,
        monto::text AS monto,
        fecha::text AS fecha
     FROM egresos
     WHERE status IS DISTINCT FROM 'anulado'
       AND etiqueta = 'Cierre de Caja'
       AND ${filtroFecha}
     ORDER BY empresa_salida, cuenta_salida, COALESCE(moneda, 'ARS'), fecha DESC, hora DESC, id DESC`,
    params
  );
  return result.rows;
}

router.get("/", auth, requireConciliador, async (req, res) => {
  try {
    const anio = Number(req.query.anio);
    const mes = Number(req.query.mes);
    if (!periodoValido(anio, mes)) {
      return res.status(400).json({ message: "Elegí un mes válido" });
    }
    const { desde, hasta } = periodoMes(anio, mes);

    const [cierresAntes, cierresEnPeriodo, movimientos] = await Promise.all([
      ultimosCierres("fecha < $1::date", [desde]),
      ultimosCierres("fecha >= $1::date AND fecha <= $2::date", [desde, hasta]),
      query(
        `SELECT
            COALESCE(moneda, 'ARS') AS moneda,
            CASE
              WHEN NULLIF(TRIM(etiqueta), '') IS NULL THEN '(sin etiqueta)'
              WHEN lower(trim(etiqueta)) = 'otro' AND NULLIF(TRIM(etiqueta_otro), '') IS NOT NULL
                THEN 'Otro · ' || TRIM(etiqueta_otro)
              ELSE TRIM(etiqueta)
            END AS etiqueta,
            fecha::text AS fecha,
            COALESCE(tipo_transaccion, 'SALIDA') AS tipo,
            SUM(monto)::text AS monto,
            COUNT(*)::int AS n
         FROM egresos
         WHERE status IS DISTINCT FROM 'anulado'
           AND etiqueta IS DISTINCT FROM 'Cierre de Caja'
           AND fecha >= $1::date
           AND fecha <= $2::date
         GROUP BY 1, 2, 3, 4`,
        [desde, hasta]
      ),
    ]);

    const delFormulario = movimientos.rows.filter((m) => {
      return !(String(m.moneda).toUpperCase() === "ARS" && String(m.tipo).toUpperCase() === "ENTRADA");
    });

    let ingresosArs = [];
    let avisoBalance = null;
    try {
      const matriz = await leerBalanceMensual();
      ingresosArs = ingresosArsDesdeBalance(matriz, { desde, hasta });
    } catch (e) {
      avisoBalance = e.message || "No pude leer el balance mensual";
      console.error("flujo-caja balance:", avisoBalance);
    }

    const { flujos } = armarFlujoCaja({
      movimientos: [...delFormulario, ...ingresosArs],
      cierresAntes,
      cierresEnPeriodo,
    });

    return res.json({
      periodo: { anio, mes, desde, hasta },
      ingresos_ars: {
        movimientos: ingresosArs.reduce((s, g) => s + g.n, 0),
        aviso: avisoBalance,
      },
      flujos,
    });
  } catch (e) {
    console.error("flujo-caja:", e.message);
    return res.status(500).json({ message: "No pude armar el flujo de caja" });
  }
});

export default router;
