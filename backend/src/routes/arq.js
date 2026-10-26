import express from "express";
import { auth, requireAdminOrDireccion } from "../middleware/auth.js";
import { query } from "../config/db.js";
import { auditLog } from "../utils/audit.js";
import { writeLimiter } from "../middleware/rateLimiter.js";
import {
  INICIO_SEGUIMIENTO,
  calcularSaldos,
  fechaValida,
  idValido as idParam,
  montoCentavos,
  resolverFondeo,
  validarMovimiento,
} from "../services/arqTarjetas.js";

const router = express.Router();
router.use(auth, requireAdminOrDireccion);
// Toda escritura pasa por el mismo límite que las altas y ediciones de egresos.
router.use((req, res, next) => (req.method === "GET" ? next() : writeLimiter(req, res, next)));

const ESTADOS_FONDEO = new Set(["ok", "pendiente", "sin_asignar", "descartado"]);

function texto(v, max) {
  const s = String(v ?? "").trim();
  return s ? s.slice(0, max) : null;
}

async function leerFondeos() {
  const { rows } = await query(
    `SELECT e.id AS egreso_id,
            e.fecha::text AS fecha,
            to_char(e.hora, 'HH24:MI') AS hora,
            e.etiqueta,
            e.monto::text AS monto,
            COALESCE(e.moneda, 'ARS') AS moneda,
            COALESCE(e.empresa_salida, '') AS empresa,
            COALESCE(e.cuenta_salida, '') AS cuenta_salida,
            COALESCE(e.cuenta_receptora, '') AS cuenta_receptora,
            COALESCE(e.notas, '') AS nota,
            ef.cuenta_id AS cuenta_etiqueta,
            f.cuenta_id AS cuenta_asignada,
            f.monto_usd::text AS monto_usd_confirmado,
            COALESCE(f.descartado, false) AS descartado
     FROM egresos e
     JOIN arq_etiquetas_fondeo ef ON ef.etiqueta = e.etiqueta
     LEFT JOIN arq_fondeos f ON f.egreso_id = e.id
     WHERE e.status IS DISTINCT FROM 'anulado'
       AND COALESCE(e.tipo_transaccion, 'SALIDA') = 'SALIDA'
       AND e.fecha >= $1::date
     ORDER BY e.fecha, e.hora, e.id`,
    [INICIO_SEGUIMIENTO]
  );
  return rows.map((fila) => ({
    egreso_id: Number(fila.egreso_id),
    fecha: fila.fecha,
    hora: fila.hora,
    etiqueta: fila.etiqueta,
    moneda: fila.moneda,
    monto_egreso: Number(fila.monto),
    empresa: fila.empresa,
    cuenta_salida: fila.cuenta_salida,
    cuenta_receptora: fila.cuenta_receptora,
    nota: fila.nota,
    ...resolverFondeo(fila),
  }));
}

async function leerMovimientosActivos() {
  const { rows } = await query(
    `SELECT tipo, cuenta_id, cuenta_destino_id, monto_usd::text AS monto_usd
     FROM arq_movimientos
     WHERE status = 'activo' AND fecha >= $1::date`,
    [INICIO_SEGUIMIENTO]
  );
  return rows;
}

async function cuentaExiste(id) {
  const { rows } = await query(`SELECT id FROM arq_cuentas WHERE id = $1`, [id]);
  return rows.length > 0;
}

// Revisa que las cuentas y la tarjeta del movimiento existan y que la tarjeta sea de la cuenta.
async function verificarReferencias(mov) {
  if (!(await cuentaExiste(mov.cuenta_id))) return "La cuenta no existe";
  if (mov.cuenta_destino_id && !(await cuentaExiste(mov.cuenta_destino_id))) {
    return "La cuenta que recibe no existe";
  }
  if (mov.tarjeta_id) {
    const { rows } = await query(`SELECT cuenta_id FROM arq_tarjetas WHERE id = $1`, [mov.tarjeta_id]);
    if (!rows.length) return "La tarjeta no existe";
    if (Number(rows[0].cuenta_id) !== mov.cuenta_id) return "La tarjeta no es de esa cuenta";
  }
  return null;
}

/* =========================
   RESUMEN Y DETALLE
   ========================= */

