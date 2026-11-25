import test from "node:test";
import assert from "node:assert/strict";
import { balanceIdDelMes, extraerIdPlanilla, idDelEntorno } from "../../src/services/planillasMes.js";

const ID = "1UYDkzRap-QI0Py4nqCxhDzWP7tyPR5ODL1keJG_rCNQ";

test("extraerIdPlanilla acepta el link o el ID", () => {
  assert.equal(extraerIdPlanilla(ID), ID);
  assert.equal(extraerIdPlanilla(` https://docs.google.com/spreadsheets/d/${ID}/edit?gid=0#gid=0 `), ID);
  assert.equal(extraerIdPlanilla("https://docs.google.com/spreadsheets/d/corto/edit"), null);
  assert.equal(extraerIdPlanilla("javascript:alert(1)"), null);
  assert.equal(extraerIdPlanilla(""), null);
});

test("balanceIdDelMes usa la del formulario y si no hay, la del entorno", async () => {
  const antes = { a: process.env.BALANCE_DEF_SHEETS, b: process.env.BALANCE_DEF_SHEET_ID };
  process.env.BALANCE_DEF_SHEETS = "";
  process.env.BALANCE_DEF_SHEET_ID = "id-entorno";
  try {
    const vistas = [];
    const query = async (_sql, params) => {
      vistas.push(params[0]);
      return { rows: params[0] === "2026-11-01" ? [{ balance_id: ID }] : [] };
    };
    assert.equal(await balanceIdDelMes(query, "2026-11-23"), ID);
    assert.equal(await balanceIdDelMes(query, "2026-12-05"), "id-entorno");
    assert.deepEqual(vistas, ["2026-11-01", "2026-12-01"]);
  } finally {
    process.env.BALANCE_DEF_SHEETS = antes.a ?? "";
    if (antes.b === undefined) delete process.env.BALANCE_DEF_SHEET_ID; else process.env.BALANCE_DEF_SHEET_ID = antes.b;
  }
});

test("idDelEntorno solo mira los meses que nombra BALANCE_DEF_SHEETS", () => {
  const antes = process.env.BALANCE_DEF_SHEETS;
  process.env.BALANCE_DEF_SHEETS = JSON.stringify({ "2026-11": "id-nov" });
  try {
    assert.equal(idDelEntorno("2026-11-01"), "id-nov");
    assert.equal(idDelEntorno("2026-10-01"), null);
    process.env.BALANCE_DEF_SHEETS = "{roto";
    assert.equal(idDelEntorno("2026-11-01"), null);
  } finally {
    process.env.BALANCE_DEF_SHEETS = antes ?? "";
  }
});
