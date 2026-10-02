/**
 * Detección de banco / fintech de origen (port extendido de PAM `bank-templates.ts`).
 *
 * Toma el `entidad_emisora` que devuelve la IA (texto libre) y lo normaliza contra un
 * catálogo curado de entidades argentinas. Devuelve el nombre canónico + si es "conocido".
 * Los formatos desconocidos se marcan para revisión (no bloquean: el PAM decide).
 *
 * La comparación es tolerante: minúsculas, sin tildes, sin palabras de relleno
 * ("banco", "s.a.", etc.), match por subcadena con guardas anti falso-positivo.
 */

export type BankKind = "banco" | "fintech" | "billetera";

interface BankEntry {
  canonical: string;
  kind: BankKind;
  aliases: string[];
}

const RAW_BANKS: BankEntry[] = [
  // ── Bancos ──────────────────────────────────────────────────────────────
  { canonical: "Banco Nación", kind: "banco", aliases: ["nacion", "bna", "banco de la nacion argentina"] },
  { canonical: "Banco Galicia", kind: "banco", aliases: ["galicia"] },
  { canonical: "Banco Santander", kind: "banco", aliases: ["santander", "santander rio"] },
  { canonical: "BBVA", kind: "banco", aliases: ["bbva", "bbva frances", "frances"] },
  { canonical: "Banco Macro", kind: "banco", aliases: ["macro"] },
  { canonical: "Banco Provincia", kind: "banco", aliases: ["provincia", "bapro", "banco provincia buenos aires"] },
  { canonical: "Banco Ciudad", kind: "banco", aliases: ["ciudad", "ciudad de buenos aires", "cuidad"] },
  { canonical: "Banco Hipotecario", kind: "banco", aliases: ["hipotecario"] },
  { canonical: "Banco Credicoop", kind: "banco", aliases: ["credicoop"] },
  { canonical: "Banco Supervielle", kind: "banco", aliases: ["supervielle"] },
  { canonical: "Banco Patagonia", kind: "banco", aliases: ["patagonia"] },
  { canonical: "Banco Comafi", kind: "banco", aliases: ["comafi"] },
  { canonical: "Banco ICBC", kind: "banco", aliases: ["icbc"] },
  { canonical: "Banco HSBC", kind: "banco", aliases: ["hsbc"] },
  { canonical: "Banco Itaú", kind: "banco", aliases: ["itau"] },
  { canonical: "Banco del Sol", kind: "banco", aliases: ["del sol", "banco del sol"] },
  { canonical: "Banco Entre Ríos", kind: "banco", aliases: ["entre rios"] },
  { canonical: "Banco BICA", kind: "banco", aliases: ["bica"] },
  { canonical: "BanCor (Córdoba)", kind: "banco", aliases: ["bancor", "banco de cordoba"] },
  { canonical: "Banco de Corrientes", kind: "banco", aliases: ["corrientes"] },
  { canonical: "Banco Piano", kind: "banco", aliases: ["piano"] },
  { canonical: "Banco Roela", kind: "banco", aliases: ["roela"] },
  { canonical: "Nuevo Banco del Chaco", kind: "banco", aliases: ["chaco", "nbch", "nuevo banco del chaco"] },
  { canonical: "Banco de Formosa", kind: "banco", aliases: ["formosa"] },
  { canonical: "Banco Columbia", kind: "banco", aliases: ["columbia"] },
  { canonical: "Banco Bind", kind: "banco", aliases: ["bind", "industrial"] },
  { canonical: "Banco de Santa Fe", kind: "banco", aliases: ["santa fe", "bsf"] },
  { canonical: "Banco de San Juan", kind: "banco", aliases: ["san juan"] },
  { canonical: "Banco Municipal de Rosario", kind: "banco", aliases: ["municipal de rosario"] },
  { canonical: "Banco Carrefour", kind: "banco", aliases: ["carrefour", "banco carrefour"] },
  { canonical: "Banco Santiago del Estero", kind: "banco", aliases: ["santiago del estero", "bse"] },
  { canonical: "Banco de Chubut", kind: "banco", aliases: ["chubut"] },
  { canonical: "Nuevo Banco de La Rioja", kind: "banco", aliases: ["rioja", "la rioja", "nblr"] },

  // ── Fintechs / billeteras ────────────────────────────────────────────────
  { canonical: "Mercado Pago", kind: "billetera", aliases: ["mercado pago", "mercadopago", "mp"] },
  { canonical: "Ualá", kind: "billetera", aliases: ["uala"] },
  { canonical: "Brubank", kind: "fintech", aliases: ["brubank"] },
  { canonical: "Naranja X", kind: "fintech", aliases: ["naranja", "naranja x", "naranjax"] },
  { canonical: "Personal Pay", kind: "billetera", aliases: ["personal pay", "personalpay"] },
  { canonical: "MODO", kind: "billetera", aliases: ["modo"] },
  { canonical: "Prex", kind: "billetera", aliases: ["prex"] },
  { canonical: "Belo", kind: "fintech", aliases: ["belo"] },
  { canonical: "Lemon Cash", kind: "fintech", aliases: ["lemon", "lemon cash", "lemoncash"] },
  { canonical: "Reba", kind: "fintech", aliases: ["reba"] },
  { canonical: "Cuenta DNI", kind: "billetera", aliases: ["cuenta dni", "cuentadni"] },
  { canonical: "Claro Pay", kind: "billetera", aliases: ["claro pay", "claropay"] },
  { canonical: "Cocos", kind: "fintech", aliases: ["cocos", "cocos capital"] },
  { canonical: "Astropay", kind: "fintech", aliases: ["astropay", "astro pay"] },
  { canonical: "Fiwind", kind: "fintech", aliases: ["fiwind"] },
  { canonical: "Credicuotas", kind: "fintech", aliases: ["credicuotas"] },
  { canonical: "Pago Fácil", kind: "billetera", aliases: ["pago facil", "pagofacil"] },
  { canonical: "Cenco Pay", kind: "billetera", aliases: ["cenco pay", "cencopay", "cencosud pay"] },
  { canonical: "Onda Siempre", kind: "billetera", aliases: ["onda siempre", "onda"] },
  // DolarApp (billetera USD/ARS). En comprobantes AR el emisor/receptor puede figurar como
  // "DolarApp" o su marca "ARQ" (dep #178). "arq" es alias corto → solo match exacto.
  { canonical: "DolarApp", kind: "fintech", aliases: ["dolarapp", "dolar app", "arq"] },
];

