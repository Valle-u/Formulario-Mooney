import { balanceSheetId } from "./sheetsBalance.js";

// Acepta el ID pelado o el link completo de Google Sheets.
export function extraerIdPlanilla(texto) {
  const s = String(texto || "").trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  const id = m ? m[1] : s;
  return /^[A-Za-z0-9_-]{20,100}$/.test(id) ? id : null;
}

// ID que BALANCE_DEF_SHEETS le asigna a ese mes en particular (o null).
export function idDelEntorno(fechaISO) {
  try {
    const map = JSON.parse(process.env.BALANCE_DEF_SHEETS || "{}");
    return map[String(fechaISO).slice(0, 7)] || null;
  } catch {
    return null;
  }
}

// Planilla del balance del mes de la fecha: la cargada en el formulario y, si
// el mes no tiene, la de las variables de entorno (como era antes).
export async function balanceIdDelMes(query, fechaISO) {
  const mes = `${String(fechaISO).slice(0, 7)}-01`;
  const r = await query(`SELECT balance_id FROM planillas_mes WHERE mes = $1::date`, [mes]);
  return r.rows[0]?.balance_id || balanceSheetId(fechaISO);
}
