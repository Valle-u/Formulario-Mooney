// Pedidos de scrapeo por rango de fechas (ver migración 042).
const QUE = new Set(["netwin", "pagos", "todo"]);
export const MAX_DIAS = 62;
// Un pedido "corriendo" hace más de esto se considera colgado y se puede volver a tomar.
export const HORAS_COLGADO = 3;

function fechaValida(texto) {
  const m = String(texto || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === texto ? d : null;
}

/** Valida lo que manda la pantalla. hoy = AAAA-MM-DD (no se piden días futuros). */
export function validarPedido(body, hoy) {
  const desde = fechaValida(body?.desde);
  const hasta = fechaValida(body?.hasta);
  if (!desde || !hasta) return { error: "Fechas inválidas (AAAA-MM-DD)" };
  if (hasta < desde) return { error: "La fecha hasta es anterior a desde" };
  if (body.hasta > hoy) return { error: "No se pueden pedir días futuros" };
  const dias = Math.round((hasta - desde) / 86400000) + 1;
  if (dias > MAX_DIAS) return { error: `Máximo ${MAX_DIAS} días por pedido` };
  const que = String(body?.que || "todo");
  if (!QUE.has(que)) return { error: "Qué traer inválido" };
  return { desde: body.desde, hasta: body.hasta, que, dias };
}

/**
 * Resultado que manda el scraper al terminar. "pendiente" = lo devuelve sin
 * correr (por ejemplo, Mooneymaker no responde) para reintentarlo después.
 */
export function validarResultado(body) {
  const estado = String(body?.estado || "");
  if (!["listo", "error", "pendiente"].includes(estado)) return { error: "estado inválido" };
  const lista = (v) => (Array.isArray(v) ? v.slice(0, 200).map((x) => String(x).slice(0, 300)) : []);
  return {
    estado,
    resultado: {
      dias_ok: lista(body.dias_ok),
      dias_error: lista(body.dias_error),
      errores: lista(body.errores),
      mensaje: body.mensaje ? String(body.mensaje).slice(0, 500) : null
    }
  };
}
