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
// The sync only marks a day whose content changed, or a day not held yet, as pending that content (`releasePageDay`, in
// its transaction): writing a day's 2,000 to 4,000 rows takes 0.2 to 0.7 s on SQLite, which would hold every request.
// The rows are written after the sync by `fillPageDaysInBackground`, which also sums the days synced before this table
// or brought in another way (the classic import, an edited demo); until a day is written, the drawer sums the page's
// missing days from their partitions itself, as it did before this table.
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

/**
 * The path a GA4 row is kept under: its stored path without the query or a trailing slash, still undecoded, so Pages'
 * figures read it as they read the partition (`pathOf` in data-views.ts) and the drawer as it reads the address
 * (`rowPath`). A path that does not start with `/` is kept whole but for the query; Pages leaves it out.
 */
export function storedPath(page: unknown) {
  const p = text(page || '').split('?')[0];
  return p.startsWith('/') ? p.replace(/\/+$/, '') || '/' : p;
}
/** The path a row's address is matched by in the drawer: the address's path for a GA4 row with a host. */
function matchPath(source: PageDaySource, host: string, path: string) {
  if (source === 'gsc' || !host) return normPath(path);
  try {
    return normPath(new URL(`https://${host}${path}`).pathname);
  } catch {
    // Kept as stored: rowPath falls back to it too.
    return normPath(path);
  }
}

/**
 * A day's partition summed by address, without the page identity: Search Console rows under their page key, GA4 rows
 * under their host as stored and `storedPath`.
 */
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
      const path = storedPath(x.page);
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

// What a day's rows are summed from, as a hash of the rows themselves: the partition's JSON as stored is not compared,
// as MySQL reorders an object's keys, so the same content read back would not match what the sync wrote.
const rowsHashOf = (rows: Row[]) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        rows
          .map((r) => ({
            at: `${r.host} ${r.path}`,
            figures: [r.clicks ?? null, r.impressions ?? null, r.views ?? null],
          }))
          .sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0))
          .map((r) => [r.at, ...r.figures]),
      ),
    )
    .digest('hex');

/** Which day of which source a partition is, or null for a partition the drawer does not read. */
function dayOfPartition(partition: Partition) {
  const source = sourceOfGrain(partition.grain);
  if (!source) return null;
  const projectId = String(partition.projectId),
    resource = String(partition.resource),
    date = dayOf(partition.date);
  return {
    scope: { projectId, source, resource, day: dayNumber(date) },
    dayKey: dayKeyOf(projectId, source, resource, date),
  };
}

/** A synced day's page rows and mark, summed from its partition outside any transaction. */
function prepareDay(partition: Partition) {
  const at = dayOfPartition(partition);
  if (!at) return null;
  const rows = pageRows(at.scope.source, partition.payload);
  const mark = {
    ...at.scope,
    dayKey: at.dayKey,
    payloadHash: rowsHashOf(rows),
    pages: rows.length,
  };
  return { scope: at.scope, rows, mark };
}

const scopeKeyOf = (projectId: string, source: string, resource: string) =>
  createHash('sha256')
    .update(JSON.stringify([projectId, source, resource]))
    .digest('hex');
const addressKeyOf = (scopeId: number, host: string, path: string) =>
  createHash('sha256')
    .update(JSON.stringify([scopeId, host, path]))
    .digest('hex');

/** The id of a project's source in nrPageScopes, made when `create` is set; null when it has none. */
async function scopeIdOf(
  db: LegacyDatabase,
  projectId: string,
  source: string,
  resource: string,
  {
    transaction,
    create = false,
  }: { transaction?: LegacyTransaction; create?: boolean } = {},
): Promise<number | null> {
  const scopeKey = scopeKeyOf(projectId, source, resource);
  const find = async (): Promise<unknown> =>
    (
      await db.getRepository('nrPageScopes').findOne({
        filter: { scopeKey },
        fields: ['id'],
        transaction,
      })
    )?.get('id') as unknown;
  let id = await find();
  if (id == null && create) {
    await db.insertMany(
      'nrPageScopes',
      [{ scopeKey, projectId, source, resource }],
      transaction,
    );
    id = await find();
  }
  return id == null ? null : Number(id);
}

