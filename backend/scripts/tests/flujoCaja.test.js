import test from "node:test";
import assert from "node:assert/strict";
import { armarFlujoCaja, ingresosArsDesdeBalance, mesAnterior, periodoMes } from "../../src/services/flujoCaja.js";

test("periodoMes cubre el mes completo, incluido febrero bisiesto", () => {
  assert.deepEqual(periodoMes(2026, 9), { desde: "2026-09-01", hasta: "2026-09-30" });
  assert.deepEqual(periodoMes(2024, 2), { desde: "2024-02-01", hasta: "2024-02-29" });
});

test("el inicio de octubre sale del ultimo dia de septiembre", () => {
  assert.deepEqual(mesAnterior("2026-10-01"), { desde: "2026-09-01", hasta: "2026-09-30" });
  assert.deepEqual(mesAnterior("2026-03-01"), { desde: "2026-02-01", hasta: "2026-02-28" });
  assert.deepEqual(mesAnterior("2024-03-01"), { desde: "2024-02-01", hasta: "2024-02-29" });
  assert.deepEqual(mesAnterior("2026-01-01"), { desde: "2025-12-01", hasta: "2025-12-31" });
});

test("separa ARS y USDT y calcula cuanto entro, salio y quedo", () => {
  const { flujos } = armarFlujoCaja({
    cierresAntes: [
      { moneda: "ARS", monto: "1000.00" },
      { moneda: "USDT", monto: "50.00" },
    ],
    cierresEnPeriodo: [
      { moneda: "ARS", monto: "700.50" },
      { moneda: "USDT", monto: "80.00" },
    ],
    movimientos: [
      { moneda: "ARS", etiqueta: "[Unidad M] Premio Pagado", fecha: "2026-09-02", tipo: "SALIDA", monto: "300.00", n: 2 },
      { moneda: "ARS", etiqueta: "[Unidad M] Pago de sueldo", fecha: "2026-09-03", tipo: "SALIDA", monto: "200.00", n: 1 },
      { moneda: "USDT", etiqueta: "[Otra] Recepcion de USDT", fecha: "2026-09-04", tipo: "ENTRADA", monto: "40.00", n: 1 },
      { moneda: "USDT", etiqueta: "[Programacion] Pago de fichas", fecha: "2026-09-05", tipo: "SALIDA", monto: "10.00", n: 1 },
      { moneda: "USD", etiqueta: "[Otra] Cambio a USD", fecha: "2026-09-06", tipo: "ENTRADA", monto: "15.00", n: 1 },
    ],
  });

  assert.equal(flujos.ARS.inicio, 1000);
  assert.equal(flujos.ARS.entro, 0);
  assert.equal(flujos.ARS.salio, 500);
  assert.equal(flujos.ARS.quedo, 500);
  assert.equal(flujos.ARS.cierre_declarado, 700.5);
  assert.equal(flujos.ARS.diferencia, 200.5);
  assert.equal(flujos.ARS.por_etiqueta.length, 2);
  assert.equal(flujos.ARS.por_dia[0].fecha, "2026-09-02");

  assert.equal(flujos.USDT.inicio, 50);
  assert.equal(flujos.USDT.entro, 40);
  assert.equal(flujos.USDT.salio, 10);
  assert.equal(flujos.USDT.quedo, 80);
  assert.equal(flujos.USDT.diferencia, 0);
  assert.equal(flujos.USDT.por_etiqueta[0].etiqueta, "[Otra] Recepcion de USDT");

  assert.equal(flujos.USD.entro, 15);
  assert.equal(flujos.USD.quedo, 15);
  assert.equal(flujos.USD.cierre_declarado, null);
});

test("la redireccion de capital no mueve el flujo", () => {
  const { flujos } = armarFlujoCaja({
    movimientos: [
      { moneda: "USDT", etiqueta: "[Unidad M] Redireccion de capital", fecha: "2026-09-01", tipo: "ENTRADA", monto: "25.50", n: 1 },
      { moneda: "USDT", etiqueta: "[Unidad M] Redireccion de capital", fecha: "2026-09-01", tipo: "SALIDA", monto: "25.50", n: 1 },
      { moneda: "USDT", etiqueta: "[Otra] Recepcion de USDT", fecha: "2026-09-01", tipo: "ENTRADA", monto: "10", n: 1 },
    ],
  });
  assert.equal(flujos.USDT.entro, 10);
  assert.equal(flujos.USDT.salio, 0);
  assert.equal(flujos.USDT.quedo, 10);
  assert.equal(flujos.USDT.por_dia[0].neto, 10);
  assert.equal(flujos.USDT.por_etiqueta.some((f) => f.etiqueta.includes("Redireccion")), false);
  assert.equal(flujos.USDT.redireccion.diferencia, 0);
});

