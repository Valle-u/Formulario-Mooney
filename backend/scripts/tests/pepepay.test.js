import test from "node:test";
import assert from "node:assert/strict";
import { BANCO_PEPEPAY, leerBancoArchivo, transformar, ETIQUETA_IVA, ETIQUETA_RECHAZADA } from "../../src/services/balanceDiario.js";
import { esXlsx, leerXlsx } from "../../src/utils/xlsx.js";

// Arma un .xlsx mínimo (zip sin comprimir) con una hoja de texto en línea y números.
function armarXlsx(filas) {
  const celda = (v, ref) => (typeof v === "number"
    ? `<c r="${ref}"><v>${v}</v></c>`
    : `<c r="${ref}" t="inlineStr"><is><t>${String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;")}</t></is></c>`);
  const col = (i) => String.fromCharCode(65 + i);
  const hoja = `<worksheet><sheetData>${filas.map((f, r) => `<row r="${r + 1}">${f.map((v, i) => (v === "" ? "" : celda(v, `${col(i)}${r + 1}`))).join("")}</row>`).join("")}</sheetData></worksheet>`;
  const archivos = {
    "xl/workbook.xml": `<workbook><sheets><sheet name="Movimientos" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
    "xl/worksheets/sheet1.xml": hoja,
  };
  const locales = [];
  const centrales = [];
  let offset = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const n = Buffer.from(nombre);
    const d = Buffer.from(contenido);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(d.length, 18);
    local.writeUInt32LE(d.length, 22);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(d.length, 20);
    central.writeUInt32LE(d.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locales.push(local, n, d);
    centrales.push(central, n);
    offset += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(archivos).length, 8);
  fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(cd.length, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...locales, cd, fin]);
}

const ENCABEZADO = ["ID", "TXID", "Fecha", "Hora", "Concepto", "Tipo", "Estado", "Destinatario", "CUIT", "CVU", "Débito", "Crédito", "Saldo"];
const EXTRACTO = armarXlsx([
  ENCABEZADO,
  ["com-1", "ing-1", "2026-11-10", "23:55:23", "Comisión por depósito", "COMMISSION", "APPROVED", "Logística cate sas", "30000000007", "0001", "", 360, 178152.01],
  ["ing-1", "TX-INGRESO-1", "2026-11-10", "23:55:21", "Ingresaste dinero", "INCOME", "APPROVED", "Cliente De Prueba Uno", "20000000001", "0002", 30000, "", 178512.01],
  ["out-1", "TX-RETIRO-1", "2026-11-10", "22:24:26", "Retiraste dinero", "OUTCOME", "APPROVED", "Cliente De Prueba Dos", "", "", "", 300000, 365802.01],
  ["out-2", "TX-RETIRO-2", "2026-11-10", "19:53:01", "Retiraste dinero", "OUTCOME", "REJECTED", "Cliente De Prueba Tres", "", "", "", 10000, 1000],
]);

test("lee la primera hoja de un xlsx como matriz de textos", () => {
  assert.equal(esXlsx(EXTRACTO), true);
  assert.equal(esXlsx(Buffer.from("ID,TXID\n1,2")), false);
  const filas = leerXlsx(EXTRACTO);
  assert.deepEqual(filas[0], ENCABEZADO);
  assert.equal(filas[2][10], "30000");
  assert.equal(filas[1][7], "Logística cate sas");
});

test("un xlsx roto da un error de formato, no un 500", () => {
  const roto = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
  assert.throws(() => leerBancoArchivo(roto, "roto.xlsx"), (e) => e.code === "FORMATO");
});

test("reconoce el extracto de PepePay y arma cada movimiento", () => {
  const { fmt, banco, registros } = leerBancoArchivo(EXTRACTO, "movimientos.xlsx");
  assert.equal(fmt, "pepepay");
  assert.equal(banco, BANCO_PEPEPAY);
  const [comision, ingreso, retiro, rechazado] = registros;

  assert.equal(ingreso.direccion, "entrante");
  assert.equal(ingreso.id, "TX-INGRESO-1");
  assert.equal(ingreso.importe, "30000");
  assert.equal(ingreso.fecha_hora, "10/11/2026 23:55:21");
  assert.equal(ingreso.titular, "Cliente De Prueba Uno");
  assert.equal(ingreso.titular_cuenta, "Logística cate sas");

  assert.equal(comision.es_iva, true);
  assert.equal(comision.id, "com-1");
  assert.equal(comision.importe, "360");

  assert.equal(retiro.direccion, "saliente");
  assert.equal(retiro.id, "TX-RETIRO-1");
  assert.equal(retiro.importe, "300000");
  assert.equal(rechazado.es_rechazada, true);
});

test("en el balance la comision va como IVA, el rechazo como rechazada y el retiro cruza con el egreso", () => {
  const { registros } = leerBancoArchivo(EXTRACTO, "movimientos.xlsx");
  const egresos = [{
    empresa_salida: "PepePay", id_transferencia: "", cuenta_receptora: "Cliente De Prueba Dos",
    etiqueta: "[Unidad M] Premio Pagado", monto_raw: "300000", monto: "300000", moneda: "ARS",
  }];
  const { salida } = transformar({ registros, egresos, planillaFilas: [], planillaFecha: "2026-11-10", bancosPresentes: ["PepePay"] });
  const porId = Object.fromEntries(salida.map((f) => [f.ID, f]));
  assert.equal(porId["com-1"].Etiqueta, ETIQUETA_IVA);
  assert.equal(porId["TX-RETIRO-2"].Etiqueta, ETIQUETA_RECHAZADA);
  assert.equal(porId["TX-RETIRO-1"].Etiqueta, "[Unidad M] Premio Pagado");
  assert.equal(porId["TX-RETIRO-1"].Empresa, "PepePay");
  assert.equal(porId["TX-INGRESO-1"]["TURNO "], "Turno noche");
});
