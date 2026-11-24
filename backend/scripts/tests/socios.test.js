import test from "node:test";
import assert from "node:assert/strict";
import { calcularReparto, controlNetwin, mesValido, repartoSocio, validarConfigPanel, validarSocioMes } from "../../src/services/socios.js";

const MES = { pct_fichas_pactado: 0.18, pct_cef_socio: 0.0225, factura_usd: 5215, cotizacion: 1782 };
const CFG_50 = { pct_ggr_socio: 0.7, pct_ggr_casa: 0.3, pct_ggr_nexo: 0, pct_costos_socio: 0.5, pct_costos_casa: 0.5, pct_costos_nexo: 0, empleados: 950000 };

// % reales de noviembre en la planilla (CEF real e "FICHAS REAL").
const REALES = { cef: 0.027163654012965586, fichas: 0.1631909516117083 };

test("AGENTE J de noviembre da igual que la planilla: socio pactado, casa real", () => {
  const f = repartoSocio({ netwin: 283483.39, entrada: 359545, salida: 83500 }, CFG_50, MES, REALES);
  assert.equal(f.ggr, 276045);
  assert.equal(f.ggr_socio, 193231.5);
  assert.equal(f.ggr_casa, 82813.5);
  assert.equal(f.cef_socio, 8089.76);   // K4
  assert.equal(f.cef_casa, 9766.56);    // J4
  assert.equal(f.fichas_socio, 25513.51); // N4
  assert.equal(f.fichas_casa, 23130.96);  // M4
  assert.equal(f.ggc_casa, 49915.98);   // T4
  assert.equal(f.ggc_socio, -790371.77); // U4
});

test("netwin negativo: no hay costo de fichas", () => {
  const f = repartoSocio({ netwin: -135229, entrada: 466700, salida: 500000 }, CFG_50, MES, REALES);
  assert.equal(f.fichas_socio, 0);
  assert.equal(f.fichas_casa, 0);
  assert.equal(f.ggr, -33300);
  assert.equal(f.ggr_socio, -23310);
});

test("TANO con nexo AGENTE PERRO da igual que la planilla", () => {
  const cfg = { pct_ggr_socio: 0.7, pct_ggr_casa: 0.2, pct_ggr_nexo: 0.1, pct_costos_socio: 0.5, pct_costos_casa: 0.334, pct_costos_nexo: 0.166, empleados: 1500000 };
  const f = repartoSocio({ netwin: 3240443.14, entrada: 7049211, salida: 3921600 }, cfg, MES, REALES);
  assert.equal(f.ggr_nexo, 312761.1);
  assert.equal(f.cef_casa, 191482.33);   // J5
  assert.equal(f.cef_socio, 158607.25);  // K5
  assert.equal(f.cef_nexo, 26328.8);     // L5
  assert.equal(f.fichas_casa, 264405.5); // M5
  assert.equal(f.fichas_socio, 291639.88); // N5
  assert.equal(f.fichas_nexo, 58327.98); // O5
  assert.equal(f.empleados_nexo, 249000); // R5
  assert.equal(f.ggc_casa, 169634.37);   // T5
  assert.equal(f.ggc_socio, 239080.57);  // U5
  assert.equal(f.ggc_nexo, -20895.68);   // V5
});

test("sin % reales la casa no tiene CEF ni fichas", () => {
  const f = repartoSocio({ netwin: 1000, entrada: 10000, salida: 0 }, CFG_50, MES);
  assert.equal(f.cef_casa, 0);
  assert.equal(f.fichas_casa, 0);
  assert.equal(f.cef_socio, 225);
});

test("costo de estructura se descuenta solo del GGC del socio", () => {
  const cfg = { ...CFG_50, empleados: 0, costo_estructura_s1: 1000, costo_estructura_s3: "500" };
  const f = repartoSocio({ netwin: 0, entrada: 10000, salida: 0 }, cfg, MES, REALES);
  assert.equal(f.costo_estructura, 1500);
  assert.equal(f.ggc_socio, 7000 - 225 - 1500);
  assert.equal(f.ggc_casa, 3000 - 271.64);
});

test("calcularReparto: totales, deuda de socios, paneles personales y netwin propio", () => {
  const paneles = [
    { id: 1, nombre: "AGENTE J", tipo: "socio", is_active: true },
    { id: 2, nombre: "NAHU", tipo: "socio", is_active: true },
    { id: 3, nombre: "M01", tipo: "socio", is_active: false },
    { id: 10, nombre: "PublicidadMo", tipo: "personal", is_active: true },
    { id: 90, nombre: "ADMIN", tipo: "control", is_active: true },
    { id: 91, nombre: "AGENTEMC", tipo: "control", is_active: true }
  ];
  const totales = {
    1: { netwin: 0, entrada: 2000000, salida: 0 },
    2: { netwin: 0, entrada: 100, salida: 0 },
    10: { netwin: 140895.34, entrada: 177194, salida: 51300, ops_entrada: 42, ops_salida: 4, bonos: 1000, inversion_publicidad: 0 },
    90: { netwin: 1000000 },
    91: { netwin: 400000 }
  };
  const configs = { 1: { ...CFG_50 }, 2: { ...CFG_50, heredada: true } };
  const r = calcularReparto({ paneles, totales, configs, socioMes: MES });

  assert.deepEqual(r.socios.map((s) => s.nombre), ["AGENTE J", "NAHU"]); // M01 inactivo y sin datos
  assert.equal(r.socios[1].config_heredada, true);
  const gJ = r.socios[0].ggc_socio;
  assert.ok(gJ > 0);
  assert.equal(r.total_socios.ggc_socio, gJ);
  assert.ok(r.socios[1].ggc_socio < 0);
  assert.equal(r.total_socios.ggc_socio, gJ); // el negativo cuenta 0

  assert.equal(r.personales[0].ggr, 177194 - 51300 - 1000);
  assert.equal(r.personales[0].ticket_deposito, Math.round(177194 / 42 * 100) / 100);
  assert.equal(r.personales[0].ticket_retiro, 12825);

  assert.equal(r.resumen.netwin_propio, 600000);
  assert.equal(r.resumen.costo_fichas_ars, 9293130);
  assert.equal(r.resumen.pct_fichas_real, null); // sin netwin del mes pasado
});

