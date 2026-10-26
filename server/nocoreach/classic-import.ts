import { systemMessageText } from '../../shared/i18n/messages.js';
import { timestamp } from '../../shared/timestamps.js';
// The one-time import of the classic NocoReach's data (docs/PORT-PLAN.md, step 5), the receiving end.
// `pnpm nocobase app import-classic` (cli/commands/import-classic.ts) reads the classic installation's Postgres on the
// computer that runs it and sends the rows here, to `nrImport` actions only a NocoBase 3 root user may call: the target
// may be a Studio app whose SQLite nothing else reaches. Rows keep their ids and timestamps. Classic user ids (numbers)
// become NocoBase 3 accounts (strings): matched by email, then by username, and the classic administrators that match
// nobody become the person importing. Settings go into nrVariables, secrets sealed with this application's keys.
import { STARTS_KEY } from './execution/restarts.js';
import type { LegacyApp } from './legacy/app.js';
import type { LegacyContext } from './legacy/context.js';
import { toFilter } from './legacy/filters.js';
import type { LegacyUsers } from './legacy/users.js';
import type { LegacyVariables } from './legacy/variables.js';

type Values = Record<string, unknown>;

/** The classic tables the import carries, with the columns the NocoBase 3 migration gave them (besides id and times). */
export const IMPORT_TABLES: Readonly<
  Record<
    string,
    { readonly columns: readonly string[]; readonly json: readonly string[] }
  >
> = {
  nrSnapshots: { columns: ['key', 'payload'], json: ['payload'] },
  nrTasks: {
    columns: ['taskKey', 'title', 'status', 'projectId', 'evidence', 'brief'],
    json: ['evidence'],
  },
  nrGoogleLinks: {
    columns: [
      'projectId',
      'accountEmail',
      'status',
      'authorizedAt',
      'ga4PropertyId',
      'gscSiteUrl',
      'scheduleEnabled',
      'nextSyncAt',
      'lastSyncAt',
    ],
    json: [],
  },
  nrSyncJobs: {
    columns: [
      'projectId',
      'status',
      'source',
      'startDate',
      'endDate',
      'cursor',
      'resource',
      'errorCode',
      'attempts',
      'recordCount',
      'trigger',
      'finishedAt',
      'retryAt',
    ],
    json: [],
  },
  nrSyncPartitions: {
    columns: [
      'partitionKey',
      'projectId',
      'source',
      'resource',
      'date',
      'grain',
      'payload',
    ],
    json: ['payload'],
  },
  nrKeywordRuns: {
    columns: [
      'projectId',
      'requestKey',
      'queryHash',
      'status',
      'spec',
      'result',
      'costUsd',
      'reservedUsd',
      'taskId',
      'errorCode',
      'completedAt',
    ],
    json: ['spec', 'result'],
  },
  nrKeywordCandidates: {
    columns: ['candidateKey', 'projectId', 'keyword', 'runId', 'payload'],
    json: ['payload'],
  },
};

/**
 * Snapshots this application writes itself: the daily analysis schedule's marker and the record of each firing
 * (server/providers/nocoreach.ts), the once-only data migrations' markers (`nr-migrations:*`), and the deployment
 * restart history. These belong to this installation: none is imported, counted as business data, or cleared.
 */
export const isAppOwnedSnapshot = (key: unknown) =>
  typeof key === 'string' &&
  (key === STARTS_KEY ||
    key === 'daily-analysis:workflow' ||
    key.startsWith('daily-analysis:occurrence:') ||
    key.startsWith('nr-migrations:'));

const APP_OWNED_FILTER = {
  $or: [
    { key: STARTS_KEY },
    { key: 'daily-analysis:workflow' },
    { key: { $startsWith: 'daily-analysis:occurrence:' } },
    { key: { $startsWith: 'nr-migrations:' } },
  ],
};

/** Every table the import replaces: the carried ones and the settings. */
export const TARGET_TABLES = [...Object.keys(IMPORT_TABLES), 'nrVariables'];

/** NocoReach's settings in classic environment variables; the public DNS is server configuration on NocoBase 3. */
export const isImportedVariable = (name: string) =>
  /^NOREACH_[A-Z0-9_]+$/.test(name) &&
  name !== 'NOREACH_PUBLIC_DNS' &&
  !name.startsWith('NOREACH_MOCK_');

export interface ClassicUser {
  readonly id: string;
  readonly email?: string | null;
  readonly username?: string | null;
  readonly nickname?: string | null;
  /** Held the classic root or admin role: always 管理员 in NocoReach. */
  readonly admin?: boolean;
}

