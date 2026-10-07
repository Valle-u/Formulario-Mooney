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

test("un hash de billetera cortado no se usa como ID", () => {
  const cortado = mapExtractionToEgresoFields({
    codigo_operacion: "0x7d...7bba",
    monto: 300,
  });
  assert.equal(cortado.fields.id_transferencia, undefined);
  assert.equal(cortado.id_incompleto, true);
  assert.deepEqual(cortado.fields._ids_candidato, []);

  const pegado = mapExtractionToEgresoFields({
    codigo_operacion: "0x7d7bba",
  });
  assert.equal(pegado.fields.id_transferencia, undefined);
  assert.equal(pegado.id_incompleto, true);

  const direccion = mapExtractionToEgresoFields({
    codigo_operacion: "0xBB66CC...F98907c72",
  });
  assert.equal(direccion.fields.id_transferencia, undefined);
  assert.equal(direccion.id_incompleto, true);
});

test("el hash completo de la transferencia sí se usa como ID", () => {
  const hash = "0x" + "ab".repeat(32);
  const { fields, id_incompleto } = mapExtractionToEgresoFields({
    codigo_operacion: hash,
  });
  assert.equal(fields.id_transferencia, hash);
  assert.equal(id_incompleto, false);
  assert.deepEqual(fields._ids_candidato, [hash]);
});
