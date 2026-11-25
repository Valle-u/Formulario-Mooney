import test from "node:test";
import assert from "node:assert/strict";
import { compararBanco, compararPagos, compararPlanilla, leerTrazabilidad, retirosBancoPorDia } from "../../src/services/auditoria.js";

// Recorte con la misma forma que "Trazabilidad General Mensual".
const HOJA = [
  [],
  ["", "PANEL DE SOCIOS", "INFORMACION GENERAL"],
  ["", "", "NETWIN", "ENTRADA", "SALIDA", "GGR", "GGR CASA ", "GGR SOCIO", "GGR NEXO", "", "", "", "", "FICHAS SOCIO", "", "", "EMPLEADOS SOCIOS"],
  ["", "AGENTE J", 1000, 5000, 4000, 1000, 300, 700, "", "", "", "", "", 126, "", "", 950000],
  ["", "SOC MAESTRA ", 500, 900, 400, 500, 150, 350, "", "", "", "", "", 63, "", "", 950000],
  ["", "TOTAL DIARIO", 1500, 5900, 4400],
  [],
  ["", "PANELES PERSONALES", "INFORMACION GENERAL"],
  ["", "", "NETWIN", "ENTRADA", "SALIDA", "CANTIDAD DE OP ENTRADA", "CANTIDAD DE OP SALIDA", "Ticket Promedio", "", "BONOS Y REMARKETING", "GGR", "", "", "SUMA DE NETWIN DE PANELES DIARIOS", "", "NETWIN DE PANEL AGENTE MC"],
  ["", "", "", "", "", "", "", "Depositos", "Retiros"],
  ["", "AGENTEMADRE", 2000, 8000, 6000, 40, 4, 200, 1500, "", 2000, "", "", 3500, "", 900],
  ["", "TOTAL", 2000, 8000, 6000],
  [],
  ["", "INFORMACION GENERAL"],
  ["", "DEPOSITOS", 13900],
  ["", "RETIROS", 10400],
  ["", "GGR", 3500]
];

const REPARTO = {
  socios: [
    { nombre: "AGENTE J", netwin: 1000, entrada: 5000, salida: 4000, ggr: 1000, ggr_casa: 300, ggr_socio: 700, ggr_nexo: 0, fichas_socio: 126, empleados_socio: 950000 },
    { nombre: "SOC MAESTRA", netwin: 500, entrada: 950, salida: 400, ggr: 550, ggr_casa: 165, ggr_socio: 385, ggr_nexo: 0, fichas_socio: 63, empleados_socio: 950000 },
    { nombre: "AGENTE PERRO", netwin: 0, entrada: 0, salida: 0 }
  ],
  personales: [{ nombre: "AgenteMadre", netwin: 2000, entrada: 8000, salida: 6000, ops_entrada: 40, ops_salida: 4, bonos: 0, ggr: 2000 }],
  resumen: { netwin_propio: 3500, netwin_agentemc: 900 },
  banco: { depositos: 13900, retiros: 10400 },
  bloques: { general: { ggr: 3500 } }
};

test("leerTrazabilidad encuentra las tablas por sus títulos", () => {
  const t = leerTrazabilidad(HOJA);
  assert.deepEqual(Object.keys(t.socios), ["AGENTE J", "SOC MAESTRA"]);
  assert.equal(t.socios["AGENTE J"].ggr_casa, 300);
  assert.equal(t.socios["AGENTE J"].empleados_socio, 950000);
  assert.equal(t.personales.AGENTEMADRE.ops_entrada, 40);
  assert.equal(t.personales.AGENTEMADRE.bonos, null);
  assert.deepEqual(t.control, { netwin_propio: 3500, agentemc: 900 });
  // "Depositos" de la tabla de personales no es el de información general.
  assert.deepEqual(t.general, { depositos: 13900, retiros: 10400, ggr: 3500 });
});

