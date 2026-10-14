import { defineMigration, rawRows, type MigrationContext } from '@nocobase/db';
import type { Knex } from 'knex';

// Frozen conversion implementation: keep this history self-contained, independent of runtime helpers.
/** Absolute timestamp contract. Never let the host timezone interpret a wall clock. */
export function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (
    value instanceof Date ||
    typeof value === 'number' ||
    (typeof value === 'string' && /^-?\d{12,16}(?:\.0+)?$/.test(value))
  ) {
    const epoch = value instanceof Date ? value.getTime() : Number(value);
    const date = new Date(epoch);
    if (
      Number.isSafeInteger(epoch) &&
      date.getUTCFullYear() >= 1000 &&
      date.getUTCFullYear() <= 9999
    )
      return date.toISOString();
    throw new Error('Invalid timestamp');
  }
  if (typeof value !== 'string') throw new Error('Invalid timestamp');
  const m = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!m) throw new Error('Timestamp requires an explicit offset');
  const calendar = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  const zone = m[8];
  if (
    +m[1] < 1000 ||
    calendar.getUTCFullYear() !== +m[1] ||
    calendar.getUTCMonth() !== +m[2] - 1 ||
    calendar.getUTCDate() !== +m[3] ||
    +m[4] > 23 ||
    +m[5] > 59 ||
    +m[6] > 59 ||
    zone === '-00:00' ||
    (zone !== 'Z' &&
      (+zone.slice(1, 3) > 14 ||
        +zone.slice(4) > 59 ||
        (+zone.slice(1, 3) === 14 && +zone.slice(4) !== 0)))
  )
    throw new Error('Invalid timestamp');
  const absolute = new Date(value.replace(' ', 'T'));
  if (absolute.getUTCFullYear() < 1000 || absolute.getUTCFullYear() > 9999)
    throw new Error('Invalid timestamp');
  return absolute.toISOString();
}

/** Resolve a proven IANA source zone; reject DST folds and gaps instead of choosing. */
export function wallTimestamp(value: string, timeZone: string): string {
  const match = value.match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?$/,
  );
  if (!match) throw new Error('Invalid wall timestamp');
  const wall = `${match[1]}T${match[2]}.${(match[3] || '').padEnd(3, '0')}`;
  const target = Date.parse(timestamp(`${wall}Z`)!);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const local = (epoch: number) => {
    const parts = Object.fromEntries(
      formatter.formatToParts(epoch).map((p) => [p.type, p.value]),
    );
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  };
  const offsets = new Set<number>();
  const wholeSecond = Math.floor(target / 1000) * 1000;
  for (let hour = -48; hour <= 48; hour++) {
    const sample = wholeSecond + hour * 3600000;
    offsets.add(Date.parse(`${local(sample)}Z`) - sample);
  }
  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((epoch) => local(epoch) === wall.slice(0, 19));
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? 'Ambiguous wall timestamp'
        : 'Nonexistent wall timestamp',
    );
  return new Date(candidates[0]).toISOString();
}

export const timeTables = [
  'nrTasks',
  'nrSnapshots',
  'nrGoogleLinks',
  'nrSyncJobs',
  'nrSyncPartitions',
  'nrKeywordRuns',
  'nrKeywordCandidates',
  'nrVariables',
  'nrYouTubeVideos',
  'nrTaskMedia',
] as const;
type Source = {
  table: string;
  id: string;
  field: string;
  raw: string | number;
  evidence: string;
  timeZone?: string;
  instant?: string;
};
type Change = {
  table: string;
  id: string;
  values: Record<string, string | null>;
};
type Issue = { table: string; id: string; field: string; reason: string };

