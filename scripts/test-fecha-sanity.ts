/**
 * Contrato de coherencia de `fecha` (#36). Correr: `npm run test:fecha-sanity`.
 *
 * Determinista y sin IA: fija las tres cosas que el consumidor necesita poder creer.
 *  1. `fecha` NUNCA se reescribe — la candidata viaja aparte.
 *  2. `false` significa "el día impreso corrobora el año", no "no revisé".
 *  3. `null` cubre los dos casos donde no hay veredicto honesto: nada que cruzar, o inconsistencia
 *     que ningún año explica. Nunca se afirma que el año está bien sin haberlo verificado.
 */
import {
  evaluarFecha,
  diaImpresoAIndice,
  diaSemanaDeFecha,
  aniosQueCalzanConDia,
} from "../src/forensic/fecha-sanity.js";

let ok = 0;
let fail = 0;

function check(nombre: string, real: unknown, esperado: unknown) {
  const a = JSON.stringify(real);
  const b = JSON.stringify(esperado);
  if (a === b) {
    ok++;
    console.log(`  OK    ${nombre}`);
  } else {
    fail++;
    console.log(`  FALLA ${nombre}\n          esperado: ${b}\n          real:     ${a}`);
  }
}

// Reloj fijo para que el test no cambie de resultado con el paso del tiempo.
// 2026-08-26 01:38 UTC = el instante real del scan de #36.
const AHORA = Date.UTC(2026, 7, 26, 1, 38, 0);

console.log("\n--- diaImpresoAIndice: lo que imprime el comprobante ---");
check("Martes", diaImpresoAIndice("Martes"), 2);
check("martes minúscula", diaImpresoAIndice("martes"), 2);
check("Mié con acento", diaImpresoAIndice("Miércoles"), 3);
check("mie sin acento", diaImpresoAIndice("mie"), 3);
check("abreviatura con punto", diaImpresoAIndice("mar."), 2);
check("Sábado", diaImpresoAIndice("Sábado"), 6);
check("Domingo", diaImpresoAIndice("Domingo"), 0);
check("inglés Tuesday", diaImpresoAIndice("Tuesday"), 2);
check("con coma y resto", diaImpresoAIndice("Martes,"), 2);
check("dos letras no alcanzan", diaImpresoAIndice("ma"), null);
check("basura", diaImpresoAIndice("xyz"), null);
check("null", diaImpresoAIndice(null), null);
check("vacío", diaImpresoAIndice(""), null);

console.log("\n--- diaSemanaDeFecha: el calendario ---");
check("2026-08-25 es martes", diaSemanaDeFecha("2026-08-25 22:36:00"), 2);
check("2025-08-25 es lunes", diaSemanaDeFecha("2025-08-25 22:36:00"), 1);
// El día se calcula sobre el Y-M-D impreso: si se calculara sobre el instante con offset -03:00,
// un comprobante de 00:30 caería el día anterior y el cruce fallaría con la fecha bien leída.
check("00:30 no se corre de día", diaSemanaDeFecha("2026-08-25 00:30:00"), 2);
check("sólo fecha, sin hora", diaSemanaDeFecha("2026-08-25"), 2);
check("fecha inexistente", diaSemanaDeFecha("2026-02-30"), null);
check("29/02 de año no bisiesto", diaSemanaDeFecha("2026-02-29"), null);
check("29/02 bisiesto sí existe", diaSemanaDeFecha("2024-02-29"), 4);
check("no parseable", diaSemanaDeFecha("ayer"), null);
check("null", diaSemanaDeFecha(null), null);

console.log("\n--- aniosQueCalzanConDia (calendario puro, sin plausibilidad) ---");
// Un 25 de agosto cae: 2023 vie · 2024 dom · 2025 lun · 2026 mar · 2027 mié · 2028 vie.
check("martes explica 2026 desde 2025", aniosQueCalzanConDia("2025-08-25 22:36:00", 2), ["2026-08-25 22:36:00"]);
check("jueves no lo explica ningún año cercano", aniosQueCalzanConDia("2025-08-25 22:36:00", 4), []);
check("domingo lo explica 2024", aniosQueCalzanConDia("2025-08-25 22:36:00", 0), ["2024-08-25 22:36:00"]);