test("avisa si la redireccion de capital no cierra entre entrada y salida", () => {
  const { flujos } = armarFlujoCaja({
    movimientos: [
      { moneda: "ARS", etiqueta: "[Unidad M] Redirección de capital", fecha: "2026-10-01", tipo: "ENTRADA", monto: "11400000", n: 10 },
      { moneda: "ARS", etiqueta: "[Unidad M] Redireccion de capital", fecha: "2026-10-02", tipo: "SALIDA", monto: "12900000", n: 11 },
      { moneda: "ARS", etiqueta: "[Unidad M] Premio Pagado", fecha: "2026-10-02", tipo: "SALIDA", monto: "200", n: 1 },
    ],
  });
  assert.equal(flujos.ARS.entro, 0);
  assert.equal(flujos.ARS.salio, 200);
  assert.equal(flujos.ARS.quedo, -200);
  assert.equal(flujos.ARS.redireccion.entro, 11400000);
  assert.equal(flujos.ARS.redireccion.salio, 12900000);
  assert.equal(flujos.ARS.redireccion.diferencia, -1500000);
  assert.equal(flujos.ARS.redireccion.movimientos, 21);
  assert.equal(flujos.ARS.por_dia.length, 1);
});

test("el ingreso ARS sale de las entradas etiquetadas del balance y no de las salidas", () => {
  const header = ["FechaHora", "ID", "Empresa", "Titular de cuenta", "Tipo de transferencia", "Titular", "Origen", "Importe", "Estado", "Nota", "FECHA", "TURNO ", "Etiqueta"];
  const ingresos = ingresosArsDesdeBalance([
    header,
    ["04/10/2026 10:00:00", "1", "HG.Cash", "Cuenta", "Transferencia Entrante", "Cliente", "", "1.500,50", "Succes", "", "04/10/2026", "Turno mañana", "[Unidad M] Deposito de cliente"],
    ["04/10/2026 11:00:00", "2", "HG.Cash", "Cuenta", "Transferencia Saliente", "Premio", "", "200", "", "", "04/10/2026", "Turno mañana", "[Unidad M] Premio Pagado"],
    ["05/10/2026 11:00:00", "3", "HG.Cash", "Cuenta", "Transferencia Entrante", "Otro", "", "300", "", "", "05/10/2026", "", ""],
    ["04/09/2026 11:00:00", "4", "HG.Cash", "Cuenta", "Transferencia Entrante", "Viejo", "", "9999", "", "", "04/09/2026", "", "[Unidad M] Deposito de cliente"],
    ["04/10/2026 12:00:00", "5", "HG.Cash", "Cuenta", "Transferencia Entrante", "Rechazo", "", "50", "Rechazada", "", "04/10/2026", "", "[Unidad M] Transferencia Rechazada"],
  ], { desde: "2026-10-01", hasta: "2026-10-31" });

  assert.equal(ingresos.length, 2);
  const deposito = ingresos.find((g) => g.etiqueta === "[Unidad M] Deposito de cliente");
  const sinEtiqueta = ingresos.find((g) => g.etiqueta === "(sin etiqueta)");
  assert.equal(deposito.monto, 1500.5);
  assert.equal(deposito.n, 1);
  assert.equal(deposito.fecha, "2026-10-04");
  assert.equal(sinEtiqueta.monto, 300);

  const { flujos } = armarFlujoCaja({
    cierresAntes: [{ moneda: "ARS", monto: "1000" }],
    movimientos: [
      { moneda: "ARS", etiqueta: "[Unidad M] Premio Pagado", fecha: "2026-10-04", tipo: "SALIDA", monto: "200", n: 1 },
      ...ingresos,
    ],
  });
  assert.equal(flujos.ARS.entro, 1800.5);
  assert.equal(flujos.ARS.salio, 200);
  assert.equal(flujos.ARS.quedo, 2600.5);
  const filaDeposito = flujos.ARS.por_etiqueta.find((f) => f.etiqueta === "[Unidad M] Deposito de cliente");
  assert.equal(filaDeposito.entro, 1500.5);
  assert.equal(filaDeposito.salio, 0);
});
