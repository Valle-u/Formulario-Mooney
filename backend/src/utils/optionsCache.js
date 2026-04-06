import { query } from "../config/db.js";
import {
  EMPRESAS_SALIDA,
  ETIQUETAS_CON_USUARIO_CASINO,
  ETIQUETAS_PREMIO_MINIMO,
  ETIQUETAS_CIERRE_CAJA
} from "./validators.js";

// Cache en memoria con TTL
let _cache = null;
let _cacheTimestamp = 0;
const CACHE_TTL_MS = 60_000; // 60 segundos

async function loadFromDB() {
  const { rows } = await query(
    `SELECT id, option_type, value, category, sort_order, is_active,
            flag_usuario_casino, flag_premio_minimo, flag_cierre_caja, legacy_value
     FROM select_options
     ORDER BY option_type, sort_order, id`
  );
  return rows;
}

async function getCache() {
  const now = Date.now();
  if (_cache && (now - _cacheTimestamp) < CACHE_TTL_MS) {
    return _cache;
  }

  try {
    const rows = await loadFromDB();
    _cache = {
      all: rows,
      empresas: rows.filter(r => r.option_type === "empresa" && r.is_active).map(r => r.value),
      etiquetas: rows.filter(r => r.option_type === "etiqueta" && r.is_active).map(r => r.value),
      etiquetaRows: rows.filter(r => r.option_type === "etiqueta" && r.is_active),
      flagsMap: {},
      legacyMap: {}
    };

    // Construir mapa de flags por valor
    for (const r of rows) {
      if (r.option_type === "etiqueta") {
        _cache.flagsMap[r.value] = {
          flag_usuario_casino: r.flag_usuario_casino,
          flag_premio_minimo: r.flag_premio_minimo,
          flag_cierre_caja: r.flag_cierre_caja
        };
        // Construir mapa legacy bidireccional
        if (r.legacy_value) {
          _cache.legacyMap[r.legacy_value] = r.value;
          _cache.legacyMap[r.value] = r.legacy_value;
        }
      }
    }

    _cacheTimestamp = now;
    return _cache;
  } catch (err) {
    console.error("Error loading select_options from DB, using fallback:", err.message);
    // Fallback a constantes hardcodeadas
    return _buildFallbackCache();
  }
}

function _buildFallbackCache() {
  return {
    all: [],
    empresas: [...EMPRESAS_SALIDA],
    etiquetas: [],
    etiquetaRows: [],
    flagsMap: Object.fromEntries(
      [...ETIQUETAS_CON_USUARIO_CASINO].map(v => [v, {
        flag_usuario_casino: true,
        flag_premio_minimo: ETIQUETAS_PREMIO_MINIMO.has(v),
        flag_cierre_caja: false
      }])
    ),
    legacyMap: {}
  };
}

// === Funciones exportadas ===

export async function getActiveEmpresas() {
  const cache = await getCache();
  return cache.empresas;
}

export async function getActiveEtiquetas() {
  const cache = await getCache();
  return cache.etiquetas;
}

export async function getActiveEtiquetaRows() {
  const cache = await getCache();
  return cache.etiquetaRows;
}

export async function isValidEmpresa(value) {
  const cache = await getCache();
  return cache.empresas.includes(value);
}

export async function getEtiquetaFlags(value) {
  const cache = await getCache();
  return cache.flagsMap[value] || {
    flag_usuario_casino: false,
    flag_premio_minimo: false,
    flag_cierre_caja: false
  };
}

export async function getLegacyEquivalentes(etiqueta) {
  if (!etiqueta) return [];
  const cache = await getCache();
  const equivalentes = [etiqueta];
  if (cache.legacyMap[etiqueta]) {
    equivalentes.push(cache.legacyMap[etiqueta]);
  }
  return equivalentes;
}

export function invalidateCache() {
  _cache = null;
  _cacheTimestamp = 0;
}
