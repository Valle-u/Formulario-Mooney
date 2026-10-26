import test from "node:test";
import assert from "node:assert/strict";
import { INICIO_SEGUIMIENTO, calcularSaldos, resolverFondeo, validarMovimiento } from "../../src/services/arqTarjetas.js";

test("un fondeo en USDT toma el monto del egreso y la cuenta de la etiqueta", () => {
  assert.deepEqual(
    resolverFondeo({ moneda: "USDT", monto: "100.46", cuenta_etiqueta: "2" }),
    { cuenta_id: 2, monto_usd: 100.46, estado: "ok" }
  );
});

test("un fondeo en ARS queda pendiente hasta cargar los USD acreditados", () => {
  assert.equal(resolverFondeo({ moneda: "ARS", monto: "50000", cuenta_etiqueta: 1 }).estado, "pendiente");
  assert.deepEqual(
    resolverFondeo({ moneda: "ARS", monto: "50000", cuenta_etiqueta: 1, monto_usd_confirmado: "30.47" }),
    { cuenta_id: 1, monto_usd: 30.47, estado: "ok" }
  );
});

test("la etiqueta generica deja el fondeo sin asignar y la asignacion manual manda", () => {
  assert.equal(resolverFondeo({ moneda: "USDT", monto: "10", cuenta_etiqueta: null }).estado, "sin_asignar");
  assert.equal(resolverFondeo({ moneda: "USDT", monto: "10", cuenta_etiqueta: 1, cuenta_asignada: 3 }).cuenta_id, 3);
  assert.equal(resolverFondeo({ moneda: "USDT", monto: "10", cuenta_etiqueta: 1, descartado: true }).estado, "descartado");
});

test("el saldo suma fondeos, transferencias recibidas y ajustes y resta consumos y envios", () => {
  const saldos = calcularSaldos({
    cuentas: [{ id: 1 }, { id: 2 }],
    fondeos: [
      { cuenta_id: 1, monto_usd: 200, estado: "ok" },
      { cuenta_id: 1, monto_usd: null, estado: "pendiente" },
      { cuenta_id: 2, monto_usd: 50, estado: "descartado" },
      { cuenta_id: null, monto_usd: 70, estado: "sin_asignar" },
    ],
    movimientos: [
      { tipo: "CONSUMO", cuenta_id: 1, monto_usd: "30.10" },
      { tipo: "TRANSFERENCIA", cuenta_id: 1, cuenta_destino_id: 2, monto_usd: "100" },
      { tipo: "CONSUMO", cuenta_id: 2, monto_usd: "21" },
      { tipo: "AJUSTE", cuenta_id: 2, monto_usd: "-4.5" },
    ],
  });
  const [a, b] = saldos;
  assert.equal(a.saldo, 69.9);
  assert.equal(a.fondeos_pendientes, 1);
  assert.equal(a.transferido_salida, 100);
  assert.equal(b.fondeado, 0);
  assert.equal(b.transferido_entrada, 100);
  assert.equal(b.saldo, 74.5);
});

test("una transferencia no cambia el total entre las cuentas", () => {
  const saldos = calcularSaldos({
    cuentas: [{ id: 1 }, { id: 2 }],
    fondeos: [{ cuenta_id: 1, monto_usd: 300, estado: "ok" }],
    movimientos: [{ tipo: "TRANSFERENCIA", cuenta_id: 1, cuenta_destino_id: 2, monto_usd: "120.33" }],
  });
  assert.equal(saldos.reduce((s, c) => s + c.saldo, 0), 300);
});

test("valida un consumo pagado en pesos", () => {
  const ok = validarMovimiento({
    tipo: "consumo", cuenta_id: "1", tarjeta_id: 4, servicio: " Meta ",
    fecha: "2026-10-22", hora: "14:05", monto_usd: "21,50", moneda_origen: "ARS", monto_origen: "30.000,50",
  });
  assert.equal(ok.error, undefined);
  assert.equal(ok.mov.servicio, "Meta");
  assert.equal(ok.mov.monto_usd, 21.5);
  assert.equal(ok.mov.monto_origen, 30000.5);
  assert.match(validarMovimiento({ tipo: "CONSUMO", cuenta_id: 1, fecha: "2026-10-22", monto_usd: 5 }).error, /servicio/);
  assert.match(validarMovimiento({ tipo: "CONSUMO", cuenta_id: 1, servicio: "Meta", fecha: "2026-10-22", monto_usd: 5, moneda_origen: "ARS" }).error, /pesos/);
});

test("rechaza transferencias a la misma cuenta y montos negativos fuera del ajuste", () => {
  assert.match(validarMovimiento({ tipo: "TRANSFERENCIA", cuenta_id: 1, cuenta_destino_id: 1, fecha: "2026-10-22", monto_usd: 5 }).error, /distintas/);
  assert.match(validarMovimiento({ tipo: "CONSUMO", cuenta_id: 1, servicio: "Meta", fecha: "2026-10-22", monto_usd: "-5" }).error, /positivo/);
  const ajuste = validarMovimiento({ tipo: "AJUSTE", cuenta_id: 1, fecha: "2026-10-26", monto_usd: "-12.40", notas: "Saldo real ARQ" });
  assert.equal(ajuste.mov.monto_usd, -12.4);
  assert.match(validarMovimiento({ tipo: "AJUSTE", cuenta_id: 1, fecha: "2026-10-26", monto_usd: 3 }).error, /motivo/);
  assert.match(validarMovimiento({ tipo: "TRANSFERENCIA", cuenta_id: 1, cuenta_destino_id: 2, fecha: "2026-10-22", monto_usd: 5, moneda_origen: "ARS", monto_origen: 7000 }).error, /pesos/);
});

test("no deja cargar movimientos anteriores al inicio del seguimiento", () => {
  assert.equal(INICIO_SEGUIMIENTO, "2026-09-01");
  assert.match(validarMovimiento({ tipo: "AJUSTE", cuenta_id: 1, fecha: "2026-08-31", monto_usd: 3, notas: "x" }).error, /arranca/);
  assert.equal(validarMovimiento({ tipo: "AJUSTE", cuenta_id: 1, fecha: "2026-09-01", monto_usd: 3, notas: "x" }).error, undefined);
});
