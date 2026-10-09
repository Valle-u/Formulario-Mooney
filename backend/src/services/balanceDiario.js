/**
 * Balance diario desde CSV de banco.
 * Port de balance_module.py (scraper). Misma prioridad de reglas y mismas trampas
 * ya corregidas: valor absoluto, pre-pasada por ID, extras solo de bancos ausentes.
 */

const AR_OFFSET_MS = -3 * 60 * 60 * 1000;

export const OUTPUT_COLUMNS = [
  "FechaHora", "ID", "Empresa", "Titular de cuenta", "Tipo de transferencia",
  "Titular", "Origen", "Importe", "Estado", "Nota", "FECHA", "TURNO ", "Etiqueta",
];

export const ETIQUETA_DEPOSITO = "[Unidad M] Deposito de cliente";
export const ETIQUETA_IVA = "[Unidad M] IVA";
export const ETIQUETA_RECHAZADA = "[Unidad M] Transferencia Rechazada";
export const ETIQUETA_DISCREPANCIA = "[Unidad M] Discrepancia";
const ETIQUETA_EXCLUIR = "cierre de caja";
const ETIQUETA_REDIRECCION = "redireccion de capital";

const MONTO_MARCADOR_DISCREPANCIA = 2_000_000;
const DEPOSITO_TOL_CENT = Number(process.env.DEPOSITO_TOL_PESOS || 100) * 100;
const HORA_TOL_MIN = Number(process.env.PLANILLA_HORA_TOL_MIN || 20);

const ESTADOS_RECHAZADA = new Set([
  "rechazada", "rechazado", "cancelada", "cancelado", "failed", "rejected", "denied",
]);

const TIPOS_IVA_LOHAS = new Set([
  "pase",
  "imp. debitos y creditos",
  "cargo por tranferencia saliente",
  "cargo por transferencia saliente",
]);

export const BANCO_LOHAS = "Lohas";
export const BANCO_HG = "HG.Cash";
export const BANCO_RIVEN = "Riven Flow";

const BANCOS_USDT = ["trustwallet", "trust wallet", "binance", "bybit", "exodus"];

const BANCO_POR_FORMATO = { lohas: BANCO_LOHAS, hg: BANCO_HG, riven: BANCO_RIVEN };

export function rstripChars(s, chars) {
  let i = s.length;
  while (i > 0 && chars.includes(s[i - 1])) i -= 1;
  return s.slice(0, i);
}

export function limpiarNombre(s) {
  if (s == null) return "";
  s = String(s).trim();
  if (s.includes("\\u")) {
    s = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return s.trim();
}

export function normText(s) {
  if (s == null) return "";
  s = limpiarNombre(s).toLowerCase();
  s = s.normalize("NFKD").replace(/\p{M}/gu, "");
  s = s.replace(/[áéíóúüñ]/g, (ch) => ({
    á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
  }[ch]));
  return s.replace(/\s+/g, " ").trim();
}

export function normName(s) {
  return normText(s).replace(/[^a-z0-9]/g, "");
}

/** Mismas palabras, cualquier orden: "JURI DANIEL GUSTAVO" y "Daniel Gustavo Juri". */
export function claveNombre(s) {
  return normText(s).split(/[^a-z0-9]+/).filter(Boolean).sort().join("");
}

function distanciaEdicion(a, b) {
  if (a === b) return 0;
  if (a.length < b.length) [a, b] = [b, a];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const cur = [i, ...Array(b.length).fill(0)];
    for (let j = 1; j <= b.length; j += 1) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + costo);
    }
    prev = cur;
  }
  return prev[prev.length - 1];
}

function nombresParecidos(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  if (corto.length < 8) return false;
  if (largo.startsWith(corto) || largo.endsWith(corto)) return true;
  if (corto.length >= 12) return distanciaEdicion(a, b) <= 2;
  return false;
}