router.get("/resumen", async (req, res) => {
  try {
    const [cuentas, tarjetas, fondeos, movimientos] = await Promise.all([
      query(
        `SELECT id, nombre, titular, billetera, alias, wallet, telefono, notas, is_active
         FROM arq_cuentas ORDER BY is_active DESC, nombre`
      ),
      query(
        `SELECT id, cuenta_id, tipo, alias, nombre_tarjeta, ultimos4, is_active
         FROM arq_tarjetas ORDER BY cuenta_id, id`
      ),
      leerFondeos(),
      leerMovimientosActivos(),
    ]);

    const saldos = new Map(
      calcularSaldos({ cuentas: cuentas.rows, fondeos, movimientos }).map((s) => [s.cuenta_id, s])
    );

    return res.json({
      inicio: INICIO_SEGUIMIENTO,
      cuentas: cuentas.rows.map((c) => ({
        ...c,
        id: Number(c.id),
        tarjetas: tarjetas.rows
          .filter((t) => Number(t.cuenta_id) === Number(c.id))
          .map((t) => ({ ...t, id: Number(t.id), cuenta_id: Number(t.cuenta_id) })),
        saldo: saldos.get(Number(c.id)),
      })),
      fondeos_pendientes: fondeos.filter((f) => f.estado === "pendiente").length,
      fondeos_sin_asignar: fondeos.filter((f) => f.estado === "sin_asignar").length,
    });
  } catch (e) {
    console.error("arq resumen:", e.message);
    return res.status(500).json({ message: "No pude armar el resumen de las cuentas ARQ" });
  }
});

router.get("/cuentas/:id/detalle", async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ message: "Cuenta inválida" });
    const desde = fechaValida(req.query.desde) ? req.query.desde : INICIO_SEGUIMIENTO;
    const hasta = fechaValida(req.query.hasta) ? req.query.hasta : "2100-12-31";

    const [cuenta, fondeos, movimientos] = await Promise.all([
      query(`SELECT id, nombre FROM arq_cuentas WHERE id = $1`, [id]),
      leerFondeos(),
      query(
        `SELECT m.id, m.tipo, m.cuenta_id, m.cuenta_destino_id, m.tarjeta_id,
                m.servicio, m.fecha::text AS fecha, to_char(m.hora, 'HH24:MI') AS hora,
                m.monto_usd::text AS monto_usd, m.moneda_origen, m.monto_origen::text AS monto_origen,
                COALESCE(m.notas, '') AS nota,
                co.nombre AS cuenta_origen, cd.nombre AS cuenta_destino,
                t.tipo AS tarjeta_tipo, t.alias AS tarjeta_alias, t.ultimos4 AS tarjeta_ultimos4,
                u.username AS cargado_por
         FROM arq_movimientos m
         JOIN arq_cuentas co ON co.id = m.cuenta_id
         LEFT JOIN arq_cuentas cd ON cd.id = m.cuenta_destino_id
         LEFT JOIN arq_tarjetas t ON t.id = m.tarjeta_id
         LEFT JOIN users u ON u.id = m.created_by
         WHERE m.status = 'activo'
           AND (m.cuenta_id = $1 OR m.cuenta_destino_id = $1)
           AND m.fecha >= GREATEST($2::date, $4::date)
           AND m.fecha <= $3::date
         ORDER BY m.fecha, m.hora NULLS FIRST, m.id`,
        [id, desde, hasta, INICIO_SEGUIMIENTO]
      ),
    ]);
    if (!cuenta.rows.length) return res.status(404).json({ message: "La cuenta no existe" });

    const items = [];
    for (const f of fondeos) {
      if (f.cuenta_id !== id || (f.estado !== "ok" && f.estado !== "pendiente")) continue;
      if (f.fecha < desde || f.fecha > hasta) continue;
      items.push({ origen: "fondeo", tipo: "FONDEO", signo: 1, ...f });
    }
    for (const m of movimientos.rows) {
      const monto = Number(m.monto_usd);
      let signo = -1;
      if (m.tipo === "AJUSTE") signo = 1;
      else if (m.tipo === "TRANSFERENCIA" && Number(m.cuenta_destino_id) === id) signo = 1;
      items.push({
        origen: "movimiento",
        ...m,
        id: Number(m.id),
        cuenta_id: Number(m.cuenta_id),
        cuenta_destino_id: m.cuenta_destino_id == null ? null : Number(m.cuenta_destino_id),
        tarjeta_id: m.tarjeta_id == null ? null : Number(m.tarjeta_id),
        monto_usd: monto,
        monto_origen: m.monto_origen == null ? null : Number(m.monto_origen),
        signo,
      });
    }
    items.sort((a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || "")));

    return res.json({ cuenta: { id, nombre: cuenta.rows[0].nombre }, desde, hasta, items });
  } catch (e) {
    console.error("arq detalle:", e.message);
    return res.status(500).json({ message: "No pude leer los movimientos de la cuenta" });
  }
});

