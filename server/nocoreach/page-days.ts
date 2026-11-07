// Each page's figures of each synced day (nrPageDays), summed from the day's Search Console query × page partition and
// GA4 page partition, so the page drawer reads one page's days by key instead of every page of the window (on 252, about
// 24,000 addresses in 90 days: 3.7 to 5.8 s a page before, 2026-11-07).
//
// Rows are kept under the address without the page identity: Search Console rows under their page key (host without
// `www.`, path without a trailing slash, query or fragment), GA4 rows under their host as stored and their path (the
// address's path for a row with a host, the stored path for the rows synced before hosts were kept). The identity is
// applied when a page is read, so a newly read canonical needs no rewrite. A day is marked in nrPageDayMarks when its
// rows are written, so a day held with no row for a page reads as zero.
//
// The sync writes a day's rows with its partition, in the same transaction (`writePageDay`), unless the day it read
// again is unchanged: writing a day's 4,000 rows takes 0.15 to 0.9 s on SQLite. Days synced before this table, or
// brought in another way (the classic import, an edited demo), are summed by `fillDays` in the background, one day per
// transaction, giving way to other requests between days; until then the drawer sums the page's missing days from their
// partitions itself, as it did before this table.
import { createHash } from 'node:crypto';
import {
  canonicalUrl,
  pageKey,
  type PageIdentity,
} from '../../shared/page-identity.js';
import type { LegacyDatabase, LegacyTransaction } from './legacy/database.js';

type Values = Record<string, unknown>;
export type PageDaySource = 'gsc' | 'ga4';
type Row = {
  host: string;
  path: string;
  clicks?: number;
  impressions?: number;
  views?: number;
};
type Held = Row & { source: string; resource: string; date: string };

const DAY_MS = 86400000;
/** A calendar date (YYYY-MM-DD) as the days since 1970-01-01 the tables hold, and back. */
export const dayNumber = (date: string) =>
  Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const dateOfDay = (day: unknown) =>
  new Date(Number(day) * DAY_MS).toISOString().slice(0, 10);

export const PAGE_GRAINS: Record<PageDaySource, string> = {
  gsc: 'query_page',
  ga4: 'page',
};
const sourceOfGrain = (grain: unknown): PageDaySource | null =>
  grain === 'query_page' ? 'gsc' : grain === 'page' ? 'ga4' : null;

// The page drawer's GA4 matching: a row is the page whose path its address has under the page identity, whatever its
// host; rows without a host match by their own path.
// Synced values as text: the partitions hold strings (and numbers), never objects.
const text = (v: unknown) =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
export const normPath = (p: unknown) =>
  text(p || '')
    .split('?')[0]
    .replace(/\/+$/, '') || '/';
export function rowPath(
  x: { host?: unknown; page?: unknown },
  identity?: PageIdentity | null,
) {
  if (!x.host) return normPath(x.page);
  try {
    return normPath(
      new URL(
        canonicalUrl(`https://${text(x.host)}${text(x.page || '')}`, identity),
      ).pathname,
    );
  } catch {
    return normPath(x.page);
  }
}
const dayOf = (v: unknown) =>
  v instanceof Date ? v.toISOString().slice(0, 10) : text(v).slice(0, 10);
const hashOf = (path: string) =>
  createHash('sha1').update(path).digest('hex').slice(0, 16);
const splitKey = (key: string) => {
  const i = key.indexOf('/');
  return [key.slice(0, i), key.slice(i)] as const;
};
const dayKeyOf = (
  projectId: string,
  source: string,
  resource: string,
  date: string,
) =>
  createHash('sha256')
    .update(JSON.stringify([projectId, source, resource, date]))
    .digest('hex');