console.log("\n--- evaluarFecha: el caso de #36 ---");
{
  // El comprobante imprime "Martes, 25 de agosto de 2026"; el modelo leyó 2025 (que fue lunes).
  const r = evaluarFecha("2025-08-25 22:36:00", "Martes", AHORA);
  check("marca el año sospechoso", r.anioSospechoso, true);
  check("propone la fecha del día impreso", r.fechaAlternativa, "2026-08-25 22:36:00");
  check("una sola alerta", r.alerts.length, 1);
  check("la alerta nombra el año bueno", r.alerts[0]!.includes("2026-08-25"), true);
  check("prefijo FECHA_ANIO_SOSPECHOSO", r.alerts[0]!.startsWith("FECHA_ANIO_SOSPECHOSO:"), true);
}

console.log("\n--- evaluarFecha: el control (mismo día, año bien leído) ---");
{
  const r = evaluarFecha("2026-08-25 22:35:00", "Martes", AHORA);
  check("el día corrobora el año", r.anioSospechoso, false);
  check("sin candidata", r.fechaAlternativa, null);
  check("sin alertas", r.alerts, []);
}

console.log("\n--- evaluarFecha: cuándo NO hay veredicto ---");
{
  const sinDia = evaluarFecha("2025-08-25 22:36:00", null, AHORA);
  check("sin día impreso → null, no false", sinDia.anioSospechoso, null);
  check("sin día impreso → sin alerta", sinDia.alerts, []);

  const sinFecha = evaluarFecha(null, "Martes", AHORA);
  check("sin fecha → null", sinFecha.anioSospechoso, null);
  check("sin fecha → sin alerta (SIN_FECHA ya la emite validateExtraction)", sinFecha.alerts, []);

  const noParseable = evaluarFecha("25 de agosto", "Martes", AHORA);
  check("fecha no parseable → null", noParseable.anioSospechoso, null);
}

console.log("\n--- evaluarFecha: inconsistente pero NO por el año ---");
{
  // 2026-08-25 fue martes. Con "Jueves" impreso algo no cierra, y ningún 25 de agosto cercano cae
  // jueves: la inconsistencia es real pero no es del año, así que no se afirma nada sobre el año.
  const r = evaluarFecha("2026-08-25 22:36:00", "Jueves", AHORA);
  check("no afirma que el año esté bien", r.anioSospechoso, null);
  check("avisa igual", r.alerts.length, 1);
  check("prefijo FECHA_INCONSISTENTE", r.alerts[0]!.startsWith("FECHA_INCONSISTENTE:"), true);
}
{
  // El caso que descubrió el filtro de plausibilidad: 2028-08-25 SÍ es viernes y está dentro de la
  // ventana de ±2, pero es futuro. Proponer una fecha posterior al scan como "el año verdadero" es
  // imposible, así que la candidata se descarta y queda una inconsistencia sin explicación de año.
  const r = evaluarFecha("2026-08-25 22:36:00", "Viernes", AHORA);
  check("no propone un año futuro", r.fechaAlternativa, null);
  check("no lo llama misread de año", r.anioSospechoso, null);
  check("lo reporta como inconsistente", r.alerts[0]!.startsWith("FECHA_INCONSISTENTE:"), true);
}

console.log("\n--- evaluarFecha: fecha futura ---");
{
  // Un comprobante no puede emitirse después de subirse. Es la única señal que se saca del reloj
  // propio, y va en la dirección segura: manda a mirar algo que se veía fresco.
  const r = evaluarFecha("2027-08-25 22:36:00", null, AHORA);
  check("avisa futura", r.alerts.some((a) => a.startsWith("FECHA_FUTURA:")), true);

  const cerca = evaluarFecha("2026-08-25 22:36:00", null, AHORA);
  check("una hora de margen no dispara", cerca.alerts, []);
}

console.log("\n--- el contrato duro: fecha nunca se reescribe ---");
{
  // evaluarFecha no recibe el objeto de extracción: no tiene forma de tocar `fecha` ni por accidente.
  // Lo que se verifica acá es que la candidata NO sea igual al crudo, o sea que viaje por otro campo.
  const r = evaluarFecha("2025-08-25 22:36:00", "Martes", AHORA);
  check("la candidata es otro valor", r.fechaAlternativa !== "2025-08-25 22:36:00", true);
}

console.log(`\n${ok} OK · ${fail} fallas\n`);
if (fail > 0) process.exit(1);