/** The ids of a day's addresses in nrPageAddresses, made for the addresses it does not hold yet. */
async function addressIdsOf(
  db: LegacyDatabase,
  projectId: string,
  source: PageDaySource,
  scopeId: number,
  rows: Row[],
  transaction: LegacyTransaction,
) {
  const repo = db.getRepository('nrPageAddresses');
  const wanted = new Map<string, Row>();
  for (const r of rows) wanted.set(addressKeyOf(scopeId, r.host, r.path), r);
  const ids = new Map<string, number>();
  const read = async (keys: string[]) => {
    for (let i = 0; i < keys.length; i += PAGE_READ_HASHES)
      for (const a of await repo.find({
        filter: { addressKey: { $in: keys.slice(i, i + PAGE_READ_HASHES) } },
        fields: ['id', 'addressKey'],
        transaction,
      }))
        ids.set(String(a.get('addressKey')), Number(a.get('id')));
  };
  await read([...wanted.keys()]);
  const added = [...wanted.keys()].filter((k) => !ids.has(k));
  if (added.length) {
    await db.insertMany(
      'nrPageAddresses',
      added.map((addressKey) => {
        const r = wanted.get(addressKey)!;
        return {
          addressKey,
          projectId,
          scopeId,
          host: r.host,
          path: r.path,
          pathHash: hashOf(matchPath(source, r.host, r.path)),
        };
      }),
      transaction,
    );
    await read(added);
  }
  return (r: Row) => ids.get(addressKeyOf(scopeId, r.host, r.path))!;
}

// A mark whose day is still to be summed from the partition content it names (`pages` is otherwise the day's row count).
const PENDING = -1;
export type PageDayMark = {
  projectId: string;
  source: PageDaySource;
  resource: string;
  day: number;
  dayKey: string;
  payloadHash: string;
};

/**
 * The marks of the partitions the drawer reads, summed before a writer's transaction so it does not hold it: the sync
 * builds them before its write transaction, and the classic import with the rows it writes.
 */
export function pageDayMarks(partitions: Partition[]): PageDayMark[] {
  const marks: PageDayMark[] = [];
  for (const partition of partitions) {
    const at = dayOfPartition(partition);
    if (at)
      marks.push({
        ...at.scope,
        dayKey: at.dayKey,
        payloadHash: rowsHashOf(pageRows(at.scope.source, partition.payload)),
      });
  }
  return marks;
}

/**
 * For a writer's transaction (the sync, the classic import, an edited demo): marks the days whose partitions it wrote
 * with other content (or days not held yet) as pending that content, so their rows are summed again in the background
 * (`fillPageDaysInBackground`) and the drawer sums them from their partitions meanwhile. Writing the rows there would
 * hold the transaction, and with it every request on SQLite, 0.2 to 0.7 s a day. The pending mark names the new content,
 * so a fill that read a partition before it was rewritten does not write the old rows. A day written again unchanged
 * keeps its rows. Returns the days marked pending.
 */
export async function releasePageDays(
  db: LegacyDatabase,
  marks: PageDayMark[],
  transaction?: LegacyTransaction,
) {
  if (!marks.length) return 0;
  const repo = db.getRepository('nrPageDayMarks');
  const held = new Map<string, unknown>();
  for (let i = 0; i < marks.length; i += PAGE_READ_HASHES)
    for (const m of await repo.find({
      filter: {
        dayKey: {
          $in: marks.slice(i, i + PAGE_READ_HASHES).map((m) => m.dayKey),
        },
      },
      fields: ['dayKey', 'payloadHash'],
      transaction,
    }))
      held.set(String(m.get('dayKey')), m.get('payloadHash'));
  const changed = [...new Map(marks.map((m) => [m.dayKey, m])).values()].filter(
    (m) => held.get(m.dayKey) !== m.payloadHash,
  );
  if (!changed.length) return 0;
  for (let i = 0; i < changed.length; i += PAGE_READ_HASHES)
    await repo.destroy({
      filter: {
        dayKey: {
          $in: changed.slice(i, i + PAGE_READ_HASHES).map((m) => m.dayKey),
        },
      },
      transaction,
    });
  await db.insertMany(
    'nrPageDayMarks',
    changed.map((m) => ({ ...m, pages: PENDING })),
    transaction,
  );
  return changed.length;
}

