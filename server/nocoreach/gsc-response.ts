export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  position?: number;
}
export interface GscQuery {
  dimensions: string[];
  startDate: string;
  endDate: string;
  rowLimit?: number;
  [key: string]: unknown;
}

// Keep untrusted upstream data unknown until the required row fields are checked.
export function searchConsoleRows(
  response: unknown,
  dimensions: readonly string[],
  range?: { startDate: string; endDate: string },
): GscRow[] {
  if (!response || typeof response !== 'object')
    throw new Error('Invalid Search Console response');
  const rows: unknown = 'rows' in response ? response.rows : undefined;
  if (rows === undefined) return [];
  if (!Array.isArray(rows)) throw new Error('Invalid Search Console response');
  for (const row of rows as unknown[]) {
    if (
      !row ||
      typeof row !== 'object' ||
      !('keys' in row) ||
      !Array.isArray(row.keys) ||
      row.keys.length !== dimensions.length ||
      !row.keys.every((key: unknown) => typeof key === 'string') ||
      !('clicks' in row) ||
      typeof row.clicks !== 'number' ||
      !Number.isFinite(row.clicks) ||
      !('impressions' in row) ||
      typeof row.impressions !== 'number' ||
      !Number.isFinite(row.impressions)
    )
      throw new Error('Invalid Search Console rows');
    if (range) {
      if (
        !('position' in row) ||
        typeof row.position !== 'number' ||
        !Number.isFinite(row.position) ||
        row.clicks < 0 ||
        row.impressions < 0
      )
        throw new Error('Invalid Search Console rows');
      if (dimensions.includes('date')) {
        const date = row.keys[0];
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          !Number.isFinite(Date.parse(date + 'T00:00:00Z')) ||
          new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) !== date ||
          date < range.startDate ||
          date > range.endDate
        )
          throw new Error('Invalid Search Console rows');
      }
    }
  }
  return rows as GscRow[];
}
