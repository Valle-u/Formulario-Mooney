import OpenAI from "openai";
import { env } from "../config/env.js";
import { analyzeWithGemini, type GeminiExtractionResult } from "./gemini.js";
import { analyzeWithClaude } from "./claude.js";
import type { ExtractionResult, ReceiptExtraction } from "./types.js";
import {
  isMissingSenderReceipt,
  isPreviewReceipt,
  REASON_RECEIPT_NO_SENDER,
  validateExtraction,
} from "./validate.js";
import { normalizeExtractionAccounts, looksLikeMisreadCbu, type CbuNormalization } from "./normalize.js";
import { sanitizeReceiptCodes } from "./code-sanity.js";
import { evaluarFecha } from "./fecha-sanity.js";
import { withAiRetry } from "./ai-retry.js";
import { logger } from "../lib/logger.js";

let _client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!_client) {
    if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
    _client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return _client;
}

const SYSTEM_PROMPT = `Sos un sistema experto en lectura de comprobantes bancarios argentinos.

Tu tarea es extraer datos estructurados de la imagen de un comprobante de transferencia bancaria.

REGLAS CRITICAS DE FORMATO ARGENTINO:
- En Argentina, el PUNTO (.) separa miles: 50.000 = cincuenta mil
- La COMA (,) separa decimales: 50.000,50 = cincuenta mil con cincuenta centavos
- NUNCA confundir: $5.000 son CINCO MIL pesos, NO cinco pesos
- Montos tipicos de deposito: entre $1.000 y $5.000.000

REGLAS DE EXTRACCION:
1. Extraer el monto EXACTO como numero (sin puntos de miles, con punto decimal si hay centavos)
2. El codigo de operacion es un identificador unico de la transaccion
3. La fecha en formato ISO: YYYY-MM-DD HH:MM:SS. Ver el bloque FECHA.
4. Cuenta receptora (DESTINO): CBU/CVU (22 digitos EXACTOS) o Alias. Transcribi los 22 digitos completos, sin espacios ni puntos, sin confundir letras con numeros (O=0, I/l=1, S=5, B=8). No la trunques. El CBU/CVU tiene EXACTAMENTE 22 digitos — en secuencias largas de ceros conta con cuidado y NO agregues ni quites ceros (exactamente 22).
5. Entidad emisora: banco o fintech (Mercado Pago, Brubank, Galicia, DolarApp/ARQ, etc.)
6. confianza: 0.0 a 1.0
7. signos_edicion: true si detectas edicion digital
8. es_comprobante_valido: true si parece comprobante bancario real

CODIGO DE OPERACION / COELSA ID (CRITICO — es la LLAVE de conciliacion del deposito):
- Transcribi el codigo (codigo_operacion y coelsa_id) EXACTO caracter por caracter, sin omitir ni
  agregar. Suelen ser alfanumericos MAYUSCULAS monoespaciados (ej: L18MKX9RPXVMQKMV2O6WYV).
- NO lo corrijas ni normalices: transcribi el glifo EXACTO que ves. Cuidado con pares ambiguos:
  0(cero)/O · 1/I/L · 5/S · 8/B · 6/G · 2/Z · Y/V · U/V. El 6 es cerrado y la G tiene gancho;
  la Y tiene brazo y la V baja recta; el 0 es mas angosto que la O. Un caracter mal rompe el match.
- NO confundas el codigo con OTRO campo: NO es el CUIT/CUIL (11 digitos), NI el CBU/CVU (22 digitos), NI el
  monto, NI la fecha. Busca su etiqueta ("Coelsa ID", "N de operacion", "Comprobante", "Referencia"). Si no
  hay un codigo claro, devolve null — NUNCA pongas el CUIT, la cuenta ni un placeholder "<UNKNOWN>"/"N/A".

FECHA (CRITICO — de este campo depende que un comprobante de HOY no se lea como de hace un año):
- El AÑO se TRANSCRIBE de la imagen. NUNCA lo deduzcas ni lo completes con el año que vos creas que
  es hoy: tu noción del año actual viene de tu entrenamiento y ESTA DESACTUALIZADA. Si el comprobante
  dice 2026, va 2026, aunque te parezca futuro. Relee los cuatro digitos del año antes de escribirlo.
- Si el comprobante NO imprime el año, devolve fecha en null. No lo inventes.
- dia_semana: el dia de la semana TAL CUAL esta impreso ("Martes, 25 de agosto de 2026"); null si no
  aparece. NO lo deduzcas de la fecha: se usa para verificar el año contra el calendario.

ESTADO DEL COMPROBANTE (CRITICO):
- estado_comprobante = "confirmado" SOLO si es comprobante FINAL de transferencia YA realizada y acreditada
- estado_comprobante = "pendiente" si la transferencia YA fue enviada pero sigue en clearing/acreditación (badge "PENDIENTE"/"En proceso", típico DolarApp/ARQ) — a diferencia de "preview", YA tiene número de operación y fecha
- estado_comprobante = "preview" si es pantalla PREVIA a confirmar (boton Confirmar visible, sin número de operación ni fecha)
- estado_comprobante = "desconocido" si no se puede determinar
- Cuenta DNI: pantalla POST-éxito ("Transferencia exitosa", "Le transferiste a…", botones Ir al inicio / Otra transferencia / Compartir comprobante) es "confirmado" aunque NO figure emisor — NO es "preview"
- Si dudas entre confirmado y preview, elegi "preview" EXCEPTO en Cuenta DNI post-éxito con banner de transferencia realizada. Si dudas entre pendiente y preview, fijate si hay número de operación/fecha: si hay, es "pendiente"`;