export function parseMonto(s) {
  if (s == null) return null;
  s = String(s).trim().replace(/\$/g, "").replace(/ /g, "");
  if (!s) return null;
  const hasComma = s.includes(",");
  const hasDot = s.includes(".");
  if (hasComma && hasDot) {
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (hasComma) {
    const dec = s.split(",").pop();
    s = dec.length === 3 ? s.replace(/,/g, "") : s.replace(",", ".");
  } else if (hasDot && (s.match(/\./g) || []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function limpiarFecha(s) {
  if (!s) return "";
  s = String(s).trim().replace(/,/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  const m = s.match(/^(\d{1,2}\/\d{1,2}\/\d{4}) (\d{1,2}):(\d{2}):(\d{2})\s*(a\.?\s*m\.?|p\.?\s*m\.?)$/i);
  if (!m) return s;
  let hh = Number(m[2]);
  const ampm = m[5].toLowerCase().replace(/\./g, "").replace(/ /g, "");
  if (ampm === "pm" && hh !== 12) hh += 12;
  else if (ampm === "am" && hh === 12) hh = 0;
  return `${m[1]} ${String(hh).padStart(2, "0")}:${m[3]}:${m[4]}`;
}

function esEstadoRechazada(s) {
  return ESTADOS_RECHAZADA.has(normText(s));
}

export function detectarFormato(headers) {
  const h = new Set((headers || []).map((x) => String(x).trim()));
  if (h.has("Nombre Destino") && h.has("Tipo") && h.has("ID")) return "lohas";
  if (h.has("ID Externo") || h.has("Código COELSA") || h.has("Dirección")) return "hg";
  if (h.has("Merchant Order No") || h.has("Conttraparte")) return "riven";
  return null;
}

function esIva(banco, fila) {
  if (banco === BANCO_HG) return normText(fila.Concepto).includes("fee");
  if (banco === BANCO_RIVEN) {
    const tipo = normText(fila.Type);
    return tipo === "fee" || tipo === "fee_cobro" || normText(fila.Concepto).includes("cobro fees");
  }
  return false;
}

function adaptLohas(r) {
  const tipo = rstripChars(normText(r.Tipo), " -.,");
  const direccion = tipo === "transferencia entrante" ? "entrante" : "saliente";
  return {
    banco: BANCO_LOHAS,
    id: r.ID || "",
    id_interno: String(r.Trx || "").trim(),
    fecha_hora: r["Fecha/Hora"] || "",
    titular_cuenta: r.Titular || "",
    direccion,
    titular: limpiarNombre(r["Nombre Destino"]),
    importe: r.Importe || "",
    tipo_raw: r.Tipo || "",
    es_iva: TIPOS_IVA_LOHAS.has(tipo) || normText(r["Nombre Destino"]).includes("impuesto"),
    es_rechazada: esEstadoRechazada(r.Estado),
  };
}

function adaptHg(r) {
  const direccion = normText(r["Dirección"]) === "entrante" ? "entrante" : "saliente";
  const contraparte = direccion === "entrante" ? (r["Nombre Remitente"] || "") : (r["Nombre Destinatario"] || "");
  return {
    banco: BANCO_HG,
    id: String(r["Código COELSA"] || "").trim(),
    id_interno: String(r["ID Interno"] || "").trim(),
    fecha_hora: limpiarFecha(r.Fecha || ""),
    titular_cuenta: r.Cuenta || "",
    direccion,
    titular: limpiarNombre(contraparte),
    importe: r.Monto || "",
    tipo_raw: r.Tipo || "",
    es_iva: esIva(BANCO_HG, r),
    es_rechazada: esEstadoRechazada(r.Estado),
  };
}

function adaptRiven(r, rivenTitular) {
  const tipo = normText(r.Type);
  const direccion = ["ingreso", "payment", "inbound"].includes(tipo) ? "entrante" : "saliente";
  return {
    banco: BANCO_RIVEN,
    id: r["Merchant Order No"] || "",
    id_interno: "",
    fecha_hora: limpiarFecha(r["Transaction Date"] || ""),
    titular_cuenta: rivenTitular || r.Cuenta || "",
    direccion,
    titular: limpiarNombre(r.Conttraparte),
    importe: r.Amount || "",
    tipo_raw: r.Type || "",
    es_iva: esIva(BANCO_RIVEN, r),
    es_rechazada: esEstadoRechazada(r.Status),
  };
}

export function primeraLinea(text) {
  const s = String(text).replace(/^\uFEFF/, "");
  const i = s.indexOf("\n");
  return (i < 0 ? s : s.slice(0, i)).replace(/\r$/, "");
}

export function detectarDelim(text) {
  const line = primeraLinea(text);
  return (line.split(";").length - 1) > (line.split(",").length - 1) ? ";" : ",";
}

export function parseCsv(text, delim) {
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let inQ = false;
  const s = String(text).replace(/^\uFEFF/, "");
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQ = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') { inQ = true; i += 1; continue; }
    if (c === delim) { row.push(field); field = ""; i += 1; continue; }
    if (c === "\r") { i += 1; continue; }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function matrixAObjetos(matrix) {
  if (!matrix.length) return { headers: [], filas: [] };
  const headers = matrix[0];
  const filas = matrix.slice(1).map((r) => {
    const o = {};
    headers.forEach((h, i) => { o[h] = r[i] ?? ""; });
    return o;
  });
  return { headers, filas };
}

export function leerBancoTexto(text, nombreArchivo, { rivenTitular = "" } = {}) {
  const delim = detectarDelim(text);
  const matrix = parseCsv(text, delim);
  const { headers, filas } = matrixAObjetos(matrix);
  const fmt = detectarFormato(headers);
  if (!fmt) {
    const err = new Error(`No reconozco el formato de: ${nombreArchivo}. Columnas: ${headers.join(", ")}`);
    err.code = "FORMATO";
    err.columnas = headers;
    throw err;
  }
  const registros = [];
  for (const r of filas) {
    const idv = String(r.ID || r["ID Externo"] || r["Merchant Order No"] || "").trim();
    if (!idv) continue;
    if (fmt === "lohas" && !/^\d+$/.test(idv.replace(/,/g, "").replace(/\./g, ""))) continue;
    if (fmt === "lohas") registros.push(adaptLohas(r));
    else if (fmt === "hg") registros.push(adaptHg(r));
    else registros.push(adaptRiven(r, rivenTitular));
  }
  return { fmt, banco: BANCO_POR_FORMATO[fmt], registros, columnas: headers };
}

function pad2(n) { return String(n).padStart(2, "0"); }

export function fmtFecha(s) {
  if (!s) return "";
  s = String(s).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.includes("T") || s.endsWith("Z") ? s : s.replace(" ", "T");
    const dt = new Date(iso.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(iso) ? iso : `${iso}Z`);
    if (!Number.isNaN(dt.getTime()) && (s.includes("T") || s.endsWith("Z"))) {
      const ar = new Date(dt.getTime() + AR_OFFSET_MS);
      return `${pad2(ar.getUTCDate())}/${pad2(ar.getUTCMonth() + 1)}/${ar.getUTCFullYear()} ${pad2(ar.getUTCHours())}:${pad2(ar.getUTCMinutes())}:${pad2(ar.getUTCSeconds())}`;
    }
  }
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return `${pad2(m[1])}/${pad2(m[2])}/${m[3]} ${pad2(m[4])}:${m[5]}:${m[6] || "00"}`;
  }
  return s;
}

export function fmtImporte(s) {
  const c0 = parseMonto(s);
  if (c0 == null) return s == null ? "" : String(s);
  const c = Math.abs(c0);
  if (c % 100 === 0) return String(Math.trunc(c / 100));
  return (c / 100).toFixed(2).replace(".", ",");
}

export function fechaYTurno(fechaHora) {
  const m = String(fechaHora || "").match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}):/);
  if (!m) return ["", ""];
  const h = Number(m[2]);
  let turno = "Turno noche";
  if (h >= 6 && h < 14) turno = "Turno mañana";
  else if (h >= 14 && h < 22) turno = "Turno tarde";
  return [m[1], turno];
}

export function filaBalance(banco, idv, fecha, titularCuenta, tipoOut, titular, importe, etiqueta) {
  const fh = fmtFecha(fecha);
  const [fechaSolo, turno] = fechaYTurno(fh);
  return {
    FechaHora: fh,
    ID: idv == null ? "" : String(idv),
    Empresa: banco == null ? "" : String(banco),
    "Titular de cuenta": titularCuenta == null ? "" : String(titularCuenta),
    "Tipo de transferencia": tipoOut,
    Titular: titular == null ? "" : String(titular),
    Origen: "",
    Importe: fmtImporte(importe),
    Estado: "",
    Nota: "",
    FECHA: fechaSolo,
    "TURNO ": turno,
    Etiqueta: etiqueta || "",
  };
}

function parseHoraPlanilla(s) {
  const m = String(s || "").trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function montoPlano(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (Number.isInteger(v)) return String(v);
    const red = Math.round(v * 100) / 100;
    return String(red);
  }
  return v == null ? "" : String(v).trim();
}

function horaPlana(v) {
  if (typeof v === "number" && Number.isFinite(v)) {
    const frac = ((v % 1) + 1) % 1;
    const total = Math.round(frac * 24 * 60);
    const mins = ((total % 1440) + 1440) % 1440;
    const hh = Math.floor(mins / 60);
    const mm = mins % 60;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  const s = v == null ? "" : String(v).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return s;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** La planilla guarda 2000; el formato de la hoja lo muestra como $2.000. Se lee el número. */
export function normalizarPlanilla(filas) {
  return (filas || []).map((row, index) => {
    const celdas = (row || []).map((c) => (c == null ? "" : c));
    if (index < 2) return celdas.map((c) => String(c));
    if (celdas.length > 2) celdas[2] = montoPlano(celdas[2]);
    if (celdas.length > 3) celdas[3] = horaPlana(celdas[3]);
    return celdas.map((c) => (typeof c === "number" ? String(c) : String(c)));
  });
}

function fechaMinutosBanco(fechaHora) {
  const fh = fmtFecha(fechaHora);
  const m = fh.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})/);
  if (!m) return [null, null];
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  return [`${y}-${pad2(mo)}-${pad2(d)}`, Number(m[4]) * 60 + Number(m[5])];
}

