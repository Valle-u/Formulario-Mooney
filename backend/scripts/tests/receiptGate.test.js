import assert from "node:assert/strict";
import test from "node:test";
import { mapExtractionToEgresoFields } from "../../src/services/receiptGate.js";

test("la cuenta receptora sale del nombre cuando el comprobante lo trae", () => {
  const { fields } = mapExtractionToEgresoFields({
    nombre_emisor: "Enoc",
    observaciones: "Le transferiste a Exodus.",
    cuenta_receptora: "0000003100098765432100",
  });
  assert.equal(fields.cuenta_salida, "Enoc");
  assert.equal(fields.cuenta_receptora, "Exodus");
});

test("si no hay nombre, se escribe el CBU o alias de destino", () => {
  const cbu = mapExtractionToEgresoFields({
    nombre_emisor: "Enoc",
    cuenta_receptora: "0000003100098765432100",
  });
  assert.equal(cbu.fields.cuenta_receptora, "0000003100098765432100");

  const alias = mapExtractionToEgresoFields({
    nombre_emisor: "Enoc",
    cuenta_receptora: "exodus.wallet",
  });
  assert.equal(alias.fields.cuenta_receptora, "exodus.wallet");
});

test("Receptor: nombre sigue completando la cuenta receptora", () => {
  const { fields } = mapExtractionToEgresoFields({
    observaciones: "Receptor: Nahuel Esquivel (CUIT: 20123456789)",
  });
  assert.equal(fields.cuenta_receptora, "Nahuel Esquivel");
});
