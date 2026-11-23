import test from "node:test";
import assert from "node:assert/strict";
import { calcularReparto, mesValido, repartoSocio, validarConfigPanel, validarSocioMes } from "../../src/services/socios.js";

const MES = { pct_fichas_pactado: 0.18, pct_cef_socio: 0.0225, factura_usd: 5215, cotizacion: 1782 };
const CFG_50 = { pct_ggr_socio: 0.7, pct_ggr_casa: 0.3, pct_ggr_nexo: 0, pct_costos_socio: 0.5, pct_costos_casa: 0.5, pct_costos_nexo: 0, empleados: 950000 };

test("AGENTE J de noviembre: 9% de fichas y 2,25% de CEF para cada parte", () => {
  const f = repartoSocio({ netwin: 279193.39, entrada: 354265, salida: 83500 }, CFG_50, MES);
  assert.equal(f.ggr, 270765);
  assert.equal(f.ggr_socio, 189535.5);
  assert.equal(f.ggr_casa, 81229.5);
  assert.equal(f.cef_socio, 7970.96);
  assert.equal(f.cef_casa, 7970.96);
  assert.equal(f.fichas_socio, f.fichas_casa);
  assert.ok(Math.abs(f.fichas_socio - 279193.39 * 0.09) < 0.01);
  assert.equal(f.ggc_socio, Math.round((189535.5 - 7970.96 - f.fichas_socio - 950000) * 100) / 100);
  assert.equal(f.ggc_casa, Math.round((81229.5 - 7970.96 - f.fichas_casa) * 100) / 100);
});

test("netwin negativo: no hay costo de fichas", () => {
  const f = repartoSocio({ netwin: -135229, entrada: 466700, salida: 500000 }, CFG_50, MES);
  assert.equal(f.fichas_socio, 0);
  assert.equal(f.fichas_casa, 0);
  assert.equal(f.ggr, -33300);
  assert.equal(f.ggr_socio, -23310);
});

test("TANO con nexo: el socio paga lo mismo que en la planilla y el nexo su % de costos", () => {
  const cfg = { pct_ggr_socio: 0.7, pct_ggr_casa: 0.2, pct_ggr_nexo: 0.1, pct_costos_socio: 0.5, pct_costos_casa: 0.334, pct_costos_nexo: 0.166, empleados: 1500000 };
  const f = repartoSocio({ netwin: 70418.1, entrada: 182000, salida: 95000 }, cfg, MES);
  assert.equal(f.ggr_nexo, 8700);
  assert.equal(f.cef_socio, 4095);
  assert.equal(f.fichas_socio, 6337.63);
  assert.equal(f.empleados_nexo, 249000);
  assert.equal(f.cef_nexo, Math.round(182000 * 0.045 * 0.166 * 100) / 100);
  assert.equal(f.ggc_nexo, Math.round((f.ggr_nexo - f.cef_nexo - f.fichas_nexo - 249000) * 100) / 100);
  // Lo que paga cada parte suma el costo total pactado.
  assert.ok(Math.abs(f.cef_socio + f.cef_casa + f.cef_nexo - 182000 * 0.045) < 0.02);
});

test("costo de estructura se descuenta solo del GGC del socio", () => {
  const cfg = { ...CFG_50, empleados: 0, costo_estructura_s1: 1000, costo_estructura_s3: "500" };
  const f = repartoSocio({ netwin: 0, entrada: 10000, salida: 0 }, cfg, MES);
  assert.equal(f.costo_estructura, 1500);
  assert.equal(f.ggc_socio, 7000 - 225 - 1500);
  assert.equal(f.ggc_casa, 3000 - 225);
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
  assert.equal(r.total_socios.deuda_socios, -r.socios[1].ggc_socio);

  assert.equal(r.personales[0].ggr, 177194 - 51300 - 1000);
  assert.equal(r.personales[0].ticket_deposito, Math.round(177194 / 42 * 100) / 100);
  assert.equal(r.personales[0].ticket_retiro, 12825);

  assert.equal(r.resumen.netwin_propio, 600000);
  assert.equal(r.resumen.costo_fichas_ars, 9293130);
  assert.ok(Math.abs(r.resumen.pct_fichas_real - 9293130 / 600000) < 1e-9);
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
