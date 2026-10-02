import { multistream, pino } from "pino";
import { env } from "../config/env.js";
import { crearTrazaDiaria } from "./log-trail.js";

const nivel = env.NODE_ENV === "production" ? "info" : "debug";

// Con GATE_LOG_DIR el log va a stdout **y** a un archivo del volumen persistente, para que la traza
// de un scan no muera con el contenedor (ver log-trail.ts). Sin la variable, todo sigue igual.
export const logger = env.GATE_LOG_DIR
  ? pino(
      { level: nivel },
      multistream([
        { stream: process.stdout, level: nivel },
        { stream: crearTrazaDiaria(env.GATE_LOG_DIR, env.GATE_LOG_RETENTION_DAYS), level: nivel },
      ]),
    )
  : pino({
      level: nivel,
      transport:
        env.NODE_ENV === "production"
          ? undefined
          : { target: "pino/file", options: { destination: 1 } },
    });
