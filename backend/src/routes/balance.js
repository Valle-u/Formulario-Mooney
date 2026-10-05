import express from "express";
import multer from "multer";
import { auth } from "../middleware/auth.js";
import { writeLimiter } from "../middleware/rateLimiter.js";
import { query } from "../config/db.js";
import { auditLog } from "../utils/audit.js";
import {
  BANCO_HG,
  OUTPUT_COLUMNS,
  transformar,
  resumenEtiquetas,
  contarFechasFuera,
  contarDirecciones,
  isoAFecha,
  tabDeFecha,
  leerBancoTexto,
  planillaPareceValida,
  normText,
} from "../services/balanceDiario.js";
import { leerPlanillaDia, escribirBalanceMensual } from "../services/sheetsBalance.js";

const router = express.Router();

const ROLES_BALANCE = new Set(["admin", "direccion", "encargado"]);

function requireConciliador(req, res, next) {
  if (!ROLES_BALANCE.has(req.user?.role)) {
    return res.status(403).json({ message: "Solo admin, dirección o encargado" });
  }
  return next();
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 6 },
});

function fechaValida(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || ""));
}

async function egresosDelDia(fechaISO) {
  const result = await query(
    `SELECT
        to_char(fecha, 'DD/MM/YYYY') AS fecha,
        to_char(hora, 'HH24:MI') AS hora,
        empresa_salida,
        cuenta_salida,
        COALESCE(id_transferencia, '') AS id_transferencia,
        COALESCE(cuenta_receptora, '') AS cuenta_receptora,
        etiqueta,
        monto_raw,
        monto::text AS monto,
        COALESCE(moneda, 'ARS') AS moneda
     FROM egresos
     WHERE fecha = $1::date
       AND status IS DISTINCT FROM 'anulado'
     ORDER BY hora, id`,
    [fechaISO]
  );
  return result.rows;
}

function avisosDeCorrida({ resultado, egresos, fechaDDMMAAAA, archivosVacios }) {
  const avisos = [];
  const { fuera, otras } = contarFechasFuera(resultado.registros, fechaDDMMAAAA);
  if (fuera > 0) {
    const detalle = otras.map((o) => `${o.cantidad} del ${o.fecha}`).join(", ");
    avisos.push({
      nivel: "aviso",
      codigo: "fecha_fuera",
      mensaje: `${fuera} movimiento(s) del CSV no son del ${fechaDDMMAAAA}${detalle ? ` (${detalle})` : ""}. Revisá que no sea el extracto de otro día.`,
    });
  }
  for (const v of archivosVacios) {
    avisos.push({
      nivel: "aviso",
      codigo: "csv_vacio",
      mensaje: `${v} no tiene movimientos válidos. Si ese banco tuvo egresos, van a entrar como filas extra.`,
    });
  }

  const presentes = new Set(resultado.bancosPresentes);
  const faltantes = new Map();
  for (const e of egresos) {
    if (normText(e.etiqueta) === "cierre de caja") continue;
    const key = normText(e.empresa_salida);
    if (!key || presentes.has(key)) continue;
    if (!faltantes.has(key)) faltantes.set(key, e.empresa_salida);
  }
  if (faltantes.size) {
    const nombres = [...faltantes.values()].join(", ");
    avisos.push({
      nivel: "aviso",
      codigo: "bancos_faltantes",
      mensaje: `Sin CSV de: ${nombres}. Esos egresos se agregan como filas extra (no se cruzan con el banco).`,
    });
  }
  return avisos;
}