test("compararPlanilla marca solo lo que no coincide", () => {
  const r = compararPlanilla(leerTrazabilidad(HOJA), REPARTO);
  const malas = r.filas.filter((f) => !f.ok).map((f) => `${f.panel} ${f.campo} ${f.diferencia}`);
  assert.deepEqual(malas, ["SOC MAESTRA entrada 50", "SOC MAESTRA ggr 50", "SOC MAESTRA ggr_casa 15", "SOC MAESTRA ggr_socio 35"]);
  assert.equal(r.diferencias, 4);
  // AGENTE PERRO no está en la planilla pero no tiene movimientos: no se avisa.
  assert.deepEqual(r.faltantes, []);
});

test("compararPlanilla avisa paneles que faltan de un lado", () => {
  const reparto = { ...REPARTO, socios: REPARTO.socios.filter((s) => s.nombre !== "SOC MAESTRA").concat({ nombre: "NUEVO", netwin: 10 }) };
  const r = compararPlanilla(leerTrazabilidad(HOJA), reparto);
  assert.deepEqual(r.faltantes, [
    "NUEVO (Socios) está en el formulario pero no en la planilla",
    "SOC MAESTRA (Socios) está en la planilla pero no en el formulario"
  ]);
});

const fila = (fecha, importe, etiqueta, estado = "Success") =>
  [`${fecha} 10:00`, "", "", "", "", "", "", importe, estado, "", fecha, "", etiqueta];
const BANCO = [
  ["FechaHora"],
  fila("01/11/2026", "1.000,00", "[Unidad M] Deposito de cliente"),
  fila("01/11/2026", "400,00", "[Unidad M] Premio Pagado"),
  fila("02/11/2026", "250,50", "[Unidad M] Premio Pagado"),
  fila("02/11/2026", "999,00", "[Unidad M] Premio Pagado", "Rejected"),
  fila("02/11/2026", "-30,00", "[Unidad M] IVA")
];
const NOV = { desde: "2026-11-01", hasta: "2026-11-30" };

test("compararBanco compara lo guardado con la hoja de hoy", () => {
  const r = compararBanco({ depositos: 1000, retiros: 400, iva: 30, movimientos: 3 }, BANCO, NOV);
  assert.deepEqual(r.filas.map((f) => [f.campo, f.formu, f.planilla, f.ok]), [
    ["depositos", 1000, 1000, true], ["retiros", 400, 650.5, false], ["iva", 30, 30, true]
  ]);
  assert.equal(r.movimientos_hoja, 4);
  const sin = compararBanco(null, BANCO, NOV);
  assert.equal(sin.diferencias, 3);
});

test("retirosBancoPorDia y compararPagos", () => {
  const banco = retirosBancoPorDia(BANCO, NOV);
  assert.deepEqual(banco, { "2026-11-01": 400, "2026-11-02": 250.5 });
  const r = compararPagos(
    [{ fecha: "2026-11-01", salida: 400 }, { fecha: "2026-11-02", salida: 300 }],
    [{ fecha: "2026-11-01", total: 400 }, { fecha: "2026-11-03", total: 50 }],
    banco
  );
  assert.deepEqual(r.filas.map((f) => [f.fecha, f.panel, f.egresos, f.banco, f.dif_egresos, f.dif_banco, f.ok]), [
    ["2026-11-01", 400, 400, 400, 0, 0, true],
    ["2026-11-02", 300, 0, 250.5, -300, -49.5, false],
    ["2026-11-03", 0, 50, 0, 50, 0, false]
  ]);
  assert.deepEqual(r.total, { panel: 700, egresos: 450, banco: 650.5, dif_egresos: -250, dif_banco: -49.5 });
  assert.equal(r.diferencias, 2);
  // Sin la hoja del banco, la columna queda vacía.
  assert.equal(compararPagos([{ fecha: "2026-11-01", salida: 1 }], [], null).filas[0].banco, null);
});
