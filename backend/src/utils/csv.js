function escapeField(v) {
  const s = (v ?? "").toString();
  // CSV con ; — si contiene ; o " o salto de línea, se comilla
  if (/[;"\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCSV({ columns, rows, delimiter = ";" }) {
  const header = columns.map(escapeField).join(delimiter);
  const lines = rows.map(r => r.map(escapeField).join(delimiter));
  return [header, ...lines].join("\n");
}

// BOM UTF-8 para Excel
export function withBOM(str) {
  return "\uFEFF" + str;
}