/** A day's partition summed by page, under the address without the page identity. */
export function pageRows(source: PageDaySource, payload: unknown): Row[] {
  const sums = new Map<string, Row>();
  const keys = new Map<string, string>();
  for (const x of Array.isArray(payload) ? (payload as Values[]) : []) {
    if (source === 'gsc') {
      // Each address is keyed once: a page reached by many queries repeats it in every row.
      const page = text(x.page);
      let key = keys.get(page);
      if (key === undefined) keys.set(page, (key = pageKey(page)));
      if (!key) continue;
      let row = sums.get(key);
      if (!row) {
        const [host, path] = splitKey(key);
        sums.set(key, (row = { host, path, clicks: 0, impressions: 0 }));
      }
      row.clicks! += Number(x.clicks) || 0;
      row.impressions! += Number(x.impressions) || 0;
    } else {
      const host = x.host ? text(x.host) : '';
      // The address's path is what the page identity reads (rowPath), so the query and a trailing slash go.
      let path = normPath(x.page);
      if (host)
        try {
          path = normPath(
            new URL(`https://${host}${text(x.page || '')}`).pathname,
          );
        } catch {
          /* kept as stored: rowPath falls back to it too */
        }
      const key = `${host} ${path}`;
      let row = sums.get(key);
      if (!row) sums.set(key, (row = { host, path, views: 0 }));
      row.views! += Number(x.views) || 0;
    }
  }
  return [...sums.values()];
}

type Partition = {
  projectId: unknown;
  source: unknown;
  resource: unknown;
  date: unknown;
  grain: unknown;
  payload: unknown;
};

const payloadHashOf = (payload: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(payload ?? null))
    .digest('hex');

/** A synced day's mark, without its rows. */
function prepareMark(partition: Partition) {
  const source = sourceOfGrain(partition.grain);
  if (!source) return null;
  const projectId = String(partition.projectId),
    resource = String(partition.resource),
    date = dayOf(partition.date);
  return {
    projectId,
    source,
    resource,
    day: dayNumber(date),
    dayKey: dayKeyOf(projectId, source, resource, date),
    payloadHash: payloadHashOf(partition.payload),
  };
}

/** A synced day's page rows and mark, summed from its partition outside any transaction. */
function prepareDay(partition: Partition) {
  const source = sourceOfGrain(partition.grain);
  if (!source) return null;
  const projectId = String(partition.projectId),
    resource = String(partition.resource),
    date = dayOf(partition.date);
  const scope = { projectId, source, resource, day: dayNumber(date) };
  const rows = pageRows(source, partition.payload).map((r) => ({
    ...scope,
    host: r.host,
    path: r.path,
    pathHash: hashOf(r.path),
    clicks: r.clicks ?? null,
    impressions: r.impressions ?? null,
    views: r.views ?? null,
  }));
  const mark = {
    ...scope,
    dayKey: dayKeyOf(projectId, source, resource, date),
    payloadHash: payloadHashOf(partition.payload),
    pages: rows.length,
  };
  return { scope, rows, mark };
}

async function applyDay(
  db: LegacyDatabase,
  day: NonNullable<ReturnType<typeof prepareDay>>,
  transaction: LegacyTransaction | undefined,
) {
  const marks = db.getRepository('nrPageDayMarks');
  const held = await marks.findOne({
    filter: { dayKey: day.mark.dayKey },
    fields: ['payloadHash', 'pages'],
    transaction,
  });
  if (
    held &&
    Number(held.get('pages')) >= 0 &&
    held.get('payloadHash') === day.mark.payloadHash
  )
    return false;
  await db
    .getRepository('nrPageDays')
    .destroy({ filter: day.scope, transaction });
  await marks.destroy({ filter: { dayKey: day.mark.dayKey }, transaction });
  await db.insertMany('nrPageDays', day.rows, transaction);
  await db.insertMany('nrPageDayMarks', [day.mark], transaction);
  return true;
}

// A mark whose day is still to be summed from the partition content it names (`pages` is otherwise the day's row count).
const PENDING = -1;

/**
 * For the sync's transaction: marks a day whose partition the sync wrote with other content (or a day not held yet) as
 * pending that content, so its rows are summed again in the background after the sync (`fillPageDaysInBackground`) and
 * the drawer sums the day from its partition meanwhile. Writing the day's rows here would hold the sync's transaction,
 * and with it every request on SQLite, 0.2 to 0.7 s a day. The pending mark names the new content, so a fill that read
 * the partition before the sync wrote it does not write the old rows. A day read again unchanged keeps its rows.
 * Returns whether the day was marked pending.
 */