router.post("/generar", auth, requireConciliador, (req, res) => {
  upload.array("bancos", 6)(req, res, async (multerErr) => {
    if (multerErr) {
      const message = multerErr.code === "LIMIT_FILE_SIZE"
        ? "Un CSV supera los 20 MB"
        : (multerErr.message || "No pude leer los archivos");
      return res.status(400).json({ message });
    }
    try {
      const fecha = String(req.body?.fecha || "").trim();
      if (!fechaValida(fecha)) {
        return res.status(400).json({ message: "Elegí el día del balance (YYYY-MM-DD)" });
      }
      const files = req.files || [];
      if (!files.length) {
        return res.status(400).json({ message: "Subí al menos un CSV de banco" });
      }

      const rivenTitular = process.env.RIVEN_TITULAR || "";
      const leidos = [];
      for (const file of files) {
        const nombre = file.originalname || "banco.csv";
        const texto = file.buffer.toString("utf8");
        try {
          leidos.push({ nombre, texto, ...leerBancoTexto(texto, nombre, { rivenTitular }) });
        } catch (e) {
          if (e.code === "FORMATO") {
            return res.status(400).json({ message: e.message });
          }
          throw e;
        }
      }

      const vistos = new Set();
      for (const l of leidos) {
        if (vistos.has(l.banco)) {
          return res.status(400).json({ message: `Subiste más de un CSV de ${l.banco}` });
        }
        vistos.add(l.banco);
      }

      const hg = leidos.find((l) => l.banco === BANCO_HG);
      if (hg) {
        const { entrante, saliente } = contarDirecciones(hg.registros, BANCO_HG);
        if (saliente > 0 && entrante === 0) {
          return res.status(400).json({
            message: `Balance incompleto: HG.Cash tiene ${saliente} saliente(s) y 0 entrantes. El export parece incompleto.`,
          });
        }
      }

      const planilla = await leerPlanillaDia(fecha);
      if (!planillaPareceValida(planilla.values)) {
        const celda = String((planilla.values?.[1] || [])[1] ?? "");
        return res.status(400).json({
          message: `La pestaña ${planilla.tab} no parece la planilla de cargas (columna B, fila 2: "${celda || "vacía"}").`,
        });
      }

      const egresos = await egresosDelDia(fecha);
      const resultado = transformar({
        bancos: leidos.map((l) => ({ nombre: l.nombre, texto: l.texto })),
        egresos,
        planillaFilas: planilla.values,
        planillaFecha: fecha,
        rivenTitular,
      });

      const fechaDD = isoAFecha(fecha);
      const avisos = avisosDeCorrida({
        resultado,
        egresos,
        fechaDDMMAAAA: fechaDD,
        archivosVacios: resultado.resumenFormatos.filter((f) => f.filas === 0).map((f) => f.archivo),
      });

      const { registros, ...resto } = resultado;
      return res.json({
        fecha,
        fechaDD,
        tab: tabDeFecha(fechaDD),
        planilla: { tab: planilla.tab, filas: resto.cuadre.planilla_filas },
        bancos: resto.resumenFormatos,
        avisos,
        cuadre: resto.cuadre,
        resumen: resumenEtiquetas(resto.salida),
        filas: resto.salida,
        revisar: resto.revisar,
        filasUsdt: resto.salidaUsdt,
        columnas: OUTPUT_COLUMNS,
      });
    } catch (e) {
      console.error("balance/generar:", e.message);
      const message = e.message || "No pude armar el balance";
      const status = /Falta |No pude leer|no parece|Fecha inválida|JSON válido|No encuentro/.test(message) ? 400 : 500;
      return res.status(status).json({ message });
    }
  });
});

router.post("/cargar", auth, requireConciliador, writeLimiter, async (req, res) => {
  try {
    const fecha = String(req.body?.fecha || "").trim();
    const filas = req.body?.filas;
    if (!fechaValida(fecha)) {
      return res.status(400).json({ message: "Fecha inválida" });
    }
    if (!Array.isArray(filas) || !filas.length) {
      return res.status(400).json({ message: "No hay filas para cargar" });
    }
    if (filas.length > 20000) {
      return res.status(400).json({ message: "Demasiadas filas para una sola carga" });
    }
    const fechaDD = isoAFecha(fecha);
    const resultado = await escribirBalanceMensual(filas, fechaDD);
    await auditLog(req, {
      action: "balance_cargar",
      entity: "balance_mensual",
      success: true,
      status_code: 200,
      details: { fecha, tab: resultado.tab, nuevas: resultado.nuevas, repetidas: resultado.repetidas },
    });
    return res.json({
      message: resultado.nuevas
        ? `Cargué ${resultado.nuevas} fila(s) en "${resultado.tab}". ${resultado.repetidas} ya estaban.`
        : `Nada nuevo: las ${resultado.repetidas} fila(s) ya estaban en "${resultado.tab}".`,
      ...resultado,
    });
  } catch (e) {
    console.error("balance/cargar:", e.message);
    await auditLog(req, {
      action: "balance_cargar",
      entity: "balance_mensual",
      success: false,
      status_code: 500,
      details: { error: e.message },
    }).catch(() => {});
    const message = e.message || "No pude escribir el balance mensual";
    const status = /Falta |No encuentro|JSON válido|pestaña/.test(message) ? 400 : 500;
    return res.status(status).json({ message });
  }
});

export default router;
