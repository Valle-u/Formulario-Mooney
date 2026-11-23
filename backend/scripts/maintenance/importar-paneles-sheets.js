// Importa a panel_diario los datos de un mes de la planilla BALANCE
// (hojas "1".."31" y "CONTROL NETWIN DIARIO").
//
// Uso (desde backend/):
//   node scripts/maintenance/importar-paneles-sheets.js --sheet=<ID planilla> --mes=2026-11
//   node scripts/maintenance/importar-paneles-sheets.js --sheet=<ID planilla> --mes=2026-11 --aplicar
//
// Sin --aplicar solo muestra lo que importaría. Necesita GOOGLE_CREDENTIALS_*
// y, con --aplicar, DATABASE_URL. Se puede correr de nuevo: reemplaza los
// valores de cada día sin duplicar.
import dotenv from "dotenv";
import { getSheets } from "../../src/services/sheetsBalance.js";
import { guardarIngesta, normalizarIngesta } from "../../src/services/panelesIngesta.js";
import { RANGO_CONTROL, RANGO_HOJA_DIA, filasControlNetwin, filasHojaDia } from "../../src/services/panelesPlanilla.js";

dotenv.config();

function argumento(nombre) {
  const arg = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return arg ? arg.slice(nombre.length + 3) : null;
}

async function main() {
  const sheetId = argumento("sheet");
  const mes = argumento("mes");
  const aplicar = process.argv.includes("--aplicar");
  const match = String(mes || "").match(/^(\d{4})-(\d{2})$/);
  if (!sheetId || !/^[\w-]{20,}$/.test(sheetId) || !match) {
    console.error("Uso: --sheet=<ID planilla> --mes=AAAA-MM [--aplicar]");
    process.exit(1);
  }
  const anio = Number(match[1]);
  const nroMes = Number(match[2]);
  const diasMes = new Date(Date.UTC(anio, nroMes, 0)).getUTCDate();

  const sheets = await getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId, fields: "sheets.properties.title" });
  const titulos = new Set(meta.data.sheets.map((s) => s.properties.title));

  const dias = [];
  for (let d = 1; d <= diasMes; d++) if (titulos.has(String(d))) dias.push(d);
  const ranges = dias.map((d) => `'${d}'!${RANGO_HOJA_DIA}`);
  const tieneControl = titulos.has("CONTROL NETWIN DIARIO");
  if (tieneControl) ranges.push(`'CONTROL NETWIN DIARIO'!${RANGO_CONTROL}`);

  const resp = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: sheetId,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE"
  });
  const valores = resp.data.valueRanges.map((r) => r.values || []);
  const control = tieneControl ? filasControlNetwin(valores.pop()) : {};

  const envios = [];
  dias.forEach((dia, i) => {
    const fecha = `${anio}-${String(nroMes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
    const paneles = [...filasHojaDia(valores[i]), ...(control[fecha] || [])];
    if (paneles.length === 0) return;
    const datos = normalizarIngesta({ fecha, paneles });
    if (datos.error) throw new Error(`${fecha}: ${datos.error}`);
    envios.push(datos);
  });

  console.log(`📄 ${envios.length} días con datos en ${mes} (hojas encontradas: ${dias.length}).`);
  for (const e of envios) {
    console.log(`  ${e.fecha}: ${e.filas.map((f) => f.nombre).join(", ")}`);
  }

  if (!aplicar) {
    console.log("\nSimulación: no se guardó nada. Agregá --aplicar para importar.");
    return;
  }

  const { pool } = await import("../../src/config/db.js");
  const client = await pool.connect();
  const desconocidos = new Set();
  try {
    await client.query("BEGIN");
    for (const datos of envios) {
      const r = await guardarIngesta(client, datos, "import");
      r.desconocidos.forEach((n) => desconocidos.add(n));
    }
    await client.query("COMMIT");
    console.log(`\n✅ Importados ${envios.length} días.`);
    if (desconocidos.size) console.log(`⚠️ Paneles que no existen en la base (no se importaron): ${[...desconocidos].join(", ")}`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
