import "./load-env.js";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(4100),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

  DB_PATH: z.string().default("./data/receipt-gate.db"),
  RECEIPT_STORAGE_PATH: z.string().default("./data/receipts"),
  // Almacén RETENIDO para la base que aprende (PTMUAT-414 c): copias de comprobantes cuyo
  // codigo_operacion/coelsa_id fue corregido por PAM. NO lo toca cleanupExpiredReceipts (TTL),
  // porque son datos de evaluación/entrenamiento. Distinto de RECEIPT_STORAGE_PATH (efímero, 168h).
  RECEIPT_EVAL_STORAGE_PATH: z.string().default("./data/ocr-eval"),

  RECEIPT_GATE_TOKENS: z.string().default(""),

  // URL pública del gate (para armar view_url en respuestas). Ej: https://gate.example.com
  RECEIPT_PUBLIC_URL: z.string().default("http://localhost:4100"),
  // Secreto HMAC para tokens de vista de comprobantes (GET /receipts/:id?token=...)
  RECEIPT_VIEW_SECRET: z.string().default(""),
  RECEIPT_VIEW_TTL_HOURS: z.coerce.number().default(168),

  // Traza de log en disco. Vacío = sólo stdout (el log muere con el contenedor). En los hosts apunta
  // al volumen persistente. La retención acompaña al TTL de los scans: la traza no sobrevive a lo que
  // traza. Ver src/lib/log-trail.ts.
  GATE_LOG_DIR: z.string().default(""),
  GATE_LOG_RETENTION_DAYS: z.coerce.number().default(7),

  RECEIPT_CLAMAV_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  RECEIPT_CLAMAV_FAIL_CLOSED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  RECEIPT_STATS_MIN: z.coerce.number().default(1440),

  // Limpieza de comprobantes expirados (minutos entre corridas; 0 = deshabilitar).
  RECEIPT_CLEANUP_INTERVAL_MIN: z.coerce.number().default(60),

  // Capa 2 — extracción forense (IA sobre JPEG limpio)
  RECEIPT_FORENSIC_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  RECEIPT_FORENSIC_REQUIRED: z
    .enum(["true", "false", "auto"])
    .default("auto")
    .transform((v) => {
      if (v === "true") return true;
      if (v === "false") return false;
      return (process.env.NODE_ENV ?? "development") === "production";
    }),

  // Proveedor primario: Anthropic Claude (visión vía Messages API + tool-use).
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_BASE_URL: z.string().url().default("https://api.anthropic.com"),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
  ANTHROPIC_VERSION: z.string().default("2023-06-01"),

  // Fallbacks: OpenAI (GPT-4o) y Gemini.
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_RECEIPT_MODEL: z.string().default("gpt-4o"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-flash-latest"),

  // Fase 2 (diferida) — inyección few-shot de ejemplos corregidos en el prompt OCR.
  // Default OFF: solo se activa si la eval (ocr-eval:report) demuestra ganancia medible.
  RECEIPT_OCR_FEWSHOT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Dedup GLOBAL por CONTENIDO fuerte sin depender de pHash (#402, MSG-PAM-20260727-3):
  // coelsa_id exacto, o monto+fecha+cuenta_receptora+cuenta_emisora. Money-sensitive → default OFF
  // (prod mantiene comportamiento vigente); se activa en gate-test y en prod tras OK de PAM.
  RECEIPT_DEDUP_CONTENT_STRONG: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // v1.2 aditivo (#444, MSG-PAM-20260728-6): emite `cuenta_emisora/receptora_checksum_valid` en la
  // extracción. GATE NO anula (PAM decidió flag, no null: su capa de tolerancia rescata misreads d=1 que
  // anular rompería). Default OFF (contrato v1.1); ON en prod+test tras que PAM shippee su consumer.
  RECEIPT_SANITIZE_INVALID_CBU: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Scopes por etiqueta de token (`MSG-TRAZA-20260908-3`). Formato: `etiqueta=scope[,scope];otra=scope`.
  // Una etiqueta que NO figure acá queda con acceso COMPLETO — es el comportamiento histórico y se
  // mantiene para no voltear los tokens que ya andan en prod al desplegar esto. Ojo con eso: el
  // default es permisivo a propósito, así que un token nuevo sin entrada acá puede TODO. El arranque
  // lo loguea cliente por cliente para que la deriva se vea (ver `logClientScopes`).
  RECEIPT_GATE_SCOPES: z.string().default(""),
});

