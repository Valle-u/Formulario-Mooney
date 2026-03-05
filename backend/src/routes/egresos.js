import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import { query } from "../config/db.js";
import { auth, requireAdminOrDireccion, requireAdmin } from "../middleware/auth.js";
import { validateUploadedFile } from "../middleware/fileValidator.js";
import {
  EMPRESAS_SALIDA,
  ETIQUETAS_CON_USUARIO_CASINO,
  ETIQUETAS_PREMIO_MINIMO,
  ETIQUETAS_CIERRE_CAJA,
  isFutureDateISO,
  parseMontoARSStrict,
  montoToCommaString,
  requireNonEmpty,
  getEtiquetasEquivalentes
} from "../utils/validators.js";
import { toCSV, withBOM } from "../utils/csv.js";
import { auditLog } from "../utils/audit.js";

// Almacenamiento de comprobantes
import { uploadToImgBB, isImgBBConfigured } from "../config/imgbb.js";

// Notificaciones en tiempo real
import { sendNotification } from "./notifications.js";

 const router = express.Router();

const SALDOS_CACHE_TTL_MS = Number(process.env.SALDOS_CACHE_TTL_MS || 15000);
const SALDOS_CACHE_MAX_ENTRIES = Number(process.env.SALDOS_CACHE_MAX_ENTRIES || 100);
const saldosCache = new Map();

function buildSaldosCacheKey({ empresa, moneda, cuenta, mes, anio }) {
  return [empresa || "*", moneda || "*", cuenta || "*", String(mes), String(anio)].join("|");
}

function getSaldosCache(cacheKey) {
  const item = saldosCache.get(cacheKey);
  if (!item) return null;
  if ((Date.now() - item.ts) > SALDOS_CACHE_TTL_MS) {
    saldosCache.delete(cacheKey);
    return null;
  }
  return item.payload;
}

function setSaldosCache(cacheKey, payload) {
  if (saldosCache.size >= SALDOS_CACHE_MAX_ENTRIES) {
    const firstKey = saldosCache.keys().next().value;
    if (firstKey) saldosCache.delete(firstKey);
  }
  saldosCache.set(cacheKey, { ts: Date.now(), payload });
}

function clearSaldosCache() {
  if (saldosCache.size) saldosCache.clear();
}

const TURNOS_CIERRE = ["Turno mañana", "Turno tarde", "Turno noche"];
const TURNOS_CIERRE_ORDER = {
  "Turno mañana": 1,
  "Turno tarde": 2,
  "Turno noche": 3
};

function normalizeTurnoLabel(turnoValue) {
  const raw = String(turnoValue || "").trim();
  const lower = raw.toLowerCase();

  if (lower === "turno manana" || lower === "turno mañana") return "Turno mañana";
  if (lower === "turno tarde") return "Turno tarde";
  if (lower === "turno noche") return "Turno noche";

  return raw;
}

function localDateToISO(dateObj) {
  if (!(dateObj instanceof Date) || Number.isNaN(dateObj.getTime())) return null;
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toISODateOnly(value) {
  if (!value) return null;

  if (value instanceof Date) return localDateToISO(value);

  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];

  const parsed = normalizeFecha(text, { enforceCurrentYear: false });
  if (parsed.valid) return parsed.fecha;

  return null;
}

function shiftISODate(isoDate, deltaDays) {
  const dateObj = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(dateObj.getTime())) return isoDate;
  dateObj.setDate(dateObj.getDate() + deltaDays);
  return localDateToISO(dateObj);
}

async function findDuplicateCierreSlot({ fecha, turno, empresaSalida, cuentaSalida, moneda, excludeId = null }) {
  const params = [fecha, turno, empresaSalida, cuentaSalida, moneda];
  let excludeSql = "";

  if (excludeId !== null && excludeId !== undefined) {
    params.push(excludeId);
    excludeSql = ` AND id <> $${params.length}`;
  }

  return query(
    `SELECT id, fecha, turno, empresa_salida, cuenta_salida, moneda, monto, created_at
       FROM egresos
      WHERE etiqueta = 'Cierre de Caja'
        AND status <> 'anulado'
        AND fecha = $1::date
        AND turno = $2
        AND empresa_salida = $3
        AND cuenta_salida = $4
        AND moneda = $5
        ${excludeSql}
      ORDER BY created_at DESC, id DESC
      LIMIT 1`,
    params
  );
}

// GET distinct empresas (for saldos filter)
router.get("/distinct-empresas", auth, async (req, res) => {
  try {
    const result = await query("SELECT DISTINCT empresa_salida FROM egresos WHERE status NOT IN ('anulado') ORDER BY empresa_salida", []);
    const empresas = result.rows.map(r => r.empresa_salida);
    return res.json({ empresas });
  } catch (error) {
    console.error("Error obteniendo empresas distintas:", error);
    return res.status(500).json({ message: "Error obteniendo empresas" });
  }
});

// GET cuentas por empresa (para dividir por cuentas de una empresa)
router.get("/cuentas", auth, async (req, res) => {
  try {
    const { empresa_salida, moneda } = req.query;
    if (!empresa_salida) {
      return res.status(400).json({ message: "Parámetro 'empresa_salida' requerido" });
    }
    let sql = "SELECT DISTINCT cuenta_salida FROM egresos WHERE empresa_salida = $1 AND status NOT IN ('anulado')";
    const params = [empresa_salida];
    if (moneda) {
      sql += ` AND moneda = $${params.length + 1}`;
      params.push(moneda.toUpperCase());
    }
    const r = await query(sql, params);
    const cuentas = r.rows.map(row => row.cuenta_salida);
    return res.json({ cuentas });
  } catch (error) {
    console.error("Error obteniendo cuentas por empresa:", error);
    return res.status(500).json({ message: "Error obteniendo cuentas" });
  }
});
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 10);

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function isDigitsOnly(v){ return /^[0-9]+$/.test(String(v || "").trim()); }

/**
 * Convierte fecha ISO (aaaa-mm-dd) o Date a formato dd/mm/aaaa
 */
function formatFechaDDMMAAAA(fecha) {
  if (!fecha) return null;

  let dateObj;
  if (fecha instanceof Date) {
    dateObj = fecha;
  } else if (typeof fecha === 'string') {
    // Formato ISO aaaa-mm-dd
    const match = fecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [_, anio, mes, dia] = match;
      return `${dia}/${mes}/${anio}`;
    }
    dateObj = new Date(fecha);
  } else {
    return null;
  }

  if (isNaN(dateObj.getTime())) return null;

  const dia = String(dateObj.getDate()).padStart(2, '0');
  const mes = String(dateObj.getMonth() + 1).padStart(2, '0');
  const anio = dateObj.getFullYear();

  return `${dia}/${mes}/${anio}`;
}

function normalizeHoraToTime(hora) {
  const h = String(hora || "").trim();
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(h)) return null;
  const [HH, MM, SS = "00"] = h.split(":");
  const hh = Number(HH), mm = Number(MM), ss = Number(SS);
  if (![hh, mm, ss].every(Number.isFinite)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;
  return `${HH.padStart(2,"0")}:${MM.padStart(2,"0")}:${SS.padStart(2,"0")}`;
}
function normalizeHoraOptional(hora){
  const v = String(hora || "").trim();
  if(!v) return null;
  return normalizeHoraToTime(v);
}

/**
 * Normaliza fecha de formato dd/mm/aaaa a ISO aaaa-mm-dd.
 * Valida fecha real y no futura.
 * Por defecto exige año actual (alta de egresos), pero puede relajarse en edición.
 * @returns {object} { valid: boolean, fecha: string|null, error: string|null }
 */
function normalizeFecha(fechaStr, { enforceCurrentYear = true, allowFuture = false } = {}) {
  const v = String(fechaStr || "").trim();

  // Intentar formato dd/mm/aaaa primero
  const regexSlash = /^(\d{2})\/(\d{2})\/(\d{4})$/;
  const matchSlash = v.match(regexSlash);

  if (matchSlash) {
    const [_, dia, mes, anio] = matchSlash;
    const diaNum = parseInt(dia, 10);
    const mesNum = parseInt(mes, 10);
    const anioNum = parseInt(anio, 10);

    // Validar año actual (solo cuando corresponde)
    const anioActual = new Date().getFullYear();
    if (enforceCurrentYear && anioNum !== anioActual) {
      return { valid: false, fecha: null, error: `La fecha debe ser del año ${anioActual}` };
    }

    // Validar mes
    if (mesNum < 1 || mesNum > 12) {
      return { valid: false, fecha: null, error: "Mes inválido" };
    }

    // Validar día
    const fecha = new Date(anioNum, mesNum - 1, diaNum);
    if (fecha.getDate() !== diaNum || fecha.getMonth() !== mesNum - 1 || fecha.getFullYear() !== anioNum) {
      return { valid: false, fecha: null, error: "Fecha inválida" };
    }

    // Validar no futura
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fecha.setHours(0, 0, 0, 0);
    if (!allowFuture && fecha > hoy) {
      return { valid: false, fecha: null, error: "No se permiten fechas futuras" };
    }

    // Convertir a ISO aaaa-mm-dd
    const fechaISO = `${anio}-${mes}-${dia}`;
    return { valid: true, fecha: fechaISO, error: null };
  }

  // Intentar formato ISO aaaa-mm-dd (por retrocompatibilidad)
  const regexISO = /^(\d{4})-(\d{2})-(\d{2})$/;
  const matchISO = v.match(regexISO);

  if (matchISO) {
    const [_, anio, mes, dia] = matchISO;
    const anioNum = parseInt(anio, 10);
    const mesNum = parseInt(mes, 10);
    const diaNum = parseInt(dia, 10);

    // Validar año actual (solo cuando corresponde)
    const anioActual = new Date().getFullYear();
    if (enforceCurrentYear && anioNum !== anioActual) {
      return { valid: false, fecha: null, error: `La fecha debe ser del año ${anioActual}` };
    }

    // Validar fecha válida
    const fecha = new Date(anioNum, mesNum - 1, diaNum);
    if (fecha.getDate() !== diaNum || fecha.getMonth() !== mesNum - 1) {
      return { valid: false, fecha: null, error: "Fecha inválida" };
    }

    // Validar no futura
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    fecha.setHours(0, 0, 0, 0);
    if (!allowFuture && fecha > hoy) {
      return { valid: false, fecha: null, error: "No se permiten fechas futuras" };
    }

    return { valid: true, fecha: v, error: null };
  }

  return { valid: false, fecha: null, error: "Formato de fecha inválido. Usá dd/mm/aaaa" };
}

// memoryStorage para subir a ImgBB o disco local como fallback
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "application/pdf"];
  if (!allowed.includes(file.mimetype)) return cb(new Error("Tipo de archivo no permitido"));
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });

/**
 * GET /api/egresos/check-id-transferencia
 * Verifica si un ID de transferencia ya existe para una empresa específica
 * Query params: empresa_salida, id_transferencia
 * Retorna: { exists: boolean, egreso: {...} | null }
 * IMPORTANTE: Debe estar ANTES del POST / para que Express lo matchee correctamente
 */
