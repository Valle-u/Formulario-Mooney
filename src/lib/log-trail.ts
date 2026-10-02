import { createWriteStream, mkdirSync, readdirSync, unlinkSync, type WriteStream } from "node:fs";
import { join } from "node:path";
import { Writable } from "node:stream";

/**
 * Traza de log que sobrevive al recreate del contenedor.
 *
 * El log del gate iba sólo a stdout, o sea al log de Docker, que **se borra cuando el contenedor se
 * reemplaza**. El 12/08 eso costó una evidencia real: el único rastro del primer scan del entorno dev
 * de PAM era una línea del log, y un `compose up --build` de 21 minutos después se la llevó. Un
 * rechazo no deja fila en `scan_records`, así que no había ningún otro lado donde mirar.
 *
 * Escribe un archivo por día UTC en el volumen persistente (`/data`), el mismo que ya guarda la base.
 *
 * **Retención: la traza vive lo mismo que lo que traza** (`RECEIPT_VIEW_TTL_HOURS`, 168 h por
 * default). Es una decisión escrita y no un default heredado: un rastro que sobreviva a los scans que
 * describe acumularía `subject_id` de gente real para siempre, que es exactamente el problema que PAM
 * marcó sobre `/data/ocr-eval`.
 */
const PREFIJO = "gate-";
const SUFIJO = ".jsonl";

const diaUTC = (t: Date): string => t.toISOString().slice(0, 10);

/** Borra las trazas más viejas que la retención. Silencioso: no puede tumbar el arranque. */
export function limpiarTrazasVencidas(dir: string, retencionDias: number, ahora = new Date()): number {
  let borradas = 0;
  const corte = new Date(ahora.getTime() - retencionDias * 24 * 60 * 60 * 1000);
  try {
    for (const nombre of readdirSync(dir)) {
      if (!nombre.startsWith(PREFIJO) || !nombre.endsWith(SUFIJO)) continue;
      const fecha = nombre.slice(PREFIJO.length, nombre.length - SUFIJO.length);
      // La fecha sale del NOMBRE y no del mtime: un `cp -r` o un restore cambian el mtime y harían
      // que la retención se mida contra cuándo se copió el archivo, no contra qué hay adentro.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      if (fecha >= diaUTC(corte)) continue;
      try {
        unlinkSync(join(dir, nombre));
        borradas++;
      } catch {
        /* si no se puede borrar uno, seguir con el resto */
      }
    }
  } catch {
    /* directorio inaccesible: la traza es best-effort, nunca un error del servicio */
  }
  return borradas;
}

/**
 * Destino pino con archivo por día UTC. Nunca lanza: si el disco falla, se pierde la traza pero el
 * scan sigue. El log es para auditar el camino del comprobante, no parte del camino.
 */
export function crearTrazaDiaria(dir: string, retencionDias: number): Writable {
  mkdirSync(dir, { recursive: true });
  limpiarTrazasVencidas(dir, retencionDias);

  let diaAbierto = "";
  let archivo: WriteStream | null = null;

  const salidaDelDia = (): WriteStream => {
    const hoy = diaUTC(new Date());
    if (archivo && hoy === diaAbierto) return archivo;
    archivo?.end();
    diaAbierto = hoy;
    archivo = createWriteStream(join(dir, `${PREFIJO}${hoy}${SUFIJO}`), { flags: "a" });
    // Sin esto, un EACCES o un disco lleno emiten 'error' sin listener y tumban el proceso.
    archivo.on("error", () => {});
    limpiarTrazasVencidas(dir, retencionDias);
    return archivo;
  };

  return new Writable({
    write(chunk, _enc, cb) {
      try {
        salidaDelDia().write(chunk, () => cb());
      } catch {
        cb();
      }
    },
  });
}
