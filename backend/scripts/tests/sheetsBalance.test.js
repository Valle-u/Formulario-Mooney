import test from "node:test";
import assert from "node:assert/strict";
import { balanceSheetId, planillaSheetId } from "../../src/services/sheetsBalance.js";

const VARS = ["BALANCE_DEF_SHEETS", "BALANCE_DEF_SHEET_ID", "PLANILLA_CARGAS_SHEETS", "PLANILLA_CARGAS_SHEET_ID"];

function conEntorno(valores, fn) {
  const antes = Object.fromEntries(VARS.map((k) => [k, process.env[k]]));
  for (const k of VARS) delete process.env[k];
  Object.assign(process.env, valores);
  try {
    fn();
  } finally {
    for (const k of VARS) {
      if (antes[k] === undefined) delete process.env[k];
      else process.env[k] = antes[k];
    }
  }
}

test("el balance se escribe y se lee en la planilla del mes de la fecha", () => {
  conEntorno({
    BALANCE_DEF_SHEETS: JSON.stringify({ "2026-10": "id-octubre", "2026-11": "id-noviembre" }),
    BALANCE_DEF_SHEET_ID: "id-unico",
  }, () => {
    assert.equal(balanceSheetId("2026-11-05"), "id-noviembre");
    assert.equal(balanceSheetId("2026-10-01"), "id-octubre");
    assert.equal(balanceSheetId("2026-12-01"), "id-unico");
  });
});

test("sin la lista por mes, el balance usa el ID unico de siempre", () => {
  conEntorno({ BALANCE_DEF_SHEET_ID: "id-unico" }, () => {
    assert.equal(balanceSheetId("2026-11-05"), "id-unico");
  });
  conEntorno({}, () => {
    assert.throws(() => balanceSheetId("2026-11-05"), /Falta BALANCE_DEF_SHEET_ID/);
  });
  conEntorno({ BALANCE_DEF_SHEETS: "{roto", BALANCE_DEF_SHEET_ID: "id-unico" }, () => {
    assert.throws(() => balanceSheetId("2026-11-05"), /BALANCE_DEF_SHEETS no es un JSON/);
  });
});

test("la planilla de cargas sigue eligiendo por mes como antes", () => {
  conEntorno({
    PLANILLA_CARGAS_SHEETS: JSON.stringify({ "2026-11": "cargas-noviembre" }),
    PLANILLA_CARGAS_SHEET_ID: "cargas-unica",
  }, () => {
    assert.equal(planillaSheetId("2026-11-30"), "cargas-noviembre");
    assert.equal(planillaSheetId("2026-10-30"), "cargas-unica");
  });
});
