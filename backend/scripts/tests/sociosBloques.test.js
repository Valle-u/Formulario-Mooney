import test from "node:test";
import assert from "node:assert/strict";
import { calcularBloques, costosFijosPorCategoria, resumenBanco, validarCostosFijos } from "../../src/services/sociosBloques.js";

// Fila del balance bancario: 0 FechaHora, 7 Importe, 8 Estado, 10 FECHA, 12 Etiqueta.
const fila = (fecha, importe, estado, etiqueta) => {
  const r = new Array(13).fill("");
  r[0] = `${fecha} 10:00`; r[7] = importe; r[8] = estado; r[10] = fecha; r[12] = etiqueta;
  return r;
};

test("resumenBanco suma depósitos y retiros exitosos y el IVA del mes", () => {
  const matriz = [
    ["FechaHora", "", "", "", "", "", "", "Importe", "Estado", "", "FECHA", "", "Etiqueta"],
    fila("05/11/2026", "$ 10.000,00", "Succes", "[Unidad M] Deposito de cliente"),
    fila("06/11/2026", "2.500,50", "Succes", "[Unidad M]  Deposito de cliente"),
    fila("06/11/2026", "9.999,00", "Rejected", "[Unidad M] Deposito de cliente"),
    fila("07/11/2026", "4.000,00", "Succes", "[Unidad M] Premio Pagado"),
    fila("07/11/2026", "-300,00", "", "[Unidad M] IVA"),
    fila("07/11/2026", "777,00", "Succes", "[Unidad M] Pago de sueldo"),
    fila("01/12/2026", "50.000,00", "Succes", "[Unidad M] Deposito de cliente")
  ];
  assert.deepEqual(resumenBanco(matriz, { desde: "2026-11-01", hasta: "2026-11-30" }),
    { depositos: 12500.5, retiros: 4000, iva: 300, movimientos: 4 });
});

test("costos fijos por categoría, pasando USD a pesos con la cotización", () => {
  const asignaciones = [
    { etiqueta: "[Unidad M] Pago de sueldo", categoria: "Empleados" },
    { etiqueta: "[Unidad M] Adelanto de sueldo", categoria: "Empleados" },
    { etiqueta: "[Programacion] Pago de servidor", categoria: "Servidor" },
    { etiqueta: "[Granja] Costo Fijo", categoria: "Granja" }
  ];
  const filas = [
    { etiqueta: "[Unidad M] Pago de sueldo", moneda: "ARS", total: 1000000 },
    { etiqueta: "[unidad m]  adelanto de sueldo", moneda: "ARS", total: 50000 },
    { etiqueta: "[Programacion] Pago de servidor", moneda: "USDT", total: 100 },
    { etiqueta: "[Otra] ROBO", moneda: "ARS", total: 999 }
  ];
  const r = costosFijosPorCategoria(filas, asignaciones, 1500);
  assert.deepEqual(r.lista, [
    { categoria: "Empleados", monto: 1050000 },
    { categoria: "Servidor", monto: 150000 },
    { categoria: "Granja", monto: 0 }
  ]);
  assert.equal(r.total, 1200000);

  const sinCot = costosFijosPorCategoria(filas, asignaciones, null);
  assert.equal(sinCot.total, 1050000);
  assert.equal(sinCot.usd_sin_cotizacion, 100);
});

