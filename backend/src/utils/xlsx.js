import zlib from "zlib";

/**
 * Lector mínimo de .xlsx para los extractos de banco: devuelve la primera hoja
 * como matriz de textos. Solo usa zlib de Node; no evalúa fórmulas ni estilos.
 */

// Un extracto real pesa unos cientos de KB; esto corta archivos inflados a propósito.
const MAX_DESCOMPRIMIDO = 50 * 1024 * 1024;

export function esXlsx(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length > 4
    && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
}

function errorXlsx(msg) {
  const err = new Error(msg);
  err.code = "FORMATO";
  return err;
}

function entradasZip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw errorXlsx("El Excel está dañado (no encuentro el índice del archivo)");
  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entradas = new Map();
  for (let n = 0; n < total; n += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw errorXlsx("El Excel está dañado (índice inválido)");
    }
    const metodo = buf.readUInt16LE(p + 10);
    const comprimido = buf.readUInt32LE(p + 20);
    const largoNombre = buf.readUInt16LE(p + 28);
    const largoExtra = buf.readUInt16LE(p + 30);
    const largoComentario = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nombre = buf.toString("utf8", p + 46, p + 46 + largoNombre);
    entradas.set(nombre, { metodo, comprimido, local });
    p += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

function leerEntrada(buf, entradas, nombre) {
  const e = entradas.get(nombre);
  if (!e) return null;
  if (e.local + 30 > buf.length || buf.readUInt32LE(e.local) !== 0x04034b50) {
    throw errorXlsx("El Excel está dañado (entrada inválida)");
  }
  const inicio = e.local + 30 + buf.readUInt16LE(e.local + 26) + buf.readUInt16LE(e.local + 28);
  const datos = buf.subarray(inicio, inicio + e.comprimido);
  if (e.metodo === 0) return datos.toString("utf8");
  if (e.metodo !== 8) throw errorXlsx("El Excel usa una compresión que no reconozco");
  try {
    return zlib.inflateRawSync(datos, { maxOutputLength: MAX_DESCOMPRIMIDO }).toString("utf8");
  } catch {
    throw errorXlsx("No pude descomprimir el Excel (dañado o demasiado grande)");
  }
}

function decodificar(s) {
  return String(s)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function atributos(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = decodificar(m[2]);
  return out;
}

function textos(xml) {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodificar(m[1])).join("");
}

function columna(ref) {
  const letras = String(ref || "").match(/^[A-Z]+/);
  if (!letras) return -1;
  let n = 0;
  for (const ch of letras[0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function rutaPrimeraHoja(buf, entradas) {
  const libro = leerEntrada(buf, entradas, "xl/workbook.xml");
  const rels = leerEntrada(buf, entradas, "xl/_rels/workbook.xml.rels");
  const hoja = libro && libro.match(/<sheet\b[^>]*>/);
  if (hoja && rels) {
    const rid = atributos(hoja[0])["r:id"];
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      const a = atributos(m[0]);
      if (a.Id === rid && a.Target) {
        const t = a.Target.replace(/^\//, "");
        return t.startsWith("xl/") ? t : `xl/${t}`;
      }
    }
  }
  return "xl/worksheets/sheet1.xml";
}

/** Primera hoja del .xlsx como matriz de textos (fila 0 = encabezados). */
export function leerXlsx(buffer) {
  const entradas = entradasZip(buffer);
  const compartidosXml = leerEntrada(buffer, entradas, "xl/sharedStrings.xml");
  const compartidos = compartidosXml
    ? [...compartidosXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]))
    : [];
  const hoja = leerEntrada(buffer, entradas, rutaPrimeraHoja(buffer, entradas));
  if (!hoja) throw errorXlsx("El Excel no tiene hojas");

  const filas = [];
  for (const fila of hoja.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const valores = [];
    for (const c of fila[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = atributos(c[1]);
      const col = columna(a.r);
      if (col < 0 || col > 200) continue;
      const cuerpo = c[2] || "";
      const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/);
      let valor = "";
      if (a.t === "s" && v) valor = compartidos[Number(v[1])] ?? "";
      else if (a.t === "inlineStr") valor = textos(cuerpo);
      else if (v) valor = decodificar(v[1]);
      valores[col] = valor;
    }
    filas.push(Array.from(valores, (x) => x ?? ""));
  }
  return filas;
}