export async function releasePageDay(
  db: LegacyDatabase,
  partition: Partition,
  transaction?: LegacyTransaction,
) {
  const day = prepareMark(partition);
  if (!day) return false;
  const marks = db.getRepository('nrPageDayMarks');
  const held = await marks.findOne({
    filter: { dayKey: day.dayKey },
    fields: ['payloadHash', 'pages'],
    transaction,
  });
  if (held && held.get('payloadHash') === day.payloadHash) return false;
  await marks.destroy({ filter: { dayKey: day.dayKey }, transaction });
  await db.insertMany(
    'nrPageDayMarks',
    [{ ...day, pages: PENDING }],
    transaction,
  );
  return true;
}

/**
 * Writes one synced day's page rows and its mark, replacing what the day held, in the caller's transaction. A day held
 * from the same partition content is left as it is. Returns whether the day was written.
 */
export async function writePageDay(
  db: LegacyDatabase,
  partition: Partition,
  transaction?: LegacyTransaction,
) {
  const day = prepareDay(partition);
  return day ? applyDay(db, day, transaction) : false;
}

const giveWay = () => new Promise((resolve) => setImmediate(resolve));
type Range = { start?: string; end?: string };
const dayRange = ({ start, end }: Range) =>
  start || end
    ? {
        day: {
          ...(start ? { $gte: dayNumber(start) } : {}),
          ...(end ? { $lte: dayNumber(end) } : {}),
        },
      }
    : {};
// A range's dates, for the partitions' string dates; read a chunk of dates at a time.
const DATE_CHUNK = 400;
function datesOf({ start, end }: Range) {
  if (!start || !end) return null;
  const dates: string[] = [];
  for (let d = dayNumber(start); d <= dayNumber(end); d++)
    dates.push(dateOfDay(d));
  return dates;
}

/** The days of a source held in nrPageDays, within the range when one is given. */
async function markedDays(
  db: LegacyDatabase,
  projectId: string,
  source: PageDaySource,
  resource: string,
  range: Range = {},
) {
  const marks = await db.getRepository('nrPageDayMarks').find({
    filter: { projectId, source, resource, ...dayRange(range) },
    fields: ['day', 'pages'],
  });
  // A pending day is not held: its rows are from content the sync has replaced.
  return new Set(
    marks
      .filter((m) => Number(m.get('pages')) >= 0)
      .map((m) => dateOfDay(m.get('day'))),
  );
}

/** The synced days of a source (within the range when one is given) not yet held in nrPageDays. */
async function missingDays(
  db: LegacyDatabase,
  projectId: string,
  source: PageDaySource,
  resource: string,
  range: Range = {},
) {
  const partitions = db.getRepository('nrSyncPartitions');
  const filter = { projectId, source, grain: PAGE_GRAINS[source], resource };
  // Dates only: SQLite reads them without walking each row's payload, which is stored after them.
  const dates = datesOf(range);
  const stored: string[] = [];
  if (!dates)
    for (const r of await partitions.find({ filter, fields: ['date'] }))
      stored.push(dayOf(r.get('date')));
  else
    for (let i = 0; i < dates.length; i += DATE_CHUNK)
      for (const r of await partitions.find({
        filter: { ...filter, date: { $in: dates.slice(i, i + DATE_CHUNK) } },
        fields: ['date'],
      }))
        stored.push(dayOf(r.get('date')));
  const held = await markedDays(db, projectId, source, resource, range);
  return [...new Set(stored)].filter((d) => !held.has(d)).sort();
}

const FILL_DAYS = 8,
  FILL_ROWS = 4000;

/**
 * Sums the synced days of a source not yet held, a few days at a time, giving way between them. The partitions are read
 * and summed outside the transaction, which writes only the days whose partitions are still stored and that are
 * unmarked or pending the very content read: the sync marks a day pending its new content in its transaction, so a
 * partition read before the sync rewrote it is left for the next fill, and a project cleared meanwhile gets no rows.
 * Returns the days summed.
 */