function montosCercanos(planillaCent, bancoCent) {
  if (planillaCent === bancoCent) return true;
  if (Math.trunc(planillaCent / 100) === Math.trunc(bancoCent / 100)) return true;
  return Math.abs(planillaCent - bancoCent) <= DEPOSITO_TOL_CENT;
}

function horasCercanas(a, b) {
  if (a == null || b == null) return false;
  let diff = Math.abs(a - b);
  diff = Math.min(diff, 1440 - diff);
  return diff <= HORA_TOL_MIN;
}

export function cargarPlanillaFilas(rows, fechaISO) {
  const cargas = new Map();
  for (const r of (rows || []).slice(2)) {
    if (!r || r.length < 3) continue;
    const nombre = String(r[1] ?? "");
    const monto = String(r[2] ?? "");
    const horaBanco = r.length > 3 ? String(r[3] ?? "") : "";
    if (!nombre.trim() || !monto.trim()) continue;
    const m = parseMonto(monto);
    if (m == null) continue;
    const key = claveNombre(nombre);
    if (!cargas.has(key)) cargas.set(key, []);
    cargas.get(key).push({
      monto: m,
      hora_min: parseHoraPlanilla(horaBanco),
      fecha: fechaISO || null,
      es_discrepancia: m === MONTO_MARCADOR_DISCREPANCIA,
      consumida: false,
    });
  }
  return cargas;
}