router.get("/check-id-transferencia", auth, async (req, res) => {
  try {
    const { empresa_salida, id_transferencia } = req.query;

    // Validar parámetros
    if (!empresa_salida || !id_transferencia) {
      return res.status(400).json({
        message: "Parámetros requeridos: empresa_salida, id_transferencia"
      });
    }

    // Validar empresa
    if (!EMPRESAS_SALIDA.includes(empresa_salida)) {
      return res.status(400).json({
        message: `Empresa inválida. Debe ser una de: ${EMPRESAS_SALIDA.join(", ")}`
      });
    }

    // Buscar si existe
    const result = await query(
      `SELECT id, fecha, monto, moneda, etiqueta, created_by, status
       FROM egresos
       WHERE empresa_salida = $1 AND id_transferencia = $2
       LIMIT 1`,
      [empresa_salida, id_transferencia]
    );

    if (result.rowCount === 0) {
      return res.json({
        exists: false,
        egreso: null
      });
    }

    const egreso = result.rows[0];

    return res.json({
      exists: true,
      egreso: {
        id: egreso.id,
        fecha: egreso.fecha,
        monto: egreso.monto,
        moneda: egreso.moneda,
        etiqueta: egreso.etiqueta,
        status: egreso.status,
        created_by: egreso.created_by
      }
    });

  } catch (error) {
    console.error("🔥 Error verificando ID de transferencia:", error);
    return res.status(500).json({ message: "Error verificando ID de transferencia" });
  }
});

