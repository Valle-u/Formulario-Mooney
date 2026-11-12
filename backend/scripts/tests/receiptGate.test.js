import assert from "node:assert/strict";
import test from "node:test";
import { mapExtractionToEgresoFields, parseGateFecha, matchEmpresaSalida } from "../../src/services/receiptGate.js";

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

test("fecha con día y mes invertidos que cae en el futuro se corrige", () => {
  // "12/11/2026, 11:59 a.m." leído como 11 de diciembre.
  assert.deepEqual(parseGateFecha("2026-12-11 11:59:00", "2026-11-12"), { fecha: "12/11/2026", hora: "11:59" });
  // Fecha pasada normal: no se toca.
  assert.deepEqual(parseGateFecha("2026-11-05 09:30:00", "2026-11-12"), { fecha: "05/11/2026", hora: "09:30" });
  // Hoy mismo: no se toca.
  assert.equal(parseGateFecha("2026-11-12", "2026-11-12").fecha, "12/11/2026");
  // Futura pero con día > 12: no se puede invertir, queda igual.
  assert.equal(parseGateFecha("2026-12-25", "2026-11-12").fecha, "25/12/2026");
  // Futura e invertida también futura: queda igual.
  assert.equal(parseGateFecha("2026-12-30", "2026-11-12").fecha, "30/12/2026");
  assert.equal(parseGateFecha("2027-03-01", "2026-11-12").fecha, "01/03/2027");
});

test("PepePay se reconoce como empresa de salida", () => {
  assert.equal(matchEmpresaSalida("Pepe Pay", ["PepePay", "Lohas"]), "PepePay");
  assert.equal(matchEmpresaSalida("PepePay", ["PepePay"]), "PepePay");
});
