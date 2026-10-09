// The classic NocoBase database surface the ported NocoReach services call — `db.getRepository(name)` with
// find/findOne/count/create/update/destroy, records with `.get()` and `.toJSON()`, `db.sequelize.transaction()` and the
// `pg_advisory_xact_lock(hashtext(key))` statement every service takes before a read-modify-write — rebuilt on the
// NocoBase 3 Repository. The classic code stays as it was (docs/PORT-PLAN.md); this layer is the only place that knows
// NocoBase 3.
//
// Locks: Postgres advisory locks become in-process locks by key, held until the transaction ends. NocoReach runs as
// one process (Studio's host backend, a single standalone server), which is what makes that equivalent.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseManager } from '@nocobase/db';
import type { IdGeneratorService } from '@nocobase/snowflake';
import { toFilter, toSort } from './filters.js';

type Values = Record<string, unknown>;
type Hook = (model: LegacyRecord, options: { transaction?: LegacyTransaction }) => unknown;

/** What a classic transaction object was to the ported code: something passed along in `{ transaction }`. */
export interface LegacyTransaction {
  readonly connection: { repository(name: string): any; afterCommit?(fn: () => unknown): void };
  readonly held: (() => void)[];
  afterCommit(fn: () => unknown): void;
}

/** A classic record: the row's fields, plus `get(key)`, `set(key, value)` and `toJSON()`. */
export type LegacyRecord = Values & {
  get(key?: string): any;
  set(key: string, value: unknown): void;
  toJSON(): Values;
};

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v);

export function legacyRecord(row: Values): LegacyRecord {
  const data: Values = {};
  for (const [k, v] of Object.entries(row)) data[k] = iso(v);
  const record = { ...data } as LegacyRecord;
  Object.defineProperties(record, {
    get: { value: (key?: string) => (key === undefined ? { ...record } : record[key]), enumerable: false },
    set: {
      value: (key: string, value: unknown) => {
        record[key] = value;
      },
      enumerable: false,
    },
    toJSON: { value: () => ({ ...record }), enumerable: false },
  });
  return record;
}

/** In-process locks by key, re-entrant within one async flow. */
class KeyedLocks {
  private tails = new Map<string, Promise<void>>();
  private owned = new AsyncLocalStorage<Set<string>>();
  isHeld(key: string) {
    return this.tails.has(key);
  }
  async acquire(key: string): Promise<() => void> {
    const mine = this.owned.getStore();
    if (mine?.has(key)) return () => {};
    const previous = this.tails.get(key) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((r) => (release = r));
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    await previous;
    mine?.add(key);
    return () => {
      mine?.delete(key);
      if (this.tails.get(key) === tail) this.tails.delete(key);
      release();
    };
  }
  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.owned.run(new Set(this.owned.getStore() || []), fn);
  }
}

// Tables whose records the layer gives a generated id and keeps createdAt/updatedAt on.
const OWN = new Set([
  'nrSnapshots',
  'nrTasks',
  'nrGoogleLinks',
  'nrSyncJobs',
  'nrSyncPartitions',
  'nrKeywordRuns',
  'nrKeywordCandidates',
  'nrVariables',
]);

export interface LegacyRepository {
  find(options?: Values): Promise<LegacyRecord[]>;
  findOne(options?: Values): Promise<LegacyRecord | null>;
  count(options?: Values): Promise<number>;
  create(options: Values): Promise<LegacyRecord>;
  update(options: Values): Promise<LegacyRecord[]>;
  destroy(options: Values): Promise<number>;
}

export class LegacyDatabase {
  private locks = new KeyedLocks();
  private hooks = new Map<string, Hook[]>();
  private custom = new Map<string, LegacyRepository>();
  private current = new AsyncLocalStorage<LegacyTransaction>();
  readonly sequelize: {
    transaction<T>(fn: (t: LegacyTransaction) => Promise<T>): Promise<T>;
    query(sql: string, options?: Values): Promise<unknown>;
  };

  constructor(
    private readonly db: DatabaseManager,
    private readonly ids: IdGeneratorService,
  ) {
    this.sequelize = {
      transaction: (fn) => this.transaction(fn),
      query: (sql, options) => this.query(sql, options),
    };
  }

  /** Classic `db.on('nrTasks.beforeCreate', fn)`. */
  on(event: string, fn: Hook) {
    this.hooks.set(event, [...(this.hooks.get(event) || []), fn]);
  }

  /** A repository the bridge answers itself (users, notification channels…), under a classic name. */
  define(name: string, repository: LegacyRepository) {
    this.custom.set(name, repository);
  }

  getCollection(name: string) {
    return OWN.has(name) || this.custom.has(name) ? { name } : undefined;
  }