export async function fillDays(
  db: LegacyDatabase,
  projectId: string,
  source: PageDaySource,
  resource: string,
  stopped = () => false,
) {
  const partitions = db.getRepository('nrSyncPartitions');
  const filter = { projectId, source, grain: PAGE_GRAINS[source], resource };
  const missing = await missingDays(db, projectId, source, resource);
  let filled = 0;
  for (let i = 0; i < missing.length && !stopped();) {
    // Days read together until a batch holds FILL_DAYS days or about FILL_ROWS rows.
    const batch: NonNullable<ReturnType<typeof prepareDay>>[] = [];
    let rows = 0;
    while (i < missing.length && batch.length < FILL_DAYS && rows < FILL_ROWS) {
      // A large site's day holds thousands of rows: a batch starts with one day, and goes on a day at a time when its
      // days are large.
      const step =
        !batch.length || rows / batch.length > FILL_ROWS / FILL_DAYS ? 1 : 4;
      const dates = missing.slice(
        i,
        i + Math.min(step, FILL_DAYS - batch.length),
      );
      i += dates.length;
      for (const r of await partitions.find({
        filter: { ...filter, date: { $in: dates } },
        fields: ['date', 'payload'],
      })) {
        const day = prepareDay({
          ...filter,
          date: r.get('date'),
          payload: r.get('payload'),
        });
        if (day) {
          batch.push(day);
          rows += day.rows.length;
        }
      }
      await giveWay();
    }
    if (!batch.length) continue;
    filled += await db.sequelize.transaction(async (transaction) => {
      const dates = batch.map((d) => dateOfDay(d.scope.day));
      const stored = new Set(
        (
          await partitions.find({
            filter: { ...filter, date: { $in: dates } },
            fields: ['date'],
            transaction,
          })
        ).map((r) => dayOf(r.get('date'))),
      );
      const marks = new Map(
        (
          await db.getRepository('nrPageDayMarks').find({
            filter: { dayKey: { $in: batch.map((d) => d.mark.dayKey) } },
            fields: ['dayKey', 'payloadHash', 'pages'],
            transaction,
          })
        ).map((m) => [String(m.get('dayKey')), m]),
      );
      // A day not marked, or pending the very content read here; a day pending other content was read before the sync
      // rewrote it and is left for the next fill.
      const write = batch.filter((d) => {
        if (!stored.has(dateOfDay(d.scope.day))) return false;
        const mark = marks.get(d.mark.dayKey);
        return (
          !mark ||
          (Number(mark.get('pages')) < 0 &&
            mark.get('payloadHash') === d.mark.payloadHash)
        );
      });
      if (!write.length) return 0;
      // Rows and the pending mark a released day still has are replaced.
      await db.getRepository('nrPageDays').destroy({
        filter: {
          projectId,
          source,
          resource,
          day: { $in: write.map((d) => d.scope.day) },
        },
        transaction,
      });
      await db.getRepository('nrPageDayMarks').destroy({
        filter: { dayKey: { $in: write.map((d) => d.mark.dayKey) } },
        transaction,
      });
      await db.insertMany(
        'nrPageDays',
        write.flatMap((d) => d.rows),
        transaction,
      );
      await db.insertMany(
        'nrPageDayMarks',
        write.map((d) => d.mark),
        transaction,
      );
      return write.length;
    });
    await giveWay();
  }
  return filled;
}

// One background fill a project at a time, for the drawers that find days missing.
const filling = new WeakMap<LegacyDatabase, Map<string, Promise<unknown>>>();
export function fillPageDaysInBackground(
  db: LegacyDatabase,
  projectId: string,
  sources: [PageDaySource, string][],
  log?: (days: number, ms: number) => void,
) {
  let running = filling.get(db);
  if (!running)
    filling.set(db, (running = new Map<string, Promise<unknown>>()));
  if (running.has(projectId)) return;
  const started = Date.now();
  const fill = (async () => {
    // Started after the drawer that asked has answered.
    await giveWay();
    let days = 0;
    for (const [source, resource] of sources)
      days += await fillDays(db, projectId, source, resource);
    if (days) log?.(days, Date.now() - started);
  })()
    .catch(() => undefined)
    .finally(() => running.delete(projectId));
  running.set(projectId, fill);
}

/** Resolves once the project's background fill, if one is running, has finished. */
export async function pageDaysFilled(db: LegacyDatabase, projectId: string) {
  await filling.get(db)?.get(projectId);
}

/**
 * The paths a page's rows may be held under: its own, those of the addresses whose canonical names a page with its path,
 * and its path behind every prefix a host drops. Rows under them are matched exactly by the page identity when read.
 */