router.post("/", auth, upload.single("comprobante"), validateUploadedFile, async (req, res) => {
  try {
    const dataStr = req.body?.data;
    if (!dataStr) return res.status(400).json({ message: "Falta campo data" });

    let data;
    try { data = JSON.parse(dataStr); }
    catch { return res.status(400).json({ message: "data JSON inválido" }); }

    const file = req.file;
    if (!file) return res.status(400).json({ message: "Comprobante obligatorio" });

    const {
      fecha, hora, turno,
      etiqueta, otro_concepto,
      monto_transferencia_raw,
      cuenta_receptora,
      usuario_casino,
      cuenta_salida,
      empresa_cuenta_salida,
      id_transferencia,
      notas,
      hora_solicitud_cliente,
      hora_quema_fichas,
      moneda,
      tipo_transaccion
    } = data;

    const errFecha = requireNonEmpty(fecha, "fecha");
    if (errFecha) return res.status(400).json({ message: errFecha });

    // Normalizar y validar fecha (acepta dd/mm/aaaa o aaaa-mm-dd)
    const fechaResult = normalizeFecha(fecha);
    if (!fechaResult.valid) {
      return res.status(400).json({ message: fechaResult.error });
    }
    const fechaNorm = fechaResult.fecha; // Fecha en formato ISO aaaa-mm-dd

    const errHora = requireNonEmpty(hora, "hora");
    if (errHora) return res.status(400).json({ message: errHora });

    const horaNorm = normalizeHoraToTime(hora);
    if (!horaNorm) return res.status(400).json({ message: "Hora inválida. Usá HH:MM" });

    const errEtiqueta = requireNonEmpty(etiqueta, "etiqueta");
    if (errEtiqueta) return res.status(400).json({ message: errEtiqueta });

    // Detectar si es cierre de caja
    const esCierreCaja = ETIQUETAS_CIERRE_CAJA.has(etiqueta);

    // Validar turno (ahora siempre obligatorio)
    const turnoNorm = normalizeTurnoLabel(String(turno || "").trim());
    if (!turnoNorm) {
      return res.status(400).json({ message: "Turno es obligatorio" });
    }

    if (etiqueta === "Otro" && !String(otro_concepto || "").trim()) {
      return res.status(400).json({ message: "Si etiqueta es 'Otro', otro_concepto es obligatorio" });
    }

    if (ETIQUETAS_CON_USUARIO_CASINO.has(etiqueta) && !String(usuario_casino || "").trim()) {
      return res.status(400).json({ message: "usuario_casino es obligatorio para ese concepto" });
    }

    // Normalizar id_transferencia: null explícito = sin ID (checkbox "Sin ID")
    const idTrim = id_transferencia === null ? null : String(id_transferencia || "").trim() || null;

    // Para cierre de caja, cuenta_receptora e id_transferencia NO son obligatorios
    if (!esCierreCaja) {
      if (requireNonEmpty(cuenta_receptora, "cuenta_receptora")) return res.status(400).json({ message: "cuenta_receptora es obligatoria" });

      // id_transferencia puede ser null (checkbox "Sin ID") o un valor alfanumérico válido
      if (idTrim !== null && !/^[a-zA-Z0-9\-_]+$/.test(idTrim)) {
        return res.status(400).json({ message: "ID TRANSFERENCIA inválido: solo letras, números, guiones y guiones bajos" });
      }
    }

    // Cuenta salida y empresa son siempre obligatorias
    if (requireNonEmpty(cuenta_salida, "cuenta_salida")) return res.status(400).json({ message: "cuenta_salida es obligatoria" });

    if (requireNonEmpty(empresa_cuenta_salida, "empresa_cuenta_salida")) return res.status(400).json({ message: "empresa_cuenta_salida es obligatoria" });
    if (!EMPRESAS_SALIDA.includes(empresa_cuenta_salida)) return res.status(400).json({ message: "empresa_salida inválida" });

    // Validar moneda primero (antes de validar monto mínimo)
    const monedaNorm = String(moneda || "ARS").trim().toUpperCase();
    if (!["USD", "ARS", "USDT"].includes(monedaNorm)) {
      return res.status(400).json({ message: "Moneda inválida. Debe ser USD, ARS o USDT" });
    }

    // Validar tipo_transaccion
    const tipoTransaccion = String(tipo_transaccion || "SALIDA").trim().toUpperCase();
    if (!["ENTRADA", "SALIDA"].includes(tipoTransaccion)) {
      return res.status(400).json({ message: "tipo_transaccion inválido. Debe ser ENTRADA o SALIDA" });
    }

    // Validación: ARS solo puede ser ENTRADA para "[Unidad M] Deposito de cliente"
    if (monedaNorm === "ARS" && tipoTransaccion === "ENTRADA") {
      if (etiqueta !== "[Unidad M] Deposito de cliente") {
        return res.status(400).json({ message: "Transacciones ARS solo pueden ser ENTRADA para 'Deposito de cliente'" });
      }
    }

    // Validar turno para cierre de caja (sin límite de duplicados)
    if (esCierreCaja) {
      if (!TURNOS_CIERRE.includes(turnoNorm)) {
        return res.status(400).json({ message: "Turno inválido para cierre de caja" });
      }
    }

    const raw = (monto_transferencia_raw || "").trim();
    const montoNum = parseMontoARSStrict(raw);
    if (montoNum === null) return res.status(400).json({ message: "Monto inválido" });
    if (montoNum <= 0) return res.status(400).json({ message: "Monto debe ser mayor a 0" });

    // Validar horas de premio - OBLIGATORIAS para etiquetas con usuario_casino
    const hsNorm = normalizeHoraOptional(hora_solicitud_cliente);
    const hqNorm = normalizeHoraOptional(hora_quema_fichas);

    if (ETIQUETAS_CON_USUARIO_CASINO.has(etiqueta)) {
      // Para premios, ambas horas son OBLIGATORIAS
      if (!String(hora_solicitud_cliente || "").trim()) {
        return res.status(400).json({ message: "Hora solicitud cliente es obligatoria para este concepto" });
      }
      if (!hsNorm) {
        return res.status(400).json({ message: "Hora solicitud cliente inválida. Usá HH:MM" });
      }

      if (!String(hora_quema_fichas || "").trim()) {
        return res.status(400).json({ message: "Hora quema de fichas es obligatoria para este concepto" });
      }
      if (!hqNorm) {
        return res.status(400).json({ message: "Hora quema de fichas inválida. Usá HH:MM" });
      }
    } else {
      // Para otros conceptos, si se proveen deben ser válidas
      if (String(hora_solicitud_cliente || "").trim() && !hsNorm) {
        return res.status(400).json({ message: "Hora solicitud cliente inválida. Usá HH:MM" });
      }
      if (String(hora_quema_fichas || "").trim() && !hqNorm) {
        return res.status(400).json({ message: "Hora quema de fichas inválida. Usá HH:MM" });
      }
    }

    // Subir archivo a ImgBB o guardar localmente como fallback
    let comprobanteUrl;
    const safe = file.originalname.replace(/[^\w.\-() ]+/g, "_");
    const fileName = `${Date.now()}_${safe}`;
    const fileNameWithoutExt = fileName.replace(/\.[^.]+$/, ''); // Sin extensión para ImgBB

    console.log(`📁 Archivo recibido: ${file.originalname}, Size: ${file.size} bytes, MIME: ${file.mimetype}`);

    // ImgBB (servicio principal)
    if (isImgBBConfigured()) {
      try {
        console.log(`☁️ Intentando subir a ImgBB: ${fileName}`);
        comprobanteUrl = await uploadToImgBB(file.buffer, fileNameWithoutExt, file.mimetype);
        console.log(`✅ Comprobante subido a ImgBB: ${fileName} -> ${comprobanteUrl}`);
      } catch (error) {
        console.error('❌ Error subiendo a ImgBB:', error);
        console.warn('⚠️ ImgBB falló, usando almacenamiento local como fallback...');
      }
    }

    // Fallback: Guardar en disco local (si ImgBB falló o no está configurado)
    if (!comprobanteUrl) {
      try {
        console.log(`💾 Guardando localmente en: ${UPLOAD_DIR}/${fileName}`);
        console.warn('⚠️  ADVERTENCIA: Guardando archivo localmente. Esto NO es recomendado en SeeNode.');
        console.warn('⚠️  Configura IMGBB_API_KEY para usar almacenamiento externo.');

        // Asegurar que el directorio existe
        if (!fs.existsSync(UPLOAD_DIR)) {
          fs.mkdirSync(UPLOAD_DIR, { recursive: true });
          console.log(`📂 Directorio creado: ${UPLOAD_DIR}`);
        }

        const filePath = path.join(UPLOAD_DIR, fileName);
        fs.writeFileSync(filePath, file.buffer);

        const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 4000}`;
        comprobanteUrl = `${baseUrl}/${UPLOAD_DIR}/${encodeURIComponent(fileName)}`;
        console.log(`✅ Comprobante guardado localmente: ${filePath} -> ${comprobanteUrl}`);
      } catch (error) {
        console.error('❌ Error guardando archivo localmente:', error);
        console.error('Error details:', error.message, error.stack);
        return res.status(500).json({ message: `Error al guardar comprobante: ${error.message}` });
      }
    }

    const insert = await query(
      `INSERT INTO egresos
        (fecha,hora,turno,etiqueta,etiqueta_otro,monto_raw,monto,
         cuenta_receptora,usuario_casino,cuenta_salida,empresa_salida,id_transferencia,
         comprobante_url,comprobante_filename,comprobante_mime,comprobante_size,
         notas,created_by,
         hora_solicitud_cliente,hora_quema_fichas,moneda,tipo_transaccion)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,$11,$12,
         $13,$14,$15,$16,
         $17,$18,
         $19,$20,$21,$22)
       RETURNING id`,
      [
        fechaNorm, // Fecha normalizada en formato ISO
        horaNorm,
        turnoNorm, // Turno ahora siempre obligatorio
        etiqueta,
        etiqueta === "Otro" ? String(otro_concepto || "").trim() : null,
        raw,
        montoNum,
        esCierreCaja ? null : String(cuenta_receptora || "").trim(),
        String(usuario_casino || "").trim() || null,
        String(cuenta_salida || "").trim(),
        empresa_cuenta_salida,
        esCierreCaja ? null : idTrim,
        comprobanteUrl,
        file.originalname,
        file.mimetype,
        file.size,
        String(notas || "").trim() || null,
        req.user.id,
        hsNorm,
        hqNorm,
        monedaNorm,
        tipoTransaccion
      ]
    );

    const egresoId = insert.rows[0].id;

    await auditLog(req, {
      action: "EGRESO_CREATE",
      entity: "egresos",
      entity_id: egresoId,
      success: true,
      status_code: 201,
      details: {
        id_transferencia: idTrim,
        empresa_salida: empresa_cuenta_salida,
        monto: montoNum,
        etiqueta
      }
    });

    // Enviar notificación en tiempo real a otros usuarios
    try {
      const creatorName = req.user.username || 'Usuario';
      const creatorRole = req.user.role || 'empleado';

      // Determinar quién debe recibir la notificación según el rol del creador
      let targetRoles = null;
      if (creatorRole === 'empleado') {
        // Si un empleado crea un egreso, notificar a encargados, dirección y admin
        targetRoles = ['encargado', 'direccion', 'admin'];
      } else if (creatorRole === 'encargado') {
        // Si un encargado crea un egreso, notificar a dirección y admin
        targetRoles = ['direccion', 'admin'];
      }
      // Si es admin o dirección, no notificar a nadie (ellos pueden ver todo)

      if (targetRoles) {
        sendNotification({
          type: 'egreso_created',
          title: 'Nuevo egreso registrado',
          message: `${creatorName} registró un egreso de $${montoToCommaString(montoNum)} ${monedaNorm} (${etiqueta})`,
          category: 'success',
          data: {
            egreso_id: egresoId,
            monto: montoNum,
            moneda: monedaNorm,
            etiqueta,
            created_by: creatorName
          }
        }, null, targetRoles);
      }
    } catch (notifError) {
      console.error('Error enviando notificación:', notifError);
      // No fallar la creación del egreso si falla la notificación
    }

    clearSaldosCache();
    return res.status(201).json({ id: egresoId, message: "ok" });
  } catch (e) {
    console.error("🔥 POST /api/egresos ERROR:", e);

    // log fallo
    try{
      await auditLog(req, {
        action: "EGRESO_CREATE_FAIL",
        entity: "egresos",
        entity_id: null,
        success: false,
        status_code: e?.code === "23505" ? 409 : (e?.code === "23514" ? 400 : 500),
        details: { pg_code: e?.code || null }
      });
    }catch{}

    if (e?.code === "23505") return res.status(409).json({ message: "Duplicado: ya existe un egreso con ese ID para esa empresa" });
    if (e?.code === "23514") return res.status(400).json({ message: "Datos inválidos: revisá TURNO/ID/MONTO" });

    if (String(e?.message || "").includes("File too large")) return res.status(400).json({ message: `Archivo muy grande. Máx ${MAX_UPLOAD_MB}MB` });
    if (String(e?.message || "").includes("Tipo de archivo")) return res.status(400).json({ message: "Solo se permite JPG/PNG/PDF" });

    return res.status(500).json({ message: "Error guardando egreso" });
  }
});

// ═══════════════════════════════════════════════════
// HELPER: Calcular saldos de un mes dado
// ═══════════════════════════════════════════════════
async function computeSaldos({ empresa, moneda, cuenta, mes, anio, includeBreakdown = true }) {
  // Robustly derive month/year for filtering
  const mm = Number.isFinite(Number(mes)) ? Number(mes) : (new Date()).getMonth() + 1;
  const aa = Number.isFinite(Number(anio)) ? Number(anio) : new Date().getFullYear();
  const mesStr = String(mm).padStart(2, "0");
  const anioStr = String(aa);
  const primerDiaMesISO = `${anioStr}-${mesStr}-01`;

  const next = new Date(aa, mm, 1);
  const nextMesStr = String(next.getMonth() + 1).padStart(2, "0");
  const nextAnioStr = String(next.getFullYear());
  const primerDiaMesSiguienteISO = `${nextAnioStr}-${nextMesStr}-01`;

  // Construir filtros comunes
  const baseParams = [];
  let commonFilter = "";

  if (empresa) {
    baseParams.push(empresa);
    commonFilter += ` AND empresa_salida = $${baseParams.length}`;
  }
  if (moneda) {
    baseParams.push(moneda.toUpperCase());
    commonFilter += ` AND moneda = $${baseParams.length}`;
  }
  if (cuenta) {
    baseParams.push(cuenta);
    commonFilter += ` AND cuenta_salida = $${baseParams.length}`;
  }

  const nextIdx = baseParams.length + 1;

  // Función SQL reutilizable para parsear fecha de forma segura
  // Filtra filas con fechas inválidas (NULL, vacías, formato desconocido)
  const FECHA_VALIDA = `(fecha IS NOT NULL AND fecha::text <> '' AND (fecha::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR fecha::text ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$'))`;
  const PARSE_FECHA = `(CASE WHEN fecha::text ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN TO_DATE(fecha::text, 'YYYY-MM-DD') ELSE TO_DATE(fecha::text, 'DD/MM/YYYY') END)`;

  // 1) Cierre de Caja anterior al mes seleccionado
  const cierreSql = `
    WITH base AS (
      SELECT
        empresa_salida,
        cuenta_salida,
        moneda,
        monto,
        ${PARSE_FECHA} AS fecha_parsed
      FROM egresos
      WHERE status <> 'anulado'
        AND etiqueta = 'Cierre de Caja'
        AND ${FECHA_VALIDA}
        ${commonFilter}
    )
    SELECT DISTINCT ON (empresa_salida, cuenta_salida, moneda)
      empresa_salida,
      cuenta_salida,
      moneda,
      monto
    FROM base
    WHERE fecha_parsed < $${nextIdx}::date
    ORDER BY empresa_salida, cuenta_salida, moneda, fecha_parsed DESC
  `;
  const cierreResult = await query(cierreSql, [...baseParams, primerDiaMesISO]);

  const cierreMap = {};
  cierreResult.rows.forEach(r => {
    cierreMap[`${r.empresa_salida}|${r.cuenta_salida}|${r.moneda}`] = Number(r.monto);
  });

  // 2) Movimientos del mes (con o sin desglose por etiqueta)
  const movSql = includeBreakdown
    ? `
      WITH base AS (
        SELECT
          empresa_salida,
          cuenta_salida,
          moneda,
          etiqueta,
          tipo_transaccion,
          monto,
          created_at,
          ${PARSE_FECHA} AS fecha_parsed
        FROM egresos
        WHERE status <> 'anulado'
          AND etiqueta != 'Cierre de Caja'
          AND ${FECHA_VALIDA}
          ${commonFilter}
      )
      SELECT
        empresa_salida,
        cuenta_salida,
        moneda,
        etiqueta,
        COALESCE(SUM(CASE WHEN tipo_transaccion = 'ENTRADA' THEN monto END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo_transaccion = 'SALIDA' THEN monto END), 0) AS salidas,
        MAX(created_at) AS ultima_transaccion,
        COUNT(*) AS cnt
      FROM base
      WHERE fecha_parsed >= $${nextIdx}::date
        AND fecha_parsed < $${nextIdx + 1}::date
      GROUP BY empresa_salida, cuenta_salida, moneda, etiqueta
      ORDER BY empresa_salida, cuenta_salida, moneda, salidas DESC
    `
    : `
      WITH base AS (
        SELECT
          empresa_salida,
          cuenta_salida,
          moneda,
          tipo_transaccion,
          monto,
          created_at,
          ${PARSE_FECHA} AS fecha_parsed
        FROM egresos
        WHERE status <> 'anulado'
          AND etiqueta != 'Cierre de Caja'
          AND ${FECHA_VALIDA}
          ${commonFilter}
      )
      SELECT
        empresa_salida,
        cuenta_salida,
        moneda,
        COALESCE(SUM(CASE WHEN tipo_transaccion = 'ENTRADA' THEN monto END), 0) AS entradas,
        COALESCE(SUM(CASE WHEN tipo_transaccion = 'SALIDA' THEN monto END), 0) AS salidas,
        MAX(created_at) AS ultima_transaccion,
        COUNT(*) AS cnt
      FROM base
      WHERE fecha_parsed >= $${nextIdx}::date
        AND fecha_parsed < $${nextIdx + 1}::date
      GROUP BY empresa_salida, cuenta_salida, moneda
      ORDER BY empresa_salida, cuenta_salida, moneda
    `;

  const movResult = await query(movSql, [...baseParams, primerDiaMesISO, primerDiaMesSiguienteISO]);

  // 3) Combinar: construir cuentasMap con desglose
  const cuentasMap = {};

  // Cuentas con cierre previo (pueden no tener movimientos este mes)
  for (const [key, inicioCaja] of Object.entries(cierreMap)) {
    const [emp, cta, mon] = key.split("|");
    cuentasMap[key] = {
      empresa_salida: emp,
      cuenta_salida: cta,
      moneda: mon,
      inicio_caja: inicioCaja,
      tiene_cierre_previo: true,
      total_entradas: 0,
      total_salidas: 0,
      saldo: inicioCaja,
      ultima_transaccion: null,
      total_transacciones: 0,
      desglose_etiquetas: []
    };
  }

  // Agregar movimientos (agrupados por etiqueta → agregar a cuenta)
  movResult.rows.forEach(r => {
    const key = `${r.empresa_salida}|${r.cuenta_salida}|${r.moneda}`;
    const entradas = Number(r.entradas);
    const salidas = Number(r.salidas);
    const cnt = Number(r.cnt);

    if (!cuentasMap[key]) {
      const inicioCaja = cierreMap[key] || 0;
      cuentasMap[key] = {
        empresa_salida: r.empresa_salida,
        cuenta_salida: r.cuenta_salida,
        moneda: r.moneda,
        inicio_caja: inicioCaja,
        tiene_cierre_previo: !!cierreMap[key],
        total_entradas: 0,
        total_salidas: 0,
        saldo: inicioCaja,
        ultima_transaccion: null,
        total_transacciones: 0,
        desglose_etiquetas: []
      };
    }

    const c = cuentasMap[key];
    c.total_entradas += entradas;
    c.total_salidas += salidas;
    c.total_transacciones += cnt;
    if (r.ultima_transaccion && (!c.ultima_transaccion || r.ultima_transaccion > c.ultima_transaccion)) {
      c.ultima_transaccion = r.ultima_transaccion;
    }

    // Desglose por etiqueta (solo si fue solicitado)
    if (includeBreakdown) {
      c.desglose_etiquetas.push({
        etiqueta: r.etiqueta,
        entradas,
        salidas,
        total: entradas + salidas,
        count: cnt
      });
    }
  });

  // Calcular saldo final y ordenar desglose
  for (const c of Object.values(cuentasMap)) {
    c.saldo = c.inicio_caja + c.total_entradas - c.total_salidas;
    if (includeBreakdown) {
      c.desglose_etiquetas.sort((a, b) => b.total - a.total);
    }
  }

  const saldos = Object.values(cuentasMap).sort((a, b) => {
    if (a.moneda !== b.moneda) return a.moneda.localeCompare(b.moneda);
    if (a.empresa_salida !== b.empresa_salida) return a.empresa_salida.localeCompare(b.empresa_salida);
    return a.cuenta_salida.localeCompare(b.cuenta_salida);
  });

  return { saldos, periodo: { mes: mm, anio: aa } };
}

function parsePeriodoQuery(req) {
  const now = new Date();
  const mesRaw = req.query.mes;
  const anioRaw = req.query.anio;

  let mes = Number.parseInt(mesRaw, 10);
  let anio = Number.parseInt(anioRaw, 10);

  if (!Number.isInteger(mes)) mes = now.getMonth() + 1;
  if (!Number.isInteger(anio)) anio = now.getFullYear();

  if (mes < 1 || mes > 12) {
    const err = new Error("Mes inválido. Debe estar entre 1 y 12");
    err.status = 400;
    throw err;
  }
  if (anio < 2020 || anio > 2100) {
    const err = new Error("Año inválido");
    err.status = 400;
    throw err;
  }

  return { mes, anio };
}

function parseFechaQueryFlexible(rawValue, fallbackISO, fieldName) {
  if (!rawValue) return fallbackISO;

  const parsed = normalizeFecha(String(rawValue), { enforceCurrentYear: false, allowFuture: true });
  if (!parsed.valid) {
    const err = new Error(`${fieldName} inválida: ${parsed.error}`);
    err.status = 400;
    throw err;
  }

  return parsed.fecha;
}

function buildISODateRange(fechaDesdeISO, fechaHastaISO) {
  const from = new Date(`${fechaDesdeISO}T00:00:00`);
  const to = new Date(`${fechaHastaISO}T00:00:00`);
  const out = [];

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return out;

  const cursor = new Date(from.getTime());
  while (cursor <= to) {
    out.push(localDateToISO(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

// GET /api/egresos/saldos - Obtener saldos de cuentas con lógica de cierre mensual
// Solo Admin puede ver saldos
// Parámetros: empresa, moneda, cuenta, mes (1-12), anio (YYYY)
router.get("/saldos", auth, requireAdmin, async (req, res) => {
  try {
    const routeStart = Date.now();
    const { empresa, moneda, cuenta } = req.query;
    const { mes, anio } = parsePeriodoQuery(req);

    const cacheKey = buildSaldosCacheKey({ empresa, moneda, cuenta, mes, anio });
    const cached = getSaldosCache(cacheKey);
    if (cached) {
      return res.json(cached);
    }

    // Calcular saldos del mes actual y anterior en paralelo
    let prevMes = mes - 1;
    let prevAnio = anio;
    if (prevMes < 1) { prevMes = 12; prevAnio--; }

    const [current, prev] = await Promise.all([
      computeSaldos({ empresa, moneda, cuenta, mes, anio, includeBreakdown: true }),
      computeSaldos({ empresa, moneda, cuenta, mes: prevMes, anio: prevAnio, includeBreakdown: false })
    ]);

    // Mapear saldos anteriores por clave
    const prevMap = {};
    prev.saldos.forEach(s => {
      prevMap[`${s.empresa_salida}|${s.cuenta_salida}|${s.moneda}`] = s.saldo;
    });

    // Agregar comparación a cada cuenta
    current.saldos.forEach(s => {
      const key = `${s.empresa_salida}|${s.cuenta_salida}|${s.moneda}`;
      const prevSaldo = prevMap[key];
      if (prevSaldo !== undefined) {
        s.saldo_anterior = prevSaldo;
        s.diferencia = s.saldo - prevSaldo;
        s.diferencia_pct = prevSaldo !== 0
          ? Math.round(((s.saldo - prevSaldo) / Math.abs(prevSaldo)) * 1000) / 10
          : null;
      } else {
        s.saldo_anterior = null;
        s.diferencia = null;
        s.diferencia_pct = null;
      }
    });

    // Totales por moneda (sin duplicar payload)
    const totales = current.saldos.reduce((acc, r) => {
      const key = String(r.moneda || "").toUpperCase();
      if (!acc[key]) acc[key] = 0;
      acc[key] += Number(r.saldo || 0);
      return acc;
    }, { ARS: 0, USD: 0, USDT: 0 });

    const payload = {
      saldos: current.saldos,
      totales,
      periodo: current.periodo
    };

    setSaldosCache(cacheKey, payload);

    const durationMs = Date.now() - routeStart;
    if (durationMs > 700) {
      console.log(`Query saldos lenta (${durationMs}ms)`, { empresa, moneda, cuenta, mes, anio, cuentas: current.saldos.length });
    }

    return res.json(payload);
  } catch (error) {
    console.error("Error obteniendo saldos:", error);
    if (error?.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    // Devolver detalle del error (solo admin puede ver saldos)
    return res.status(500).json({
      message: "Error obteniendo saldos",
      detail: error?.message || "Error desconocido",
      code: error?.code || null
    });
  }
});

// GET /api/egresos/saldos/csv - Exportar saldos a CSV
router.get("/saldos/csv", auth, requireAdmin, async (req, res) => {
  try {
    const { empresa, moneda, cuenta } = req.query;
    const { mes, anio } = parsePeriodoQuery(req);

    const { saldos } = await computeSaldos({ empresa, moneda, cuenta, mes, anio, includeBreakdown: false });

    const columns = ["Empresa", "Cuenta", "Moneda", "Inicio Caja", "Entradas", "Salidas", "Balance", "Cant. Operaciones"];
    const rows = saldos.map(s => [
      s.empresa_salida,
      s.cuenta_salida,
      s.moneda,
      s.inicio_caja.toFixed(2),
      s.total_entradas.toFixed(2),
      s.total_salidas.toFixed(2),
      s.saldo.toFixed(2),
      s.total_transacciones
    ]);

    const mesStr = String(mes).padStart(2, "0");
    const csv = withBOM(toCSV({ columns, rows }));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="saldos_${mesStr}_${anio}.csv"`);
    return res.send(csv);
  } catch (error) {
    console.error("Error exportando saldos CSV:", error);
    if (error?.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Error exportando saldos" });
  }
});

// GET /api/egresos/cierres/kpi - Cobertura de cierres por dia/turno (3 slots por dia)
router.get("/cierres/kpi", auth, async (req, res) => {
  try {
    const todayISO = localDateToISO(new Date());
    const defaultDesde = shiftISODate(todayISO, -2);

    const fechaDesde = parseFechaQueryFlexible(req.query.fecha_desde, defaultDesde, "fecha_desde");
    const fechaHasta = parseFechaQueryFlexible(req.query.fecha_hasta, todayISO, "fecha_hasta");

    if (fechaDesde > fechaHasta) {
      return res.status(400).json({ message: "fecha_desde no puede ser mayor que fecha_hasta" });
    }

    const fromDate = new Date(`${fechaDesde}T00:00:00`);
    const toDate = new Date(`${fechaHasta}T00:00:00`);
    const totalDays = Math.floor((toDate - fromDate) / 86400000) + 1;
    if (totalDays < 1 || totalDays > 31) {
      return res.status(400).json({ message: "El rango de fechas debe estar entre 1 y 31 dias" });
    }

    const empresaSalida = String(req.query.empresa_salida || "").trim();
    const moneda = String(req.query.moneda || "").trim().toUpperCase();

    if (empresaSalida && !EMPRESAS_SALIDA.includes(empresaSalida)) {
      return res.status(400).json({ message: "empresa_salida inválida" });
    }
    if (moneda && !["ARS", "USD", "USDT"].includes(moneda)) {
      return res.status(400).json({ message: "Moneda inválida. Debe ser ARS, USD o USDT" });
    }

    const cierreWhere = [
      "e.etiqueta = 'Cierre de Caja'",
      "e.status <> 'anulado'",
      "e.fecha >= $1::date",
      "e.fecha <= $2::date"
    ];
    const cierreParams = [fechaDesde, fechaHasta];

    if (empresaSalida) {
      cierreParams.push(empresaSalida);
      cierreWhere.push(`e.empresa_salida = $${cierreParams.length}`);
    }
    if (moneda) {
      cierreParams.push(moneda);
      cierreWhere.push(`e.moneda = $${cierreParams.length}`);
    }

    const cierresResult = await query(
      `SELECT
          e.id,
          e.fecha,
          e.turno,
          e.empresa_salida,
          e.cuenta_salida,
          e.moneda,
          e.monto,
          e.monto_raw,
          e.hora,
          e.created_at,
          e.created_by,
          u.username AS created_by_username
       FROM egresos e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE ${cierreWhere.join(" AND ")}
       ORDER BY e.created_at DESC, e.id DESC`,
      cierreParams
    );

    const grouped = new Map();
    for (const c of cierresResult.rows) {
      const fechaISO = toISODateOnly(c.fecha);
      const turnoNorm = normalizeTurnoLabel(c.turno);
      if (!fechaISO || !TURNOS_CIERRE.includes(turnoNorm)) continue;

      const key = [fechaISO, turnoNorm].join("|");

      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push({
        id: c.id,
        monto: Number(c.monto || 0),
        monto_raw: c.monto_raw,
        hora: c.hora,
        empresa_salida: c.empresa_salida || null,
        cuenta_salida: c.cuenta_salida || null,
        moneda: String(c.moneda || "").toUpperCase() || null,
        created_at: c.created_at,
        created_by: c.created_by,
        created_by_username: c.created_by_username || null
      });
    }

    const fechas = buildISODateRange(fechaDesde, fechaHasta).reverse();
    const rows = [];
    const summary = { total: 0, pendientes: 0, ok: 0, duplicados: 0 };

    for (const fechaISO of fechas) {
      for (const turno of TURNOS_CIERRE) {
        const key = [fechaISO, turno].join("|");
        const hits = grouped.get(key) || [];

        let status = "PENDIENTE";
        if (hits.length === 1) status = "OK";
        if (hits.length > 1) status = "DUPLICADO";

        summary.total += 1;
        if (status === "PENDIENTE") summary.pendientes += 1;
        if (status === "OK") summary.ok += 1;
        if (status === "DUPLICADO") summary.duplicados += 1;

        rows.push({
          fecha: fechaISO,
          turno,
          status,
          count: hits.length,
          cierre: hits.length > 0 ? hits[0] : null,
          cierres: hits.slice(0, 3)
        });
      }
    }

    rows.sort((a, b) => {
      if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
      return (TURNOS_CIERRE_ORDER[a.turno] || 99) - (TURNOS_CIERRE_ORDER[b.turno] || 99);
    });

    return res.json({
      periodo: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta, total_dias: totalDays },
      filtros: {
        empresa_salida: empresaSalida || null,
        moneda: moneda || null
      },
      summary,
      rows
    });
  } catch (error) {
    console.error("Error obteniendo KPI de cierres:", error);
    if (error?.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Error obteniendo KPI de cierres" });
  }
});

// GET /api/egresos/cierres/csv - Exportar cierres de caja filtrados (incluye legacy)
router.get("/cierres/csv", auth, async (req, res) => {
  try {
    const todayISO = localDateToISO(new Date());
    const defaultDesde = shiftISODate(todayISO, -2);

    const fechaDesde = parseFechaQueryFlexible(req.query.fecha_desde, defaultDesde, "fecha_desde");
    const fechaHasta = parseFechaQueryFlexible(req.query.fecha_hasta, todayISO, "fecha_hasta");

    if (fechaDesde > fechaHasta) {
      return res.status(400).json({ message: "fecha_desde no puede ser mayor que fecha_hasta" });
    }

    const fromDate = new Date(`${fechaDesde}T00:00:00`);
    const toDate = new Date(`${fechaHasta}T00:00:00`);
    const totalDays = Math.floor((toDate - fromDate) / 86400000) + 1;
    if (totalDays < 1 || totalDays > 62) {
      return res.status(400).json({ message: "El rango de fechas para CSV debe estar entre 1 y 62 dias" });
    }

    const empresaSalida = String(req.query.empresa_salida || "").trim();
    const moneda = String(req.query.moneda || "").trim().toUpperCase();
    const turno = req.query.turno ? normalizeTurnoLabel(String(req.query.turno || "").trim()) : "";

    if (empresaSalida && !EMPRESAS_SALIDA.includes(empresaSalida)) {
      return res.status(400).json({ message: "empresa_salida inválida" });
    }
    if (moneda && !["ARS", "USD", "USDT"].includes(moneda)) {
      return res.status(400).json({ message: "Moneda inválida. Debe ser ARS, USD o USDT" });
    }
    if (turno && !TURNOS_CIERRE.includes(turno)) {
      return res.status(400).json({ message: "Turno inválido para cierre de caja" });
    }

    const where = [
      "LOWER(COALESCE(e.etiqueta, '')) LIKE '%cierre%caja%'",
      "COALESCE(e.status, 'activo') <> 'anulado'",
      "e.fecha >= $1::date",
      "e.fecha <= $2::date"
    ];
    const params = [fechaDesde, fechaHasta];

    if (empresaSalida) {
      params.push(empresaSalida);
      where.push(`e.empresa_salida = $${params.length}`);
    }
    if (moneda) {
      params.push(moneda);
      where.push(`e.moneda = $${params.length}`);
    }
    if (turno) {
      params.push(turno);
      where.push(`e.turno = $${params.length}`);
    }

    const r = await query(
      `SELECT
         e.id,
         e.fecha,
         to_char(e.hora, 'HH24:MI') AS hora,
         e.turno,
         e.empresa_salida,
         e.cuenta_salida,
         e.moneda,
         e.monto,
         e.monto_raw,
         to_char((e.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'DD/MM/YYYY HH24:MI:SS') AS created_at_ar,
         u.username AS created_by_username,
         e.comprobante_url
       FROM egresos e
       LEFT JOIN users u ON u.id = e.created_by
       WHERE ${where.join(" AND ")}
       ORDER BY e.fecha DESC,
                CASE e.turno
                  WHEN 'Turno mañana' THEN 1
                  WHEN 'Turno tarde' THEN 2
                  WHEN 'Turno noche' THEN 3
                  ELSE 99
                END,
                e.created_at DESC,
                e.id DESC`,
      params
    );

    const columns = [
      "id",
      "fecha",
      "turno",
      "hora",
      "empresa_salida",
      "cuenta_salida",
      "moneda",
      "monto",
      "monto_raw",
      "created_by_username",
      "created_at",
      "comprobante_url"
    ];

    const rows = r.rows.map((x) => ([
      x.id,
      formatFechaDDMMAAAA(x.fecha) || x.fecha,
      x.turno || "",
      x.hora || "",
      x.empresa_salida || "",
      x.cuenta_salida || "",
      x.moneda || "ARS",
      montoToCommaString(Number(x.monto)),
      x.monto_raw || "",
      x.created_by_username || "",
      x.created_at_ar || "",
      x.comprobante_url || ""
    ]));

    const csv = withBOM(toCSV({ columns, rows, delimiter: ";" }));

    const safeFrom = fechaDesde.replace(/-/g, "");
    const safeTo = fechaHasta.replace(/-/g, "");
    const filename = `cierres_caja_${safeFrom}_${safeTo}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await auditLog(req, {
      action: "CIERRES_CSV_EXPORT",
      entity: "egresos",
      entity_id: null,
      success: true,
      status_code: 200,
      details: {
        rows: r.rowCount,
        filters: { fecha_desde: fechaDesde, fecha_hasta: fechaHasta, empresa_salida: empresaSalida || null, moneda: moneda || null, turno: turno || null }
      }
    });

    return res.send(csv);
  } catch (error) {
    console.error("Error exportando cierres CSV:", error);
    if (error?.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Error exportando CSV de cierres" });
  }
});

// GET /api/egresos - Listar con filtros y paginación
router.get("/", auth, async (req, res) => {
  try {
    const {
      fecha_desde,
      fecha_hasta,
      empresa_salida,
      etiqueta,
      status,
      moneda,
      usuario_casino,
      id_transferencia,
      monto_min,
      monto_max,
      turno,
      cuenta_receptora,
      cuenta_salida,
      created_by,
      limit,
      offset
    } = req.query;

    const where = [];
    const params = [];

    if (fecha_desde) {
      params.push(fecha_desde);
      where.push(`e.fecha >= $${params.length}::date`);
    }

    if (fecha_hasta) {
      params.push(fecha_hasta);
      where.push(`e.fecha <= $${params.length}::date`);
    }

    if (empresa_salida) {
      params.push(empresa_salida);
      where.push(`e.empresa_salida = $${params.length}`);
    }

    if (etiqueta) {
      // Buscar etiqueta y sus equivalentes legacy/nuevos
      const etiquetasEquivalentes = getEtiquetasEquivalentes(etiqueta);
      if (etiquetasEquivalentes.length === 1) {
        params.push(etiqueta);
        where.push(`e.etiqueta = $${params.length}`);
      } else {
        // Buscar en todas las etiquetas equivalentes
        params.push(etiquetasEquivalentes);
        where.push(`e.etiqueta = ANY($${params.length})`);
      }
    }

    if (status) {
      params.push(status);
      where.push(`e.status = $${params.length}`);
    }

    if (moneda) {
      params.push(moneda.toUpperCase());
      where.push(`e.moneda = $${params.length}`);
    }

    if (req.query.tipo_transaccion) {
      const tipoNorm = String(req.query.tipo_transaccion).trim().toUpperCase();
      if (["ENTRADA", "SALIDA"].includes(tipoNorm)) {
        params.push(tipoNorm);
        where.push(`e.tipo_transaccion = $${params.length}`);
      }
    }

    if (usuario_casino) {
      params.push(`%${usuario_casino}%`);
      where.push(`e.usuario_casino ILIKE $${params.length}`);
    }

    if (id_transferencia) {
      params.push(`%${id_transferencia}%`);
      where.push(`e.id_transferencia ILIKE $${params.length}`);
    }

    if (monto_min) {
      params.push(Number(monto_min));
      where.push(`e.monto >= $${params.length}`);
    }

    if (monto_max) {
      params.push(Number(monto_max));
      where.push(`e.monto <= $${params.length}`);
    }

    if (turno) {
      params.push(turno);
      where.push(`e.turno = $${params.length}`);
    }

    if (cuenta_receptora) {
      params.push(`%${cuenta_receptora}%`);
      where.push(`e.cuenta_receptora ILIKE $${params.length}`);
    }

    if (cuenta_salida) {
      params.push(cuenta_salida);
      where.push(`e.cuenta_salida = $${params.length}`);
    }

    if (created_by) {
      params.push(Number(created_by));
      where.push(`e.created_by = $${params.length}`);
    }

    // Filtrar por rol del usuario:
    // - Admin/Dirección: ven todos los egresos
    // - Encargado: ve egresos de empleados y encargados
    // - Empleado: ve solo egresos de empleados
    const isAdminOrDireccion = req.user.role === "admin" || req.user.role === "direccion";
    const isEncargado = req.user.role === "encargado";
    const isEmpleado = req.user.role === "empleado";

    if (isEncargado) {
      // Encargados ven egresos de empleados y encargados
      where.push(`u.role IN ('empleado', 'encargado')`);
    } else if (isEmpleado) {
      // Empleados solo ven egresos de empleados
      where.push(`u.role = 'empleado'`);
    }
    // Admin y Dirección ven todos (no se agrega filtro)

    const lim = Math.min(Number(limit || 50), 200);
    const off = Math.max(Number(offset || 0), 0);

    params.push(lim);
    params.push(off);

    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

    // Optimización: Usar COUNT(*) OVER() para obtener total en una sola consulta
    // Esto es mucho más eficiente que hacer 2 queries separadas
    const sql = `
      SELECT
        e.*,
        to_char(e.hora, 'HH24:MI') AS hora_formatted,
        to_char(e.hora_solicitud_cliente, 'HH24:MI') AS hora_solicitud_cliente_formatted,
        to_char(e.hora_quema_fichas, 'HH24:MI') AS hora_quema_fichas_formatted,
        u.username AS created_by_username,
        COUNT(*) OVER() AS total_count
      FROM egresos e
      JOIN users u ON u.id = e.created_by
      ${whereClause}
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const r = await query(sql, params);
    const total = r.rows.length > 0 ? Number(r.rows[0].total_count) : 0;

    // Consulta adicional para obtener sumas totales (sin paginación)
    const sumParams = params.slice(0, -2); // Quitar limit y offset
    const sumSql = `
      SELECT
        COALESCE(SUM(CASE WHEN e.moneda = 'ARS' THEN e.monto ELSE 0 END), 0) AS suma_ars,
        COALESCE(SUM(CASE WHEN e.moneda = 'USD' THEN e.monto ELSE 0 END), 0) AS suma_usd,
        COALESCE(SUM(CASE WHEN e.moneda = 'USDT' THEN e.monto ELSE 0 END), 0) AS suma_usdt
      FROM egresos e
      JOIN users u ON u.id = e.created_by
      ${whereClause}
    `;
    const sumResult = await query(sumSql, sumParams);
    const sumas = sumResult.rows[0] || { suma_ars: 0, suma_usd: 0, suma_usdt: 0 };

    const egresos = r.rows.map(e => ({
      id: e.id,
      fecha: formatFechaDDMMAAAA(e.fecha) || e.fecha,
      hora: e.hora_formatted,
      turno: e.turno,
      hora_solicitud_cliente: e.hora_solicitud_cliente_formatted || null,
      hora_quema_fichas: e.hora_quema_fichas_formatted || null,
      etiqueta: e.etiqueta,
      etiqueta_otro: e.etiqueta_otro,
      monto: Number(e.monto),
      monto_raw: e.monto_raw,
      moneda: e.moneda || 'ARS',
      tipo_transaccion: e.tipo_transaccion || 'SALIDA',
      cuenta_receptora: e.cuenta_receptora,
      usuario_casino: e.usuario_casino,
      cuenta_salida: e.cuenta_salida,
      empresa_salida: e.empresa_salida,
      id_transferencia: e.id_transferencia,
      comprobante_url: e.comprobante_url,
      comprobante_filename: e.comprobante_filename,
      comprobante_mime: e.comprobante_mime,
      notas: e.notas,
      status: e.status || 'activo',
      motivo_anulacion: e.motivo_anulacion || null,
      anulado_at: e.anulado_at || null,
      updated_at: e.updated_at || null,
      created_by: e.created_by,
      created_by_username: e.created_by_username,
      created_at: e.created_at
    }));

    await auditLog(req, {
      action: "EGRESO_LIST",
      entity: "egresos",
      entity_id: null,
      success: true,
      status_code: 200,
      details: { rows: r.rowCount, filters: req.query }
    });

    return res.json({
      egresos,
      pagination: {
        total,
        limit: lim,
        offset: off,
        hasMore: off + lim < total
      },
      sumas: {
        ars: Number(sumas.suma_ars),
        usd: Number(sumas.suma_usd),
        usdt: Number(sumas.suma_usdt)
      }
    });
  } catch (e) {
    console.error("🔥 GET /api/egresos ERROR:", e);
    return res.status(500).json({ message: "Error listando egresos" });
  }
});

// CSV con filtros (solo admin y direccion)
router.get("/csv", auth, requireAdminOrDireccion, async (req, res) => {
  try {

    const {
      fecha_desde,
      fecha_hasta,
      empresa_salida,
      etiqueta,
      usuario_casino,
      id_transferencia,
      monto_min,
      monto_max,
      turno,
      cuenta_receptora,
      created_by
    } = req.query;

    const where = [];
    const params = [];

    if (fecha_desde) {
      params.push(fecha_desde);
      where.push(`e.fecha >= $${params.length}::date`);
    }

    if (fecha_hasta) {
      params.push(fecha_hasta);
      where.push(`e.fecha <= $${params.length}::date`);
    }

    if (empresa_salida) {
      params.push(empresa_salida);
      where.push(`e.empresa_salida = $${params.length}`);
    }

    if (etiqueta) {
      // Buscar etiqueta y sus equivalentes legacy/nuevos
      const etiquetasEquivalentes = getEtiquetasEquivalentes(etiqueta);
      if (etiquetasEquivalentes.length === 1) {
        params.push(etiqueta);
        where.push(`e.etiqueta = $${params.length}`);
      } else {
        // Buscar en todas las etiquetas equivalentes
        params.push(etiquetasEquivalentes);
        where.push(`e.etiqueta = ANY($${params.length})`);
      }
    }

    if (usuario_casino) {
      params.push(`%${usuario_casino}%`);
      where.push(`e.usuario_casino ILIKE $${params.length}`);
    }

    if (id_transferencia) {
      params.push(`%${id_transferencia}%`);
      where.push(`e.id_transferencia ILIKE $${params.length}`);
    }

    if (monto_min) {
      params.push(Number(monto_min));
      where.push(`e.monto >= $${params.length}`);
    }

    if (monto_max) {
      params.push(Number(monto_max));
      where.push(`e.monto <= $${params.length}`);
    }

    if (turno) {
      params.push(turno);
      where.push(`e.turno = $${params.length}`);
    }

    if (cuenta_receptora) {
      params.push(`%${cuenta_receptora}%`);
      where.push(`e.cuenta_receptora ILIKE $${params.length}`);
    }

    if (created_by) {
      params.push(Number(created_by));
      where.push(`e.created_by = $${params.length}`);
    }

    if (req.query.moneda) {
      params.push(req.query.moneda.toUpperCase());
      where.push(`e.moneda = $${params.length}`);
    }

    if (req.query.tipo_transaccion) {
      const tipoNorm = String(req.query.tipo_transaccion).trim().toUpperCase();
      if (["ENTRADA", "SALIDA"].includes(tipoNorm)) {
        params.push(tipoNorm);
        where.push(`e.tipo_transaccion = $${params.length}`);
      }
    }

    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

    const r = await query(
      `SELECT
         e.*,
         to_char(e.hora, 'HH24:MI') AS hora,
         to_char(e.hora_solicitud_cliente, 'HH24:MI') AS hora_solicitud_cliente,
         to_char(e.hora_quema_fichas, 'HH24:MI') AS hora_quema_fichas,
         to_char((e.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires'), 'DD/MM/YYYY HH24:MI:SS') AS created_at_ar,
         u.username AS created_by_username
       FROM egresos e
       JOIN users u ON u.id = e.created_by
       ${whereClause}
       ORDER BY e.created_at DESC, e.id DESC`,
      params
    );

    const columns = [
      "fecha","hora","turno",
      "hora_solicitud_cliente","hora_quema_fichas",
      "empresa_salida","cuenta_salida","id_transferencia",
      "cuenta_receptora",
      "etiqueta","etiqueta_otro",
      "usuario_casino",
      "monto","monto_raw","moneda","tipo_transaccion",
      "comprobante_url",
      "notas",
      "created_by_username","created_at"
    ];

    const rows = r.rows.map(x => ([
      formatFechaDDMMAAAA(x.fecha) || x.fecha,
      x.hora || "",
      x.turno || "",
      x.hora_solicitud_cliente || "",
      x.hora_quema_fichas || "",
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
      x.comprobante_url || "",
      x.notas || "",
      x.created_by_username || "",
      x.created_at_ar || ""
    ]));

    const csv = withBOM(toCSV({ columns, rows, delimiter: ";" }));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="egresos.csv"`);

    await auditLog(req, {
      action: "EGRESO_CSV_EXPORT",
      entity: "egresos",
      entity_id: null,
      success: true,
      status_code: 200,
      details: { rows: r.rowCount, filters: req.query }
    });

    return res.send(csv);
  } catch {
    return res.status(500).json({ message: "Error exportando CSV" });
  }
});

// GET /api/egresos/:id/comprobante - Descargar comprobante con validación de permisos
router.get("/:id/comprobante", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Buscar el egreso con URL, filename y rol del creador
    const r = await query(
      `SELECT e.comprobante_url, e.comprobante_filename, e.created_by, u.role as creator_role
       FROM egresos e
       JOIN users u ON u.id = e.created_by
       WHERE e.id = $1`,
      [id]
    );

    if (r.rows.length === 0) {
      return res.status(404).json({ message: "Egreso no encontrado" });
    }

    const egreso = r.rows[0];

    // Validar permisos según rol:
    // - Admin/Dirección: pueden ver todos los comprobantes
    // - Encargado: puede ver comprobantes de empleados y encargados
    // - Empleado: puede ver comprobantes de empleados
    const isAdminOrDireccion = req.user.role === "admin" || req.user.role === "direccion";
    const isEncargado = req.user.role === "encargado";
    const isEmpleado = req.user.role === "empleado";
    const creatorRole = egreso.creator_role;

    let hasPermission = false;

    if (isAdminOrDireccion) {
      // Admin y Dirección pueden ver todos
      hasPermission = true;
    } else if (isEncargado) {
      // Encargados pueden ver comprobantes de empleados y encargados
      hasPermission = creatorRole === "empleado" || creatorRole === "encargado";
    } else if (isEmpleado) {
      // Empleados solo pueden ver comprobantes de empleados
      hasPermission = creatorRole === "empleado";
    }

    if (!hasPermission) {
      await auditLog(req, {
        action: "COMPROBANTE_ACCESS_DENIED",
        entity: "egresos",
        entity_id: id,
        success: false,
        status_code: 403,
        details: { reason: "No tiene permisos para ver este comprobante", creator_role: creatorRole }
      });
      return res.status(403).json({ message: "No tenés permisos para ver este comprobante" });
    }

    console.log(`📄 Sirviendo comprobante para egreso ${id}:`);
    console.log(`  - comprobante_url: ${egreso.comprobante_url}`);
    console.log(`  - comprobante_filename: ${egreso.comprobante_filename}`);
    console.log(`  - UPLOAD_DIR: ${UPLOAD_DIR}`);
    console.log(`  - process.cwd(): ${process.cwd()}`);

    // Si el comprobante está en ImgBB, redirigir
    const isExternalUrl = egreso.comprobante_url &&
                          egreso.comprobante_url.startsWith('http') &&
                          (egreso.comprobante_url.includes('i.ibb.co') ||
                           egreso.comprobante_url.includes('ibb.co'));

    if (isExternalUrl) {
      // Verificar que la URL externa siga accesible antes de redirigir.
      // Si no está disponible, intentar servir el comprobante localmente como fallback.
      const externalUrl = egreso.comprobante_url;
      const storageType = 'ImgBB';
      let accessible = false;
      try {
        const urlObj = new URL(externalUrl);
        const httpModule = urlObj.protocol === 'https:' ? https : http;
        accessible = await new Promise((resolve) => {
          const reqHead = httpModule.request(externalUrl, { method: 'HEAD' }, (resp) => {
            resolve(resp.statusCode >= 200 && resp.statusCode < 400);
          });
          reqHead.on('error', () => resolve(false));
          reqHead.end();
        });
      } catch (err) {
        accessible = false;
      }

      if (accessible) {
        console.log(`  ✅ Redirigiendo a ${storageType}: ${externalUrl}`);
        await auditLog(req, {
          action: "COMPROBANTE_VIEW",
          entity: "egresos",
          entity_id: id,
          success: true,
          status_code: 302,
          details: { url: externalUrl, storage: storageType }
        });
        return res.redirect(externalUrl);
      } else {
        // Fall back to local if disponible
        console.log('🔄 Img/Blob no accesible externamente. intentando fallback local.');
      }
    }

    // Si está en disco local, servir el archivo
    const filePath = path.join(process.cwd(), UPLOAD_DIR, egreso.comprobante_filename);
    console.log(`  - Ruta completa del archivo: ${filePath}`);
    console.log(`  - Archivo existe: ${fs.existsSync(filePath)}`);

    if (!fs.existsSync(filePath)) {
      console.log(`  ❌ Archivo no encontrado en disco`);

      // Listar archivos en el directorio de uploads para debugging
      try {
        const uploadFiles = fs.readdirSync(path.join(process.cwd(), UPLOAD_DIR));
        console.log(`  📂 Archivos en ${UPLOAD_DIR}:`, uploadFiles.slice(0, 10));
      } catch (err) {
        console.log(`  ❌ Error listando directorio: ${err.message}`);
      }

      return res.status(404).json({ message: "Archivo no encontrado" });
    }

    await auditLog(req, {
      action: "COMPROBANTE_VIEW",
      entity: "egresos",
      entity_id: id,
      success: true,
      status_code: 200,
      details: { filename: egreso.comprobante_filename }
    });

    console.log(`  ✅ Sirviendo archivo desde disco`);
    return res.sendFile(filePath);
  } catch (err) {
    console.error("🔥 Error sirviendo comprobante:", err);
    return res.status(500).json({ message: "Error al obtener comprobante" });
  }
});

// ENDPOINT DE DEBUGGING - Temporal para diagnosticar el problema
router.get("/debug/uploads", auth, async (req, res) => {
  try {
    const uploadDir = path.join(process.cwd(), UPLOAD_DIR);

    const info = {
      uploadDir: uploadDir,
      exists: fs.existsSync(uploadDir),
      cwd: process.cwd(),
      files: []
    };

    if (fs.existsSync(uploadDir)) {
      const files = fs.readdirSync(uploadDir);
      info.files = files.map(f => {
        const stats = fs.statSync(path.join(uploadDir, f));
        return {
          name: f,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      });
      info.totalFiles = files.length;
    }

    // También listar registros en la BD
    const dbRecords = await query(
      `SELECT id, comprobante_filename, comprobante_url, created_at
       FROM egresos
       WHERE comprobante_filename IS NOT NULL
       ORDER BY created_at DESC
       LIMIT 10`
    );

    info.dbRecords = dbRecords.rows;

    return res.json(info);
  } catch (err) {
    console.error("Error en debug endpoint:", err);
    return res.status(500).json({ error: err.message });
  }
});

// PUT /api/egresos/:id - Editar egreso
// Admin/Direccion: puede editar cualquier egreso
// Empleado/Encargado: solo puede editar sus propios egresos
router.put("/:id", auth, async (req, res) => {
  try {
    // Cargar egreso existente para validaciones previas
    const { id } = req.params;
    const existing = await query("SELECT * FROM egresos WHERE id = $1", [id]);
    if (existing.rowCount === 0) {
      return res.status(404).json({ message: "Egreso no encontrado" });
    }
    const oldEgreso = existing.rows[0];
    const isAdminOrDireccion = req.user.role === 'admin' || req.user.role === 'direccion';

    // Si es Cierre de Caja, solo Admin/Dirección pueden cambiar la moneda
    const esCierreCajaOld = ETIQUETAS_CIERRE_CAJA.has(oldEgreso.etiqueta);
    const nuevaMoneda = req.body?.moneda ? String(req.body.moneda).toUpperCase() : null;
    if (esCierreCajaOld && nuevaMoneda && nuevaMoneda !== oldEgreso.moneda && !isAdminOrDireccion) {
      return res.status(403).json({ message: "Solo Admin/Dirección pueden cambiar la moneda de un Cierre de Caja" });
    }

    const {
      fecha,
      hora,
      turno,
      etiqueta,
      etiqueta_otro,
      moneda,
      tipo_transaccion,
      monto_raw,
      monto,
      cuenta_receptora,
      usuario_casino,
      hora_solicitud_cliente,
      hora_quema_fichas,
      id_transferencia,
      cuenta_salida,
      empresa_salida,
      notas,
      change_reason
    } = req.body;

    const hasField = (key) => Object.prototype.hasOwnProperty.call(req.body, key);

    const sendsFecha = hasField("fecha");
    const sendsHora = hasField("hora");
    const sendsTurno = hasField("turno");
    const sendsEtiqueta = hasField("etiqueta");
    const sendsEtiquetaOtro = hasField("etiqueta_otro");
    const sendsMoneda = hasField("moneda");
    const sendsTipoTransaccion = hasField("tipo_transaccion");
    const sendsMontoRaw = hasField("monto_raw");
    const sendsMonto = hasField("monto");
    const sendsCuentaReceptora = hasField("cuenta_receptora");
    const sendsUsuarioCasino = hasField("usuario_casino");
    const sendsHoraSolicitud = hasField("hora_solicitud_cliente");
    const sendsHoraQuema = hasField("hora_quema_fichas");
    const sendsIdTransferencia = hasField("id_transferencia");
    const sendsCuentaSalida = hasField("cuenta_salida");
    const sendsEmpresaSalida = hasField("empresa_salida");
    const sendsNotas = hasField("notas");

    const changeReasonNorm = typeof change_reason === "string" ? change_reason.trim() : "";
    if (!changeReasonNorm) {
      return res.status(400).json({ message: "Debe indicar el motivo del cambio" });
    }
    if (changeReasonNorm.length > 500) {
      return res.status(400).json({ message: "El motivo del cambio no puede superar 500 caracteres" });
    }

    const normText = (v) => {
      if (v === undefined || v === null) return null;
      const t = String(v).trim();
      return t === "" ? null : t;
    };

    const etiquetaFinal = normText(etiqueta) || oldEgreso.etiqueta;
    if (!etiquetaFinal) {
      return res.status(400).json({ message: "Etiqueta inválida" });
    }

    const esCierreCajaFinal = ETIQUETAS_CIERRE_CAJA.has(etiquetaFinal);
    const esPremioFinal = ETIQUETAS_CON_USUARIO_CASINO.has(etiquetaFinal);

    const monedaNorm = normText(moneda)
      ? String(moneda).trim().toUpperCase().replace(/\s*\(.+\)$/, "")
      : null;
    if (monedaNorm && !["ARS", "USD", "USDT"].includes(monedaNorm)) {
      return res.status(400).json({ message: "Moneda inválida. Debe ser ARS, USD o USDT" });
    }

    const monedaFinal = monedaNorm || oldEgreso.moneda || "ARS";

    const tipoTransaccionNorm = normText(tipo_transaccion)
      ? String(tipo_transaccion).trim().toUpperCase()
      : null;
    if (tipoTransaccionNorm && !["ENTRADA", "SALIDA"].includes(tipoTransaccionNorm)) {
      return res.status(400).json({ message: "tipo_transaccion inválido. Debe ser ENTRADA o SALIDA" });
    }
    const tipoTransaccionFinal = esCierreCajaFinal
      ? "SALIDA"
      : (tipoTransaccionNorm || oldEgreso.tipo_transaccion || "SALIDA");

    // Mantener regla de negocio: ARS solo ENTRADA para Deposito de cliente
    const touchedMonedaTipoEtiqueta = sendsMoneda || sendsTipoTransaccion || sendsEtiqueta;
    if (
      touchedMonedaTipoEtiqueta &&
      monedaFinal === "ARS" &&
      tipoTransaccionFinal === "ENTRADA" &&
      etiquetaFinal !== "[Unidad M] Deposito de cliente"
    ) {
      return res.status(400).json({ message: "Transacciones ARS solo pueden ser ENTRADA para 'Deposito de cliente'" });
    }

    // id_transferencia puede ser null explícito (checkbox "Sin ID")
    const idTransferenciaNorm = esCierreCajaFinal
      ? null
      : (
          sendsIdTransferencia
            ? (id_transferencia === null ? null : normText(id_transferencia))
            : normText(oldEgreso.id_transferencia)
        );

    const cuentaReceptoraNorm = esCierreCajaFinal
      ? null
      : (sendsCuentaReceptora ? normText(cuenta_receptora) : normText(oldEgreso.cuenta_receptora));

    // etiqueta_otro solo aplica cuando etiqueta = Otro
    let etiquetaOtroNorm = sendsEtiquetaOtro ? normText(etiqueta_otro) : normText(oldEgreso.etiqueta_otro);
    if (etiquetaFinal !== "Otro") {
      etiquetaOtroNorm = null;
    } else if ((sendsEtiqueta || sendsEtiquetaOtro) && !etiquetaOtroNorm) {
      return res.status(400).json({ message: "Si etiqueta es 'Otro', etiqueta_otro es obligatorio" });
    }

    let usuarioCasinoNorm = sendsUsuarioCasino ? normText(usuario_casino) : normText(oldEgreso.usuario_casino);
    const notasNorm = sendsNotas ? normText(notas) : normText(oldEgreso.notas);

    // Horas opcionales con formato validado
    let hsNorm = null;
    const hsSource = sendsHoraSolicitud ? normText(hora_solicitud_cliente) : normText(oldEgreso.hora_solicitud_cliente);
    if (hsSource) {
      hsNorm = normalizeHoraOptional(hsSource);
      if (!hsNorm) {
        return res.status(400).json({ message: "Hora solicitud cliente inválida. Formato: HH:MM" });
      }
    }

    let hqNorm = null;
    const hqSource = sendsHoraQuema ? normText(hora_quema_fichas) : normText(oldEgreso.hora_quema_fichas);
    if (hqSource) {
      hqNorm = normalizeHoraOptional(hqSource);
      if (!hqNorm) {
        return res.status(400).json({ message: "Hora quema de fichas inválida. Formato: HH:MM" });
      }
    }

    // Para conceptos no-premio, estos campos deben quedar siempre en null
    if (!esPremioFinal && (sendsEtiqueta || sendsUsuarioCasino || sendsHoraSolicitud || sendsHoraQuema)) {
      usuarioCasinoNorm = null;
      hsNorm = null;
      hqNorm = null;
    }

    // Si está editando/creando un premio, exigir campos completos
    const touchedPremioFields = sendsEtiqueta || sendsUsuarioCasino || sendsHoraSolicitud || sendsHoraQuema;
    if (esPremioFinal && touchedPremioFields) {
      if (!usuarioCasinoNorm) {
        return res.status(400).json({ message: "usuario_casino es obligatorio para ese concepto" });
      }
      if (!hsNorm) {
        return res.status(400).json({ message: "Hora solicitud cliente es obligatoria para este concepto" });
      }
      if (!hqNorm) {
        return res.status(400).json({ message: "Hora quema de fichas es obligatoria para este concepto" });
      }
    }

    let montoNorm = null;
    let montoRawNorm = null;
    if (sendsMontoRaw || sendsMonto) {
      montoRawNorm = sendsMontoRaw ? String(monto_raw || "").trim() : String(oldEgreso.monto_raw || "").trim();
      let parsedMonto = parseMontoARSStrict(montoRawNorm);

      if ((parsedMonto === null || parsedMonto <= 0) && monto !== undefined && monto !== null && String(monto).trim() !== "") {
        const n = Number(monto);
        if (Number.isFinite(n) && n > 0) {
          parsedMonto = Math.round(n * 100) / 100;
          if (!montoRawNorm) montoRawNorm = montoToCommaString(parsedMonto);
        }
      }

      if (parsedMonto === null || parsedMonto <= 0) {
        return res.status(400).json({ message: "Monto inválido. Debe ser mayor a 0" });
      }

      montoNorm = parsedMonto;
      if (!montoRawNorm) montoRawNorm = montoToCommaString(parsedMonto);
    }

    // Para no cierre de caja, validar campos si se envían/cambian
    if (!esCierreCajaFinal) {
      if (idTransferenciaNorm !== null && !/^[a-zA-Z0-9\-_]+$/.test(idTransferenciaNorm)) {
        return res.status(400).json({ message: "ID TRANSFERENCIA inválido" });
      }

      if ((sendsEtiqueta || sendsCuentaReceptora) && !cuentaReceptoraNorm) {
        return res.status(400).json({ message: "CUENTA RECEPTORA es obligatoria" });
      }
    }

    // Verificar permisos: admin/direccion pueden editar cualquiera, otros solo los propios
    const isOwner = oldEgreso.created_by === req.user.id;

    if (!isAdminOrDireccion && !isOwner) {
      return res.status(403).json({ message: "Solo podés editar tus propios egresos" });
    }

    // No permitir editar egresos anulados
    if (oldEgreso.status === 'anulado') {
      return res.status(400).json({ message: "No se puede editar un egreso anulado" });
    }

    // Normalizar y validar fecha si viene en el body
    let fechaNormalizada = fecha;
    if (sendsFecha) {
      const fechaResult = normalizeFecha(fecha, { enforceCurrentYear: false });
      if (!fechaResult.valid) {
        return res.status(400).json({ message: `Error en fecha: ${fechaResult.error}` });
      }
      fechaNormalizada = fechaResult.fecha; // Convertir a ISO aaaa-mm-dd
    }

    // Validar hora si viene en el body
    let horaNorm = null;
    const horaRawNorm = sendsHora ? normText(hora) : null;
    if (sendsHora) {
      if (!horaRawNorm) {
        return res.status(400).json({ message: "Hora inválida. Formato debe ser HH:MM" });
      }
      horaNorm = normalizeHoraToTime(horaRawNorm);
      if (!horaNorm) {
        return res.status(400).json({ message: "Hora inválida. Formato debe ser HH:MM" });
      }
    }

    const turnoNorm = sendsTurno ? normalizeTurnoLabel(normText(turno)) : null;
    if (sendsTurno && !turnoNorm) {
      return res.status(400).json({ message: "Turno es obligatorio" });
    }

    const cuentaSalidaNorm = sendsCuentaSalida ? normText(cuenta_salida) : normText(oldEgreso.cuenta_salida);
    if (sendsCuentaSalida && !cuentaSalidaNorm) {
      return res.status(400).json({ message: "CUENTA SALIDA es obligatoria" });
    }

    const empresaSalidaNorm = sendsEmpresaSalida ? normText(empresa_salida) : normText(oldEgreso.empresa_salida);
    if (sendsEmpresaSalida) {
      if (!empresaSalidaNorm) {
        return res.status(400).json({ message: "EMPRESA SALIDA es obligatoria" });
      }
      if (!EMPRESAS_SALIDA.includes(empresaSalidaNorm)) {
        return res.status(400).json({ message: "empresa_salida inválida" });
      }
    }

    const fechaFinal = sendsFecha ? fechaNormalizada : toISODateOnly(oldEgreso.fecha);
    const turnoFinal = sendsTurno ? turnoNorm : normalizeTurnoLabel(normText(oldEgreso.turno));
    const cuentaSalidaFinal = cuentaSalidaNorm;
    const empresaSalidaFinal = empresaSalidaNorm;

    if (esCierreCajaFinal) {
      if (!fechaFinal) {
        return res.status(400).json({ message: "Fecha inválida para cierre de caja" });
      }
      if (!turnoFinal || !TURNOS_CIERRE.includes(turnoFinal)) {
        return res.status(400).json({ message: "Turno inválido para cierre de caja" });
      }
      if (!empresaSalidaFinal) {
        return res.status(400).json({ message: "EMPRESA SALIDA es obligatoria para cierre de caja" });
      }
      if (!cuentaSalidaFinal) {
        return res.status(400).json({ message: "CUENTA SALIDA es obligatoria para cierre de caja" });
      }
    }

    const setClauses = [];
    const params = [];
    const setField = (column, value) => {
      params.push(value);
      setClauses.push(`${column} = $${params.length}`);
    };

    if (sendsFecha) setField("fecha", fechaNormalizada);
    if (sendsHora) setField("hora", horaNorm);
    if (sendsTurno) setField("turno", turnoNorm);
    if (sendsEtiqueta) setField("etiqueta", etiquetaFinal);
    if (sendsEtiqueta || sendsEtiquetaOtro) setField("etiqueta_otro", etiquetaOtroNorm);
    if (sendsMoneda) setField("moneda", monedaFinal);
    if (sendsTipoTransaccion || sendsEtiqueta) setField("tipo_transaccion", tipoTransaccionFinal);

    if (sendsMontoRaw || sendsMonto) {
      setField("monto_raw", montoRawNorm);
      setField("monto", montoNorm);
    }

    if (sendsEtiqueta || sendsCuentaReceptora || sendsIdTransferencia) {
      setField("cuenta_receptora", cuentaReceptoraNorm);
      setField("id_transferencia", idTransferenciaNorm);
    }

    if (sendsEtiqueta || sendsUsuarioCasino || sendsHoraSolicitud || sendsHoraQuema) {
      setField("usuario_casino", usuarioCasinoNorm);
      setField("hora_solicitud_cliente", hsNorm);
      setField("hora_quema_fichas", hqNorm);
    }

    if (sendsCuentaSalida) setField("cuenta_salida", cuentaSalidaNorm);
    if (sendsEmpresaSalida) setField("empresa_salida", empresaSalidaNorm);
    if (sendsNotas) setField("notas", notasNorm);

    // Marcar siempre como editado y registrar auditoría de quién editó
    setClauses.push("status = 'editada'");
    params.push(req.user.id);
    setClauses.push(`updated_by = $${params.length}`);
    setClauses.push("updated_at = CURRENT_TIMESTAMP");

    // Actualizar egreso
    params.push(id);
    await query(
      `UPDATE egresos SET ${setClauses.join(", ")} WHERE id = $${params.length}`,
      params
    );

    // Si no hay campos explícitos para cambio, al menos dejar trazabilidad por estado/updated_by
    if (setClauses.length === 3) {
      // status + updated_by + updated_at
      // no-op: ya quedó trazabilidad
    }

    // Registrar en audit logs
    await auditLog(req, {
      action: "EGRESO_UPDATE",
      entity: "egresos",
      entity_id: id,
      success: true,
      status_code: 200,
      details: {
        change_reason: changeReasonNorm,
        fields_changed: Object.keys(req.body).filter(k => k !== 'change_reason')
      }
    });

    clearSaldosCache();
    return res.json({ message: "Egreso actualizado correctamente" });

  } catch (error) {
    console.error("🔥 Error actualizando egreso:", error);
    if (error?.code === "23514") {
      return res.status(400).json({
        message: "Datos inválidos al editar egreso (constraint). Revisá moneda, ID transferencia y campos obligatorios.",
        constraint: error?.constraint || null
      });
    }
    if (error?.code === "22P02") {
      return res.status(400).json({ message: "Formato inválido en algún campo (número/fecha/hora)." });
    }
    if (error?.code === "23502") {
      return res.status(400).json({ message: "Faltan campos obligatorios para actualizar el egreso." });
    }
    return res.status(500).json({ message: "Error actualizando egreso" });
  }
});

// POST /api/egresos/:id/anular - Anular egreso (solo admin)
router.post("/:id/anular", auth, async (req, res) => {
  try {
    // Solo admin puede anular
    if (req.user.role !== "admin") {
      return res.status(403).json({ message: "Solo administradores pueden anular egresos" });
    }

    const { id } = req.params;
    const { motivo } = req.body;

    if (!motivo || motivo.trim() === "") {
      return res.status(400).json({ message: "El motivo de anulación es obligatorio" });
    }

    // Verificar que el egreso existe
    const checkEgreso = await query(
      `SELECT * FROM egresos WHERE id = $1`,
      [id]
    );

    if (checkEgreso.rows.length === 0) {
      return res.status(404).json({ message: "Egreso no encontrado" });
    }

    const egreso = checkEgreso.rows[0];

    // No permitir anular un egreso ya anulado
    if (egreso.status === 'anulado') {
      return res.status(400).json({ message: "Este egreso ya está anulado" });
    }

    // Anular egreso
    await query(
      `UPDATE egresos
       SET status = 'anulado',
           motivo_anulacion = $1,
           anulado_por = $2,
           anulado_at = CURRENT_TIMESTAMP,
           updated_by = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [motivo, req.user.id, id]
    );

    // Registrar en audit logs
    await auditLog(req, {
      action: "EGRESO_ANULAR",
      entity: "egresos",
      entity_id: id,
      success: true,
      status_code: 200,
      details: {
        motivo,
        monto: Number(egreso.monto),
        empresa_salida: egreso.empresa_salida,
        id_transferencia: egreso.id_transferencia
      }
    });

    clearSaldosCache();
    return res.json({ message: "Egreso anulado correctamente" });

  } catch (error) {
    console.error("🔥 Error anulando egreso:", error);
    return res.status(500).json({ message: "Error anulando egreso" });
  }
});

// GET /api/egresos/:id/history - Obtener historial de cambios
router.get("/:id/history", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el egreso existe
    const checkEgreso = await query(
      `SELECT id FROM egresos WHERE id = $1`,
      [id]
    );

    if (checkEgreso.rows.length === 0) {
      return res.status(404).json({ message: "Egreso no encontrado" });
    }

    // Obtener historial
    const history = await query(
      `SELECT
        h.*,
        to_char(h.created_at, 'YYYY-MM-DD HH24:MI:SS') AS created_at_formatted
       FROM egresos_history h
       WHERE h.egreso_id = $1
       ORDER BY h.created_at DESC`,
      [id]
    );

    return res.json({
      egreso_id: id,
      changes: history.rows
    });

  } catch (error) {
    console.error("🔥 Error obteniendo historial:", error);
    return res.status(500).json({ message: "Error obteniendo historial" });
  }
});

// DELETE /api/egresos/:id - Eliminar egreso completamente
// Admin/Direccion: puede eliminar cualquier egreso
// Empleado/Encargado: solo puede eliminar sus propios egresos
router.delete("/:id", auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar que el egreso existe
    const checkEgreso = await query(
      `SELECT * FROM egresos WHERE id = $1`,
      [id]
    );

    if (checkEgreso.rows.length === 0) {
      return res.status(404).json({ message: "Egreso no encontrado" });
    }

    const egreso = checkEgreso.rows[0];

    // Verificar permisos: admin/direccion pueden eliminar cualquiera, otros solo los propios
    const isAdminOrDireccion = req.user.role === 'admin' || req.user.role === 'direccion';
    const isOwner = egreso.created_by === req.user.id;

    if (!isAdminOrDireccion && !isOwner) {
      return res.status(403).json({ message: "Solo podés eliminar tus propios egresos" });
    }

    // Eliminar el egreso de la base de datos
    await query(
      `DELETE FROM egresos WHERE id = $1`,
      [id]
    );

    // Registrar en audit logs
    await auditLog(req, {
      action: "EGRESO_DELETE",
      entity: "egresos",
      entity_id: id,
      success: true,
      status_code: 200,
      details: {
        monto: Number(egreso.monto),
        empresa_salida: egreso.empresa_salida,
        id_transferencia: egreso.id_transferencia,
        fecha: egreso.fecha
      }
    });

    clearSaldosCache();
    return res.json({ message: "Egreso eliminado correctamente" });

  } catch (error) {
    console.error("🔥 Error eliminando egreso:", error);
    return res.status(500).json({ message: "Error eliminando egreso" });
  }
});

export default router;