function normalize(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // cualquier carácter no alfanumérico (símbolos: + . , - / etc.) → espacio.
    // Esto hace que "BNA+", "Banco-Nación", "Pago.Fácil" matcheen sus alias.
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(banco|s\s?a|sa|sucursal|entidad|financiera)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NORM_ENTRIES = RAW_BANKS.map((b) => ({
  canonical: b.canonical,
  kind: b.kind,
  normAliases: [b.canonical, ...b.aliases].map(normalize).filter(Boolean),
}));

export interface BankDetection {
  /** Nombre canónico si se reconoció; null si desconocido. */
  canonical: string | null;
  /** Tipo de entidad reconocida. */
  kind: BankKind | null;
  /** true si la entidad está en el catálogo curado. */
  known: boolean;
  /** Texto crudo que devolvió la IA (para auditoría / training). */
  raw: string | null;
  /** Alias contra el que matcheó (debug). */
  matchedOn: string | null;
}

/** Busca la entidad en el catálogo. Tolerante a tildes/relleno; guardas anti falso-positivo. */
export function detectBank(raw: string | null | undefined): BankDetection {
  const rawText = raw ? String(raw) : null;
  const needle = normalize(rawText ?? "");
  if (!needle) {
    return { canonical: null, kind: null, known: false, raw: rawText, matchedOn: null };
  }

  for (const entry of NORM_ENTRIES) {
    for (const al of entry.normAliases) {
      if (!al) continue;
      // Match exacto, o subcadena en ambos sentidos pero solo con alias largos
      // (evita que "mp" matchee dentro de "amparo", "del" dentro de "delta", etc.).
      if (needle === al) {
        return { canonical: entry.canonical, kind: entry.kind, known: true, raw: rawText, matchedOn: al };
      }
      if (al.length >= 4 && (needle.includes(al) || al.includes(needle))) {
        return { canonical: entry.canonical, kind: entry.kind, known: true, raw: rawText, matchedOn: al };
      }
    }
  }

  return { canonical: null, kind: null, known: false, raw: rawText, matchedOn: null };
}

export function listKnownBanks(): string[] {
  return RAW_BANKS.map((b) => b.canonical);
}
