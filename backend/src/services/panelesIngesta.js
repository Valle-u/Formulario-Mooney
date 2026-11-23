// Ingesta de los datos diarios de los paneles de MooneyMaker (netwin,
// entrada, salida, etc.). La usan el endpoint del scraper y el script que
// importa los meses que ya están en la planilla BALANCE.

export const CAMPOS_MONTO = ["netwin", "entrada", "salida", "bonos", "inversion_publicidad"];
export const CAMPOS_ENTEROS = ["ops_entrada", "ops_salida"];
const CAMPOS = [...CAMPOS_MONTO, ...CAMPOS_ENTEROS];

const MAX_FILAS = 200;
const MAX_MONTO = 1e13; // NUMERIC(18,2)

export function fechaValida(texto) {
  if (typeof texto !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const [y, m, d] = texto.split("-").map(Number);
  if (y < 2020 || y > 2100) return false;
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

export function normalizarNombre(nombre) {
  return String(nombre ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

// Acepta número o texto ("1.234,56", "-135229", "$ 1.867,30").
// undefined/null/"" = el campo no vino (no se toca). Devuelve NaN si es inválido.
export function parseMonto(valor) {
  if (valor === undefined || valor === null || valor === "") return undefined;
  if (typeof valor === "number") {
    return Number.isFinite(valor) && Math.abs(valor) < MAX_MONTO ? Math.round(valor * 100) / 100 : NaN;
  }
  let texto = String(valor).replace(/[$\s]/g, "");
  if (!texto) return undefined;
  if (texto.includes(",")) texto = texto.replace(/\./g, "").replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(texto)) return NaN;
  return parseMonto(Number(texto));
}

function parseEntero(valor) {
  if (valor === undefined || valor === null || valor === "") return undefined;
  const n = Number(valor);
  return Number.isSafeInteger(n) && n >= 0 ? n : NaN;
}

/**
 * Valida el cuerpo { fecha, paneles: [{ nombre, netwin?, entrada?, ... }] }.
 * Devuelve { fecha, filas } o { error }.
 */
export function normalizarIngesta(body) {
  const fecha = body?.fecha;
  if (!fechaValida(fecha)) return { error: "fecha inválida (formato AAAA-MM-DD)" };

  const paneles = body?.paneles;
  if (!Array.isArray(paneles) || paneles.length === 0) return { error: "paneles vacío" };
  if (paneles.length > MAX_FILAS) return { error: `máximo ${MAX_FILAS} paneles por envío` };

  const filas = [];
  const vistos = new Set();
  for (const [i, item] of paneles.entries()) {
    const nombre = normalizarNombre(item?.nombre);
    if (!nombre) return { error: `paneles[${i}]: falta el nombre` };
    if (vistos.has(nombre)) return { error: `paneles[${i}]: ${nombre} está repetido` };
    vistos.add(nombre);

    const valores = {};
    for (const campo of CAMPOS) {
      const v = CAMPOS_ENTEROS.includes(campo) ? parseEntero(item[campo]) : parseMonto(item[campo]);
      if (Number.isNaN(v)) return { error: `paneles[${i}] (${nombre}): ${campo} inválido` };
      if (v !== undefined) valores[campo] = v;
    }
    if (Object.keys(valores).length === 0) return { error: `paneles[${i}] (${nombre}): no trae ningún dato` };
    filas.push({ nombre, valores });
  }
  return { fecha, filas };
}

/**
 * Guarda las filas en panel_diario. Un campo que no vino conserva el valor
 * anterior, así el netwin y las estadísticas de pago pueden llegar separados.
 * Los nombres se buscan por nombre o por usuario de MooneyMaker; los que no
 * existen se devuelven en `desconocidos` y no se crean.
 */
export async function guardarIngesta(client, { fecha, filas }, fuente = "scraper") {
  const paneles = await client.query(
    `SELECT id, nombre, mooneymaker_usuario FROM paneles`
  );
  const porNombre = new Map();
  for (const p of paneles.rows) {
    porNombre.set(normalizarNombre(p.nombre), p);
    if (p.mooneymaker_usuario) porNombre.set(normalizarNombre(p.mooneymaker_usuario), p);
  }

  const guardados = [];
  const desconocidos = [];
  for (const fila of filas) {
    const panel = porNombre.get(fila.nombre);
    if (!panel) {
      desconocidos.push(fila.nombre);
      continue;
    }
    const v = fila.valores;
    await client.query(
      `INSERT INTO panel_diario
         (fecha, panel_id, netwin, entrada, salida, ops_entrada, ops_salida, bonos, inversion_publicidad, fuente, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
       ON CONFLICT (fecha, panel_id) DO UPDATE SET
         netwin               = COALESCE(EXCLUDED.netwin, panel_diario.netwin),
         entrada              = COALESCE(EXCLUDED.entrada, panel_diario.entrada),
         salida               = COALESCE(EXCLUDED.salida, panel_diario.salida),
         ops_entrada          = COALESCE(EXCLUDED.ops_entrada, panel_diario.ops_entrada),
         ops_salida           = COALESCE(EXCLUDED.ops_salida, panel_diario.ops_salida),
         bonos                = COALESCE(EXCLUDED.bonos, panel_diario.bonos),
         inversion_publicidad = COALESCE(EXCLUDED.inversion_publicidad, panel_diario.inversion_publicidad),
         fuente               = EXCLUDED.fuente,
         updated_at           = NOW()`,
      [fecha, panel.id, v.netwin ?? null, v.entrada ?? null, v.salida ?? null,
        v.ops_entrada ?? null, v.ops_salida ?? null, v.bonos ?? null,
        v.inversion_publicidad ?? null, fuente]
    );
    guardados.push(panel.nombre);
  }
  return { guardados, desconocidos };
}
