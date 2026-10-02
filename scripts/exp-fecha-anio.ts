/**
 * Experimento del año de `fecha` (issue #36). Correr: `npm run exp:fecha-anio`.
 *
 * QA reportó un comprobante Mercado Pago del 2026-08-25 leído como 2025-08-25: año −1 sobre un año
 * que está IMPRESO y legible. Un error de año es 365x sobre la regla de 48 h de PAM, así que el
 * prompt no se cambia "porque se lee mejor": se mide antes y después sobre la misma imagen.
 *
 * Compara el prompt vivo contra el endurecido, N corridas cada uno, y usa como control un
 * comprobante del mismo banco y del mismo día que SÍ salió bien: un arreglo que corrige el caso
 * malo y rompe el control no es un arreglo.
 *
 * Las imágenes son comprobantes reales (PII) → fuera del repo, en IMG_DIR.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

function loadEnv(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let val = m[2]!;
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (!process.env[m[1]!]) process.env[m[1]!] = val;
  }
}
loadEnv("E:\\credenciales\\GATE\\local.env");
process.env.DB_PATH ??= ":memory:";
process.env.RECEIPT_STORAGE_PATH ??= "E:\\CursorTemp\\exp-fecha-storage";

const IMG_DIR = process.env.EXP_IMG_DIR ?? "E:\\CursorTemp";
const N = Number(process.env.EXP_N ?? 5);
/** Comparar el prompt reducido del experimento contra el endurecido (cuesta el doble de llamadas). */
const CON_AB = process.env.EXP_AB === "1";

interface Caso {
  archivo: string;
  etiqueta: string;
  /** Lo que dice la imagen, leído a ojo por un humano. */
  fechaImpresa: string;
  diaImpreso: string;
}

const CASOS: Caso[] = [
  { archivo: "scan36.jpg", etiqueta: "#36 (falló: año −1)", fechaImpresa: "2026-08-25 22:36", diaImpreso: "Martes" },
  { archivo: "scan-ok.jpg", etiqueta: "control (salió bien)", fechaImpresa: "2026-08-25 22:35", diaImpreso: "" },
];

/** Regla de fecha del prompt vivo hoy: una línea, sin nada sobre el año. */
const REGLA_ACTUAL = `4. La fecha en formato ISO: YYYY-MM-DD HH:MM:SS (lo mas completo posible)`;

/**
 * Regla endurecida. Dos ideas: (a) nombrar el sesgo, porque el año que el modelo "sabe" viene de su
 * entrenamiento y está viejo; (b) pedir el día de la semana impreso, que convierte el año en un dato
 * verificable con aritmética en vez de una transcripción sin testigo.
 */
const REGLA_NUEVA = `4. FECHA (CRITICO — de este campo depende que un comprobante de HOY no se lea como de hace un año):
   - Formato ISO YYYY-MM-DD HH:MM:SS, lo mas completo posible.
   - El AÑO se TRANSCRIBE de la imagen. NUNCA lo deduzcas ni lo completes con el año que vos creas
     que es hoy: tu noción del año actual viene de tu entrenamiento y ESTA DESACTUALIZADA. Si el
     comprobante dice 2026, va 2026, aunque te parezca futuro.
   - Antes de escribirlo, RELEE los cuatro dígitos del año en la imagen y confirmá el último.
   - Si el comprobante NO imprime el año, devolve null. No lo inventes ni lo asumas.
   - dia_semana: si el comprobante imprime el día de la semana ("Martes, 25 de agosto..."),
     transcribilo TAL CUAL. Si no lo imprime, null.`;

function armarPrompt(regla: string): string {
  return `Sos un sistema experto en lectura de comprobantes bancarios argentinos.

Tu tarea es extraer datos estructurados de la imagen de un comprobante de transferencia bancaria, invocando SIEMPRE la herramienta "registrar_comprobante".

REGLAS DE EXTRACCION:
1. Extraer el monto EXACTO como numero (sin puntos de miles, con punto decimal si hay centavos).
2. El codigo de operacion es un identificador unico de la transaccion.
3. El COELSA ID (si existe) es un numero largo de referencia interbancaria.
${regla}
5. Cuenta receptora (DESTINO): CBU/CVU (22 digitos EXACTOS) o Alias del destinatario.
6. Cuenta emisora: CBU/CVU/Alias del que envia.
7. Entidad emisora: banco o fintech del que envia.

Si un campo no se puede extraer, devolver null.`;
}

function armarTool(conDiaSemana: boolean) {
  const props: Record<string, unknown> = {
    monto: { type: ["number", "null"], description: "Monto como numero decimal" },
    fecha: { type: ["string", "null"], description: "Fecha y hora ISO YYYY-MM-DD HH:MM:SS" },
    cuenta_receptora: { type: ["string", "null"], description: "CBU/CVU/Alias destino" },
    entidad_emisora: { type: ["string", "null"], description: "Banco o fintech de origen" },
  };
  const required = ["monto", "fecha", "cuenta_receptora", "entidad_emisora"];
  if (conDiaSemana) {
    props.dia_semana = {
      type: ["string", "null"],
      description: "Dia de la semana TAL CUAL esta impreso en el comprobante (ej 'Martes'). null si no aparece.",
    };
    required.push("dia_semana");
  }
  return {
    name: "registrar_comprobante",
    description: "Registra los datos extraidos de un comprobante bancario argentino.",
    input_schema: { type: "object" as const, properties: props, required },
  };
}

