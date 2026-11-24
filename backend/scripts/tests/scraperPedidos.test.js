import test from "node:test";
import assert from "node:assert/strict";
import { validarPedido, validarResultado } from "../../src/services/scraperPedidos.js";

test("validarPedido: rango válido, días futuros y máximo de días", () => {
  assert.deepEqual(validarPedido({ desde: "2026-10-01", hasta: "2026-10-31", que: "netwin" }, "2026-11-24"),
    { desde: "2026-10-01", hasta: "2026-10-31", que: "netwin", dias: 31 });
  assert.equal(validarPedido({ desde: "2026-10-01", hasta: "2026-10-31" }, "2026-11-24").que, "todo");
  assert.match(validarPedido({ desde: "2026-11-20", hasta: "2026-11-25" }, "2026-11-24").error, /futuros/);
  assert.match(validarPedido({ desde: "2026-11-10", hasta: "2026-11-01" }, "2026-11-24").error, /anterior/);
  assert.match(validarPedido({ desde: "2026-08-01", hasta: "2026-10-31" }, "2026-11-24").error, /Máximo/);
  assert.match(validarPedido({ desde: "2026-02-30", hasta: "2026-03-01" }, "2026-11-24").error, /inválidas/);
  assert.match(validarPedido({ desde: "2026-10-01", hasta: "2026-10-02", que: "borrar" }, "2026-11-24").error, /inválido/);
});

test("validarResultado: solo listo o error y listas recortadas", () => {
  const r = validarResultado({ estado: "listo", dias_ok: ["01/10/2026"], errores: [], mensaje: "ok" });
  assert.deepEqual(r, { estado: "listo", resultado: { dias_ok: ["01/10/2026"], dias_error: [], errores: [], mensaje: "ok" } });
  assert.match(validarResultado({ estado: "corriendo" }).error, /estado/);
  assert.equal(validarResultado({ estado: "pendiente", mensaje: "Mooneymaker no responde" }).estado, "pendiente");
});