export function planillaPareceValida(rows) {
  const celda = String((rows?.[1] || [])[1] ?? "");
  return normText(celda).includes("nombre de cliente");
}

function matchDeposito(cargas, nombre, monto, fechaHoraBanco) {
  const nombreNorm = claveNombre(nombre);
  const lst = cargas.get(nombreNorm) || [];
  const [bkFecha, bkMin] = fechaMinutosBanco(fechaHoraBanco);

  const distHora = (horaMin) => {
    if (horaMin == null || bkMin == null) return null;
    const diff = Math.abs(horaMin - bkMin);
    return Math.min(diff, 1440 - diff);
  };

  const mejorCandidato = (lista) => {
    const candidatos = lista.filter((e) => !e.consumida && !e.es_discrepancia && montosCercanos(e.monto, monto));
    const conHora = candidatos.filter((e) => distHora(e.hora_min) != null);
    const enTolerancia = conHora.filter((e) => horasCercanas(e.hora_min, bkMin));
    const sinHora = candidatos.filter((e) => distHora(e.hora_min) == null);
    const elegibles = enTolerancia.length ? enTolerancia : sinHora;
    let mejor = null;
    let mejorKey = null;
    for (const e of elegibles) {
      const dist = distHora(e.hora_min);
      const key = [Math.abs(e.monto - monto), dist == null ? 0 : dist];
      if (!mejor || key[0] < mejorKey[0] || (key[0] === mejorKey[0] && key[1] < mejorKey[1])) {
        mejor = e;
        mejorKey = key;
      }
    }
    return mejor;
  };

  if (monto != null) {
    let mejor = mejorCandidato(lst);
    if (!mejor) {
      const candidatas = [];
      for (const [k, v] of cargas) {
        if (k === nombreNorm) continue;
        if (!v.some((e) => !e.consumida)) continue;
        if (nombresParecidos(nombreNorm, k)) candidatas.push(k);
      }
      if (candidatas.length === 1) mejor = mejorCandidato(cargas.get(candidatas[0]));
    }
    if (mejor) {
      mejor.consumida = true;
      return ETIQUETA_DEPOSITO;
    }
  }
  if (!lst.length || monto == null) return null;

  let mejor = null;
  let mejorDiff = null;
  for (const e of lst) {
    if (e.consumida || !e.es_discrepancia) continue;
    if (e.fecha && bkFecha && e.fecha !== bkFecha) continue;
    if (!horasCercanas(e.hora_min, bkMin)) continue;
    let diff = (e.hora_min != null && bkMin != null) ? Math.abs(e.hora_min - bkMin) : 0;
    diff = Math.min(diff, 1440 - diff);
    if (!mejor || diff < mejorDiff) {
      mejor = e;
      mejorDiff = diff;
    }
  }
  if (mejor) {
    mejor.consumida = true;
    return ETIQUETA_DEPOSITO;
  }
  return null;
}