export interface UserMatch {
  readonly classicId: string;
  readonly name: string;
  readonly admin: boolean;
  readonly to: string | null;
  readonly toName: string | null;
  readonly by: 'email' | 'username' | 'importer' | null;
}

const lower = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null;
const nameOf = (u: {
  nickname?: unknown;
  username?: unknown;
  email?: unknown;
  id?: unknown;
}) => String(u.nickname || u.username || u.email || u.id);

/** A NocoBase 3 account as the legacy users repository answers it: id, email, username, nickname. */
export type Account = Readonly<Record<string, unknown>>;

/** Classic users to NocoBase 3 accounts: email, then username; unmatched classic administrators to the importer. */
export function matchUsers(
  classic: readonly ClassicUser[],
  accounts: readonly Account[],
  importerId: string,
): UserMatch[] {
  const byEmail = new Map<string, Account>(),
    byUsername = new Map<string, Account>();
  for (const a of accounts) {
    const e = lower(a.email),
      u = lower(a.username);
    if (e && !byEmail.has(e)) byEmail.set(e, a);
    if (u && !byUsername.has(u)) byUsername.set(u, a);
  }
  const importer = accounts.find((a) => String(a.id) === importerId) ?? null;
  return classic.map((c) => {
    const email = lower(c.email),
      username = lower(c.username);
    const found: [Account | null, UserMatch['by']] =
      email && byEmail.has(email)
        ? [byEmail.get(email)!, 'email']
        : username && byUsername.has(username)
          ? [byUsername.get(username)!, 'username']
          : c.admin
            ? [importer ?? { id: importerId }, 'importer']
            : [null, null];
    return {
      classicId: String(c.id),
      name: nameOf(c),
      admin: Boolean(c.admin),
      to: found[0] ? String(found[0].id) : null,
      toName: found[0] ? nameOf(found[0]) : null,
      by: found[1],
    };
  });
}

// Keys whose value is a user id in the classic records (task owners, reviewers, who recorded, approved or added what),
// and `collaborators: [{ id, name }]`. Only values that are a known classic user id change, so ids of other things
// under these names ('atlas', 'local-agent') stay as they are.
const USER_KEYS = new Set([
  'ownerId',
  'humanOwnerId',
  'reviewerId',
  'userId',
  'actor',
  'actorId',
  'createdBy',
  'updatedBy',
  'recordedBy',
  'approvedBy',
  'archivedBy',
  'cancelledBy',
  'confirmedBy',
  'addedBy',
  'removedBy',
]);

const mapped = (value: unknown, users: ReadonlyMap<string, string>) =>
  (typeof value === 'string' || typeof value === 'number') &&
  users.has(String(value))
    ? users.get(String(value))
    : value;

/** A classic JSON value with its user ids replaced by NocoBase 3 account ids. */
export function remapUsers(
  value: unknown,
  users: ReadonlyMap<string, string>,
): unknown {
  if (Array.isArray(value)) return value.map((v) => remapUsers(v, users));
  if (!value || typeof value !== 'object') return value;
  const out: Values = {};
  for (const [k, v] of Object.entries(value as Values)) {
    if (USER_KEYS.has(k)) out[k] = mapped(v, users);
    else if (k === 'collaborators' && Array.isArray(v))
      out[k] = (v as unknown[]).map((p) =>
        p && typeof p === 'object'
          ? { ...(p as Values), id: mapped((p as Values).id, users) }
          : p,
      );
    else out[k] = remapUsers(v, users);
  }
  return out;
}

const MEMBERS_KEY = 'nr-members';

/** The 设置 · 成员 record: roles under the new ids; classic administrators stay 管理员; people with no account drop out. */
export function remapMembers(
  payload: unknown,
  users: ReadonlyMap<string, string>,
  admins: ReadonlySet<string>,
): Values {
  const p = (payload && typeof payload === 'object' ? payload : {}) as Values;
  const next: Record<string, string> = {};
  for (const [id, role] of Object.entries(
    (p.users as Record<string, string>) || {},
  )) {
    const to = users.get(String(id));
    if (to && (role === 'admin' || role === 'member') && next[to] !== 'admin')
      next[to] = role;
  }
  for (const id of admins) {
    const to = users.get(id);
    if (to) next[to] = 'admin';
  }
  return { ...(remapUsers(p, users) as Values), users: next };
}

const date = (v: unknown) => {
  const iso = timestamp(v === undefined ? null : v);
  return iso === null ? null : new Date(iso);
};