  getRepository(name: string): LegacyRepository {
    const custom = this.custom.get(name);
    if (custom) return custom;
    if (!OWN.has(name)) throw new Error(`NocoReach has no table ${name} on NocoBase 3`);
    return this.repository(name);
  }

  private async transaction<T>(fn: (t: LegacyTransaction) => Promise<T>): Promise<T> {
    // A transaction opened inside another one joins it, as one Postgres connection would have serialized them.
    const outer = this.current.getStore();
    if (outer) return fn(outer);
    const held: (() => void)[] = [];
    const after: (() => unknown)[] = [];
    try {
      return await this.locks.run(() =>
        this.db.transaction(async (connection: any) => {
          const t: LegacyTransaction = {
            connection,
            held,
            afterCommit: (cb) => {
              after.push(cb);
            },
          };
          return this.current.run(t, () => fn(t));
        }),
      ).then(async (result) => {
        for (const cb of after) await Promise.resolve(cb()).catch(() => undefined);
        return result;
      });
    } finally {
      for (const release of held.splice(0)) release();
    }
  }

  // The only raw SQL the ported code runs: taking an advisory lock by key, and trying to.
  private async query(sql: string, options: Values = {}): Promise<unknown> {
    const t = (options.transaction as LegacyTransaction) || this.current.getStore();
    const named = /hashtext\(:key\)/.test(sql)
      ? String((options.replacements as Values)?.key)
      : sql.match(/hashtext\('([^']+)'\)/)?.[1];
    if (!named) throw new Error(`Unsupported SQL on NocoBase 3: ${sql}`);
    const key = `lock:${named}`;
    if (/pg_try_advisory_xact_lock/.test(sql)) {
      if (this.locks.isHeld(key)) return [[{ locked: false }]];
      const release = await this.locks.acquire(key);
      if (t) t.held.push(release);
      else release();
      return [[{ locked: true }]];
    }
    if (/pg_advisory_xact_lock/.test(sql)) {
      const release = await this.locks.acquire(key);
      if (t) t.held.push(release);
      else release();
      return [[{}]];
    }
    throw new Error(`Unsupported SQL on NocoBase 3: ${sql}`);
  }

  private target(name: string, options: Values) {
    const t = (options.transaction as LegacyTransaction) || this.current.getStore();
    return t ? t.connection.repository(name) : this.db.repository(name);
  }

  private repository(name: string): LegacyRepository {
    const target = (options: Values) => this.target(name, options);
    const read = (options: Values) => {
      const filter = toFilter(options.filter as Values, options.filterByTk);
      const sort = toSort(options.sort);
      const fields = options.fields as string[] | undefined;
      return {
        ...(filter ? { filter } : {}),
        ...(sort ? { sort } : {}),
        ...(fields?.length ? { select: (select: any) => select.fields(...fields) } : {}),
        ...(options.limit != null ? { limit: Number(options.limit) } : {}),
        ...(options.offset != null ? { offset: Number(options.offset) } : {}),
      };
    };
    const find = async (options: Values = {}) => {
      const rows = await target(options).findMany(read(options));
      return (rows as Values[]).map(legacyRecord);
    };
    return {
      find,
      findOne: async (options: Values = {}) => (await find({ ...options, limit: 1 }))[0] || null,
      count: async (options: Values = {}) => {
        const filter = toFilter(options.filter as Values, options.filterByTk);
        return target(options).count(filter ? { filter } : {});
      },
      create: async (options: Values) => {
        const now = new Date();
        const values: Values = { ...(options.values as Values) };
        if (values.id == null) values.id = this.ids.generate();
        values.createdAt ??= now;
        values.updatedAt ??= now;
        const model = legacyRecord(values);
        for (const hook of this.hooks.get(`${name}.beforeCreate`) || [])
          await hook(model, { transaction: options.transaction as LegacyTransaction });
        const plain: Values = { ...model.toJSON() };
        for (const k of ['createdAt', 'updatedAt']) if (typeof plain[k] === 'string') plain[k] = new Date(plain[k] as string);
        const result = await target(options).createOne({ values: plain });
        return legacyRecord(result.record as Values);
      },
      update: async (options: Values) => {
        const filter = toFilter(options.filter as Values, options.filterByTk);
        if (!filter) throw new Error(`Refusing an unscoped update of ${name}`);
        const values: Values = { ...(options.values as Values), updatedAt: new Date() };
        delete values.id;
        await target(options).updateMany({ filter, values });
        return find({ filter: options.filter, filterByTk: options.filterByTk, transaction: options.transaction });
      },
      destroy: async (options: Values) => {
        const filter = toFilter(options.filter as Values, options.filterByTk);
        if (!filter) throw new Error(`Refusing an unscoped delete of ${name}`);
        const result = await target(options).deleteMany({ filter });
        return Number((result as Values)?.deletedCount ?? 0);
      },
    };
  }
}