test("calcularBloques arma los cuadros como la planilla", () => {
  const reparto = {
    total_socios: {
      ggr: 400000, entrada: 750000, costo_estructura: 1000,
      ggc_socio: 80000, ggc_nexo: 0, fichas_casa: 9000, fichas_socio: 9000, fichas_nexo: 0
    },
    total_personales: { entrada: 2000000, netwin: 1000000 },
    resumen: { netwin_propio: 5000000, costo_fichas_ars: 800000, pct_fichas_real: 0.16, pct_cef_socio: 0.0225 }
  };
  const banco = { depositos: 10000000, retiros: 7000000, iva: 250000 };
  const fijos = { lista: [{ categoria: "Empleados", monto: 1000000 }], total: 1000000 };
  const b = calcularBloques({ reparto, banco, fijos });

  assert.equal(b.general.ggr, 3000000);
  assert.equal(b.general.rtp, 0.7);
  assert.equal(b.general.pct_cef_real, 0.025);
  assert.equal(b.general.utilidades, 80000);
  assert.equal(b.general.costos_totales, 1000000 + 250000 + 800000 + 1000 + 80000);
  assert.equal(b.general.neta, 3000000 - 2131000);

  assert.equal(b.casa.ggr, 2600000);
  assert.equal(b.casa.cef, 50000);          // 2.000.000 × 2,5%
  assert.equal(b.casa.fichas, 160000);      // 1.000.000 × 16%
  assert.equal(b.casa.neta, 2600000 - 50000 - 160000 - 1000000);

  assert.equal(b.socios.ganancia_casa, 400000 - 81000);
  assert.equal(b.socios.cef, 18750);        // 750.000 × 2,5% (CEF real)
  assert.equal(b.socios.fichas, 18000);
  assert.equal(b.socios.neta, 319000 - 18750 - 18000);

  assert.equal(b.representacion.total, 2600000 + 319000);
  assert.equal(b.representacion.propio, 2600000);
  assert.ok(Math.abs(b.representacion.pct_propio - 2600000 / 2919000) < 1e-12);

  assert.equal(b.volumen.socio, 750000);
  assert.equal(b.volumen.casa, 9250000);
  assert.equal(b.volumen.pct_socio, 0.075);
});

test("sin balance bancario los bloques no se rompen", () => {
  const reparto = {
    total_socios: { ggr: 100, entrada: 100 },
    total_personales: { entrada: 0, netwin: 0 },
    resumen: { netwin_propio: null, costo_fichas_ars: null, pct_fichas_real: null, pct_cef_socio: 0.0225 }
  };
  const b = calcularBloques({ reparto, banco: null, fijos: { lista: [], total: 0 } });
  assert.equal(b.general.depositos, 0);
  assert.equal(b.general.rtp, null);
  assert.equal(b.casa.cef, 0);
  assert.equal(b.volumen.pct_socio, null);
});

test("validarCostosFijos: sin categoría se saca, repetidas no", () => {
  assert.deepEqual(validarCostosFijos({ asignaciones: [
    { etiqueta: "[Unidad M] Pago de sueldo", categoria: " Empleados " },
    { etiqueta: "[Otra] ROBO", categoria: "" }
  ] }), { asignaciones: [{ etiqueta: "[Unidad M] Pago de sueldo", categoria: "Empleados" }] });
  assert.match(validarCostosFijos({ asignaciones: [{ etiqueta: "A", categoria: "x" }, { etiqueta: " a ", categoria: "y" }] }).error, /repetida/);
  assert.match(validarCostosFijos({}).error, /inválidas/);
});

test("guardarResumenBanco recalcula el mes de la fecha y hace upsert", async () => {
  const { guardarResumenBanco, rangoMes } = await import("../../src/services/sociosBloques.js");
  assert.deepEqual(rangoMes("2026-11-22"), { desde: "2026-11-01", hasta: "2026-11-30" });
  assert.deepEqual(rangoMes("2028-02-10"), { desde: "2028-02-01", hasta: "2028-02-29" });

  const llamadas = [];
  const queryFn = async (sql, params) => { llamadas.push({ sql, params }); return { rows: [] }; };
  const matriz = [
    fila("05/11/2026", "1.000,00", "succes", "[Unidad M] Deposito de cliente"),
    fila("30/10/2026", "5.000,00", "succes", "[Unidad M] Deposito de cliente")
  ];
  const r = await guardarResumenBanco(queryFn, "2026-11-22", matriz, { origen: "carga", userId: 7 });
  assert.equal(r.mes, "2026-11-01");
  assert.equal(r.depositos, 1000);
  assert.match(llamadas[0].sql, /ON CONFLICT \(mes\) DO UPDATE/);
  assert.deepEqual(llamadas[0].params, ["2026-11-01", 1000, 0, 0, 1, "carga", 7]);
});
