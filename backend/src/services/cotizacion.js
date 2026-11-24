// Cotización USDT/ARS en vivo (Binance P2P vía CriptoYa, precio "ask"), la
// misma que usa la planilla. Se guarda en memoria 5 minutos.
const URL_COTIZACION = "https://criptoya.com/api/binance/usdt/ars/0.1";
const CACHE_MS = 5 * 60 * 1000;
let cache = null;

export async function cotizacionEnVivo({ fetchFn = fetch, ahora = Date.now() } = {}) {
  if (cache && ahora - cache.leida < CACHE_MS) return cache.dato;
  try {
    const res = await fetchFn(URL_COTIZACION, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const cuerpo = await res.json();
    const valor = Number(cuerpo?.ask);
    if (!Number.isFinite(valor) || valor <= 0) throw new Error("respuesta sin precio");
    const dato = { valor, fecha: new Date(Number(cuerpo.time) * 1000 || ahora).toISOString() };
    cache = { dato, leida: ahora };
    return dato;
  } catch (error) {
    console.error("⚠️ No pude leer la cotización en vivo:", error.message);
    // Si falla, sirve la última que se leyó aunque esté vieja.
    return cache?.dato ?? null;
  }
}

export function _resetCotizacionCache() {
  cache = null;
}