function candidatePaths(path: string, identity?: PageIdentity | null) {
  const paths = new Set([path]);
  for (const [key, url] of Object.entries(identity?.canonical || {})) {
    const named = pageKey(url);
    if (named && splitKey(named)[1] === path) paths.add(splitKey(key)[1]);
  }
  for (const prefixes of Object.values(identity?.dropped || {}))
    for (const prefix of prefixes)
      paths.add(path === '/' ? `/${prefix}` : `/${prefix}${path}`);
  return [...paths];
}

const PAGE_READ_HASHES = 200;
const MISSING_READ_DAYS = 4;

/**
 * One page's days in a range: its rows (Search Console by page key, GA4 by path, both under the page identity) and the
 * days each source has. Days of the range synced but not yet held are summed from their partitions for this page, and
 * the project's days are filled in the background.
 */
export async function readPageDays(
  db: LegacyDatabase,
  projectId: string,
  key: string,
  identity: PageIdentity | null | undefined,
  range: { start: string; end: string },
  sources: Partial<Record<PageDaySource, string | null>>,
  log?: (days: number, ms: number) => void,
) {
  const wanted = (
    Object.entries(sources) as [PageDaySource, string | null][]
  ).filter(([, resource]) => resource) as [PageDaySource, string][];
  const days: Partial<Record<PageDaySource, Set<string>>> = {};
  const missing: [PageDaySource, string, string[]][] = [];
  for (const [source, resource] of wanted) {
    days[source] = await markedDays(db, projectId, source, resource, range);
    const absent = await missingDays(db, projectId, source, resource, range);
    if (absent.length) missing.push([source, resource, absent]);
  }
  const path = splitKey(key)[1];
  const candidates = new Set(candidatePaths(path, identity));
  const hashes = [...new Set([...candidates].map(hashOf))];
  const rows: Held[] = [];
  for (let i = 0; i < hashes.length; i += PAGE_READ_HASHES)
    for (const r of await db.getRepository('nrPageDays').find({
      filter: {
        projectId,
        pathHash: { $in: hashes.slice(i, i + PAGE_READ_HASHES) },
        ...dayRange(range),
      },
      fields: [
        'source',
        'resource',
        'day',
        'host',
        'path',
        'clicks',
        'impressions',
        'views',
      ],
    })) {
      // Rows of a day no longer marked (its partition changed and is still to be summed again) are left out: the day
      // is summed from its partition below.
      const source = String(r.get('source')) as PageDaySource;
      const date = dateOfDay(r.get('day'));
      if (!days[source]?.has(date)) continue;
      rows.push({
        source,
        resource: String(r.get('resource')),
        date,
        host: String(r.get('host') ?? ''),
        path: String(r.get('path')),
        clicks: Number(r.get('clicks')) || 0,
        impressions: Number(r.get('impressions')) || 0,
        views: Number(r.get('views')) || 0,
      });
    }
  // Days not yet held are summed for this page alone from their partitions, a few at a time, without writing them.
  const partitions = db.getRepository('nrSyncPartitions');
  for (const [source, resource, dates] of missing) {
    for (let i = 0; i < dates.length; i += MISSING_READ_DAYS) {
      if (i) await giveWay();
      for (const r of await partitions.find({
        filter: {
          projectId,
          source,
          grain: PAGE_GRAINS[source],
          resource,
          date: { $in: dates.slice(i, i + MISSING_READ_DAYS) },
        },
        fields: ['date', 'payload'],
      })) {
        const date = dayOf(r.get('date'));
        days[source]!.add(date);
        for (const row of pageRows(source, r.get('payload')))
          if (candidates.has(row.path))
            rows.push({
              ...row,
              source,
              resource,
              date,
              clicks: row.clicks ?? 0,
              impressions: row.impressions ?? 0,
              views: row.views ?? 0,
            });
      }
    }
  }
  // The project's days are filled in the background once this drawer has read what it needs.
  if (missing.length) fillPageDaysInBackground(db, projectId, wanted, log);
  const target = normPath(path);
  const search = rows.filter(
    (r) =>
      r.source === 'gsc' &&
      r.resource === sources.gsc &&
      pageKey(`https://${r.host}${r.path}`, identity) === key,
  );
  const web = rows.filter(
    (r) =>
      r.source === 'ga4' &&
      r.resource === sources.ga4 &&
      rowPath({ host: r.host, page: r.path }, identity) === target,
  );
  return { days, search, web };
}
