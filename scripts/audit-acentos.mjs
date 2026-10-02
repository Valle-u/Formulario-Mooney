/**
 * Audita acentuación y encoding en los .md del repo.
 *
 * No corrige: cuenta y localiza. Separa lo INEQUÍVOCO (una sola forma correcta) de lo AMBIGUO
 * (`esta`/`está`, `mas`/`más`, `si`/`sí`), porque un reemplazo ciego de los ambiguos mete errores
 * de sentido en un documento que se lee para decidir sobre dinero.
 *
 * Uso: node scripts/audit-acentos.mjs [--file <path>] [--show <palabra>]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Sin acento → con acento. Sólo palabras con UNA lectura posible en español. */
const INEQUIVOCAS = {
  medicion: "medición", mediciones: "mediciones", correccion: "corrección",
  correcciones: "correcciones", informacion: "información", configuracion: "configuración",
  configuraciones: "configuraciones", version: "versión", versiones: "versiones",
  razon: "razón", razones: "razones", numero: "número", numeros: "números",
  ultimo: "último", ultima: "última", ultimos: "últimos", ultimas: "últimas",
  unico: "único", unica: "única", unicos: "únicos", unicas: "únicas",
  tambien: "también", asi: "así", ahi: "ahí", aca: "acá", alla: "allá",
  dia: "día", dias: "días", habia: "había", habian: "habían", habias: "habías",
  tenia: "tenía", tenian: "tenían", queria: "quería", querian: "querían",
  decia: "decía", decian: "decían", sabia: "sabía", sabian: "sabían",
  veia: "veía", veian: "veían", creia: "creía", creian: "creían",
  seria: "sería", serian: "serían", haria: "haría", harian: "harían",
  podia: "podía", podian: "podían", debia: "debía", debian: "debían",
  salia: "salía", salian: "salían", venia: "venía", venian: "venían",
  ponia: "ponía", ponian: "ponían", hacia_: "hacía",
  salio: "salió",
  midio: "midió", midieron: "midieron", pidio: "pidió", pidieron: "pidieron",
  escribio: "escribió", escribieron: "escribieron", volvio: "volvió",
  aparecio: "apareció", aparecieron: "aparecieron", ocurrio: "ocurrió",
  sirvio: "sirvió", conclusion: "conclusión",
  decision: "decisión", decisiones: "decisiones", atencion: "atención",
  accion: "acción", acciones: "acciones", direccion: "dirección",
  proteccion: "protección", retencion: "retención", extraccion: "extracción",
  normalizacion: "normalización", validacion: "validación", verificacion: "verificación",
  aprobacion: "aprobación", revocacion: "revocación", asignacion: "asignación",
  clasificacion: "clasificación", conciliacion: "conciliación", integracion: "integración",
  acreditacion: "acreditación", implementacion: "implementación", documentacion: "documentación",
  ejecucion: "ejecución", excepcion: "excepción", inyeccion: "inyección",
  transaccion: "transacción", operacion: "operación", operaciones: "operaciones",
  organizacion: "organización", rotacion: "rotación", relacion: "relación",
  situacion: "situación", posicion: "posición", peticion: "petición",
  condicion: "condición", condiciones: "condiciones", definicion: "definición",
  edicion: "edición", ediciones: "ediciones", emision: "emisión",
  precision: "precisión", provision: "provisión", revision: "revisión",
  revisiones: "revisiones", television: "televisión", dimension: "dimensión",
  extension: "extensión", intencion: "intención", invencion: "invención",
  mencion: "mención", opcion: "opción", opciones: "opciones",
  porcion: "porción", prevencion: "prevención", produccion: "producción",
  reduccion: "reducción", reaccion: "reacción", seleccion: "selección",
  sesion: "sesión", sesiones: "sesiones", solucion: "solución",
  soluciones: "soluciones", sustitucion: "sustitución", traduccion: "traducción",
  transicion: "transición", union: "unión", contencion: "contención",
  atribucion: "atribución", distribucion: "distribución", ejecuciones: "ejecuciones",
  fraccion: "fracción", funcion: "función", funciones: "funciones",
  instruccion: "instrucción", instrucciones: "instrucciones", interaccion: "interacción",
  particion: "partición", percepcion: "percepción", presion: "presión",
  progresion: "progresión", proporcion: "proporción", reconstruccion: "reconstrucción",
  restriccion: "restricción", satisfaccion: "satisfacción", subvencion: "subvención",
  supervision: "supervisión", suspension: "suspensión", tension: "tensión",
  ademas: "además", despues: "después", quizas: "quizás", jamas: "jamás",
  detras: "detrás", atras: "atrás", adonde_: "adonde", ningun: "ningún",
  algun: "algún", segun: "según", tambien_: "también", aun_: "aún",
  facil: "fácil", dificil: "difícil", debil: "débil", util: "útil",
  inutil: "inútil", posible_: "posible", imposible_: "imposible",
  automatico: "automático", automatica: "automática", automaticamente: "automáticamente",
  deterministico: "determinístico", determinista_: "determinista",
  aritmetica: "aritmética", matematica: "matemática", practica_: "práctica",
  tecnico: "técnico", tecnica: "técnica", tecnicos: "técnicos", tecnicas: "técnicas",
  critico: "crítico", critica: "crítica", criticos: "críticos", criticas: "críticas",
  logico: "lógico", logica: "lógica", metodo: "método", metodos: "métodos",
  parametro: "parámetro", parametros: "parámetros", codigo: "código",
  codigos: "códigos", numerico: "numérico", numerica: "numérica",
  historico: "histórico", historica: "histórica", proposito: "propósito",
  minimo: "mínimo", maximo: "máximo", minima: "mínima", maxima: "máxima",
  ultimo_: "último", proximo: "próximo", proxima: "próxima",
  anterior_: "anterior", especifico: "específico", especifica: "específica",
  identico: "idéntico", identica: "idéntica", identicas: "idénticas",
  identicos: "idénticos", sintoma: "síntoma", sintomas: "síntomas",
  analisis_: "análisis", diagnostico: "diagnóstico", pronostico: "pronóstico",
  telefono: "teléfono", volumen_: "volumen", modulo: "módulo", modulos: "módulos",
  titulo: "título", titulos: "títulos", capitulo: "capítulo",
  articulo: "artículo", vehiculo: "vehículo", calculo: "cálculo",
  calculos: "cálculos", riesgo_: "riesgo", exito: "éxito",
  intrinseco: "intrínseco", periodo_: "período", area_: "área",
  linea: "línea", lineas: "líneas", limite: "límite", limites: "límites",
  margen_: "margen", indice: "índice", indices: "índices",
  origen_: "origen", imagen_: "imagen", pagina: "página", paginas: "páginas",
  maquina: "máquina", maquinas: "máquinas", ventana_: "ventana",
  quien_: "quien", cuando_: "cuando", donde_: "donde", como_: "como",
  porque_: "porque", cuanto_: "cuanto", cual_: "cual",
  anio: "año", anios: "años", ano: "año", anos: "años",
  senal: "señal", senales: "señales", senalar: "señalar",
  manana: "mañana", pequeno: "pequeño", pequena: "pequeña",
  compania: "compañía", extrano: "extraño", extrana: "extraña",
  disenio: "diseño", diseno: "diseño", dueno: "dueño", duena: "dueña",
  ninguno_: "ninguno", tamano: "tamaño", danio: "daño", dano: "daño",
  ensenia: "enseña", ensena: "enseña", ensenar: "enseñar",
  banio: "baño", campania: "campaña", montania: "montaña",
};