/** `releasePageDays` for one partition. Returns whether its day was marked pending. */
export async function releasePageDay(
  db: LegacyDatabase,
  partition: Partition,
  transaction?: LegacyTransaction,
) {
  return (
    (await releasePageDays(db, pageDayMarks([partition]), transaction)) > 0
  );
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

/** The synced days of a source, within the range when one is given. */
async function storedDays(
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
  return [...new Set(stored)].sort();
}

/** The synced days of a source (within the range when one is given) not yet held in nrPageDays. */
async function missingDays(
  db: LegacyDatabase,
  projectId: string,
  source: PageDaySource,
  resource: string,
  range: Range = {},
  held?: Set<string>,
) {
  const stored = await storedDays(db, projectId, source, resource, range);
  const marked =
    held ?? (await markedDays(db, projectId, source, resource, range));
  return stored.filter((d) => !marked.has(d));
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
  range: Range = {},
) {
  const partitions = db.getRepository('nrSyncPartitions');
  const filter = { projectId, source, grain: PAGE_GRAINS[source], resource };
  const missing = await missingDays(db, projectId, source, resource, range);
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
      const scopeId = (await scopeIdOf(db, projectId, source, resource, {
        transaction,
        create: true,
      }))!;
      // Rows and the pending mark a released day still has are replaced.
      await db.getRepository('nrPageDays').destroy({
        filter: { scopeId, day: { $in: write.map((d) => d.scope.day) } },
        transaction,
      });
      await db.getRepository('nrPageDayMarks').destroy({
        filter: { dayKey: { $in: write.map((d) => d.mark.dayKey) } },
        transaction,
      });
      const idOf = await addressIdsOf(
        db,
        projectId,
        source,
        scopeId,
        write.flatMap((d) => d.rows),
        transaction,
      );
      await db.insertMany(
        'nrPageDays',
        write.flatMap((d) =>
          d.rows.map((r) => ({
            scopeId,
            day: d.scope.day,
            pageId: idOf(r),
            clicks: r.clicks ?? null,
            impressions: r.impressions ?? null,
            views: r.views ?? null,
          })),
        ),
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

// One background fill a project at a time. Sources asked for while one runs are filled once it ends (over the union of
// the ranges asked for), so the days a second sync job marks pending are not left to the drawers.
export type PageDayFill = {
  source: PageDaySource;
  resource: string;
  range?: Range;
};
type FillLogger = {
  info?(message: string, meta?: Values): void;
  warn?(message: string, meta?: Values): void;
};
type Fill = { done: Promise<unknown>; queued: Map<PageDaySource, PageDayFill> };
const filling = new WeakMap<LegacyDatabase, Map<string, Fill>>();
function queue(queued: Map<PageDaySource, PageDayFill>, fills: PageDayFill[]) {
  for (const f of fills) {
    const held = queued.get(f.source);
    // Another resource replaces the one queued; ranges of the same one join, and no range is the whole history.
    const range =
      held && held.resource === f.resource
        ? held.range &&
          f.range &&
          held.range.start &&
          held.range.end &&
          f.range.start &&
          f.range.end
          ? {
              start:
                held.range.start < f.range.start
                  ? held.range.start
                  : f.range.start,
              end: held.range.end > f.range.end ? held.range.end : f.range.end,
            }
          : undefined
        : f.range;
    queued.set(f.source, { ...f, range });
  }
}
export function fillPageDaysInBackground(
  db: LegacyDatabase,
  projectId: string,
  fills: PageDayFill[],
  {
    logger,
    stopped = () => false,
  }: { logger?: FillLogger; stopped?: () => boolean } = {},
) {
  let running = filling.get(db);
  if (!running) filling.set(db, (running = new Map<string, Fill>()));
  const current = running.get(projectId);
  if (current) {
    queue(current.queued, fills);
    return;
  }
  const fill: Fill = { done: Promise.resolve(), queued: new Map() };
  queue(fill.queued, fills);
  const started = Date.now();
  fill.done = (async () => {
    // Started after the drawer or sync that asked has answered.
    await giveWay();
    let days = 0;
    for (;;) {
      // Checked and let go in one step, so a request queued after the last check starts a fill of its own.
      if (!fill.queued.size || stopped()) {
        if (running.get(projectId) === fill) running.delete(projectId);
        break;
      }
      const next = [...fill.queued.values()];
      fill.queued.clear();
      for (const f of next)
        try {
          days += await fillDays(
            db,
            projectId,
            f.source,
            f.resource,
            stopped,
            f.range,
          );
        } catch (e) {
          // The days stay pending: the drawers sum them from their partitions, and the next sync or drawer fills them.
          logger?.warn?.('NocoReach page days fill failed', {
            projectId,
            source: f.source,
            message: e instanceof Error ? e.message : String(e),
          });
        }
    }
    if (days)
      logger?.info?.('NocoReach page days filled', {
        projectId,
        days,
        ms: Date.now() - started,
      });
  })().finally(() => {
    if (running.get(projectId) === fill) running.delete(projectId);
  });
  running.set(projectId, fill);
}

/** Resolves once the project's background fill, if one is running, has finished. */
export async function pageDaysFilled(db: LegacyDatabase, projectId: string) {
  await filling.get(db)?.get(projectId)?.done;
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
  options: { logger?: FillLogger; stopped?: () => boolean } = {},
) {
  const wanted = (
    Object.entries(sources) as [PageDaySource, string | null][]
  ).filter(([, resource]) => resource) as [PageDaySource, string][];
  const days: Partial<Record<PageDaySource, Set<string>>> = {};
  const missing: [PageDaySource, string, string[]][] = [];
  for (const [source, resource] of wanted) {
    days[source] = await markedDays(db, projectId, source, resource, range);
    const absent = await missingDays(
      db,
      projectId,
      source,
      resource,
      range,
      days[source],
    );
    if (absent.length) missing.push([source, resource, absent]);
  }
  const path = splitKey(key)[1];
  const candidates = new Set(candidatePaths(path, identity));
  const hashes = [...new Set([...candidates].map(hashOf))];
  const rows: Held[] = [];
  // The page's addresses of each source, then their days.
  const addresses = new Map<
    number,
    { source: PageDaySource; resource: string; host: string; path: string }
  >();
  for (const [source, resource] of wanted) {
    const scopeId = await scopeIdOf(db, projectId, source, resource);
    if (scopeId == null) continue;
    for (let i = 0; i < hashes.length; i += PAGE_READ_HASHES)
      for (const a of await db.getRepository('nrPageAddresses').find({
        filter: {
          scopeId,
          pathHash: { $in: hashes.slice(i, i + PAGE_READ_HASHES) },
        },
        fields: ['id', 'host', 'path'],
      }))
        addresses.set(Number(a.get('id')), {
          source,
          resource,
          host: String(a.get('host') ?? ''),
          path: String(a.get('path')),
        });
  }
  const ids = [...addresses.keys()];
  for (let i = 0; i < ids.length; i += PAGE_READ_HASHES)
    for (const r of await db.getRepository('nrPageDays').find({
      filter: {
        pageId: { $in: ids.slice(i, i + PAGE_READ_HASHES) },
        ...dayRange(range),
      },
      fields: ['pageId', 'day', 'clicks', 'impressions', 'views'],
    })) {
      const address = addresses.get(Number(r.get('pageId')))!;
      // Rows of a day no longer marked (its partition changed and is still to be summed again) are left out: the day
      // is summed from its partition below.
      const date = dateOfDay(r.get('day'));
      if (!days[address.source]?.has(date)) continue;
      rows.push({
        ...address,
        date,
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
          if (candidates.has(matchPath(source, row.host, row.path)))
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
  if (missing.length)
    fillPageDaysInBackground(
      db,
      projectId,
      wanted.map(([source, resource]) => ({ source, resource })),
      options,
    );
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

// Days summed in one GROUP BY: SQLite answers synchronously, so a long range is summed a month at a time, giving way
// to other requests between them.
const SUM_DAYS = 31;
export type PagePeriodRow = Row & { period: number };

/**
 * Every address's figures of a source in each period (Pages' list): the held days summed by the database from
 * nrPageDays, the synced days not held yet summed from their partitions, which also starts the project's fill. Rows are
 * under the address as stored (`pageRows`), one per period and address; `days` counts each period's synced days.
 */
export async function sumPageDays(
  db: LegacyDatabase,
  projectId: string,
  source: PageDaySource,
  resource: string,
  periods: { start: string; end: string }[],
  options: { logger?: FillLogger; stopped?: () => boolean } = {},
) {
  const range = {
    start: periods.map((p) => p.start).sort()[0],
    end: periods
      .map((p) => p.end)
      .sort()
      .at(-1),
  };
  const [stored, held] = await Promise.all([
    storedDays(db, projectId, source, resource, range),
    markedDays(db, projectId, source, resource, range),
  ]);
  const periodOf = (date: string) =>
    periods.findIndex((p) => date >= p.start && date <= p.end);
  const days = periods.map(() => 0);
  const heldDays: [number, number][] = [];
  const missing: string[] = [];
  for (const date of stored) {
    const p = periodOf(date);
    if (p < 0) continue;
    days[p]++;
    if (held.has(date)) heldDays.push([p, dayNumber(date)]);
    else missing.push(date);
  }
  const sums = new Map<string, PagePeriodRow>();
  const add = (p: number, host: string, path: string, r: Partial<Row>) => {
    const k = `${p} ${host} ${path}`;
    let o = sums.get(k);
    if (!o) sums.set(k, (o = { period: p, host, path }));
    for (const f of ['clicks', 'impressions', 'views'] as const)
      if (r[f] != null) o[f] = (o[f] ?? 0) + Number(r[f]);
  };
  const scopeId = heldDays.length
    ? await scopeIdOf(db, projectId, source, resource)
    : null;
  if (scopeId != null) {
    const repo = db.getRepository('nrPageDays');
    const byPage = new Map<number, Partial<Row>[]>();
    for (let p = 0; p < periods.length; p++) {
      const own = heldDays.filter(([q]) => q === p).map(([, d]) => d);
      for (let i = 0; i < own.length; i += SUM_DAYS) {
        if (i) await giveWay();
        for (const r of await repo.groupBy!({
          by: ['pageId'],
          sum: ['clicks', 'impressions', 'views'],
          filter: { scopeId, day: { $in: own.slice(i, i + SUM_DAYS) } },
        })) {
          const id = Number(r.pageId);
          let list = byPage.get(id);
          if (!list) byPage.set(id, (list = []));
          list.push({ ...(r as Partial<Row>), period: p } as Partial<Row>);
        }
      }
      await giveWay();
    }
    if (byPage.size)
      for (const a of await db.getRepository('nrPageAddresses').find({
        filter: { scopeId },
        fields: ['id', 'host', 'path'],
      })) {
        const list = byPage.get(Number(a.get('id')));
        if (list)
          for (const r of list)
            add(
              (r as PagePeriodRow).period,
              String(a.get('host') ?? ''),
              String(a.get('path')),
              r,
            );
      }
  }
  // Days not yet held are summed from their partitions, a few at a time, and the project's days filled after.
  const partitions = db.getRepository('nrSyncPartitions');
  for (let i = 0; i < missing.length; i += MISSING_READ_DAYS) {
    if (i) await giveWay();
    for (const r of await partitions.find({
      filter: {
        projectId,
        source,
        grain: PAGE_GRAINS[source],
        resource,
        date: { $in: missing.slice(i, i + MISSING_READ_DAYS) },
      },
      fields: ['date', 'payload'],
    })) {
      const p = periodOf(dayOf(r.get('date')));
      for (const row of pageRows(source, r.get('payload')))
        add(p, row.host, row.path, row);
    }
  }
  if (missing.length)
    fillPageDaysInBackground(db, projectId, [{ source, resource }], options);
  return { days, rows: [...sums.values()] };
}

/** Deletes the projects' page days, addresses, sources and marks (a demo project cleared). */
export async function clearPageDays(
  db: LegacyDatabase,
  projectIds: string[],
  transaction?: LegacyTransaction,
) {
  const scopes = (
    await db.getRepository('nrPageScopes').find({
      filter: { projectId: { $in: projectIds } },
      fields: ['id'],
      transaction,
    })
  ).map((s) => Number(s.get('id')));
  if (scopes.length)
    await db.getRepository('nrPageDays').destroy({
      filter: { scopeId: { $in: scopes } },
      transaction,
    });
  for (const name of ['nrPageAddresses', 'nrPageScopes', 'nrPageDayMarks'])
    await db.getRepository(name).destroy({
      filter: { projectId: { $in: projectIds } },
      transaction,
    });
}
