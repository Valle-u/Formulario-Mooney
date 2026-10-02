import { env } from "../config/env.js";
import type { ReceiptExtraction } from "./types.js";

const SYSTEM_PROMPT = `Sos un sistema experto en lectura de comprobantes bancarios argentinos.

Tu tarea es extraer datos estructurados de la imagen de un comprobante de transferencia bancaria, invocando SIEMPRE la herramienta "registrar_comprobante".

REGLAS CRITICAS DE FORMATO ARGENTINO:
- En Argentina, el PUNTO (.) separa miles: 50.000 = cincuenta mil
- La COMA (,) separa decimales: 50.000,50 = cincuenta mil con cincuenta centavos
- NUNCA confundir: $5.000 son CINCO MIL pesos, NO cinco pesos
- Montos tipicos de deposito: entre $1.000 y $5.000.000

REGLAS DE EXTRACCION:
1. Extraer el monto EXACTO como numero (sin puntos de miles, con punto decimal si hay centavos). Ej: "50.000,50" -> 50000.50
2. El codigo de operacion es un identificador unico de la transaccion (N° Operacion, Comprobante N°, Referencia)
3. El COELSA ID (si existe) es un numero largo de referencia interbancaria
4. La fecha en formato ISO: YYYY-MM-DD HH:MM:SS (lo mas completo posible). Ver el bloque FECHA.
5. Cuenta receptora (DESTINO): CBU/CVU (22 digitos EXACTOS) o Alias del destinatario. Transcribi los 22 digitos completos, sin espacios ni puntos, sin confundir letras con numeros (O=0, I/l=1, S=5, B=8). Es el dato mas importante: no lo trunques ni lo inventes. IMPORTANTE: el CBU/CVU tiene EXACTAMENTE 22 digitos — en las secuencias largas de ceros conta con cuidado y NO agregues ni quites ceros de mas (ni 21 ni 23: exactamente 22).
6. Cuenta emisora: CBU/CVU/Alias del que envia (mismas reglas de transcripcion)
7. Entidad emisora: banco o fintech del que envia (Mercado Pago, Brubank, Galicia, DolarApp/ARQ, etc.)
8. confianza: 0.0 a 1.0
9. signos_edicion: true si detectas edicion digital (fuentes inconsistentes, borrones, pixeles raros)
10. es_comprobante_valido: true si parece comprobante bancario real y legible

CODIGO DE OPERACION / COELSA ID (CRITICO — es la LLAVE de conciliacion del deposito):
- Transcribi el codigo EXACTO caracter por caracter, sin omitir, agregar ni reordenar. Suelen ser
  alfanumericos en MAYUSCULAS, fuente monoespaciada (ej: L18MKX9RPXVMQKMV2O6WYV).
- NO lo "corrijas" ni normalices: transcribi EXACTAMENTE el glifo que ves. Presta atencion especial a
  los pares ambiguos: 0(cero)/O(o) · 1/I/L · 5/S · 8/B · 6/G · 2/Z · Y/V · U/V · 9/g.
  Pistas de forma: el 6 es cerrado abajo, la G tiene gancho horizontal; la Y tiene brazo en V arriba,
  la V baja recta; el 0 suele ser mas angosto que la O. Ante duda, RELEE ese caracter mirando su forma.
- Un solo caracter mal transcripto rompe la conciliacion. Es el dato mas sensible junto con el monto.
- NO confundas el codigo con OTRO campo: NO es el CUIT/CUIL del titular (formato XX-XXXXXXXX-X, 11 digitos),
  NI el CBU/CVU (22 digitos), NI el monto, NI la fecha, NI el telefono. Busca su etiqueta: "Coelsa ID",
  "N de operacion", "Numero de comprobante", "Referencia", "Codigo de operacion". Si NO hay un codigo de
  operacion/Coelsa claramente identificable en el comprobante, devolve null — NUNCA rellenes ese campo con
  el CUIT, la cuenta, el monto ni un placeholder tipo "<UNKNOWN>"/"N/A": en ese caso va null.

FECHA (CRITICO — de este campo depende que un comprobante de HOY no se lea como de hace un año):
- El AÑO se TRANSCRIBE de la imagen. NUNCA lo deduzcas, lo completes ni lo "corrijas" con el año que
  vos creas que es hoy: tu noción del año actual viene de tu entrenamiento y ESTA DESACTUALIZADA. Si
  el comprobante dice 2026, va 2026, aunque te parezca futuro.
- Antes de escribir la fecha, RELEE los cuatro digitos del año en la imagen y confirma el ultimo.
- Si el comprobante NO imprime el año, devolve fecha en null. No lo inventes ni lo asumas.
- dia_semana: si el comprobante imprime el dia de la semana ("Martes, 25 de agosto de 2026"),
  transcribilo TAL CUAL. Si no lo imprime, null. NO lo calcules ni lo deduzcas de la fecha: se usa
  justamente para verificar el año contra el calendario, y deducirlo lo vuelve inutil.

ESTADO DEL COMPROBANTE (CRITICO):
- estado_comprobante = "confirmado" SOLO si es comprobante FINAL de transferencia YA realizada Y acreditada (señales: "Transferencia exitosa/realizada/completada", número de operación/COELSA + fecha+hora de ejecución)
- estado_comprobante = "pendiente" si la transferencia YA fue enviada por el usuario pero SIGUE en proceso de acreditación/clearing (señales: badge o texto "PENDIENTE"/"En proceso"/"Procesando" — típico de billeteras como DolarApp/ARQ mientras el dinero todavía no se acredita). CLAVE: a diferencia de "preview", "pendiente" YA tiene número de operación/comprobante y fecha/hora — el envío ya ocurrió, solo falta que se acredite.
- estado_comprobante = "preview" si es pantalla PREVIA a confirmar (boton Confirmar/Continuar/Enviar visible, "Revisión del pago", "Estás enviando", ausencia de fecha y número de operación)
- estado_comprobante = "desconocido" si no se puede determinar
- Cuenta DNI: pantalla POST-éxito ("Transferencia exitosa", "Le transferiste a…") es "confirmado" aunque NO figure emisor — NO es "preview"
- Si dudas entre confirmado y preview, elegi "preview" EXCEPTO Cuenta DNI post-éxito con banner de transferencia realizada. Si dudas entre "pendiente" y "preview": si HAY número de operación/fecha, es "pendiente"; si NO hay, es "preview". NUNCA marques "confirmado" sin al menos una señal positiva explícita (banner "Transferencia exitosa" cuenta).

Si un campo no se puede extraer, devolver null. Si la imagen NO es un comprobante, es_comprobante_valido = false y el resto null.`;