export function monedaDeEgreso(r) {
  const banco = normText(r.empresa_salida);
  if (BANCOS_USDT.some((k) => banco.includes(k))) return "USDT";
  const raw = normText(r.moneda || r.Moneda || r.currency || r.tipo_moneda || "");
  if (raw.includes("usdt") || raw.includes("tether")) return "USDT";
  if (raw.includes("peso") || raw === "ars" || raw === "arg") return "ARS";
  return "ARS";
}

export function indexarEgresos(filas) {
  const salidas = new Map();
  const porBancoMonto = new Map();
  const porId = new Map();
  const todas = [];
  const push = (map, key, fila) => {
    const k = JSON.stringify(key);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(fila);
  };
  for (const r of filas) {
    const etiqueta = String(r.etiqueta || "").trim();
    if (normText(etiqueta) === ETIQUETA_EXCLUIR) continue;
    const banco = normText(r.empresa_salida);
    const monto = parseMonto(r.monto_raw || r.monto);
    const nombre = r.cuenta_receptora || "";
    const moneda = monedaDeEgreso(r);
    const fila = { raw: r, etiqueta, banco, monto, nombre, moneda, consumida: false };
    if (moneda === "ARS") {
      push(salidas, [banco, claveNombre(nombre), monto], fila);
      push(porBancoMonto, [banco, monto], fila);
      const idv = String(r.id_transferencia || "").trim();
      if (idv && !porId.has(idv)) porId.set(idv, fila);
    }
    todas.push(fila);
  }
  return { salidas, porBancoMonto, porId, todas };
}

function tomar(lista) {
  if (!lista) return null;
  for (const fila of lista) {
    if (!fila.consumida) {
      fila.consumida = true;
      return fila.etiqueta;
    }
  }
  return null;
}

function matchSalidaPorId(porId, ids) {
  for (const idv0 of ids) {
    const idv = String(idv0 || "").trim();
    if (!idv) continue;
    const fila = porId.get(idv);
    if (fila && !fila.consumida) {
      fila.consumida = true;
      return fila.etiqueta;
    }
  }
  return null;
}

function matchSalida(salidas, porBancoMonto, banco, nombre, monto) {
  const porNombre = tomar(salidas.get(JSON.stringify([normText(banco), claveNombre(nombre), monto])));
  if (porNombre != null) return porNombre;
  return tomar(porBancoMonto.get(JSON.stringify([normText(banco), monto])));
}

function tipoInvertido(tipo) {
  return tipo === "Transferencia Saliente" ? "Transferencia Entrante" : "Transferencia Saliente";
}

export function calcularCuadre(cargas, salida) {
  let planillaTotal = 0;
  let planillaFilas = 0;
  let marcadores = 0;
  let marcadoresMonto = 0;
  let consumidas = 0;
  let sinMatch = 0;
  for (const entries of cargas.values()) {
    for (const e of entries) {
      planillaTotal += e.monto;
      planillaFilas += 1;
      if (e.es_discrepancia) {
        marcadores += 1;
        marcadoresMonto += e.monto;
      }
      if (e.consumida) consumidas += 1;
      else sinMatch += 1;
    }
  }
  const planillaSinMarcadores = planillaTotal - marcadoresMonto;
  let depoCent = 0;
  let discCent = 0;
  let entrantesSin = 0;
  let depoN = 0;
  let discN = 0;
  for (const row of salida) {
    if (!normText(row["Tipo de transferencia"]).includes("entrante")) continue;
    const m = parseMonto(row.Importe) || 0;
    const et = normText(row.Etiqueta);
    if (et.includes("deposito de cliente")) { depoCent += m; depoN += 1; }
    else if (et.includes("discrepancia")) { discCent += m; discN += 1; }
    else if (!et.trim()) entrantesSin += m;
  }
  const bancoDepositos = depoCent + discCent;
  let marcadoresPendientes = 0;
  for (const entries of cargas.values()) {
    for (const e of entries) {
      if (e.es_discrepancia && !e.consumida) marcadoresPendientes += 1;
    }
  }
  const pesos = (cent) => Math.round(cent) / 100;
  return {
    planilla_total_pesos: pesos(planillaTotal),
    planilla_sin_marcadores_pesos: pesos(planillaSinMarcadores),
    planilla_filas: planillaFilas,
    planilla_consumidas: consumidas,
    planilla_sin_match: sinMatch,
    marcadores_20k: marcadores,
    marcadores_20k_pesos: pesos(marcadoresMonto),
    marcadores_pendientes: marcadoresPendientes,
    banco_deposito_pesos: pesos(depoCent),
    banco_deposito_filas: depoN,
    banco_discrepancia_pesos: pesos(discCent),
    banco_discrepancia_filas: discN,
    banco_depositos_pesos: pesos(bancoDepositos),
    diferencia_pesos: pesos(planillaSinMarcadores - bancoDepositos),
    entrantes_sin_etiqueta_pesos: pesos(entrantesSin),
  };
}

