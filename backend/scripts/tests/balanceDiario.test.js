import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  parseCsv,
  detectarDelim,
  transformar,
  egresosDesdeCsv,
  armarCuadreUsdt,
  OUTPUT_COLUMNS,
} from "../../src/services/balanceDiario.js";

const ROOT = "C:/Users/hp/scraper/paquete_balance_formulario/ejemplos";

function leer(p) {
  return fs.readFileSync(p, "utf8");
}

function matrizEsperada(p) {
  const text = leer(p);
  const delim = detectarDelim(text);
  return parseCsv(text, delim).filter((r) => r.some((c) => c !== ""));
}

function matrizObtenida(filas, columns) {
  return [
    columns,
    ...filas.map((f) => columns.map((c) => (f[c] == null ? "" : String(f[c])))),
  ];
}

function assertMatrices(obtenida, esperada, etiqueta) {
  assert.equal(obtenida.length, esperada.length, `${etiqueta}: filas ${obtenida.length} vs ${esperada.length}`);
  const n = Math.min(obtenida.length, esperada.length);
  for (let i = 0; i < n; i += 1) {
    const a = obtenida[i];
    const b = esperada[i];
    const len = Math.max(a.length, b.length);
    for (let j = 0; j < len; j += 1) {
      if ((a[j] ?? "") !== (b[j] ?? "")) {
        assert.fail(`${etiqueta} fila ${i} col ${j}: ${JSON.stringify(a[j])} !== ${JSON.stringify(b[j])}\n${JSON.stringify(a)}\n${JSON.stringify(b)}`);
      }
    }
  }
}

function correr({ bancos, egresosPath, planillaPath, fecha, rivenTitular }) {
  const egresos = egresosPath ? egresosDesdeCsv(leer(egresosPath)) : [];
  const planillaFilas = planillaPath ? parseCsv(leer(planillaPath), detectarDelim(leer(planillaPath))) : [];
  return transformar({
    bancos: bancos.map((b) => ({ nombre: b.nombre, texto: leer(b.path) })),
    egresos,
    planillaFilas,
    planillaFecha: fecha,
    rivenTitular,
  });
}

test("Lohas 2026-09-15 coincide con el golden", { skip: !fs.existsSync(ROOT) }, () => {
  const base = path.join(ROOT, "dia_2026-09-15_lohas_end_to_end");
  const r = correr({
    bancos: [{ nombre: "Lohas.csv", path: path.join(base, "entrada", "Lohas.csv") }],
    egresosPath: path.join(base, "entrada", "egresos_formulario.csv"),
    planillaPath: path.join(base, "entrada", "planilla_cargas", "15.csv"),
    fecha: "2026-09-15",
  });
  assertMatrices(
    matrizObtenida(r.salida, OUTPUT_COLUMNS),
    matrizEsperada(path.join(base, "salida", "balance_esperado.csv")),
    "balance",
  );
  assertMatrices(
    matrizObtenida(r.salidaUsdt, OUTPUT_COLUMNS),
    matrizEsperada(path.join(base, "salida", "balance_usdt_esperado.csv")),
    "usdt",
  );
  assertMatrices(
    matrizObtenida(r.revisar, OUTPUT_COLUMNS.concat(["Motivo"])),
    matrizEsperada(path.join(base, "salida", "revisar.csv")),
    "revisar",
  );
  const cuadre = JSON.parse(leer(path.join(base, "salida", "cuadre.json")));
  for (const [k, v] of Object.entries(cuadre)) {
    assert.equal(r.cuadre[k], v, `cuadre.${k}`);
  }
});

test("HG 2026-09-07 coincide con el golden", { skip: !fs.existsSync(ROOT) }, () => {
  const base = path.join(ROOT, "muestra_hg_2026-09-07");
  const r = correr({
    bancos: [{ nombre: "HG.Cash.csv", path: path.join(base, "entrada", "HG.Cash.csv") }],
    fecha: "2026-09-07",
  });
  assertMatrices(
    matrizObtenida(r.salida, OUTPUT_COLUMNS),
    matrizEsperada(path.join(base, "salida_solo_adaptador", "balance_esperado.csv")),
    "hg",
  );
  assertMatrices(
    matrizObtenida(r.revisar, OUTPUT_COLUMNS.concat(["Motivo"])),
    matrizEsperada(path.join(base, "salida_solo_adaptador", "revisar.csv")),
    "hg revisar",
  );
});

test("Riven sintético coincide con el golden", { skip: !fs.existsSync(ROOT) }, () => {
  const base = path.join(ROOT, "riven_sintetico");
  const r = correr({
    bancos: [{ nombre: "Riven Flow.csv", path: path.join(base, "entrada", "Riven Flow.csv") }],
    fecha: "2026-09-07",
    rivenTitular: "RIVEN TITULAR DE EJEMPLO",
  });
  assertMatrices(
    matrizObtenida(r.salida, OUTPUT_COLUMNS),
    matrizEsperada(path.join(base, "salida_solo_adaptador", "balance_esperado.csv")),
    "riven",
  );
});

test("USDT cuadra cierre anterior más entradas menos salidas contra el cierre del día", () => {
  const r = armarCuadreUsdt({
    cierresAyer: [{ empresa_salida: "TrustWallet", cuenta_salida: "main", moneda: "USDT", etiqueta: "Cierre de Caja", monto: "1000", hora: "22:00" }],
    movimientos: [
      { empresa_salida: "TrustWallet", cuenta_salida: "main", moneda: "USDT", etiqueta: "[Otra] Recepcion de USDT", tipo_transaccion: "ENTRADA", monto: "200", hora: "10:00", cuenta_receptora: "A", id_transferencia: "1" },
      { empresa_salida: "TrustWallet", cuenta_salida: "main", moneda: "USDT", etiqueta: "[Otra] Cambio a USDT", tipo_transaccion: "SALIDA", monto: "50", hora: "11:00", cuenta_receptora: "B", id_transferencia: "2" },
    ],
    cierresHoy: [{ empresa_salida: "TrustWallet", cuenta_salida: "main", moneda: "USDT", etiqueta: "Cierre de Caja", monto: "1150", hora: "23:00" }],
  });
  assert.equal(r.cuentas.length, 1);
  assert.equal(r.cuentas[0].saldo_calculado, 1150);
  assert.equal(r.cuentas[0].diferencia, 0);
  assert.equal(r.hay_discrepancia, false);
});

test("USDT marca discrepancia si el cierre de hoy no coincide", () => {
  const r = armarCuadreUsdt({
    cierresAyer: [{ empresa_salida: "Binance", cuenta_salida: "spot", moneda: "ARS", etiqueta: "Cierre de Caja", monto: "10", hora: "21:00" }],
    movimientos: [
      { empresa_salida: "Binance", cuenta_salida: "spot", moneda: "USDT", etiqueta: "Gasto", tipo_transaccion: "SALIDA", monto: "4", hora: "12:00" },
    ],
    cierresHoy: [{ empresa_salida: "Binance", cuenta_salida: "spot", moneda: "USDT", etiqueta: "Cierre de Caja", monto: "10", hora: "22:00" }],
  });
  assert.equal(r.cuentas[0].cierre_anterior, 10);
  assert.equal(r.cuentas[0].saldo_calculado, 6);
  assert.equal(r.cuentas[0].diferencia, 4);
  assert.equal(r.hay_discrepancia, true);
});