/* =========================
   CUENTAS Y TARJETAS
   ========================= */

function datosCuenta(body) {
  return {
    nombre: texto(body.nombre, 80),
    titular: texto(body.titular, 120),
    billetera: texto(body.billetera, 40) || "ARQ",
    alias: texto(body.alias, 80),
    wallet: texto(body.wallet, 120),
    telefono: texto(body.telefono, 40),
    notas: texto(body.notas, 1000),
  };
}

router.post("/cuentas", async (req, res) => {
  try {
    const c = datosCuenta(req.body || {});
    if (!c.nombre) return res.status(400).json({ message: "Poné un nombre para la cuenta" });
    const { rows } = await query(
      `INSERT INTO arq_cuentas (nombre, titular, billetera, alias, wallet, telefono, notas, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [c.nombre, c.titular, c.billetera, c.alias, c.wallet, c.telefono, c.notas, req.user.id]
    );
    await auditLog(req, { action: "ARQ_CUENTA_CREATE", entity: "arq_cuentas", entity_id: rows[0].id, status_code: 201, details: { nombre: c.nombre } });
    return res.status(201).json({ id: Number(rows[0].id) });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ message: "Ya hay una cuenta con ese nombre" });
    console.error("arq cuenta create:", e.message);
    return res.status(500).json({ message: "No pude crear la cuenta" });
  }
});

router.put("/cuentas/:id", async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ message: "Cuenta inválida" });
    const c = datosCuenta(req.body || {});
    if (!c.nombre) return res.status(400).json({ message: "Poné un nombre para la cuenta" });
    const activa = req.body?.is_active === undefined ? null : !!req.body.is_active;
    const { rowCount } = await query(
      `UPDATE arq_cuentas
       SET nombre = $1, titular = $2, billetera = $3, alias = $4, wallet = $5, telefono = $6, notas = $7,
           is_active = COALESCE($8, is_active), updated_at = NOW()
       WHERE id = $9`,
      [c.nombre, c.titular, c.billetera, c.alias, c.wallet, c.telefono, c.notas, activa, id]
    );
    if (!rowCount) return res.status(404).json({ message: "La cuenta no existe" });
    await auditLog(req, { action: "ARQ_CUENTA_UPDATE", entity: "arq_cuentas", entity_id: id, status_code: 200, details: { nombre: c.nombre, is_active: activa } });
    return res.json({ ok: true });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ message: "Ya hay una cuenta con ese nombre" });
    console.error("arq cuenta update:", e.message);
    return res.status(500).json({ message: "No pude actualizar la cuenta" });
  }
});

function datosTarjeta(body) {
  const tipo = String(body.tipo || "").toLowerCase();
  const ultimos4 = texto(body.ultimos4, 4);
  if (tipo !== "global" && tipo !== "local") return { error: "Elegí si la tarjeta es global o local" };
  if (ultimos4 && !/^\d{4}$/.test(ultimos4)) return { error: "Los últimos 4 dígitos tienen que ser números" };
  return { tarjeta: { tipo, alias: texto(body.alias, 80), nombre_tarjeta: texto(body.nombre_tarjeta, 80), ultimos4 } };
}

router.post("/tarjetas", async (req, res) => {
  try {
    const cuentaId = idParam(req.body?.cuenta_id);
    if (!cuentaId || !(await cuentaExiste(cuentaId))) return res.status(400).json({ message: "Elegí la cuenta" });
    const { error, tarjeta } = datosTarjeta(req.body || {});
    if (error) return res.status(400).json({ message: error });
    const { rows } = await query(
      `INSERT INTO arq_tarjetas (cuenta_id, tipo, alias, nombre_tarjeta, ultimos4) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [cuentaId, tarjeta.tipo, tarjeta.alias, tarjeta.nombre_tarjeta, tarjeta.ultimos4]
    );
    await auditLog(req, { action: "ARQ_TARJETA_CREATE", entity: "arq_tarjetas", entity_id: rows[0].id, status_code: 201, details: { cuenta_id: cuentaId, ...tarjeta } });
    return res.status(201).json({ id: Number(rows[0].id) });
  } catch (e) {
    console.error("arq tarjeta create:", e.message);
    return res.status(500).json({ message: "No pude crear la tarjeta" });
  }
});