test("costo real de fichas: factura en pesos sobre el netwin del admin del mes pasado", () => {
  const mes = { ...MES, cotizacion: 1792.2 };
  const r = calcularReparto({
    paneles: [], totales: {}, configs: {}, socioMes: mes,
    netwinAnterior: { admin: 57272311.41, agentemc: 8361800.95 }
  });
  assert.equal(r.resumen.netwin_admin_anterior, 57272311.41);
  assert.ok(Math.abs(r.resumen.pct_fichas_real - 0.1631909516117083) < 1e-12); // "FICHAS REAL" de la planilla
  const negativo = calcularReparto({ paneles: [], totales: {}, configs: {}, socioMes: MES, netwinAnterior: { admin: -5, agentemc: 0 } });
  assert.equal(negativo.resumen.pct_fichas_real, null);
});

test("un socio sin configuración se muestra sin repartir", () => {
  const r = calcularReparto({
    paneles: [{ id: 5, nombre: "NUEVO", tipo: "socio", is_active: true }],
    totales: { 5: { netwin: 100, entrada: 1000, salida: 400 } },
    configs: {},
    socioMes: MES
  });
  assert.equal(r.socios[0].sin_config, true);
  assert.equal(r.socios[0].ggr, 600);
  assert.equal(r.socios[0].ggr_socio, 0);
});

test("validaciones de lo que se edita", () => {
  assert.equal(mesValido("2026-13"), null);
  assert.equal(mesValido("2026-11").inicio, "2026-11-01");

  const ok = validarConfigPanel({ mes: "2026-11", panel_id: 1, pct_ggr_socio: 0.7, pct_ggr_casa: 0.3, pct_costos_socio: 0.5, pct_costos_casa: 0.5, empleados: "950000", costo_estructura: [100, "", null] });
  assert.equal(ok.empleados, 950000);
  assert.equal(ok.costo_estructura_s1, 100);
  assert.equal(ok.costo_estructura_s2, 0);
  assert.equal(ok.pct_ggr_nexo, 0);

  assert.match(validarConfigPanel({ mes: "2026-11", panel_id: 1, pct_ggr_socio: 0.7, pct_ggr_casa: 0.2, pct_costos_socio: 0.5, pct_costos_casa: 0.5 }).error, /GGR/);
  assert.match(validarConfigPanel({ mes: "2026-11", panel_id: 1, nexo_panel_id: 1, pct_ggr_socio: 1, pct_ggr_casa: 0, pct_costos_socio: 1, pct_costos_casa: 0 }).error, /nexo/);
  assert.match(validarConfigPanel({ mes: "2026-11", panel_id: 1, pct_ggr_socio: 1.5, pct_ggr_casa: 0, pct_costos_socio: 1, pct_costos_casa: 0 }).error, /pct_ggr_socio/);
  assert.match(validarConfigPanel({ mes: "2026-11", panel_id: 1, pct_ggr_socio: 1, pct_ggr_casa: 0, pct_costos_socio: 1, pct_costos_casa: 0, empleados: -5 }).error, /empleados/);

  const mes = validarSocioMes({ mes: "2026-11", factura_usd: "5215", cotizacion: 1782, pct_fichas_pactado: 0.18, pct_cef_socio: 0.0225 });
  assert.deepEqual(mes, { mes: "2026-11-01", factura_usd: 5215, cotizacion: 1782, pct_fichas_pactado: 0.18, pct_cef_socio: 0.0225 });
  assert.equal(validarSocioMes({ mes: "2026-11", factura_usd: "", pct_fichas_pactado: 0.18, pct_cef_socio: 0.0225 }).factura_usd, null);
  assert.match(validarSocioMes({ mes: "2026-11", cotizacion: 0, pct_fichas_pactado: 0.18, pct_cef_socio: 0.0225 }).error, /cotizacion/);
});

test("controlNetwin: suma de paneles contra admin − AgenteMC y ganancia por fichas", () => {
  const c = controlNetwin([
    { fecha: "2026-11-01", tipo: "control", nombre: "ADMIN", netwin: 2079832.79 },
    { fecha: "2026-11-01", tipo: "control", nombre: "AGENTEMC", netwin: 870108.7 },
    { fecha: "2026-11-01", tipo: "socio", nombre: "TANO", netwin: 1000000 },
    { fecha: "2026-11-01", tipo: "personal", nombre: "AGENTEMADRE", netwin: 209724.09 },
    { fecha: "2026-11-02", tipo: "socio", nombre: "TANO", netwin: 500 }
  ]);
  assert.equal(c.dias.length, 2);
  assert.equal(c.dias[0].control, 1209724.09);
  assert.equal(c.dias[0].diferencia, 0);
  assert.equal(c.dias[1].control, null);
  assert.equal(c.dias_con_diferencia, 0);
  assert.equal(c.total.paneles, 1210224.09);
  assert.equal(c.ganancia_fichas, 87010.87);
});
