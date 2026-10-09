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
  armarCuadreUsdt,
  contarDirecciones,
  fechaIsoDeRegistro,
  isoAFecha,
  listarDias,
  registrosDelDia,
  sumarCuadres,
  leerBancoTexto,
  planillaPareceValida,
  normText,
} from "../services/balanceDiario.js";
import { leerPlanillaDia, escribirBalanceMensual, tabDestinoBalance } from "../services/sheetsBalance.js";

const router = express.Router();

const ROLES_BALANCE = new Set(["admin", "direccion"]);

function requireConciliador(req, res, next) {
  if (!ROLES_BALANCE.has(req.user?.role)) {
    return res.status(403).json({ message: "Solo admin o dirección" });
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

async function cierresEnFecha(fechaSQL, params) {
  const result = await query(
    `SELECT
        empresa_salida,
        cuenta_salida,
        COALESCE(moneda, 'ARS') AS moneda,
        etiqueta,
        COALESCE(tipo_transaccion, 'SALIDA') AS tipo_transaccion,
        monto::text AS monto,
        to_char(hora, 'HH24:MI') AS hora
     FROM egresos
     WHERE status IS DISTINCT FROM 'anulado'
       AND etiqueta = 'Cierre de Caja'
       AND ${fechaSQL}
     ORDER BY hora DESC`,
    params
  );
  return result.rows;
}

const EGRESOS_SELECT = `
  SELECT
      to_char(fecha, 'YYYY-MM-DD') AS fecha_iso,
      to_char(fecha, 'DD/MM/YYYY') AS fecha,
      to_char(hora, 'HH24:MI') AS hora,
      empresa_salida,
      cuenta_salida,
      COALESCE(id_transferencia, '') AS id_transferencia,
      COALESCE(cuenta_receptora, '') AS cuenta_receptora,
      etiqueta,
      COALESCE(tipo_transaccion, 'SALIDA') AS tipo_transaccion,
      monto_raw,
      monto::text AS monto,
      COALESCE(moneda, 'ARS') AS moneda
   FROM egresos
   WHERE status IS DISTINCT FROM 'anulado'`;

async function egresosDelDia(fechaISO) {
  const result = await query(
    `${EGRESOS_SELECT}
       AND fecha = $1::date
     ORDER BY hora, id`,
    [fechaISO]
  );
  return result.rows;
}

async function egresosDelRango(desde, hasta) {
  const result = await query(
    `${EGRESOS_SELECT}
       AND fecha >= $1::date
       AND fecha <= $2::date
     ORDER BY fecha, hora, id`,
    [desde, hasta]
  );
  const porDia = new Map();
  for (const row of result.rows) {
    if (!porDia.has(row.fecha_iso)) porDia.set(row.fecha_iso, []);
    porDia.get(row.fecha_iso).push(row);
  }
  return porDia;
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
      const fechaSuelta = String(req.body?.fecha || "").trim();
      const desde = String(req.body?.desde || fechaSuelta).trim();
      const hasta = String(req.body?.hasta || fechaSuelta).trim();
      const rango = listarDias(desde, hasta);
      if (!rango.ok) {
        return res.status(400).json({ message: rango.message });
      }
      const dias = rango.dias;
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

      const todosRegistros = leidos.flatMap((l) => l.registros);
      const bancosArchivo = leidos.map((l) => l.banco);
      const egresosPorDia = await egresosDelRango(desde, hasta);
      const lecturas = await Promise.all(dias.map(async (dia) => {
        try {
          return { dia, planilla: await leerPlanillaDia(dia), error: null };
        } catch (e) {
          return { dia, planilla: null, error: e.message || "No pude leer la planilla" };
        }
      }));

      if (dias.length === 1) {
        const unica = lecturas[0];
        if (unica.error || !unica.planilla) {
          return res.status(400).json({ message: unica.error || "No pude leer la planilla de cargas" });
        }
        if (!planillaPareceValida(unica.planilla.values)) {
          const celda = String((unica.planilla.values?.[1] || [])[1] ?? "");
          return res.status(400).json({
            message: `La pestaña ${unica.planilla.tab} no parece la planilla de cargas (columna B, fila 2: "${celda || "vacía"}").`,
          });
        }
      }

      const salida = [];
      const revisar = [];
      const salidaUsdt = [];
      const porDia = [];
      const avisos = [];
      const egresos = [];

      for (const lectura of lecturas) {
        const dia = lectura.dia;
        let filasPlanilla = [];
        let tab = String(Number(dia.slice(8, 10)));
        if (lectura.error || !lectura.planilla) {
          avisos.push({
            nivel: "aviso",
            codigo: "planilla",
            mensaje: `Día ${isoAFecha(dia)}: no pude leer la planilla de cargas. Los depósitos de ese día quedan sin etiqueta.`,
          });
        } else if (!planillaPareceValida(lectura.planilla.values)) {
          tab = lectura.planilla.tab;
          avisos.push({
            nivel: "aviso",
            codigo: "planilla",
            mensaje: `La pestaña ${lectura.planilla.tab} (${isoAFecha(dia)}) no parece la planilla de cargas. Los depósitos de ese día quedan sin etiqueta.`,
          });
        } else {
          filasPlanilla = lectura.planilla.values;
          tab = lectura.planilla.tab;
        }

        const egresosDia = egresosPorDia.get(dia) || [];
        egresos.push(...egresosDia);
        const resultado = transformar({
          registros: registrosDelDia(todosRegistros, dia),
          bancosPresentes: bancosArchivo,
          egresos: egresosDia,
          planillaFilas: filasPlanilla,
          planillaFecha: dia,
          rivenTitular,
        });
        salida.push(...resultado.salida);
        revisar.push(...resultado.revisar);
        salidaUsdt.push(...resultado.salidaUsdt);
        porDia.push({
          fecha: dia,
          fechaDD: isoAFecha(dia),
          tab,
          cuadre: resultado.cuadre,
          filas: resultado.salida.length,
          revisar: resultado.revisar.length,
        });
      }

      const fueraMap = new Map();
      let fuera = 0;
      for (const reg of todosRegistros) {
        const iso = fechaIsoDeRegistro(reg);
        if (iso && iso >= desde && iso <= hasta) continue;
        fuera += 1;
        const etiqueta = iso ? isoAFecha(iso) : "sin fecha";
        fueraMap.set(etiqueta, (fueraMap.get(etiqueta) || 0) + 1);
      }
      if (fuera > 0) {
        const detalle = [...fueraMap.entries()].map(([f, n]) => `${n} del ${f}`).join(", ");
        avisos.push({
          nivel: "aviso",
          codigo: "fecha_fuera",
          mensaje: `${fuera} movimiento(s) del CSV quedan afuera del rango ${isoAFecha(desde)} a ${isoAFecha(hasta)} (${detalle}). No entran al balance.`,
        });
      }
      for (const l of leidos) {
        if (!l.registros.length) {
          avisos.push({
            nivel: "aviso",
            codigo: "csv_vacio",
            mensaje: `${l.nombre} no tiene movimientos válidos. Si ese banco tuvo egresos, van a entrar como filas extra.`,
          });
        }
      }
      const presentes = new Set(bancosArchivo.map((b) => normText(b)));
      const faltantes = new Map();
      for (const e of egresos) {
        if (normText(e.etiqueta) === "cierre de caja") continue;
        const key = normText(e.empresa_salida);
        if (!key || presentes.has(key)) continue;
        if (!faltantes.has(key)) faltantes.set(key, e.empresa_salida);
      }
      if (faltantes.size) {
        avisos.push({
          nivel: "aviso",
          codigo: "bancos_faltantes",
          mensaje: `Sin CSV de: ${[...faltantes.values()].join(", ")}. Esos egresos se agregan como filas extra (no se cruzan con el banco).`,
        });
      }

      const porEmpresa = new Map();
      for (const e of egresos) {
        if (normText(e.etiqueta) === "cierre de caja") continue;
        const nombre = e.empresa_salida || "(sin empresa)";
        porEmpresa.set(nombre, (porEmpresa.get(nombre) || 0) + 1);
      }
      const egresosHasta = egresosPorDia.get(hasta) || [];
      const cierresAyer = await cierresEnFecha("fecha = $1::date - 1", [hasta]);
      const usdt = armarCuadreUsdt({
        cierresAyer,
        movimientos: egresosHasta,
        cierresHoy: egresosHasta.filter((e) => normText(e.etiqueta) === "cierre de caja"),
      });
      const cuadre = sumarCuadres(porDia.map((d) => d.cuadre));
      const fechaDD = desde === hasta
        ? isoAFecha(desde)
        : `${isoAFecha(desde)} a ${isoAFecha(hasta)}`;

      return res.json({
        fecha: hasta,
        desde,
        hasta,
        fechaDD,
        desdeDD: isoAFecha(desde),
        hastaDD: isoAFecha(hasta),
        tab: tabDestinoBalance(),
        planilla: {
          tab: porDia.map((d) => d.tab).filter(Boolean).join(", "),
          filas: cuadre.planilla_filas,
        },
        porDia,
        bancos: leidos.map((l) => ({
          archivo: l.nombre,
          formato: l.fmt,
          banco: l.banco,
          filas: l.registros.length,
        })),
        avisos,
        cuadre,
        resumen: resumenEtiquetas(salida),
        egresosFormulario: {
          total: [...porEmpresa.values()].reduce((s, n) => s + n, 0),
          hg: [...porEmpresa.entries()].filter(([empresa]) => normText(empresa) === "hg.cash").reduce((s, [, n]) => s + n, 0),
          porEmpresa: [...porEmpresa.entries()].map(([empresa, cantidad]) => ({ empresa, cantidad })),
        },
        usdt,
        filas: salida,
        revisar,
        filasUsdt: salidaUsdt,
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

router.post("/generar-usdt", auth, requireConciliador, async (req, res) => {
  try {
    const fecha = String(req.body?.fecha || "").trim();
    if (!fechaValida(fecha)) {
      return res.status(400).json({ message: "Elegí el día del balance (YYYY-MM-DD)" });
    }
    const egresos = await egresosDelDia(fecha);
    const cierresAyer = await cierresEnFecha("fecha = $1::date - 1", [fecha]);
    const cierresHoy = egresos.filter((e) => normText(e.etiqueta) === "cierre de caja");
    const usdt = armarCuadreUsdt({ cierresAyer, movimientos: egresos, cierresHoy });
    return res.json({
      fecha,
      fechaDD: isoAFecha(fecha),
      usdt,
    });
  } catch (e) {
    console.error("balance/generar-usdt:", e.message);
    return res.status(500).json({ message: e.message || "No pude armar el balance USDT" });
  }
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
