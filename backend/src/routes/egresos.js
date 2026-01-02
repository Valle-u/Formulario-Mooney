import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { query } from "../config/db.js";
import { auth, requireAdminOrDireccion } from "../middleware/auth.js";
import { validateUploadedFile } from "../middleware/fileValidator.js";
import {
  EMPRESAS_SALIDA,
  ETIQUETAS_CON_USUARIO_CASINO,
  ETIQUETAS_PREMIO_MINIMO,
  isFutureDateISO,
  parseMontoARSStrict,
  montoToCommaString,
  requireNonEmpty
} from "../utils/validators.js";
import { toCSV, withBOM } from "../utils/csv.js";
import { auditLog } from "../utils/audit.js";

// Soportar múltiples proveedores de almacenamiento
import { uploadToR2, isR2Configured } from "../config/r2-fetch.js";
import { uploadToImgBB, isImgBBConfigured } from "../config/imgbb.js";

const router = express.Router();
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 10);

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function isDigitsOnly(v){ return /^[0-9]+$/.test(String(v || "").trim()); }

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

// Siempre usar memoryStorage para flexibilidad (R2 o disco)
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  const allowed = ["image/jpeg", "image/png", "application/pdf"];
  if (!allowed.includes(file.mimetype)) return cb(new Error("Tipo de archivo no permitido"));
  cb(null, true);
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });

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
      moneda
    } = data;

    const errFecha = requireNonEmpty(fecha, "fecha");
    if (errFecha) return res.status(400).json({ message: errFecha });
    if (isFutureDateISO(fecha)) return res.status(400).json({ message: "No se permite fecha futura" });

    const errHora = requireNonEmpty(hora, "hora");
    if (errHora) return res.status(400).json({ message: errHora });

    const horaNorm = normalizeHoraToTime(hora);
    if (!horaNorm) return res.status(400).json({ message: "Hora inválida. Usá HH:MM" });

    const turnoNorm = String(turno || "").trim();
    if (!turnoNorm) return res.status(400).json({ message: "Turno es obligatorio" });

    const errEtiqueta = requireNonEmpty(etiqueta, "etiqueta");
    if (errEtiqueta) return res.status(400).json({ message: errEtiqueta });

    if (etiqueta === "Otro" && !String(otro_concepto || "").trim()) {
      return res.status(400).json({ message: "Si etiqueta es 'Otro', otro_concepto es obligatorio" });
    }

    if (ETIQUETAS_CON_USUARIO_CASINO.has(etiqueta) && !String(usuario_casino || "").trim()) {
      return res.status(400).json({ message: "usuario_casino es obligatorio para ese concepto" });
    }

    if (requireNonEmpty(cuenta_receptora, "cuenta_receptora")) return res.status(400).json({ message: "cuenta_receptora es obligatoria" });
    if (requireNonEmpty(cuenta_salida, "cuenta_salida")) return res.status(400).json({ message: "cuenta_salida es obligatoria" });

    if (requireNonEmpty(empresa_cuenta_salida, "empresa_cuenta_salida")) return res.status(400).json({ message: "empresa_cuenta_salida es obligatoria" });
    if (!EMPRESAS_SALIDA.includes(empresa_cuenta_salida)) return res.status(400).json({ message: "empresa_salida inválida" });

    const idTrim = String(id_transferencia || "").trim();
    if (!idTrim) return res.status(400).json({ message: "id_transferencia es obligatorio" });
    // Validar que sea alfanumérico (letras, números, guiones, guiones bajos)
    if (!/^[a-zA-Z0-9\-_]+$/.test(idTrim)) {
      return res.status(400).json({ message: "ID TRANSFERENCIA inválido: solo letras, números, guiones y guiones bajos" });
    }

    // Validar moneda primero (antes de validar monto mínimo)
    const monedaNorm = String(moneda || "ARS").trim().toUpperCase();
    if (!["USD", "ARS"].includes(monedaNorm)) {
      return res.status(400).json({ message: "Moneda inválida. Debe ser USD o ARS" });
    }

    const raw = (monto_transferencia_raw || "").trim();
    const montoNum = parseMontoARSStrict(raw);
    if (montoNum === null) return res.status(400).json({ message: "Monto inválido" });
    if (montoNum <= 0) return res.status(400).json({ message: "Monto debe ser mayor a 0" });

    // Validación de monto mínimo solo para transferencias en ARS (pesos)
    if (ETIQUETAS_PREMIO_MINIMO.has(etiqueta) && monedaNorm === 'ARS' && montoNum < 3000) {
      return res.status(400).json({ message: "Para Premio Pagado en ARS el monto debe ser >= $3000" });
    }

    const hsNorm = normalizeHoraOptional(hora_solicitud_cliente);
    if (String(hora_solicitud_cliente || "").trim() && !hsNorm) return res.status(400).json({ message: "Hora solicitud cliente inválida. Usá HH:MM" });

    const hqNorm = normalizeHoraOptional(hora_quema_fichas);
    if (String(hora_quema_fichas || "").trim() && !hqNorm) return res.status(400).json({ message: "Hora quema de fichas inválida. Usá HH:MM" });

    // Subir archivo a almacenamiento externo o guardar localmente
    // Prioridad: ImgBB > R2 > Local
    let comprobanteUrl;
    const safe = file.originalname.replace(/[^\w.\-() ]+/g, "_");
    const fileName = `${Date.now()}_${safe}`;
    const fileNameWithoutExt = fileName.replace(/\.[^.]+$/, ''); // Sin extensión para ImgBB

    console.log(`📁 Archivo recibido: ${file.originalname}, Size: ${file.size} bytes, MIME: ${file.mimetype}`);
    console.log(`🔧 ImgBB configurado: ${isImgBBConfigured()}`);
    console.log(`🔧 R2 configurado: ${isR2Configured()}`);

    // Prioridad 1: ImgBB (más fácil y sin problemas SSL)
    if (isImgBBConfigured()) {
      try {
        console.log(`☁️ Intentando subir a ImgBB: ${fileName}`);
        comprobanteUrl = await uploadToImgBB(file.buffer, fileNameWithoutExt, file.mimetype);
        console.log(`✅ Comprobante subido a ImgBB: ${fileName} -> ${comprobanteUrl}`);
      } catch (error) {
        console.error('❌ Error subiendo a ImgBB:', error);
        console.error('Error details:', error.message, error.stack);
        return res.status(500).json({ message: `Error al subir comprobante a ImgBB: ${error.message}` });
      }
    }
    // Prioridad 2: Cloudflare R2 (si ImgBB no está configurado)
    else if (isR2Configured()) {
      try {
        console.log(`☁️ Intentando subir a R2: ${fileName}`);
        comprobanteUrl = await uploadToR2(file.buffer, fileName, file.mimetype);
        console.log(`✅ Comprobante subido a R2: ${fileName} -> ${comprobanteUrl}`);
      } catch (error) {
        console.error('❌ Error subiendo a R2:', error);
        console.error('Error details:', error.message, error.stack);
        return res.status(500).json({ message: `Error al subir comprobante a R2: ${error.message}` });
      }
    }
    // Fallback: Guardar en disco local (solo para desarrollo)
    else {
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
         hora_solicitud_cliente,hora_quema_fichas,moneda)
       VALUES
        ($1,$2,$3,$4,$5,$6,$7,
         $8,$9,$10,$11,$12,
         $13,$14,$15,$16,
         $17,$18,
         $19,$20,$21)
       RETURNING id`,
      [
        fecha,
        horaNorm,
        turnoNorm,
        etiqueta,
        etiqueta === "Otro" ? String(otro_concepto || "").trim() : null,
        raw,
        montoNum,
        String(cuenta_receptora || "").trim(),
        String(usuario_casino || "").trim() || null,
        String(cuenta_salida || "").trim(),
        empresa_cuenta_salida,
        idTrim,
        comprobanteUrl,
        file.originalname,
        file.mimetype,
        file.size,
        String(notas || "").trim() || null,
        req.user.id,
        hsNorm,
        hqNorm,
        monedaNorm
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
      params.push(etiqueta);
      where.push(`e.etiqueta = $${params.length}`);
    }

    if (status) {
      params.push(status);
      where.push(`e.status = $${params.length}`);
    }

    if (moneda) {
      params.push(moneda.toUpperCase());
      where.push(`e.moneda = $${params.length}`);
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
      ORDER BY e.fecha DESC, e.hora DESC, e.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;

    const r = await query(sql, params);
    const total = r.rows.length > 0 ? Number(r.rows[0].total_count) : 0;

    const egresos = r.rows.map(e => ({
      id: e.id,
      fecha: e.fecha?.toISOString?.().slice(0, 10) || e.fecha,
      hora: e.hora_formatted,
      turno: e.turno,
      hora_solicitud_cliente: e.hora_solicitud_cliente_formatted || null,
      hora_quema_fichas: e.hora_quema_fichas_formatted || null,
      etiqueta: e.etiqueta,
      etiqueta_otro: e.etiqueta_otro,
      monto: Number(e.monto),
      monto_raw: e.monto_raw,
      moneda: e.moneda || 'ARS',
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
      params.push(etiqueta);
      where.push(`e.etiqueta = $${params.length}`);
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

    if (created_by) {
      params.push(Number(created_by));
      where.push(`e.created_by = $${params.length}`);
    }

    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

    const r = await query(
      `SELECT
         e.*,
         to_char(e.hora, 'HH24:MI') AS hora,
         to_char(e.hora_solicitud_cliente, 'HH24:MI') AS hora_solicitud_cliente,
         to_char(e.hora_quema_fichas, 'HH24:MI') AS hora_quema_fichas,
         u.username AS created_by_username
       FROM egresos e
       JOIN users u ON u.id = e.created_by
       ${whereClause}
       ORDER BY e.fecha DESC, e.hora DESC, e.id DESC`,
      params
    );

    const columns = [
      "fecha","hora","turno",
      "hora_solicitud_cliente","hora_quema_fichas",
      "empresa_salida","cuenta_salida","id_transferencia",
      "cuenta_receptora",
      "etiqueta","etiqueta_otro",
      "usuario_casino",
      "monto","monto_raw","moneda",
      "comprobante_url",
      "notas",
      "created_by_username","created_at"
    ];

    const rows = r.rows.map(x => ([
      x.fecha?.toISOString?.().slice(0,10) || x.fecha,
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
      x.comprobante_url || "",
      x.notas || "",
      x.created_by_username || "",
      x.created_at ? new Date(x.created_at).toISOString() : ""
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

    // Si el comprobante está en almacenamiento externo (R2 o ImgBB), redirigir
    // Verificar que sea URL externa y no URL local de uploads
    const isExternalUrl = egreso.comprobante_url &&
                          egreso.comprobante_url.startsWith('http') &&
                          (egreso.comprobante_url.includes('.r2.dev') ||
                           egreso.comprobante_url.includes('.r2.cloudflarestorage.com') ||
                           egreso.comprobante_url.includes('pub-') ||
                           egreso.comprobante_url.includes('i.ibb.co') ||
                           egreso.comprobante_url.includes('ibb.co'));

    if (isExternalUrl) {
      const storageType = egreso.comprobante_url.includes('ibb.co') ? 'ImgBB' : 'R2';
      console.log(`  ✅ Redirigiendo a ${storageType}: ${egreso.comprobante_url}`);
      await auditLog(req, {
        action: "COMPROBANTE_VIEW",
        entity: "egresos",
        entity_id: id,
        success: true,
        status_code: 302,
        details: { url: egreso.comprobante_url, storage: storageType }
      });
      return res.redirect(egreso.comprobante_url);
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

// PUT /api/egresos/:id - Editar egreso (solo admin y direccion)
router.put("/:id", auth, requireAdminOrDireccion, async (req, res) => {
  try {

    const { id } = req.params;
    const {
      fecha,
      hora,
      turno,
      etiqueta,
      etiqueta_otro,
      monto_raw,
      monto,
      cuenta_receptora,
      usuario_casino,
      cuenta_salida,
      empresa_salida,
      notas,
      change_reason
    } = req.body;

    // Verificar que el egreso existe
    const checkEgreso = await query(
      `SELECT * FROM egresos WHERE id = $1`,
      [id]
    );

    if (checkEgreso.rows.length === 0) {
      return res.status(404).json({ message: "Egreso no encontrado" });
    }

    const oldEgreso = checkEgreso.rows[0];

    // No permitir editar egresos anulados
    if (oldEgreso.status === 'anulado') {
      return res.status(400).json({ message: "No se puede editar un egreso anulado" });
    }

    // Actualizar egreso y cambiar status a 'editada'
    await query(
      `UPDATE egresos
       SET fecha = COALESCE($1, fecha),
           hora = COALESCE($2, hora),
           turno = COALESCE($3, turno),
           etiqueta = COALESCE($4, etiqueta),
           etiqueta_otro = COALESCE($5, etiqueta_otro),
           monto_raw = COALESCE($6, monto_raw),
           monto = COALESCE($7, monto),
           cuenta_receptora = COALESCE($8, cuenta_receptora),
           usuario_casino = COALESCE($9, usuario_casino),
           cuenta_salida = COALESCE($10, cuenta_salida),
           empresa_salida = COALESCE($11, empresa_salida),
           notas = COALESCE($12, notas),
           status = 'editada',
           updated_by = $13,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $14`,
      [
        fecha, hora, turno, etiqueta, etiqueta_otro,
        monto_raw, monto, cuenta_receptora, usuario_casino,
        cuenta_salida, empresa_salida, notas,
        req.user.id,
        id
      ]
    );

    // Registrar en audit logs
    await auditLog(req, {
      action: "EGRESO_UPDATE",
      entity: "egresos",
      entity_id: id,
      success: true,
      status_code: 200,
      details: {
        change_reason: change_reason || "Sin motivo especificado",
        fields_changed: Object.keys(req.body).filter(k => k !== 'change_reason')
      }
    });

    return res.json({ message: "Egreso actualizado correctamente" });

  } catch (error) {
    console.error("🔥 Error actualizando egreso:", error);
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

export default router;