export const env = schema.parse(process.env);

/**
 * Consumidor autenticado del gate. La etiqueta nació SOLO para atribuir en logs: con dos entornos
 * de PAM (test y dev) pegándole al mismo host, sin etiqueta ninguno de los dos lados puede
 * distinguir quién originó un scan (`MSG-PAM-20260812-6`).
 *
 * Desde `MSG-TRAZA-20260908-3` la etiqueta TAMBIÉN puede acotar permisos. Hizo falta porque nos
 * pidieron un token "scope traza:feed" y no había con qué cumplirlo: `requireAuth` sólo miraba que
 * el token existiera, así que cualquier credencial emitida para leer un feed podía además llamar a
 * `POST /scan` —que gasta créditos de IA— y bajarse cualquier comprobante. El 28/08 esa fue la razón
 * para NO emitirle un token a QA (`MSG-GATE-20260828-2`): no se entrega una credencial cuyo alcance
 * la implementación no puede hacer cumplir. Esto es lo que faltaba para poder emitirla.
 *
 * `scopes: null` = acceso completo (histórico, etiqueta sin entrada en `RECEIPT_GATE_SCOPES`).
 */
export interface GateClient {
  label: string;
  token: string;
  scopes: ReadonlySet<string> | null;
}

/** Scope que exige cada ruta protegida. Un cliente con `scopes: null` pasa todos. */
export const SCOPES = {
  scan: "scan",
  read: "read",
  stats: "stats",
  feedback: "feedback",
  trazaFeed: "traza:feed",
} as const;

/** `etiqueta=scope[,scope];otra=scope` → mapa etiqueta → set de scopes. */
function parseScopes(raw: string): Map<string, ReadonlySet<string>> {
  const out = new Map<string, ReadonlySet<string>>();
  for (const entry of raw.split(";")) {
    const [label, list] = entry.split("=", 2);
    const l = label?.trim().toLowerCase();
    if (!l || !list) continue;
    const scopes = new Set(
      list
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    if (scopes.size > 0) out.set(l, scopes);
  }
  return out;
}

const SCOPES_POR_ETIQUETA = parseScopes(env.RECEIPT_GATE_SCOPES);

// Una entrada es `etiqueta:token` solo si el prefijo es una etiqueta plausible. Un token que
// contenga ":" sin ese formato se toma entero, así que la CSV vieja (sin etiquetas) sigue valiendo.
const LABELED_ENTRY = /^([a-z][a-z0-9_-]{0,23}):(.+)$/i;

export const GATE_CLIENTS: GateClient[] = env.RECEIPT_GATE_TOKENS.split(",")
  .map((t) => t.trim())
  .filter(Boolean)
  .map((entry) => {
    const m = LABELED_ENTRY.exec(entry);
    const label = m?.[1] && m[2] ? m[1].toLowerCase() : "sin_etiqueta";
    const token = m?.[1] && m[2] ? m[2] : entry;
    return { label, token, scopes: SCOPES_POR_ETIQUETA.get(label) ?? null };
  });

/** Qué puede cada token, al arrancar. Se loguea para que "quedó full sin querer" sea visible. */
export function clientScopeSummary(): { label: string; scopes: string | string[] }[] {
  return GATE_CLIENTS.map((c) => ({
    label: c.label,
    scopes: c.scopes ? [...c.scopes].sort() : "COMPLETO",
  }));
}

export const AUTH_TOKENS: string[] = GATE_CLIENTS.map((c) => c.token);