// Guarda contra mi propio error: la primera versión de esta lista mapeaba 13 palabras a SÍ MISMAS
// (`decisiones → decisiones`) porque el plural de `-ión` PIERDE la tilde, y las contaba como faltas.
// Un diccionario de correcciones que se contradice infla el hallazgo y manda a corregir lo correcto.
for (const [k, v] of Object.entries(INEQUIVOCAS)) {
  if (k === v || k.replace(/_$/, "") === v) delete INEQUIVOCAS[k];
}

/** Requieren mirar la oración: hay dos palabras distintas y las dos son válidas. */
const AMBIGUAS = ["esta", "este", "mas", "si", "el", "se", "de", "te", "tu", "mi",
  "que", "quien", "cuando", "donde", "como", "cual", "cuanto", "porque", "aun", "solo", "hacia",
  // Verbos donde la falta de tilde cambia la persona, no la ortografía. La primera versión de este
  // script los daba por erróneos y los 7 casos del repo estaban BIEN: "sin que nadie mande el
  // valor" (subjuntivo) y "los dígitos que te mando" (primera persona).
  "mande", "mando", "quedo", "paso", "cerro", "entero", "arreglo", "publico", "critico"];

const HINTS = {
  esta: "`esta` (este/esta cosa) vs `está` (verbo estar)",
  mas: "`mas` (pero, arcaico) vs `más` (cantidad) — casi siempre `más`",
  si: "`si` (condicional) vs `sí` (afirmación / reflexivo)",
  solo: "`solo` (solitario) vs `sólo` (solamente) — hoy la RAE permite `solo` en ambos",
  aun: "`aun` (incluso) vs `aún` (todavía)",
  hacia: "`hacia` (dirección) vs `hacía` (verbo hacer)",
  que: "`que` (relativo) vs `qué` (interrogativo/exclamativo)",
  porque: "`porque` (causa) vs `por qué` / `porqué`",
  el: "`el` (artículo) vs `él` (pronombre)",
  se: "`se` (pronombre) vs `sé` (saber/ser)",
  de: "`de` (preposición) vs `dé` (dar)",
  mi: "`mi` (posesivo) vs `mí` (pronombre)",
  tu: "`tu` (posesivo) vs `tú` (pronombre)",
  te: "`te` (pronombre) vs `té` (bebida)",
  mande: "`mande` (subjuntivo: que él mande) vs `mandé` (yo, pasado)",
  mando: "`mando` (yo, presente / el mando) vs `mandó` (él, pasado)",
  quedo: "`quedo` (yo) vs `quedó` (él)",
  paso: "`paso` (el paso / yo paso) vs `pasó` (él)",
  cerro: "`cerro` (colina) vs `cerró` (él)",
};

