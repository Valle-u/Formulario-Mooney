/**
 * Reporte de la base que aprende (PTMUAT-414 c). Correr: npm run ocr-eval:report
 *
 * Precisión exact-match del OCR de códigos (codigo_operacion/coelsa_id) medida contra el
 * "era en realidad" que aporta PAM: global, por banco, por clase de confusión y tendencia diaria.
 * Es la métrica que decide si vale la pena activar el few-shot (Fase 2).
 */
const { feedbackStats, countFeedback } = await import("../../src/db/ocr-feedback.js");

function pct(n: number): string { return `${(n * 100).toFixed(1)}%`; }

function run() {
  const total = countFeedback();
  if (total === 0) {
    console.log("Base que aprende vacía. Cargá feedback vía POST /scans/:id/feedback o npm run ocr-eval:import.");
    return;
  }
  const s = feedbackStats();
  console.log("== OCR eval — base que aprende (PTMUAT-414 c) ==\n");
  console.log(`Total correcciones: ${s.total} · exactas: ${s.exact} · precisión global: ${pct(s.accuracy)}\n`);

  console.log("Por banco:");
  for (const b of s.byBank) console.log(`  ${b.bank.padEnd(16)} ${String(b.exact).padStart(4)}/${String(b.total).padEnd(4)}  ${pct(b.accuracy)}`);

  console.log("\nPor clase de confusión:");
  for (const c of s.byClass) console.log(`  ${c.confusion_class.padEnd(10)} ${c.total}`);

  console.log("\nTendencia (por día):");
  for (const d of s.byDay) console.log(`  ${d.day}  ${d.exact}/${d.total}  ${pct(d.total ? d.exact / d.total : 0)}`);
}

run();