const RECEIPT_SCHEMA = {
  name: "comprobante_bancario",
  strict: true,
  schema: {
    type: "object" as const,
    properties: {
      monto: { type: ["number", "null"] as const },
      codigo_operacion: { type: ["string", "null"] as const },
      fecha: { type: ["string", "null"] as const },
      dia_semana: { type: ["string", "null"] as const },
      nombre_emisor: { type: ["string", "null"] as const },
      cuenta_emisora: { type: ["string", "null"] as const },
      cuenta_receptora: { type: ["string", "null"] as const },
      entidad_emisora: { type: ["string", "null"] as const },
      tipo_operacion: { type: ["string", "null"] as const },
      confianza: { type: "number" as const },
      signos_edicion: { type: "boolean" as const },
      es_comprobante_valido: { type: "boolean" as const },
      coelsa_id: { type: ["string", "null"] as const },
      observaciones: { type: ["string", "null"] as const },
      estado_comprobante: {
        type: ["string", "null"] as const,
        enum: ["confirmado", "pendiente", "preview", "desconocido", null],
      },
    },
    required: [
      "monto",
      "codigo_operacion",
      "fecha",
      "dia_semana",
      "nombre_emisor",
      "cuenta_emisora",
      "cuenta_receptora",
      "entidad_emisora",
      "tipo_operacion",
      "confianza",
      "signos_edicion",
      "es_comprobante_valido",
      "coelsa_id",
      "observaciones",
      "estado_comprobante",
    ],
    additionalProperties: false,
  },
};

function mapGeminiToExtraction(result: GeminiExtractionResult): ReceiptExtraction {
  if (result.error) throw new Error(result.error);
  const fecha = result.transfer_date
    ? result.transfer_date.includes(" ")
      ? result.transfer_date
      : `${result.transfer_date} 00:00:00`
    : null;
  return {
    monto: result.amount,
    codigo_operacion: result.reference_number,
    fecha,
    dia_semana: result.weekday,
    nombre_emisor: result.sender_name,
    cuenta_emisora: result.sender_cbu_alias,
    cuenta_receptora: result.receiver_cbu_alias,
    entidad_emisora: result.bank_name,
    tipo_operacion: result.transfer_type,
    confianza: result.confidence,
    signos_edicion: false,
    es_comprobante_valido: result.is_valid_receipt,
    coelsa_id: null,
    observaciones: null,
    estado_comprobante: result.is_valid_receipt ? "confirmado" : "desconocido",
  };
}

