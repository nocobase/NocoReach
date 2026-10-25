// Ported from every-app/open-seo db8bde1 src/client/lib/csv.ts and exportRows.ts (MIT).
// Changes: written without papaparse; download only (no Sheets or JSON).
export type CsvValue = string | number | boolean | null | undefined;

// Prevent CSV formula injection (OWASP): Search Console queries are untrusted and may begin with =, +, -, @.
export function normalizeExportValue(value: CsvValue): string | number | boolean {
  const v = typeof value === 'number' && Number.isFinite(value) ? Math.round((value + Number.EPSILON) * 100) / 100 : (value ?? '');
  if (typeof v === 'string' && v.length > 0 && ['=', '+', '-', '@', '\t', '\r', '\n'].includes(v[0])) return `'${v}`;
  return v;
}

export function buildCsv(headers: string[], rows: CsvValue[][]): string {
  const quote = (value: CsvValue) => `"${String(normalizeExportValue(value)).replace(/"/g, '""')}"`;
  return [headers, ...rows].map((row) => row.map(quote).join(',')).join('\n');
}

/** Downloads a CSV with a BOM so Excel reads the Chinese headers. Returns false when there is nothing to export. */
export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]): boolean {
  if (rows.length === 0) return false;
  const url = URL.createObjectURL(new Blob(['\uFEFF' + buildCsv(headers, rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
