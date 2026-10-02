/**
 * Coherencia de `fecha` (issue #36). El comprobante trae su propio testigo del año: cuando imprime
 * el día de la semana ("Martes, 25 de agosto de 2026"), el par día↔fecha se verifica con aritmética
 * de calendario. 2026-08-25 fue martes; 2025-08-25 fue lunes. Un año mal leído se delata solo.
 *
 * DOS LÍMITES DELIBERADOS:
 *
 * 1. NO se toca `fecha`. Sale tal como la leyó el modelo, siempre. GATE no decide dinero, y una
 *    fecha "corregida" viajando en el campo que PAM usa para la regla de 48 h haría exactamente lo
 *    que PAM sufrió del otro lado en el episodio del checksum: guardar el valor corregido al lado de
 *    un flag calculado sobre el crudo deja el par sin auditar y el error propio invisible. El crudo
 *    va en `fecha`, la candidata en `fecha_alternativa`, y el consumidor decide con los dos a la vista.
 *
 * 2. NO se infiere el año desde MI reloj. Sería fácil marcar como sospechoso todo comprobante que
 *    parezca de hace exactamente un año, y atajaría también los que no imprimen el día. No se hace:
 *    esa señal no tiene evidencia en la imagen y sólo puede empujar en una dirección —"este
 *    comprobante viejo en realidad es de hoy"—, que es la dirección que acredita plata. Un
 *    comprobante reusado del año pasado, subido en el aniversario, la dispararía igual que un
 *    misread. El día impreso, en cambio, es un dato del comprobante.
 */
import { receiptAgeHours } from "./validate.js";

/** Índice = `getUTCDay()` (0 = domingo). */
const DIAS_ES = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const DIAS_EN = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** Años a probar a cada lado cuando el día impreso no calza. Un misread de año es ±1 casi siempre. */
const VENTANA_ANIOS = 2;

/**
 * Margen antes de llamar futura a una fecha. La hora la imprime el banco y el scan llega después,
 * así que la edad normal es positiva; una hora de tolerancia cubre desfasajes de reloj sin tapar un
 * año o un mes adelantado.
 */
const TOLERANCIA_FUTURO_H = 1;

function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Índice de día a partir de lo que el comprobante imprime. Acepta abreviaturas ("mar.", "Mié") y el
 * nombre en inglés, porque el prompt de Gemini está en inglés y el modelo puede traducirlo.
 * Exige 3 letras: con menos, "ma" no distingue martes de nada y adivinar sería peor que abstenerse.
 */
export function diaImpresoAIndice(txt: string | null | undefined): number | null {
  if (!txt) return null;
  const t = sinAcentos(txt).replace(/[^a-z]/g, "");
  if (t.length < 3) return null;
  for (const lista of [DIAS_ES, DIAS_EN]) {
    for (let i = 0; i < lista.length; i++) {
      if (lista[i]!.startsWith(t) || t.startsWith(lista[i]!)) return i;
    }
  }
  return null;
}

/**
 * Día de la semana de la fecha leída. Se calcula sobre el Y-M-D IMPRESO, no sobre el instante con
 * offset: un comprobante de 00:30 corrido a UTC cae el día anterior y el cruce diría que no calza
 * cuando calza. Devuelve null si la fecha no existe en el calendario (ej. 2026-02-30).
 */
export function diaSemanaDeFecha(fechaIso: string | null): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec((fechaIso ?? "").trim());
  if (!m) return null;
  const [y, mes, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mes - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mes - 1 || dt.getUTCDate() !== d) return null;
  return dt.getUTCDay();
}

/** Reemplaza el año dejando el resto de la cadena intacto. */
function conAnio(fechaIso: string, anio: number): string {
  return fechaIso.trim().replace(/^\d{4}/, String(anio).padStart(4, "0"));
}