/** A classic row as the NocoBase 3 table stores it: its columns only, id and times kept, user ids replaced. */
export function importRow(
  table: string,
  row: Values,
  users: ReadonlyMap<string, string>,
  admins: ReadonlySet<string>,
): Values {
  const spec = IMPORT_TABLES[table];
  if (!spec)
    throw Object.assign(new Error(`不导入这张表：${table}`), { status: 400 });
  const id = text(row.id);
  if (!/^[1-9]\d{0,19}$/.test(id))
    throw Object.assign(new Error(`${table} 有一行没有有效的 id`), {
      status: 400,
    });
  const out: Values = { id };
  for (const field of ['createdAt', 'updatedAt']) {
    try {
      out[field] = date(row[field]);
    } catch {
      throw Object.assign(
        new Error(`${table} id=${id} ${field} 必须是合法的绝对时间或 null`),
        { status: 400 },
      );
    }
  }
  for (const column of spec.columns) {
    let v: unknown = row[column] ?? null;
    if (spec.json.includes(column) && typeof v === 'string') {
      try {
        v = JSON.parse(v);
      } catch {
        /* a JSON column holding text: kept as text */
      }
    }
    if (spec.json.includes(column) && v !== null) v = remapUsers(v, users);
    out[column] = v;
  }
  if (table === 'nrSnapshots' && out.key === MEMBERS_KEY)
    out.payload = remapMembers(out.payload, users, admins);
  return out;
}

const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};

const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';

interface ImportRuntime {
  readonly legacy: LegacyApp;
  readonly users: LegacyUsers;
  readonly variables: LegacyVariables;
  readonly plugin?: { readonly mock?: { readonly enabled: boolean } };
}

/** The two NocoBase 3 repository calls the import makes on a table inside a transaction. */
interface ImportTable {
  createMany(options: { values: Values[] }): Promise<unknown>;
  deleteMany(options: { filter: unknown }): Promise<unknown>;
}

const MAX_ROWS = 5000;

/** How long `begin` waits for background work already running before it gives up without writing. */
const BUSY_WAIT_MS = 30_000;