const EXTS = process.argv.includes("--ext")
  ? process.argv[process.argv.indexOf("--ext") + 1].split(",").map((s) => (s.startsWith(".") ? s : "." + s))
  : [".md", ".mdc"];

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".git" || e === "dist") continue;
    // Este archivo contiene las formas SIN tilde en su diccionario: incluirlo lo hace acusarse a sí
    // mismo. La primera corrida sobre `.ts` reportó 60 faltas y todas eran su propia tabla.
    if (e === "audit-acentos.mjs") continue;
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.some((x) => e.endsWith(x))) out.push(p);
  }
  return out;
}

/** Zonas que NO se tocan: bloques de código, código inline, URLs y rutas. */
function zonasProtegidas(texto) {
  const zonas = [];
  const push = (re) => {
    for (const m of texto.matchAll(re)) zonas.push([m.index, m.index + m[0].length]);
  };
  push(/```[\s\S]*?```/g);
  push(/`[^`\n]*`/g);
  push(/https?:\/\/\S+/g);
  push(/\b[\w.-]+\.(?:ts|js|mjs|md|json|env|sh|yml|db|csv|jsonl|pem)\b/g);
  // Identificadores: acentuarlos los rompe. `MONTO_MINIMO` en una tabla sin backticks era el 18% de
  // los hallazgos de la primera corrida, y "corregirlo" habría renombrado una constante en la doc.
  push(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g); // SCREAMING_SNAKE
  push(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g); // snake_case
  push(/\b[a-z]+[A-Z][A-Za-z0-9]*\b/g); // camelCase
  return zonas;
}

const protegido = (zonas, i) => zonas.some(([a, b]) => i >= a && i < b);

/**
 * En código, DÓNDE está la palabra decide si se puede tocar. Los 115 hallazgos del 26/08 se
 * repartían así, y sólo la primera categoría es segura:
 *
 *  comentario     → prosa para humanos. Se acentúa sin consecuencia.
 *  prompt         → texto que lee un modelo. Cambiarlo cambia la salida, y la del año se midió
 *                   5/5 con ESTE texto: reescribirlo es desplegar sin medición al camino del dinero.
 *  cadena         → viaja a PAM (`CRITICO:` lo parsea su lado y `hasCritical` lo compara acá) o a
 *                   los logs (grepeé "confusion de campo" contra prod hoy), o es una lista de
 *                   coincidencia contra texto de OCR ("pago facil", "revision del pago"), donde la
 *                   forma SIN tilde es justamente lo que la hace funcionar.
 *  identificador  → `telefono` es una propiedad y `anthropic-version` una cabecera HTTP. Acentuar
 *                   rompe.
 */
function clasificarZonas(texto) {
  const cats = [];
  const push = (re, cat) => {
    for (const m of texto.matchAll(re)) cats.push([m.index, m.index + m[0].length, cat]);
  };
  // El backtick de una línea gana sobre todo: `npm run exp:fecha-anio` dentro de un comentario es el
  // nombre del script, no prosa. Es lo que dejaba `anio` como "falta segura" en el header del
  // experimento, cuando acentuarlo habría documentado un comando que no se puede correr.
  push(/`[^`\n]+`/g, "identificador");
  push(/\/\*[\s\S]*?\*\//g, "comentario");
  push(/\/\/[^\n]*/g, "comentario");
  push(/`(?:\\.|[^`\\])*`/g, "prompt");
  push(/"(?:\\.|[^"\\\n])*"/g, "cadena");
  push(/'(?:\\.|[^'\\\n])*'/g, "cadena");
  return cats;
}

/**
 * Una palabra pegada a un `_` es un pedazo de identificador, y da igual que esté en un comentario:
 * `codigo_operacion` citado en prosa sigue siendo el nombre del campo. Sin esta regla, 25 de los 28
 * "seguros" del 26/08 eran `codigo_operacion` en comentarios y "corregirlos" habría dejado la doc
 * del código nombrando un campo que no existe.
 */
function pegadoAGuionBajo(texto, i, largo) {
  return texto[i - 1] === "_" || texto[i + largo] === "_";
}

function categoriaDe(cats, i) {
  // Orden deliberado: el código inline gana sobre el comentario que lo contiene, y el comentario
  // gana sobre la cadena (un `//` puede tener comillas y no por eso es una cadena).
  for (const c of ["identificador", "comentario", "prompt", "cadena"]) {
    if (cats.some(([a, b, k]) => k === c && i >= a && i < b)) return c;
  }
  return "identificador";
}

