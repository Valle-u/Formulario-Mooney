import fs from "fs";
import path from "path";
import { google } from "googleapis";
import { OUTPUT_COLUMNS, filasAMatriz, claveMovimiento, filaInicioCarga } from "./balanceDiario.js";

export const TAB_BALANCE_MENSUAL = "Balance Mensual Bancario";

export function tabDestinoBalance() {
  return String(process.env.BALANCE_DEF_TAB || "").trim() || TAB_BALANCE_MENSUAL;
}

let sheetsClient = null;

function loadCredentialsObject() {
  const raw = process.env.GOOGLE_CREDENTIALS_JSON;
  if (raw && raw.trim()) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error("GOOGLE_CREDENTIALS_JSON no es un JSON válido");
    }
  }
  const p = process.env.GOOGLE_CREDENTIALS_PATH;
  if (!p) {
    throw new Error("Falta GOOGLE_CREDENTIALS_PATH o GOOGLE_CREDENTIALS_JSON (cuenta scraper-sheets)");
  }
  const abs = path.resolve(p);
  if (!fs.existsSync(abs)) {
    throw new Error(`No encuentro el JSON de la cuenta de servicio en GOOGLE_CREDENTIALS_PATH`);
  }
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

export async function getSheets() {
  if (sheetsClient) return sheetsClient;
  const auth = new google.auth.GoogleAuth({
    credentials: loadCredentialsObject(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const client = await auth.getClient();
  sheetsClient = google.sheets({ version: "v4", auth: client });
  return sheetsClient;
}

export function planillaSheetId(fechaISO) {
  const ym = String(fechaISO || "").slice(0, 7);
  const raw = process.env.PLANILLA_CARGAS_SHEETS;
  if (raw && raw.trim()) {
    let map;
    try { map = JSON.parse(raw); } catch { throw new Error("PLANILLA_CARGAS_SHEETS no es un JSON válido"); }
    if (map[ym]) return map[ym];
    if (map[fechaISO]) return map[fechaISO];
  }
  if (!process.env.PLANILLA_CARGAS_SHEET_ID) {
    throw new Error("Falta PLANILLA_CARGAS_SHEET_ID");
  }
  return process.env.PLANILLA_CARGAS_SHEET_ID;
}

export async function leerPlanillaDia(fechaISO) {
  const m = String(fechaISO).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new Error("Fecha inválida");
  const tab = String(Number(m[3]));
  const spreadsheetId = planillaSheetId(fechaISO);
  const sheets = await getSheets();
  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'`,
      valueRenderOption: "FORMATTED_VALUE",
    });
  } catch (e) {
    const msg = e?.message || String(e);
    throw new Error(`No pude leer la pestaña "${tab}" de la planilla de cargas del ${fechaISO}. ${msg}`);
  }
  const values = (res.data.values || []).map((row) => row.map((c) => (c == null ? "" : String(c))));
  return { tab, values, fecha: fechaISO };
}

async function asegurarTab(sheets, spreadsheetId, tab) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existe = (meta.data.sheets || []).some((s) => s.properties.title === tab);
  if (existe) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tab } } }] },
  });
}

function celdaSegura(v) {
  const s = v == null ? "" : String(v);
  if (/^[=+]/.test(s)) return `'${s}`;
  return s;
}

/**
 * Escribe en la hoja "Balance Mensual Bancario" del spreadsheet del mes.
 * No pisa el encabezado. Dedup: ID|Tipo|Importe|Titular|FechaHora.
 */
export async function leerBalanceMensual() {
  const spreadsheetId = process.env.BALANCE_DEF_SHEET_ID;
  if (!spreadsheetId) throw new Error("Falta BALANCE_DEF_SHEET_ID");
  const tab = tabDestinoBalance();
  const sheets = await getSheets();
  let res;
  try {
    res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${tab}'!A:M`,
      valueRenderOption: "FORMATTED_VALUE",
    });
  } catch (e) {
    console.error("leerBalanceMensual:", e?.message || e);
    throw new Error(`No pude leer la hoja "${tab}" del balance mensual`);
  }
  return res.data.values || [];
}

export async function escribirBalanceMensual(filas) {
  const spreadsheetId = process.env.BALANCE_DEF_SHEET_ID;
  if (!spreadsheetId) throw new Error("Falta BALANCE_DEF_SHEET_ID");
  const tab = tabDestinoBalance();

  const dataRows = filasAMatriz(filas).map((r) => r.map(celdaSegura));
  const sheets = await getSheets();
  await asegurarTab(sheets, spreadsheetId, tab);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `'${tab}'` });
  const existing = res.data.values || [];
  const yaCargadas = new Set(
    existing.slice(1)
      .filter((r) => String(r?.[1] ?? "").trim())
      .map((r) => claveMovimiento(r)),
  );
  const nuevas = dataRows.filter((r) => !yaCargadas.has(claveMovimiento(r)));

  if (!nuevas.length) {
    return { tab, nuevas: 0, repetidas: dataRows.length };
  }

  if (existing.length === 0) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tab}'!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [OUTPUT_COLUMNS, ...nuevas] },
    });
  } else {
    const inicio = filaInicioCarga(existing);
    if (!String(existing[0]?.[12] ?? "").trim()) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'${tab}'!M1`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["Etiqueta"]] },
      });
    }
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${tab}'!A${inicio}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: nuevas },
    });
  }
  return { tab, nuevas: nuevas.length, repetidas: dataRows.length - nuevas.length };
}
