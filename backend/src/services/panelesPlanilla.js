// Lectura de la planilla BALANCE mensual (hojas por día "1".."31" y
// "CONTROL NETWIN DIARIO") para importar meses que ya están cargados ahí.
// Solo transforma matrices de valores; leer la planilla y guardar es del script.

// Rango de cada hoja diaria: B8:L25. Fila 8 = socios, fila 22 = paneles personales.
export const RANGO_HOJA_DIA = "B8:L25";
export const RANGO_CONTROL = "A2:C32";

const esNumero = (v) => typeof v === "number" && Number.isFinite(v);
const numeroOpcional = (v) => (esNumero(v) ? v : undefined);

/**
 * Convierte los valores (sin formato) de B8:L25 de una hoja diaria en filas
 * para normalizarIngesta. Toma solo filas con nombre y netwin o entrada
 * numéricos (así saltea títulos, encabezados y los totales).
 */
export function filasHojaDia(matriz) {
  const filas = [];
  for (const [i, fila] of (matriz || []).entries()) {
    const [nombre, netwin, entrada, salida, opsEntrada, opsSalida, , , bonos, , inversion] = fila || [];
    const texto = typeof nombre === "string" ? nombre.trim() : "";
    if (!texto || /^TOTAL/i.test(texto)) continue;
    if (!esNumero(netwin) && !esNumero(entrada)) continue;

    const item = {
      nombre: texto,
      netwin: numeroOpcional(netwin),
      entrada: numeroOpcional(entrada),
      salida: numeroOpcional(salida)
    };
    // Las columnas F..L solo existen para los paneles personales (fila 22 en adelante).
    if (i >= 14) {
      item.ops_entrada = esNumero(opsEntrada) ? Math.round(opsEntrada) : undefined;
      item.ops_salida = esNumero(opsSalida) ? Math.round(opsSalida) : undefined;
      item.bonos = numeroOpcional(bonos);
      item.inversion_publicidad = numeroOpcional(inversion);
    }
    filas.push(item);
  }
  return filas;
}

// Fecha serial de Sheets (días desde 30/12/1899) a AAAA-MM-DD.
export function serialAFecha(serial) {
  if (!esNumero(serial)) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * CONTROL NETWIN DIARIO (A: fecha, B: netwin general del admin, C: AgenteMC).
 * Devuelve { "AAAA-MM-DD": [{ nombre: "ADMIN", netwin }, { nombre: "AGENTEMC", netwin }] }.
 */
export function filasControlNetwin(matriz) {
  const porFecha = {};
  for (const fila of matriz || []) {
    const [serial, admin, agenteMc] = fila || [];
    const fecha = serialAFecha(serial);
    if (!fecha) continue;
    const items = [];
    if (esNumero(admin)) items.push({ nombre: "ADMIN", netwin: admin });
    if (esNumero(agenteMc)) items.push({ nombre: "AGENTEMC", netwin: agenteMc });
    if (items.length) porFecha[fecha] = items;
  }
  return porFecha;
}