const args = process.argv.slice(2);
const soloArchivo = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
const mostrar = args.includes("--show") ? args[args.indexOf("--show") + 1] : null;
const todos = args.includes("--all");

const archivos = soloArchivo ? [join(ROOT, soloArchivo)] : walk(ROOT);
const porArchivo = new Map();
const totalPalabra = new Map();
const ambiguasPorArchivo = new Map();
const porCategoria = new Map();
const seguros = [];
let corruptos = 0;
const esCodigo = EXTS.some((x) => [".ts", ".mjs", ".mts", ".js"].includes(x));

for (const path of archivos) {
  const texto = readFileSync(path, "utf8");
  const rel = relative(ROOT, path).replace(/\\/g, "/");
  const repl = (texto.match(/\uFFFD/g) || []).length;
  if (repl > 0) {
    corruptos++;
    console.log(`  CORRUPTO  ${rel}: ${repl} caracteres de reemplazo`);
  }
  const zonas = esCodigo ? [] : zonasProtegidas(texto);
  const cats = esCodigo ? clasificarZonas(texto) : [];
  let n = 0;
  for (const m of texto.matchAll(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+/g)) {
    const w = m[0];
    const lower = w.toLowerCase();
    if (protegido(zonas, m.index)) continue;
    if (INEQUIVOCAS[lower]) {
      n++;
      totalPalabra.set(lower, (totalPalabra.get(lower) || 0) + 1);
      if (esCodigo) {
        const cat = pegadoAGuionBajo(texto, m.index, w.length)
          ? "identificador"
          : categoriaDe(cats, m.index);
        porCategoria.set(cat, (porCategoria.get(cat) || 0) + 1);
        if (cat === "comentario") {
          seguros.push({ rel, linea: texto.slice(0, m.index).split("\n").length, w: lower });
        }
      }
      if (todos || (mostrar && lower === mostrar.toLowerCase())) {
        const linea = texto.slice(0, m.index).split("\n").length;
        const ctx = texto.slice(Math.max(0, m.index - 55), m.index + 55).replace(/\n/g, " ");
        console.log(`  ${lower} → ${INEQUIVOCAS[lower]}`);
        console.log(`    ${rel}:${linea}  ...${ctx}...`);
      }
    }
    if (AMBIGUAS.includes(lower)) {
      const k = ambiguasPorArchivo.get(rel) || new Map();
      k.set(lower, (k.get(lower) || 0) + 1);
      ambiguasPorArchivo.set(rel, k);
    }
  }
  if (n > 0) porArchivo.set(rel, n);
}