/**
 * Años dentro de la ventana cuyo mismo día-mes cae en el día impreso. Se devuelven ordenados por
 * cercanía al año leído: un misread de año es de un dígito, no de una década.
 *
 * Calendario puro: no filtra por plausibilidad. Quién es admisible lo decide `evaluarFecha`, que es
 * el que conoce el instante del scan.
 */
export function aniosQueCalzanConDia(fechaIso: string, diaIdx: number): string[] {
  const m = /^(\d{4})/.exec(fechaIso.trim());
  if (!m) return [];
  const base = Number(m[1]);
  const candidatos: string[] = [];
  for (let delta = 1; delta <= VENTANA_ANIOS; delta++) {
    for (const anio of [base - delta, base + delta]) {
      const cand = conAnio(fechaIso, anio);
      if (diaSemanaDeFecha(cand) === diaIdx) candidatos.push(cand);
    }
  }
  return candidatos;
}

export interface FechaSanity {
  /**
   * `true`  → el día impreso no calza y un cambio de año lo explica: el año está mal leído.
   * `false` → el día impreso calza con la fecha: el año quedó corroborado por el comprobante.
   * `null`  → no hubo con qué cruzar (sin fecha, sin día impreso), o el día no calza y NINGÚN año
   *           lo explica: ahí la inconsistencia es real pero no es del año, y afirmar que el año
   *           está bien sería inventar.
   */
  anioSospechoso: boolean | null;
  /** Fecha que implica el día impreso. Null si no hay una sola candidata. GATE no la promueve. */
  fechaAlternativa: string | null;
  alerts: string[];
}

export function evaluarFecha(
  fecha: string | null,
  diaImpreso: string | null | undefined,
  ahoraMs: number = Date.now(),
): FechaSanity {
  const alerts: string[] = [];
  if (!fecha) return { anioSospechoso: null, fechaAlternativa: null, alerts };

  const edad = receiptAgeHours(fecha, ahoraMs);
  if (edad !== null && edad < -TOLERANCIA_FUTURO_H) {
    alerts.push(
      `FECHA_FUTURA: ${fecha} es ${Math.abs(edad)}h posterior al scan — imposible, la fecha está mal leída`,
    );
  }

  const diaIdx = diaImpresoAIndice(diaImpreso);
  const diaDeFecha = diaSemanaDeFecha(fecha);
  if (diaIdx === null || diaDeFecha === null) {
    return { anioSospechoso: null, fechaAlternativa: null, alerts };
  }
  if (diaIdx === diaDeFecha) {
    return { anioSospechoso: false, fechaAlternativa: null, alerts };
  }

  // Una candidata posterior al scan se descarta: el comprobante no pudo emitirse después de subirse.
  // Sin este filtro, un "Viernes" sobre un 2026-08-25 (martes) hacía proponer 2028-08-25 —dos años en
  // el futuro— como el año verdadero, porque el calendario calza. El calendario no alcanza para saber
  // qué año es plausible; hace falta el reloj del scan.
  const candidatos = aniosQueCalzanConDia(fecha, diaIdx).filter((c) => {
    const edadCand = receiptAgeHours(c, ahoraMs);
    return edadCand === null || edadCand >= -TOLERANCIA_FUTURO_H;
  });
  const impreso = DIAS_ES[diaIdx]!;
  const leido = DIAS_ES[diaDeFecha]!;

  if (candidatos.length === 0) {
    alerts.push(
      `FECHA_INCONSISTENTE: el comprobante imprime "${impreso}" y ${fecha} cae ${leido}; ningún año cercano lo explica`,
    );
    return { anioSospechoso: null, fechaAlternativa: null, alerts };
  }

  const unica = candidatos.length === 1 ? candidatos[0]! : null;
  alerts.push(
    `FECHA_ANIO_SOSPECHOSO: el comprobante imprime "${impreso}" y ${fecha} cae ${leido}` +
      (unica ? ` — el año impreso es ${unica.slice(0, 4)} (${unica})` : ` — año ambiguo: ${candidatos.join(" | ")}`),
  );
  return { anioSospechoso: true, fechaAlternativa: unica, alerts };
}