const RECEIPT_TOOL = {
  name: "registrar_comprobante",
  description: "Registra los datos estructurados extraidos de un comprobante bancario argentino.",
  input_schema: {
    type: "object" as const,
    properties: {
      monto: { type: ["number", "null"], description: "Monto como numero decimal. Ej: 50000.50" },
      codigo_operacion: { type: ["string", "null"], description: "Numero de comprobante/operacion/referencia. Transcribir EXACTO caracter por caracter (glifos ambiguos 0/O,1/I/L,5/S,8/B,6/G,2/Z,Y/V) — no corregir, es la llave de conciliacion" },
      fecha: { type: ["string", "null"], description: "Fecha y hora ISO YYYY-MM-DD HH:MM:SS. El AÑO se transcribe de la imagen, NUNCA se deduce del año que creas que es hoy" },
      dia_semana: { type: ["string", "null"], description: "Dia de la semana TAL CUAL esta impreso en el comprobante (ej 'Martes'). null si no aparece. NO deducirlo de la fecha" },
      nombre_emisor: { type: ["string", "null"], description: "Nombre de quien realizo la transferencia" },
      cuenta_emisora: { type: ["string", "null"], description: "CBU/CVU/Alias origen" },
      cuenta_receptora: { type: ["string", "null"], description: "CBU/CVU/Alias destino" },
      entidad_emisora: { type: ["string", "null"], description: "Banco o fintech de origen" },
      tipo_operacion: { type: ["string", "null"], description: "transferencia, deposito, pago, etc." },
      confianza: { type: "number", description: "Confianza de la lectura, 0.0 a 1.0" },
      signos_edicion: { type: "boolean", description: "true si hay signos de edicion digital" },
      es_comprobante_valido: { type: "boolean", description: "true si es comprobante bancario real y legible" },
      coelsa_id: { type: ["string", "null"], description: "ID COELSA / referencia interbancaria. Transcribir EXACTO caracter por caracter (glifos ambiguos 0/O,1/I/L,5/S,8/B,6/G,2/Z,Y/V) — no corregir" },
      observaciones: { type: ["string", "null"], description: "Notas adicionales relevantes" },
      estado_comprobante: {
        type: ["string", "null"],
        enum: ["confirmado", "pendiente", "preview", "desconocido", null],
        description: "Clasificacion del estado (ver reglas). 'pendiente' = ya enviada, en clearing (ej. DolarApp/ARQ).",
      },
    },
    required: [
      "monto", "codigo_operacion", "fecha", "dia_semana", "nombre_emisor",
      "cuenta_emisora", "cuenta_receptora", "entidad_emisora",
      "tipo_operacion", "confianza", "signos_edicion",
      "es_comprobante_valido", "coelsa_id", "observaciones",
      "estado_comprobante",
    ],
  },
};