export function resumenEtiquetas(filas) {
  const map = new Map();
  for (const f of filas) {
    const et = f.Etiqueta || "(sin etiqueta)";
    if (!map.has(et)) map.set(et, { etiqueta: et, cantidad: 0, total_cent: 0 });
    const cur = map.get(et);
    cur.cantidad += 1;
    cur.total_cent += Math.abs(parseMonto(f.Importe) || 0);
  }
  return [...map.values()]
    .map((x) => ({ etiqueta: x.etiqueta, cantidad: x.cantidad, total: x.total_cent / 100 }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

export function filasAMatriz(filas, columns = OUTPUT_COLUMNS) {
  return filas.map((f) => columns.map((c) => (f[c] == null ? "" : String(f[c]))));
}

export function claveMovimiento(row) {
  const r = Array.isArray(row) ? row : filasAMatriz([row])[0];
  return [r[1] || "", r[4] || "", r[7] || "", r[5] || "", r[0] || ""].join("|");
}

/**
 * @param {{ nombre: string, texto: string }[]} bancos
 * @param {object[]} egresos filas con los nombres del export del formulario
 * @param {string[][]} planillaFilas matriz de la pestaña del día (con encabezados)
 * @param {string} planillaFecha YYYY-MM-DD
 */
export function fechaIsoDeRegistro(reg) {
  const fh = fmtFecha(reg?.fecha_hora);
  const m = fh.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function diaSiguiente(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

export function listarDias(desde, hasta) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
    return { ok: false, message: "Elegí un rango válido: desde no puede ser posterior a hasta" };
  }
  const dias = [];
  let cur = desde;
  while (cur && cur <= hasta) {
    dias.push(cur);
    if (dias.length > 31) return { ok: false, message: "El rango máximo es 31 días" };
    cur = diaSiguiente(cur);
  }
  return { ok: true, dias };
}

export function registrosDelDia(registros, fechaISO) {
  return (registros || []).filter((r) => fechaIsoDeRegistro(r) === fechaISO);
}

export function sumarCuadres(cuadres) {
  const base = {
    planilla_total_pesos: 0,
    planilla_sin_marcadores_pesos: 0,
    planilla_filas: 0,
    planilla_consumidas: 0,
    planilla_sin_match: 0,
    marcadores_20k: 0,
    marcadores_20k_pesos: 0,
    marcadores_pendientes: 0,
    banco_deposito_pesos: 0,
    banco_deposito_filas: 0,
    banco_discrepancia_pesos: 0,
    banco_discrepancia_filas: 0,
    banco_depositos_pesos: 0,
    diferencia_pesos: 0,
    entrantes_sin_etiqueta_pesos: 0,
  };
  for (const c of cuadres || []) {
    for (const k of Object.keys(base)) base[k] += Number(c[k]) || 0;
  }
  const red = (n) => Math.round(n * 100) / 100;
  for (const k of Object.keys(base)) base[k] = Number.isInteger(base[k]) ? base[k] : red(base[k]);
  base.diferencia_pesos = red(base.planilla_sin_marcadores_pesos - base.banco_depositos_pesos);
  return base;
}

export function transformar({ bancos, egresos, planillaFilas, planillaFecha, rivenTitular, registros, bancosPresentes: bancosForzados }) {
  const cargas = cargarPlanillaFilas(planillaFilas || [], planillaFecha);
  const { salidas, porBancoMonto, porId, todas } = indexarEgresos(egresos || []);

  const bancosPresentes = new Set();
  const todosRegistros = [];
  const resumenFormatos = [];

  if (Array.isArray(registros)) {
    for (const b of bancosForzados || []) bancosPresentes.add(normText(b));
    for (const reg of registros) todosRegistros.push(reg);
  } else {
    for (const archivo of bancos || []) {
      const leido = leerBancoTexto(archivo.texto, archivo.nombre, { rivenTitular });
      resumenFormatos.push({
        archivo: archivo.nombre,
        formato: leido.fmt,
        banco: leido.banco,
        filas: leido.registros.length,
      });
      for (const reg of leido.registros) {
        bancosPresentes.add(normText(reg.banco));
        todosRegistros.push(reg);
      }
    }
  }

  const etiquetaPorId = new Map();
  for (const reg of todosRegistros) {
    if (reg.es_rechazada || reg.es_iva || reg.direccion !== "saliente") continue;
    const et = matchSalidaPorId(porId, [reg.id, reg.id_interno]);
    if (et != null) etiquetaPorId.set(reg, et);
  }

  const salida = [];
  const salidaUsdt = [];
  const revisar = [];

  for (const reg of todosRegistros) {
    const monto = parseMonto(reg.importe);
    let mot = null;
    let tipoOut;
    let etiqueta;

    if (reg.es_rechazada) {
      tipoOut = reg.direccion === "saliente" ? "Transferencia Saliente" : "Transferencia Entrante";
      etiqueta = ETIQUETA_RECHAZADA;
    } else if (reg.es_iva) {
      tipoOut = "Transferencia Saliente";
      etiqueta = ETIQUETA_IVA;
    } else if (reg.direccion === "entrante") {
      tipoOut = "Transferencia Entrante";
      etiqueta = matchDeposito(cargas, reg.titular, monto, reg.fecha_hora) || "";
      if (!etiqueta) mot = "Entrante sin coincidencia en Planilla";
    } else {
      tipoOut = "Transferencia Saliente";
      etiqueta = etiquetaPorId.has(reg) ? etiquetaPorId.get(reg) : undefined;
      if (etiqueta == null && monto != null) {
        etiqueta = matchSalida(salidas, porBancoMonto, reg.banco, reg.titular, Math.abs(monto));
      }
      if (etiqueta == null) {
        etiqueta = "";
        mot = "Saliente sin coincidencia en egresos";
      }
    }

    const fila = filaBalance(
      reg.banco, reg.id, reg.fecha_hora, reg.titular_cuenta,
      tipoOut, reg.titular, reg.importe, etiqueta,
    );
    salida.push(fila);
    if (normText(etiqueta).includes(ETIQUETA_REDIRECCION)) {
      const pata = { ...fila, "Tipo de transferencia": tipoInvertido(tipoOut) };
      salida.push(pata);
    }
    if (mot) revisar.push({ ...fila, Motivo: mot });
  }

  for (const fila of todas) {
    if (fila.consumida || bancosPresentes.has(fila.banco)) continue;
    const r = fila.raw;
    const f = filaBalance(
      r.empresa_salida || "",
      r.id_transferencia || "",
      `${r.fecha || ""} ${r.hora || ""}`.trim(),
      r.cuenta_salida || "",
      "Transferencia Saliente",
      r.cuenta_receptora || "",
      r.monto_raw || r.monto || "",
      fila.etiqueta,
    );
    const destino = fila.moneda === "USDT" ? salidaUsdt : salida;
    destino.push(f);
    if (normText(fila.etiqueta).includes(ETIQUETA_REDIRECCION)) {
      destino.push({ ...f, "Tipo de transferencia": "Transferencia Entrante" });
    }
  }

  return {
    salida,
    revisar,
    salidaUsdt,
    cuadre: calcularCuadre(cargas, salida),
    resumenFormatos,
    bancosPresentes: [...bancosPresentes],
    registros: todosRegistros,
  };
}

export function contarFechasFuera(registros, fechaDDMMAAAA) {
  let fuera = 0;
  const otras = new Map();
  for (const reg of registros || []) {
    const fh = fmtFecha(reg.fecha_hora);
    const m = fh.match(/^(\d{2}\/\d{2}\/\d{4})/);
    const dia = m ? m[1] : "";
    if (dia !== fechaDDMMAAAA) {
      fuera += 1;
      if (dia) otras.set(dia, (otras.get(dia) || 0) + 1);
    }
  }
  return { fuera, otras: [...otras.entries()].map(([fecha, cantidad]) => ({ fecha, cantidad })) };
}

export function contarDirecciones(registros, banco) {
  let entrante = 0;
  let saliente = 0;
  for (const reg of registros || []) {
    if (reg.banco !== banco) continue;
    if (reg.direccion === "entrante") entrante += 1;
    else saliente += 1;
  }
  return { entrante, saliente };
}

export function isoAFecha(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Primera fila de Sheets (1-based) libre para cargar, sin pisar el encabezado ni filas con movimiento. */
export function filaInicioCarga(existing) {
  if (!existing?.length) return 1;
  for (let i = 1; i < existing.length; i += 1) {
    const fh = String(existing[i]?.[0] ?? "").trim();
    const id = String(existing[i]?.[1] ?? "").trim();
    if (!fh && !id) return i + 1;
  }
  return existing.length + 1;
}

export function tabDeFecha(fechaDDMMAAAA) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(fechaDDMMAAAA || "").trim());
  if (!m) return null;
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const idx = Number(m[2]) - 1;
  return meses[idx] || null;
}

export function csvEscape(v) {
  const s = v == null ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function filasACsv(filas, columns = OUTPUT_COLUMNS) {
  const lineas = [columns.map(csvEscape).join(",")];
  for (const f of filas) {
    lineas.push(columns.map((c) => csvEscape(f[c] ?? "")).join(","));
  }
  return lineas.join("\n");
}

function esEntrada(r) {
  return String(r.tipo_transaccion || "").toUpperCase() === "ENTRADA";
}

/** Billetera propia del movimiento. La entrada entra en la cuenta receptora; la salida sale de la cuenta de salida. El cierre se guarda en cuenta de salida. */
function billeteraDe(r) {
  if (esEntrada(r)) return r.cuenta_receptora || "";
  return r.cuenta_salida || "";
}

function claveCuenta(r) {
  return [r.empresa_salida || "", billeteraDe(r), monedaDeEgreso(r)].join("|");
}

function ultimoPorCuenta(rows) {
  const map = new Map();
  const ordered = [...rows].sort((a, b) => String(b.hora || "").localeCompare(String(a.hora || "")));
  for (const r of ordered) {
    const k = claveCuenta(r);
    if (!map.has(k)) map.set(k, r);
  }
  return map;
}

function sumaMonto(rows) {
  return rows.reduce((s, r) => s + (Number(r.monto) || 0), 0);
}

/**
 * USDT del formulario: cierre del día anterior + entradas/salidas del día.
 * diferencia = cierre de hoy − (cierre de ayer + entradas − salidas).
 */
export function armarCuadreUsdt({ cierresAyer = [], movimientos = [], cierresHoy = [] } = {}) {
  const esUsdt = (r) => monedaDeEgreso(r) === "USDT";
  const ayer = ultimoPorCuenta(cierresAyer.filter(esUsdt));
  const hoy = ultimoPorCuenta(cierresHoy.filter(esUsdt));
  const movs = movimientos.filter((r) => esUsdt(r) && normText(r.etiqueta) !== ETIQUETA_EXCLUIR);
  const keys = new Set([...ayer.keys(), ...hoy.keys(), ...movs.map(claveCuenta)]);
  const cuentas = [];
  for (const k of keys) {
    const sample = ayer.get(k) || hoy.get(k) || movs.find((r) => claveCuenta(r) === k);
    const delDia = movs.filter((r) => claveCuenta(r) === k);
    const entradasRows = delDia.filter((r) => String(r.tipo_transaccion || "").toUpperCase() === "ENTRADA");
    const salidasRows = delDia.filter((r) => String(r.tipo_transaccion || "").toUpperCase() !== "ENTRADA");
    const entradas = Math.round(sumaMonto(entradasRows) * 100) / 100;
    const salidas = Math.round(sumaMonto(salidasRows) * 100) / 100;
    const cierreAnt = ayer.has(k) ? Number(ayer.get(k).monto) : null;
    const cierreHoy = hoy.has(k) ? Number(hoy.get(k).monto) : null;
    const saldo = cierreAnt == null ? null : Math.round((cierreAnt + entradas - salidas) * 100) / 100;
    const diferencia = saldo == null || cierreHoy == null ? null : Math.round((cierreHoy - saldo) * 100) / 100;
    cuentas.push({
      empresa: sample.empresa_salida,
      cuenta: billeteraDe(sample),
      moneda: "USDT",
      cierre_anterior: cierreAnt,
      entradas,
      salidas,
      saldo_calculado: saldo,
      cierre_dia: cierreHoy,
      diferencia,
      cuadra: diferencia === 0,
      movimientos: delDia.map((r) => {
        const tipo = String(r.tipo_transaccion || "SALIDA").toUpperCase();
        return {
          hora: r.hora || "",
          tipo,
          etiqueta: r.etiqueta || "",
          monto: Number(r.monto) || 0,
          contraparte: tipo === "ENTRADA" ? (r.cuenta_salida || "") : (r.cuenta_receptora || ""),
          id_transferencia: r.id_transferencia || "",
        };
      }),
    });
  }
  cuentas.sort((a, b) => String(a.empresa).localeCompare(String(b.empresa)) || String(a.cuenta).localeCompare(String(b.cuenta)));
  return {
    cuentas,
    hay_discrepancia: cuentas.some((c) => c.diferencia !== 0),
  };
}

export function egresosDesdeCsv(text) {
  const delim = detectarDelim(text);
  const { headers, filas } = matrixAObjetos(parseCsv(text, delim));
  return filas.map((r) => {
    const o = {};
    for (const h of headers) o[String(h).trim()] = r[h];
    return o;
  });
}