async function unaCorrida(img: Buffer, prompt: string, tool: ReturnType<typeof armarTool>) {
  const res = await fetch(`${process.env.ANTHROPIC_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": process.env.ANTHROPIC_VERSION!,
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL,
      max_tokens: 1000,
      temperature: 0,
      system: prompt,
      tools: [tool],
      tool_choice: { type: "tool", name: tool.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.toString("base64") } },
            { type: "text", text: "Analizá este comprobante bancario y registrá todos los datos." },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: Array<{ type: string; input?: Record<string, unknown> }> };
  return data.content?.find((b) => b.type === "tool_use")?.input ?? {};
}

function distribucion(valores: string[], anioReal: string, N: number) {
  const malos = valores.filter((f) => f.slice(0, 4) !== anioReal).length;
  console.log(`      ${malos === 0 ? "AÑO OK" : `${malos}/${N} CON AÑO MAL`}`);
  const conteo = new Map<string, number>();
  for (const l of valores) conteo.set(l, (conteo.get(l) ?? 0) + 1);
  for (const [val, n] of [...conteo].sort((a, b) => b[1] - a[1])) {
    console.log(`        x${n}  ${val}${val.slice(0, 4) !== anioReal ? "  <-- AÑO MAL" : ""}`);
  }
}

async function run() {
  console.log(`\nExperimento año de fecha — ${N} corridas por variante, temperature 0\n`);

  // El camino de producción, con el prompt y el schema COMPLETOS. El A/B de arriba corre un prompt
  // reducido: sirve para aislar el efecto de la regla, no para dar por bueno lo que se despliega.
  // Medir una versión simplificada y desplegar otra es medir otra cosa.
  const { analyzeWithClaude } = await import("../src/forensic/claude.js");
  const { evaluarFecha } = await import("../src/forensic/fecha-sanity.js");

  for (const caso of CASOS) {
    const ruta = join(IMG_DIR, caso.archivo);
    if (!existsSync(ruta)) {
      console.log(`  ${caso.etiqueta}: SIN IMAGEN en ${ruta} — salteado`);
      continue;
    }
    const img = readFileSync(ruta);
    const anioReal = caso.fechaImpresa.slice(0, 4);
    console.log(`${caso.etiqueta}  —  impreso: "${caso.fechaImpresa}"${caso.diaImpreso ? ` (${caso.diaImpreso})` : ""}`);

    if (CON_AB) {
      const variantes = [
        { nombre: "regla vieja (prompt reducido)", prompt: armarPrompt(REGLA_ACTUAL), tool: armarTool(false) },
        { nombre: "regla nueva (prompt reducido)", prompt: armarPrompt(REGLA_NUEVA), tool: armarTool(true) },
      ];
      for (const v of variantes) {
        const lecturas: string[] = [];
        for (let i = 0; i < N; i++) {
          try {
            const out = await unaCorrida(img, v.prompt, v.tool);
            lecturas.push(String(out.fecha ?? "null"));
          } catch (e) {
            lecturas.push(`ERROR: ${(e as Error).message.slice(0, 60)}`);
          }
        }
        console.log(`  ${v.nombre}`);
        distribucion(lecturas, anioReal, N);
      }
    }

    // Camino real: se miran TODOS los campos, no sólo la fecha. Agregar `dia_semana` al schema le
    // cambia el contexto al modelo, así que un arreglo de fecha que mueva el monto o el código de
    // operación no es un arreglo — esos dos son la llave de conciliación del depósito.
    const fechas: string[] = [];
    const otros = new Map<string, number>();
    const dias: string[] = [];
    for (let i = 0; i < N; i++) {
      try {
        const ext = await analyzeWithClaude(img, "image/jpeg");
        fechas.push(String(ext.fecha ?? "null"));
        dias.push(String(ext.dia_semana ?? "null"));
        const huella = [
          `monto=${ext.monto}`,
          `codigo=${ext.codigo_operacion}`,
          `coelsa=${ext.coelsa_id}`,
          `receptora=${ext.cuenta_receptora}`,
          `emisora=${ext.cuenta_emisora}`,
          `estado=${ext.estado_comprobante}`,
        ].join("  ");
        otros.set(huella, (otros.get(huella) ?? 0) + 1);
      } catch (e) {
        fechas.push(`ERROR: ${(e as Error).message.slice(0, 60)}`);
      }
    }
    console.log(`  PRODUCCION (analyzeWithClaude, prompt y schema completos)`);
    distribucion(fechas, anioReal, N);
    console.log(`        dia_semana: ${[...new Set(dias)].join(" · ")}`);
    for (const [huella, n] of otros) console.log(`        x${n}  ${huella}`);

    const sanity = evaluarFecha(fechas[0] ?? null, dias[0] === "null" ? null : dias[0]);
    console.log(
      `        guarda -> anio_sospechoso=${sanity.anioSospechoso}  alternativa=${sanity.fechaAlternativa}` +
        (sanity.alerts.length ? `\n        alerta -> ${sanity.alerts.join(" | ")}` : ""),
    );
    console.log("");
  }
}

await run();