function coerceExtraction(input: Record<string, unknown>): ReceiptExtraction {
  const num = (v: unknown): number | null =>
    typeof v === "number" ? v : v == null ? null : Number.parseFloat(String(v)) || null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v : null;
  const estado = str(input.estado_comprobante);
  return {
    monto: num(input.monto),
    codigo_operacion: str(input.codigo_operacion),
    fecha: str(input.fecha),
    dia_semana: str(input.dia_semana),
    nombre_emisor: str(input.nombre_emisor),
    cuenta_emisora: str(input.cuenta_emisora),
    cuenta_receptora: str(input.cuenta_receptora),
    entidad_emisora: str(input.entidad_emisora),
    tipo_operacion: str(input.tipo_operacion),
    confianza: typeof input.confianza === "number" ? input.confianza : num(input.confianza) ?? 0,
    signos_edicion: !!input.signos_edicion,
    es_comprobante_valido: !!input.es_comprobante_valido,
    coelsa_id: str(input.coelsa_id),
    observaciones: str(input.observaciones),
    estado_comprobante:
      estado === "confirmado" || estado === "pendiente" || estado === "preview" || estado === "desconocido"
        ? estado
        : null,
  };
}

/** OCR de comprobante con Claude (Messages API + tool-use). El JPEG ya viene saneado. */
export async function analyzeWithClaude(imageBuffer: Buffer, mimeType: string): Promise<ReceiptExtraction> {
  if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  try {
    const response = await fetch(`${env.ANTHROPIC_BASE_URL}/v1/messages`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": env.ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL,
        max_tokens: 1500,
        temperature: 0,
        system: SYSTEM_PROMPT,
        tools: [RECEIPT_TOOL],
        tool_choice: { type: "tool", name: RECEIPT_TOOL.name },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: { type: "base64", media_type: mimeType, data: imageBuffer.toString("base64") },
              },
              { type: "text", text: "Analizá este comprobante bancario y registrá todos los datos." },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} ${errText.slice(0, 160)}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; name?: string; input?: Record<string, unknown> }>;
    };
    const toolUse = data.content?.find((b) => b.type === "tool_use" && b.name === RECEIPT_TOOL.name);
    if (!toolUse?.input) throw new Error("Claude no devolvió tool_use con los datos del comprobante");
    return coerceExtraction(toolUse.input);
  } finally {
    clearTimeout(timeout);
  }
}
