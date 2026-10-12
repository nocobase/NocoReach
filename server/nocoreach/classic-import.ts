import { systemMessageText } from '../../shared/i18n/messages.js';
// The one-time import of the classic NocoReach's data (docs/PORT-PLAN.md, step 5), the receiving end.
// `pnpm nocobase app import-classic` (cli/commands/import-classic.ts) reads the classic installation's Postgres on the
// computer that runs it and sends the rows here, to `nrImport` actions only a NocoBase 3 root user may call: the target
// may be a Studio app whose SQLite nothing else reaches. Rows keep their ids and timestamps. Classic user ids (numbers)
// become NocoBase 3 accounts (strings): matched by email, then by username, and the classic administrators that match
// nobody become the person importing. Settings go into nrVariables, secrets sealed with this application's keys.
import type { LegacyApp } from './legacy/app.js';
import type { LegacyContext } from './legacy/context.js';
import type { LegacyUsers } from './legacy/users.js';
import type { LegacyVariables } from './legacy/variables.js';
import type { LegacyTransaction } from './legacy/database.js';
import { TASK_RUNTIME_BACKFILL_CHECKPOINT } from './execution/runtime.js';

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
 * (server/providers/nocoreach.ts), and the once-only data migrations' markers (`nr-migrations:*`), written at its first
 * start. The classic ones pointed at a classic workflow, or recorded the same migrations done on the classic side.
 * Neither is imported, counted as data, or cleared.
 */
export const isAppOwnedSnapshot = (key: unknown) =>
  typeof key === 'string' &&
  (key === 'daily-analysis:workflow' ||
    key.startsWith('daily-analysis:occurrence:') ||
    key.startsWith('nr-migrations:'));

const APP_OWNED_FILTER = {
  $or: [
    { key: 'daily-analysis:workflow' },
    { key: { $startsWith: 'daily-analysis:occurrence:' } },
    { key: { $startsWith: 'nr-migrations:' } },
  ],
};

/**
 * Replace derived execution data with its business records, in one transaction.
 * Scheduler delivery receipts (nrAnalysisOccurrences and the legacy occurrence
 * snapshots) stay: deleting them could turn an old delivery into new paid work.
 * Their missing child records are reported as a terminal failure on inspection.
 */
export const TARGET_TABLES = [
  'nrLifecycleEffectRuns',
  'nrLifecycleTransitions',
  'nrTaskObservations',
  'nrTaskRuns',
  'nrAnalysisRuns',
  ...Object.keys(IMPORT_TABLES),
  'nrYouTubeVideos',
  'nrVariables',
];

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
  if (v == null || v === '') return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
};

const object = (value: unknown): Values | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Values)
    : undefined;
const activeExecution = (status: unknown) =>
  status === 'queued' || status === 'running';

/** Imported executions belong to the source installation, not this worker. */
function retireImportedExecution(table: string, row: Values, at: string): void {
  const reason = 'imported_runtime_unavailable';
  const message = 'classicImport.foreignExecutionStopped';
  if (table === 'nrSnapshots' && typeof row.key === 'string') {
    const payload = object(row.payload);
    if (!payload) return;
    if (row.key.startsWith('nr-task-run:')) {
      const pending = activeExecution(payload.status);
      if (
        !pending &&
        !payload.pluginRunId &&
        !payload.runtimeRunId &&
        payload.executorKind !== 'runner'
      )
        return;
      const { pluginRunId, runtimeRunId, ...archive } = payload;
      row.payload = {
        ...archive,
        pluginSettled: true,
        importedExecution: {
          status: payload.status,
          pluginRunId,
          runtimeRunId,
          importedAt: at,
          reason,
        },
        ...(pending
          ? {
              status: 'failed',
              endedAt: at,
              error: reason,
              errorDetail: message,
            }
          : {}),
      };
    } else if (
      /^daily-analysis:[^:]+$/.test(row.key) &&
      (payload.runningSince || payload.retry)
    ) {
      // Same-database upgrades still drain known safe retries. Copying another
      // installation's execution never transfers its outstanding request.
      row.payload = {
        ...payload,
        importedExecution: {
          runningSince: payload.runningSince,
          retry: payload.retry,
          importedAt: at,
          reason,
        },
        runningSince: null,
        retry: null,
        runs: [
          {
            at,
            trigger: 'schedule',
            ok: false,
            retryable: false,
            error: message,
            ms: 0,
          },
          ...(Array.isArray(payload.runs) ? (payload.runs as unknown[]) : []),
        ],
      };
    }
  }
  if (table === 'nrTasks') {
    const evidence = object(row.evidence),
      work = object(evidence?.work);
    if (!evidence || !work) return;
    const latest = object(work.latestRun),
      release = object(work.release),
      close = object(work.prClose),
      revert = object(work.revert);
    const pending =
      activeExecution(latest?.status) ||
      ['merging', 'verifying'].includes(String(release?.state)) ||
      close?.state === 'closing' ||
      revert?.state === 'opening';
    if (!pending) return;
    row.evidence = {
      ...evidence,
      work: {
        ...work,
        importedExecution: {
          latestRun: latest,
          release,
          prClose: close,
          revert,
          importedAt: at,
          reason,
        },
        ...(activeExecution(latest?.status)
          ? { latestRun: { ...latest, status: 'failed' } }
          : {}),
        ...(release?.state === 'merging'
          ? {
              release: {
                ...release,
                state: 'merge_failed',
                error: message,
                nextCheckAt: undefined,
              },
            }
          : {}),
        ...(release?.state === 'verifying'
          ? {
              release: {
                ...release,
                state: 'not_seen',
                error: message,
                nextCheckAt: undefined,
              },
            }
          : {}),
        ...(close?.state === 'closing'
          ? { prClose: { ...close, state: 'failed', error: message } }
          : {}),
        ...(revert?.state === 'opening'
          ? { revert: { ...revert, state: 'failed', error: message } }
          : {}),
      },
    };
  }
}

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
  const now = new Date();
  const out: Values = {
    id,
    createdAt: date(row.createdAt) ?? now,
    updatedAt: date(row.updatedAt) ?? date(row.createdAt) ?? now,
  };
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
  retireImportedExecution(table, out, now.toISOString());
  return out;
}