export async function timePlan(context: MigrationContext) {
  // compile() preserves Connection naming but skips QueryAdapter's temporal projection/decoding.
  // Execute compiled SQL on the same transaction client; execute() also normalizes temporal values.
  const postgres = context.connection.dialect === 'postgres';
  if (context.connection.dialect !== 'sqlite' && !postgres)
    throw new Error(
      'Time migration supports SQLite and Postgres storage only',
    );
  const client = await context.connection.client<Knex>();
  if (postgres) {
    // Transaction-local only. Text projection prevents pg's Date decoder from guessing a zone.
    // UTC also makes timestamp -> timestamptz DDL preserve the preconverted UTC wall value.
    await client.raw("SET LOCAL TIME ZONE 'UTC'");
    await client.raw("SET LOCAL DateStyle = 'ISO, YMD'");
  }
  const configuration = context.config.get<{
    sources?: Source[];
    preflightOnly?: boolean;
  }>('nocoreach.timeMigration');
  const sources = configuration?.sources ?? [];
  if (!Array.isArray(sources))
    throw new Error('Invalid time migration sources');
  const byKey = new Map<string, Source>();
  const key = (table: string, id: string, field: string) =>
    JSON.stringify([table, id, field]);
  for (const source of sources) {
    if (
      !source ||
      !timeTables.includes(source.table as (typeof timeTables)[number]) ||
      typeof source.id !== 'string' ||
      !source.id ||
      ![
        'createdAt',
        'updatedAt',
        ...(source.table === 'nrTaskMedia' ? ['expiresAt'] : []),
      ].includes(source.field) ||
      typeof source.evidence !== 'string' ||
      !source.evidence.trim() ||
      (typeof source.raw !== 'string' && typeof source.raw !== 'number') ||
      !!source.timeZone === !!source.instant
    )
      throw new Error(
        'Invalid time migration source; require table/id/field/raw/evidence and exactly one timeZone or instant',
      );
    const id = key(source.table, source.id, source.field);
    if (byKey.has(id)) throw new Error('Duplicate time migration source');
    byKey.set(id, source);
  }
  const changes: Change[] = [];
  const issues: Issue[] = [];
  const audit: Array<{
    table: string;
    id: string;
    field: string;
    raw: unknown;
    absolute: string | null;
    evidence: string;
  }> = [];
  const used = new Set<string>();
  for (const table of timeTables) {
    const fields = [
      'createdAt',
      'updatedAt',
      ...(table === 'nrTaskMedia' ? ['expiresAt'] : []),
    ];
    const compiled = context.query
      .selectFrom(table)
      .select(['id as k', ...fields.map((field, i) => `${field} as v${i}`)])
      .compile();
    const sql = postgres
      ? `SELECT k, ${fields.map((_, i) => `v${i}::text AS v${i}`).join(', ')} FROM (${compiled.sql}) AS time_raw`
      : compiled.sql;
    const rows = rawRows<Record<string, unknown>>(
      await client.raw(sql, compiled.parameters as Knex.RawBinding[]),
    );
    for (const row of rows) {
      const id = String(row.k);
      const values: Change['values'] = {};
      for (const field of fields) {
        const raw = row[`v${fields.indexOf(field)}`];
        const entryKey = key(table, id, field);
        const source = byKey.get(entryKey);
        if (source) used.add(entryKey);
        try {
          if (source && source.raw !== raw)
            throw new Error('Source raw value does not match storage');
          let absolute: string | null;
          let evidence = 'Stored absolute timestamp or null';
          try {
            absolute = timestamp(
              postgres && typeof raw === 'string'
                ? raw.replace(/([+-]\d{2})$/, '$1:00')
                : raw,
            );
          } catch {
            if (
              typeof raw !== 'string' ||
              !/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(
                raw,
              )
            )
              throw new Error('Invalid stored timestamp');
            // Validate the calendar even when the source supplies an authoritative instant.
            timestamp(raw.replace(' ', 'T') + 'Z');
            if (!source)
              throw new Error('Missing proven source timezone or instant');
            absolute = source.instant
              ? timestamp(source.instant)
              : wallTimestamp(raw, source.timeZone!);
            evidence = source.evidence;
          }
          if (
            absolute === null &&
            (table === 'nrTaskMedia' || table === 'nrYouTubeVideos')
          )
            throw new Error('Null in a nonnullable timestamp');
          // Proven absolute values never receive a second timezone conversion.
          if (raw !== absolute) values[field] = absolute;
          audit.push({ table, id, field, raw, absolute, evidence });
        } catch (error) {
          issues.push({ table, id, field, reason: (error as Error).message });
        }
      }
      if (Object.keys(values).length) changes.push({ table, id, values });
    }
  }
  for (const [entryKey, source] of byKey)
    if (!used.has(entryKey))
      issues.push({
        table: source.table,
        id: source.id,
        field: source.field,
        reason: 'Unused source mapping',
      });
  if (issues.length)
    throw new Error(
      'Time migration preflight failed; no changes made: ' +
        JSON.stringify(issues),
    );
  return {
    changes,
    audit,
    preflightOnly: configuration?.preflightOnly === true,
  };
}

export default defineMigration({
  name: '202610140002_absolute_business_timestamps',
  irreversible: true,
  async up(context) {
    const plan = await timePlan(context);
    if (plan.preflightOnly)
      throw new Error(
        'Time migration preflight succeeded; no changes made: ' +
          JSON.stringify(plan.audit),
      );
    // All validation completes before the first write. Default migration transaction owns DDL and DML.
    // SQLite retains Z as text. Postgres old timestamp columns discard Z but store the UTC wall
    // value; the transaction-local UTC timezone above makes subsequent DDL recover that instant.
    const client = await context.connection.client<Knex>();
    for (const change of plan.changes) {
      const compiled = context.query
        .updateTable(change.table)
        .set(change.values)
        .where('id', '=', change.id)
        .compile();
      await client.raw(compiled.sql, compiled.parameters as Knex.RawBinding[]);
    }
    for (const table of timeTables)
      await context.builder.alterCollection(table, (c) => {
        const nullable = table !== 'nrTaskMedia' && table !== 'nrYouTubeVideos';
        c.alterField('createdAt', { type: 'datetimeTz', nullable });
        c.alterField('updatedAt', { type: 'datetimeTz', nullable });
        if (table === 'nrTaskMedia')
          c.alterField('expiresAt', { type: 'datetimeTz', nullable: false });
      });
  },
});