async function analyzeWithOpenAI(cleanJpeg: Buffer, mime: string): Promise<ReceiptExtraction> {
  const client = getClient();
  const dataUrl = `data:${mime};base64,${cleanJpeg.toString("base64")}`;

  const response = await client.chat.completions.create({
    model: env.OPENAI_RECEIPT_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Analizá este comprobante bancario y extraé todos los datos." },
          { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
        ],
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: RECEIPT_SCHEMA,
    } as OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"],
    max_tokens: 1500,
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty response");
  return JSON.parse(content) as ReceiptExtraction;
}

type Provider = { name: string; run: (jpeg: Buffer, mime: string) => Promise<ReceiptExtraction> };

/**
 * OCR sobre JPEG ya saneado (Capa 1 completada).
 * Estrategia multi-proveedor: Claude (primario) → OpenAI → Gemini.
 * Se intenta cada proveedor configurado en orden; ante fallo se cae al siguiente.
 */
export async function analyzeCleanReceipt(cleanJpeg: Buffer): Promise<ReceiptExtraction> {
  const mime = "image/jpeg";

  const chain: Provider[] = [];
  if (env.ANTHROPIC_API_KEY) chain.push({ name: "claude", run: analyzeWithClaude });
  if (env.OPENAI_API_KEY) chain.push({ name: "openai", run: analyzeWithOpenAI });
  if (env.GEMINI_API_KEY) {
    chain.push({
      name: "gemini",
      run: async (jpeg, m) => mapGeminiToExtraction(await analyzeWithGemini(jpeg, m)),
    });
  }

  if (chain.length === 0) throw new Error("no_ai_configured");

  logger.info({ providers: chain.map((p) => p.name) }, "forensic: chain");

  let lastError: unknown;
  for (let i = 0; i < chain.length; i++) {
    const provider = chain[i]!;
    try {
      // Retry corto ante 529/429/timeout en el mismo proveedor antes de caer al siguiente.
      const result = await withAiRetry(
        provider.name,
        () => provider.run(cleanJpeg, mime),
        {
          attempts: 3,
          baseDelayMs: 800,
          log: (msg, meta) => logger.warn(meta ?? {}, msg),
        },
      );
      if (i > 0) logger.info({ provider: provider.name }, "forensic: proveedor fallback OK");
      return result;
    } catch (e) {
      lastError = e;
      const msg = e instanceof Error ? e.message : String(e);
      const next = chain[i + 1]?.name;
      if (next) logger.warn({ provider: provider.name, err: msg }, `forensic: falló — fallback ${next}`);
      else logger.error({ provider: provider.name, err: msg }, "forensic: falló sin fallback disponible");
    }
  }

  throw lastError instanceof Error ? lastError : new Error("forensic_all_providers_failed");
}

export type ForensicOutcome =
  | { status: "ok"; extraction: ReceiptExtraction; validation: ExtractionResult }
  | { status: "skipped"; reason: string }
  | { status: "rejected"; reason: string; userMessage: string }
  | { status: "failed"; error: string };

/**
 * Flag de validez de checksum de una cuenta (v1.2 aditivo). Combina TRES señales de misread:
 *  - `checksumValid` (22 dígitos puros): true/false por el algoritmo COELSA.
 *  - `kind === "digits"` (MSG-PAM-20260813-21): dígitos puros con largo de cuenta pero **distinto de
 *    22**. Un CBU/CVU tiene 22 dígitos siempre, así que 21 o 23 es un misread SEGURO — más seguro que
 *    un checksum fallido, porque no hay que confiar en ninguna aritmética para saberlo.
 *  - `looksLikeMisreadCbu` (#451): largo de CBU, mayoría dígitos, con una letra suelta → false.
 * Devuelve null sólo cuando no aplica (alias real, vacío). GATE expone el hecho; no anula.
 *
 * El caso `digits` faltaba y se iba por un hueco entre las dos primeras señales: el checksum no corre
 * sobre 21 dígitos (devuelve null) y `looksLikeMisreadCbu` se abstiene a propósito con dígitos puros
 * "porque lo maneja el checksum". No lo manejaba. Medido con el corpus de PAM: de 45 lecturas mal de
 * su cuenta, **34 salían como null**, o sea "no hay cuenta que validar" — lo mismo que dice un alias
 * legítimo. El consumidor no podía distinguir "no aplica" de "la leí mal".
 */
function accountChecksumFlag(norm: CbuNormalization): boolean | null {
  if (norm.checksumValid !== null) return norm.checksumValid;
  if (norm.kind === "digits") return false;
  if (looksLikeMisreadCbu(norm.value)) return false;
  return null;
}

export async function runForensic(cleanJpeg: Buffer): Promise<ForensicOutcome> {
  if (!env.RECEIPT_FORENSIC_ENABLED) {
    return { status: "skipped", reason: "forensic_disabled" };
  }

  if (!aiConfigured()) {
    if (env.RECEIPT_FORENSIC_REQUIRED) {
      return { status: "failed", error: "no_ai_configured" };
    }
    return { status: "skipped", reason: "no_ai_configured" };
  }

  try {
    const data = await analyzeCleanReceipt(cleanJpeg);

    // Saneo anti confusión de CAMPO ANTES de normalizar y de calcular el checksum (MSG-PAM-20260813-26).
    // Si el modelo metió un CUIT, un nombre o un <UNKNOWN> en cuenta_emisora, el campo sale null y el
    // flag también: "no encontré la cuenta". Un false queda reservado para un número mal leído.
    // También anula codigo_operacion/coelsa_id cuando son inequívocamente otro campo.
    const codeSanity = sanitizeReceiptCodes(data);
    for (const drop of codeSanity.drops) {
      logger.warn(
        { field: drop.field, raw: drop.raw, reason: drop.reason },
        "forensic: codigo anulado por confusion de campo",
      );
    }

    // Normalización post-OCR de cuentas (CBU/CVU/alias) — dep #178 DolarApp/ARQ.
    // Sanea `cuenta_receptora`/`cuenta_emisora` in place antes de validar/guardar, así el
    // PAM contrasta la cuenta destino contra la nuestra sin fallar por basura de OCR.
    const accounts = normalizeExtractionAccounts(data);
    // v1.2 aditivo (#444, MSG-PAM-20260728-6): exponer la validez del checksum CBU/CVU SIN anular.
    // PAM eligió flag sobre null porque su tolerancia rescata misreads d=1 (#255/#427) que anular
    // rompería; con checksum inválido Y cuenta desconocida, PAM cae a la CBU registrada del jugador.
    if (env.RECEIPT_SANITIZE_INVALID_CBU) {
      data.cuenta_emisora_checksum_valid = accountChecksumFlag(accounts.emisora);
      data.cuenta_receptora_checksum_valid = accountChecksumFlag(accounts.receptora);
    }
    if (accounts.receptora.changed) {
      logger.info(
        {
          raw: accounts.receptora.raw,
          value: accounts.receptora.value,
          kind: accounts.receptora.kind,
          corrected: accounts.receptora.corrected,
          checksumValid: accounts.receptora.checksumValid,
        },
        "forensic: cuenta_receptora normalizada post-OCR",
      );
    }

    const validation = validateExtraction(data);

    // Coherencia del año contra el día impreso (#36). Aditivo y sin tocar `fecha`: el crudo sigue
    // siendo el crudo y el consumidor recibe el veredicto, la evidencia y la candidata por separado.
    const fechaSanity = evaluarFecha(data.fecha, data.dia_semana);
    data.fecha_anio_sospechoso = fechaSanity.anioSospechoso;
    data.fecha_alternativa = fechaSanity.fechaAlternativa;
    validation.alerts.push(...fechaSanity.alerts);
    if (fechaSanity.alerts.length > 0) {
      logger.warn(
        {
          fecha: data.fecha,
          dia_semana: data.dia_semana,
          fecha_alternativa: fechaSanity.fechaAlternativa,
          alerts: fechaSanity.alerts,
        },
        "forensic: fecha incoherente con el dia impreso",
      );
    }

    if (isMissingSenderReceipt(data)) {
      return {
        status: "rejected",
        reason: REASON_RECEIPT_NO_SENDER,
        userMessage:
          "Ese comprobante no trae datos del emisor. Mandame otra captura donde se vea completa la transferencia 🙏",
      };
    }

    const preview = isPreviewReceipt(data);
    if (preview.preview) {
      return {
        status: "rejected",
        reason: "preview_receipt",
        userMessage:
          "Esa captura parece ser la pantalla antes de confirmar la transferencia 🙏. Mandame el comprobante final cuando se haya realizado.",
      };
    }

    if (!data.es_comprobante_valido) {
      return {
        status: "rejected",
        reason: "not_a_receipt",
        userMessage: "Eso no parece un comprobante bancario válido 🙈. Mandame la captura de la transferencia realizada 🙏",
      };
    }

    return { status: "ok", extraction: data, validation };
  } catch (e) {
    const error = e instanceof Error ? e.message : "forensic_error";
    return { status: "failed", error };
  }
}

export function aiConfigured(): boolean {
  return !!(env.ANTHROPIC_API_KEY || env.OPENAI_API_KEY || env.GEMINI_API_KEY);
}