const fail = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};

const text = (v: unknown) =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : '';

interface ImportRuntime {
  readonly legacy: LegacyApp;
  readonly users: Pick<LegacyUsers, 'find'>;
  readonly variables: LegacyVariables;
  readonly tasks?: { initialize(): Promise<void> };
  readonly plugin?: { readonly mock?: { readonly enabled: boolean } };
}

const MAX_ROWS = 5000;

/** The `nrImport` actions: plan (read only), begin (empty or clear the tables), rows, variables, finish. Root only. */
export function registerClassicImport(nr: ImportRuntime) {
  const db = nr.legacy.db;
  const table = (name: string, t: unknown) => db.table(name, t);
  const counts = async (transaction?: LegacyTransaction) => {
    const out: Record<string, number> = {};
    for (const t of TARGET_TABLES)
      out[t] =
        t === 'nrSnapshots'
          ? (
              await db.getRepository(t).find({
                fields: ['id', 'key'],
                limit: 100_000_000,
                transaction,
              })
            ).filter((r) => !isAppOwnedSnapshot(r.key)).length
          : await table(t, transaction).count(
              t === 'nrVariables'
                ? {
                    filter: (f) =>
                      f.string('name').ne(TASK_RUNTIME_BACKFILL_CHECKPOINT),
                  }
                : {},
            );
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
      const existing = await db.sequelize.transaction(async (t) => {
        const before = await counts(t);
        const total = Object.values(before).reduce((a, b) => a + b, 0);
        if (total && v.replace !== true)
          fail(
            '新应用里已经有 NocoReach 数据；确认要用旧数据替换时，加 --replace 再运行',
            409,
          );
        // The application's own schedule records stay: taken out, everything cleared, put back.
        const own = (
          await db.getRepository('nrSnapshots').find({
            filter: APP_OWNED_FILTER,
            transaction: t,
            limit: 100_000_000,
          })
        ).map((r) => ({
          ...r.toJSON(),
          createdAt: new Date(String(r.createdAt)),
          updatedAt: new Date(String(r.updatedAt)),
        }));
        for (const name of TARGET_TABLES)
          await table(name, t).deleteMany({ all: true });
        if (own.length)
          await table('nrSnapshots', t).createMany({
            values: [own[0], ...own.slice(1)],
          });
        return before;
      });
      await nr.variables.load();
      return { cleared: existing };
    },
    async rows(v) {
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
          await table(name, t).createMany({
            values: [values[0], ...values.slice(1)],
          });
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
      // The app may have started and checkpointed an empty database before the
      // first import. Rebuild indexes now, so no restart or stale cursor is needed.
      if (nr.tasks) {
        await nr.variables.set(TASK_RUNTIME_BACKFILL_CHECKPOINT, null, false);
        await nr.tasks.initialize();
      }
      return { tables: await counts() };
    },
  };
  const wrap =
    (fn: (v: Values, userId: string) => Promise<unknown>) =>
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
      ctx.body = await fn(
        (ctx.action.params.values as Values) || {},
        String(ctx.auth!.user.id),
      );
      await next();
    };
  nr.legacy.resourceManager.define({
    name: 'nrImport',
    actions: Object.fromEntries(
      Object.entries(actions).map(([k, fn]) => [k, wrap(fn)]),
    ),
  });
  nr.legacy.acl.allow('nrImport', Object.keys(actions), 'loggedIn');
}