router.put("/tarjetas/:id", async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ message: "Tarjeta inválida" });
    const { error, tarjeta } = datosTarjeta(req.body || {});
    if (error) return res.status(400).json({ message: error });
    const activa = req.body?.is_active === undefined ? null : !!req.body.is_active;
    const { rowCount } = await query(
      `UPDATE arq_tarjetas
       SET tipo = $1, alias = $2, nombre_tarjeta = $3, ultimos4 = $4, is_active = COALESCE($5, is_active), updated_at = NOW()
       WHERE id = $6`,
      [tarjeta.tipo, tarjeta.alias, tarjeta.nombre_tarjeta, tarjeta.ultimos4, activa, id]
    );
    if (!rowCount) return res.status(404).json({ message: "La tarjeta no existe" });
    await auditLog(req, { action: "ARQ_TARJETA_UPDATE", entity: "arq_tarjetas", entity_id: id, status_code: 200, details: { ...tarjeta, is_active: activa } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("arq tarjeta update:", e.message);
    return res.status(500).json({ message: "No pude actualizar la tarjeta" });
  }
});

/* =========================
   SERVICIOS
   ========================= */

router.get("/servicios", async (req, res) => {
  try {
    const { rows } = await query(`SELECT id, nombre FROM arq_servicios WHERE is_active ORDER BY nombre`);
    return res.json({ servicios: rows.map((r) => ({ id: Number(r.id), nombre: r.nombre })) });
  } catch (e) {
    console.error("arq servicios:", e.message);
    return res.status(500).json({ message: "No pude leer los servicios" });
  }
});

router.post("/servicios", async (req, res) => {
  try {
    const nombre = texto(req.body?.nombre, 80);
    if (!nombre) return res.status(400).json({ message: "Escribí el nombre del servicio" });
    const { rows } = await query(
      `INSERT INTO arq_servicios (nombre) VALUES ($1)
       ON CONFLICT (nombre) DO UPDATE SET is_active = TRUE
       RETURNING id`,
      [nombre]
    );
    return res.status(201).json({ id: Number(rows[0].id), nombre });
  } catch (e) {
    console.error("arq servicio create:", e.message);
    return res.status(500).json({ message: "No pude guardar el servicio" });
  }
});

/* =========================
   ETIQUETAS DE FONDEO
   ========================= */

router.get("/etiquetas", async (req, res) => {
  try {
    const [vinculadas, disponibles] = await Promise.all([
      query(
        `SELECT ef.etiqueta, ef.cuenta_id, c.nombre AS cuenta
         FROM arq_etiquetas_fondeo ef
         LEFT JOIN arq_cuentas c ON c.id = ef.cuenta_id
         ORDER BY ef.etiqueta`
      ),
      query(
        `SELECT value FROM select_options
         WHERE option_type = 'etiqueta' AND is_active
         ORDER BY sort_order, id`
      ),
    ]);
    return res.json({
      etiquetas: vinculadas.rows.map((r) => ({
        etiqueta: r.etiqueta,
        cuenta_id: r.cuenta_id == null ? null : Number(r.cuenta_id),
        cuenta: r.cuenta,
      })),
      disponibles: disponibles.rows.map((r) => r.value),
    });
  } catch (e) {
    console.error("arq etiquetas:", e.message);
    return res.status(500).json({ message: "No pude leer las etiquetas de fondeo" });
  }
});

