import test from "node:test";
import assert from "node:assert/strict";
import { cotizacionEnVivo, _resetCotizacionCache } from "../../src/services/cotizacion.js";

const respuesta = (cuerpo, ok = true) => async () => ({ ok, status: ok ? 200 : 500, json: async () => cuerpo });

test("cotizacionEnVivo toma el ask de CriptoYa y lo guarda 5 minutos", async () => {
  _resetCotizacionCache();
  const a = await cotizacionEnVivo({ fetchFn: respuesta({ ask: 1792.2, time: 1795549527 }), ahora: 0 });
  assert.equal(a.valor, 1792.2);
  const b = await cotizacionEnVivo({ fetchFn: respuesta({ ask: 9999 }), ahora: 60_000 });
  assert.equal(b.valor, 1792.2);
  const c = await cotizacionEnVivo({ fetchFn: respuesta({ ask: 1800 }), ahora: 6 * 60_000 });
  assert.equal(c.valor, 1800);
});

test("si CriptoYa falla devuelve la última leída o null", async () => {
  _resetCotizacionCache();
  assert.equal(await cotizacionEnVivo({ fetchFn: respuesta({}, false), ahora: 0 }), null);
  await cotizacionEnVivo({ fetchFn: respuesta({ ask: 1790 }), ahora: 0 });
  const r = await cotizacionEnVivo({ fetchFn: async () => { throw new Error("red"); }, ahora: 10 * 60_000 });
  assert.equal(r.valor, 1790);
});