/** The `nrImport` actions: plan (read only), begin (empty or clear the tables), rows, variables, finish. Root only. */
export function registerClassicImport(nr: ImportRuntime) {
  const db = nr.legacy.db;
  const hold = nr.legacy.importHold;
  const table = (name: string, t: unknown) => db.table(name, t) as ImportTable;
  const counts = async () => {
    const out: Record<string, number> = {};
    for (const t of TARGET_TABLES)
      out[t] =
        t === 'nrSnapshots'
          ? (
              await db
                .getRepository(t)
                .find({ fields: ['id', 'key'], limit: 100_000_000 })
            ).filter((r) => !isAppOwnedSnapshot(r.key)).length
          : await db.getRepository(t).count();
    return out;
  };
  const userMaps = (v: Values) => {
    const users = new Map<string, string>();
    for (const [from, to] of Object.entries(
      (v.users as Record<string, unknown>) || {},
    ))
      if (typeof to === 'string' && to) users.set(String(from), to);
    const admins = new Set(((v.admins as unknown[]) || []).map(text));
    return { users, admins };
  };
  const actions: Record<
    string,
    (v: Values, userId: string) => Promise<unknown>
  > = {
    async plan(v, userId) {
      const classic = Array.isArray(v.users) ? (v.users as ClassicUser[]) : [];
      if (classic.length > 10000) fail('旧用户太多');
      return {
        tables: await counts(),
        users: matchUsers(
          classic,
          await nr.users.find({ limit: 100000 }),
          userId,
        ),
      };
    },
    async begin(v) {
      // The hold is taken (wrap) before this waits, so nothing new starts; what already runs finishes first, so no
      // timer writes into the cleared tables.
      if (!(await hold.idle(BUSY_WAIT_MS)))
        fail('NocoReach 的后台任务还在运行；过一两分钟再运行导入', 409);
      const existing = await counts();
      const total = Object.values(existing).reduce((a, b) => a + b, 0);
      if (total && v.replace !== true)
        fail(
          '新应用里已经有 NocoReach 数据；确认要用旧数据替换时，加 --replace 再运行',
          409,
        );
      if (total)
        await db.sequelize.transaction(async (t) => {
          // The application's own runtime records stay: taken out, everything cleared, put back.
          const own = (
            await db
              .getRepository('nrSnapshots')
              .find({ filter: APP_OWNED_FILTER, transaction: t })
          ).map((r) => ({
            ...r.toJSON(),
            createdAt: new Date(String(r.createdAt)),
            updatedAt: new Date(String(r.updatedAt)),
          }));
          for (const name of TARGET_TABLES)
            await table(name, t).deleteMany({
              filter: toFilter({ id: { $ne: null } }),
            });
          if (own.length)
            await table('nrSnapshots', t).createMany({ values: own });
        });
      await nr.variables.load();
      return { cleared: existing };
    },
    async rows(v, userId) {
      const name = text(v.table);
      if (!IMPORT_TABLES[name]) fail(`不导入这张表：${name}`);
      const rows = Array.isArray(v.rows)
        ? (v.rows as Values[])
        : fail('rows 要是数组');
      if (rows.length > MAX_ROWS) fail(`一次最多 ${MAX_ROWS} 行`);
      if (!rows.length) return { inserted: 0 };
      const { users, admins } = userMaps(v);
      const values = rows
        .filter((r) => name !== 'nrSnapshots' || !isAppOwnedSnapshot(r.key))
        .map((r) => importRow(name, r, users, admins));
      if (values.length)
        await db.sequelize.transaction(async (t) => {
          const membership = name === 'nrSnapshots' ? values.find(row => row.key === MEMBERS_KEY) : undefined;
          if (membership && db.access) await db.access.lockManagement(t.connection as import('@nocobase/db').DatabaseConnection);
          await table(name, t).createMany({ values });
          if (membership && db.access) {
            const sets = db.access.authorization.permissionSets.withTransaction(t.connection as import('@nocobase/db').DatabaseConnection);
            const selected = (membership.payload as { users: Record<string, string> }).users;
            const managed = (await sets.list()).map(set => set.key).filter(key => key.startsWith('nr.'));
            // Provision incoming administrators before removing old assignments, preserving the final management entry.
            for (const [id, role] of Object.entries(selected).sort((a, b) => Number(b[1] === 'admin') - Number(a[1] === 'admin'))) await sets.replaceSubjectAssignments({ subject: { type: 'user', id }, managedPermissionSets: managed, permissionSets: [role === 'admin' ? 'nr.admin' : 'nr.member'] });
            const people = await nr.users.find({ limit: 100000, transaction: t });
            for (const person of people) if (!selected[String(person.id)]) await sets.replaceSubjectAssignments({ subject: { type: 'user', id: String(person.id) }, managedPermissionSets: managed, permissionSets: [] });
            await db.access.event(t.connection as import('@nocobase/db').DatabaseConnection, userId, 'member.import', 'classic-import', { count: Object.keys(selected).length });
          }
        });
      return { inserted: values.length, skipped: rows.length - values.length };
    },
    async variables(v) {
      const list = Array.isArray(v.variables)
        ? (v.variables as Values[])
        : fail('variables 要是数组');
      let saved = 0;
      for (const item of list) {
        const name = text(item.name);
        if (!isImportedVariable(name)) fail(`不导入这个变量：${name}`);
        if (typeof item.value !== 'string') fail(`${name} 没有值`);
        await nr.variables.set(
          name,
          item.value as string,
          item.secret === true,
        );
        saved++;
      }
      return { saved };
    },
    async finish() {
      await nr.variables.load();
      return { tables: await counts() };
    },
  };
  const wrap =
    (name: string, fn: (v: Values, userId: string) => Promise<unknown>) =>
    async (ctx: LegacyContext, next: () => Promise<void>) => {
      if (!ctx.auth?.user?.id)
        ctx.throw(401, systemMessageText('classicImport.signFirst'));
      if (
        !((ctx.state.currentRoles as string[] | undefined) || []).includes(
          'root',
        )
      )
        ctx.throw(
          403,
          systemMessageText(
            'classicImport.nocobaseSuperAdministratorImportLegacy',
          ),
        );
      // A classic import can overwrite credentials, snapshots and the permanent dataset marker.
      // Refuse the whole protocol in a simulated deployment, including replacement and variable-only imports.
      if (
        nr.plugin?.mock?.enabled ||
        (await db
          .getRepository('nrVariables')
          .findOne({ filter: { name: 'NOREACH_MOCK_DATASET_MARKER' } }))
      )
        ctx.throw(409, 'NR_MOCK_CLASSIC_IMPORT_BLOCKED');
      // Every call but plan (the dry run) holds NocoReach's timers, from its start and again from its end, so the
      // hold lasts the lease past the last call (legacy/app.ts); finish, or a begin that fails, releases it.
      const holds = name !== 'plan';
      if (holds) hold.hold();
      let ok = false;
      try {
        ctx.body = await fn(
          (ctx.action.params.values as Values) || {},
          String(ctx.auth!.user.id),
        );
        ok = true;
      } finally {
        if (name === 'finish' || (name === 'begin' && !ok)) hold.release();
        else if (holds) hold.hold();
      }
      await next();
    };
  nr.legacy.resourceManager.define({
    name: 'nrImport',
    actions: Object.fromEntries(
      Object.entries(actions).map(([k, fn]) => [k, wrap(k, fn)]),
    ),
  });
  nr.legacy.acl.allow('nrImport', Object.keys(actions), 'loggedIn');
}