// cuenta_id null = etiqueta genérica: cada egreso se asigna a mano.
router.put("/etiquetas", async (req, res) => {
  try {
    const etiqueta = texto(req.body?.etiqueta, 80);
    if (!etiqueta) return res.status(400).json({ message: "Elegí la etiqueta" });
    const existe = await query(
      `SELECT 1 FROM select_options WHERE option_type = 'etiqueta' AND value = $1`,
      [etiqueta]
    );
    if (!existe.rows.length) return res.status(400).json({ message: "Esa etiqueta no existe en el formulario" });
    let cuentaId = null;
    if (req.body?.cuenta_id != null && req.body.cuenta_id !== "") {
      cuentaId = idParam(req.body.cuenta_id);
      if (!cuentaId || !(await cuentaExiste(cuentaId))) return res.status(400).json({ message: "La cuenta no existe" });
    }
    await query(
      `INSERT INTO arq_etiquetas_fondeo (etiqueta, cuenta_id) VALUES ($1, $2)
       ON CONFLICT (etiqueta) DO UPDATE SET cuenta_id = EXCLUDED.cuenta_id`,
      [etiqueta, cuentaId]
    );
    await auditLog(req, { action: "ARQ_ETIQUETA_SET", entity: "arq_etiquetas_fondeo", status_code: 200, details: { etiqueta, cuenta_id: cuentaId } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("arq etiqueta set:", e.message);
    return res.status(500).json({ message: "No pude guardar la etiqueta de fondeo" });
  }
});

router.delete("/etiquetas/:etiqueta", async (req, res) => {
  try {
    const etiqueta = texto(req.params.etiqueta, 80);
    const { rowCount } = await query(`DELETE FROM arq_etiquetas_fondeo WHERE etiqueta = $1`, [etiqueta]);
    if (!rowCount) return res.status(404).json({ message: "Esa etiqueta no estaba vinculada" });
    await auditLog(req, { action: "ARQ_ETIQUETA_DELETE", entity: "arq_etiquetas_fondeo", status_code: 200, details: { etiqueta } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("arq etiqueta delete:", e.message);
    return res.status(500).json({ message: "No pude quitar la etiqueta de fondeo" });
  }
});

/* =========================
   FONDEOS (vienen de egresos)
   ========================= */

router.get("/fondeos", async (req, res) => {
  try {
    const estado = String(req.query.estado || "");
    const cuentaId = idParam(req.query.cuenta_id);
    let fondeos = await leerFondeos();
    if (ESTADOS_FONDEO.has(estado)) fondeos = fondeos.filter((f) => f.estado === estado);
    if (cuentaId) fondeos = fondeos.filter((f) => f.cuenta_id === cuentaId);
    return res.json({ fondeos });
  } catch (e) {
    console.error("arq fondeos:", e.message);
    return res.status(500).json({ message: "No pude leer los fondeos" });
  }
});

// Completa lo que el egreso no dice: la cuenta, los USD acreditados o que no era un fondeo.
router.put("/fondeos/:egresoId", async (req, res) => {
  try {
    const egresoId = idParam(req.params.egresoId);
    if (!egresoId) return res.status(400).json({ message: "Egreso inválido" });
    const fondeo = (await leerFondeos()).find((f) => f.egreso_id === egresoId);
    if (!fondeo) return res.status(404).json({ message: "Ese egreso no es un fondeo de cuenta ARQ" });

    const body = req.body || {};
    let cuentaId = null;
    if (body.cuenta_id != null && body.cuenta_id !== "") {
      cuentaId = idParam(body.cuenta_id);
      if (!cuentaId || !(await cuentaExiste(cuentaId))) return res.status(400).json({ message: "La cuenta no existe" });
    }
    let montoUsd = null;
    if (body.monto_usd != null && body.monto_usd !== "") {
      const c = montoCentavos(body.monto_usd);
      if (c == null || c <= 0) return res.status(400).json({ message: "Los USD acreditados tienen que ser un monto mayor a 0" });
      montoUsd = c / 100;
    }
    const descartado = !!body.descartado;

    await query(
      `INSERT INTO arq_fondeos (egreso_id, cuenta_id, monto_usd, descartado, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (egreso_id) DO UPDATE
       SET cuenta_id = EXCLUDED.cuenta_id, monto_usd = EXCLUDED.monto_usd,
           descartado = EXCLUDED.descartado, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [egresoId, cuentaId, montoUsd, descartado, req.user.id]
    );
    await auditLog(req, { action: "ARQ_FONDEO_SET", entity: "egresos", entity_id: egresoId, status_code: 200, details: { cuenta_id: cuentaId, monto_usd: montoUsd, descartado } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("arq fondeo set:", e.message);
    return res.status(500).json({ message: "No pude guardar el fondeo" });
  }
});

/* =========================
   MOVIMIENTOS (consumos, transferencias, ajustes)
   ========================= */

router.post("/movimientos", async (req, res) => {
  try {
    const { error, mov } = validarMovimiento(req.body || {});
    if (error) return res.status(400).json({ message: error });
    const refError = await verificarReferencias(mov);
    if (refError) return res.status(400).json({ message: refError });

    const { rows } = await query(
      `INSERT INTO arq_movimientos
         (tipo, cuenta_id, cuenta_destino_id, tarjeta_id, servicio, fecha, hora,
          monto_usd, moneda_origen, monto_origen, notas, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [mov.tipo, mov.cuenta_id, mov.cuenta_destino_id, mov.tarjeta_id, mov.servicio, mov.fecha, mov.hora,
        mov.monto_usd, mov.moneda_origen, mov.monto_origen, mov.notas, req.user.id]
    );
    if (mov.servicio) {
      await query(`INSERT INTO arq_servicios (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`, [mov.servicio]);
    }
    await auditLog(req, { action: "ARQ_MOVIMIENTO_CREATE", entity: "arq_movimientos", entity_id: rows[0].id, status_code: 201, details: mov });
    return res.status(201).json({ id: Number(rows[0].id) });
  } catch (e) {
    console.error("arq movimiento create:", e.message);
    return res.status(500).json({ message: "No pude guardar el movimiento" });
  }
});

router.put("/movimientos/:id", async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ message: "Movimiento inválido" });
    const { error, mov } = validarMovimiento(req.body || {});
    if (error) return res.status(400).json({ message: error });
    const refError = await verificarReferencias(mov);
    if (refError) return res.status(400).json({ message: refError });

    const { rowCount } = await query(
      `UPDATE arq_movimientos
       SET tipo = $1, cuenta_id = $2, cuenta_destino_id = $3, tarjeta_id = $4, servicio = $5,
           fecha = $6, hora = $7, monto_usd = $8, moneda_origen = $9, monto_origen = $10, notas = $11,
           updated_by = $12, updated_at = NOW()
       WHERE id = $13 AND status = 'activo'`,
      [mov.tipo, mov.cuenta_id, mov.cuenta_destino_id, mov.tarjeta_id, mov.servicio, mov.fecha, mov.hora,
        mov.monto_usd, mov.moneda_origen, mov.monto_origen, mov.notas, req.user.id, id]
    );
    if (!rowCount) return res.status(404).json({ message: "El movimiento no existe o está anulado" });
    if (mov.servicio) {
      await query(`INSERT INTO arq_servicios (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING`, [mov.servicio]);
    }
    await auditLog(req, { action: "ARQ_MOVIMIENTO_UPDATE", entity: "arq_movimientos", entity_id: id, status_code: 200, details: mov });
    return res.json({ ok: true });
  } catch (e) {
    console.error("arq movimiento update:", e.message);
    return res.status(500).json({ message: "No pude actualizar el movimiento" });
  }
});

router.post("/movimientos/:id/anular", async (req, res) => {
  try {
    const id = idParam(req.params.id);
    if (!id) return res.status(400).json({ message: "Movimiento inválido" });
    const motivo = texto(req.body?.motivo, 500);
    if (!motivo) return res.status(400).json({ message: "Contá por qué se anula" });
    const { rowCount } = await query(
      `UPDATE arq_movimientos
       SET status = 'anulado', motivo_anulacion = $1, anulado_por = $2, anulado_at = NOW()
       WHERE id = $3 AND status = 'activo'`,
      [motivo, req.user.id, id]
    );
    if (!rowCount) return res.status(404).json({ message: "El movimiento no existe o ya estaba anulado" });
    await auditLog(req, { action: "ARQ_MOVIMIENTO_ANULAR", entity: "arq_movimientos", entity_id: id, status_code: 200, details: { motivo } });
    return res.json({ ok: true });
  } catch (e) {
    console.error("arq movimiento anular:", e.message);
    return res.status(500).json({ message: "No pude anular el movimiento" });
  }
});

export default router;