if (mostrar) process.exit(0);

console.log(`\n=== ENCODING ===`);
console.log(`  archivos .md revisados: ${archivos.length}`);
console.log(`  con corrupción (U+FFFD): ${corruptos}`);

console.log(`\n=== SIN ACENTO, INEQUÍVOCO (una sola forma correcta) ===`);
const filas = [...porArchivo.entries()].sort((a, b) => b[1] - a[1]);
let total = 0;
for (const [f, n] of filas) {
  total += n;
  console.log(`  ${String(n).padStart(5)}  ${f}`);
}
console.log(`  ${String(total).padStart(5)}  TOTAL en ${filas.length} archivos`);

if (esCodigo) {
  console.log(`\n=== DÓNDE ESTÁ CADA UNA: sólo la primera categoría se puede tocar ===`);
  const orden = ["comentario", "prompt", "cadena", "identificador"];
  const riesgo = {
    comentario: "SEGURO — prosa para humanos",
    prompt: "NO TOCAR sin re-medir — texto que lee el modelo (el año se midió 5/5 con este texto)",
    cadena: "NO TOCAR — viaja a PAM / a los logs / es lista de coincidencia contra OCR",
    identificador: "NO TOCAR — acentuar rompe el código",
  };
  for (const k of orden) {
    console.log(`  ${String(porCategoria.get(k) || 0).padStart(5)}  ${k.padEnd(14)} ${riesgo[k]}`);
  }
  console.log(`\n  Los seguros, uno por uno:`);
  for (const s of seguros) console.log(`    ${s.rel}:${s.linea}  ${s.w} → ${INEQUIVOCAS[s.w]}`);
  if (seguros.length === 0) console.log(`    (ninguno)`);
}

console.log(`\n=== LAS 25 PALABRAS MÁS FRECUENTES ===`);
for (const [w, n] of [...totalPalabra.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
  console.log(`  ${String(n).padStart(4)}  ${w} → ${INEQUIVOCAS[w]}`);
}

console.log(`\n=== AMBIGUAS: hay que mirar la oración, no se reemplazan solas ===`);
const ambTotal = new Map();
for (const [, k] of ambiguasPorArchivo) {
  for (const [w, n] of k) ambTotal.set(w, (ambTotal.get(w) || 0) + n);
}
for (const [w, n] of [...ambTotal.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(5)}  ${w}${HINTS[w] ? "   " + HINTS[w] : ""}`);
}
console.log(`\n  Nota: el conteo de ambiguas incluye los usos CORRECTOS sin tilde, así que`);
console.log(`  no es una lista de errores: es el trabajo que ningún regex puede hacer solo.`);
