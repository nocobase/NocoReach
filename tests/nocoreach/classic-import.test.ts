// The one-time import of the classic NocoReach (docs/PORT-PLAN.md, step 5): user matching, user ids inside the classic
// records, the row shape, the classic secrets' encryption, and the root-only `nrImport` actions.
import { createCipheriv } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { decryptClassic } from '../../cli/commands/lib/classic-source.js';
import {
  importRow,
  isImportedVariable,
  matchUsers,
  registerClassicImport,
  remapMembers,
  remapUsers,
} from '../../server/nocoreach/classic-import.js';
import {
  IMPORT_HOLD_LEASE_MS,
  LegacyApp,
  type LegacyAction,
  type LegacyJob,
} from '../../server/nocoreach/legacy/app.js';
import {
  LegacyCache,
  LegacyHttpError,
  legacyContext,
} from '../../server/nocoreach/legacy/context.js';

const accounts = [
  {
    id: 'u-root',
    nickname: 'Super Admin',
    username: 'nocobase',
    email: 'admin@nocobase.com',
  },
  { id: 'u-lin', nickname: 'Lin', username: 'lin', email: 'Lin@Example.com' },
  { id: 'u-mia', nickname: 'Mia', username: 'mia', email: 'mia@example.com' },
];

describe('matching classic users to accounts', () => {
  it('matches by email (any case), then username; an unmatched classic admin becomes the importer', () => {
    const matches = matchUsers(
      [
        {
          id: '1',
          email: 'old-root@example.com',
          username: 'root',
          nickname: 'Esther',
          admin: true,
        },
        {
          id: '2',
          email: 'lin@example.com',
          username: 'lin-old',
          nickname: 'Lin',
        },
        { id: '3', email: null, username: 'MIA', nickname: null },
        {
          id: '4',
          email: 'gone@example.com',
          username: 'gone',
          nickname: 'Gone',
        },
      ],
      accounts,
      'u-root',
    );
    expect(matches).toEqual([
      {
        classicId: '1',
        name: 'Esther',
        admin: true,
        to: 'u-root',
        toName: 'Super Admin',
        by: 'importer',
      },
      {
        classicId: '2',
        name: 'Lin',
        admin: false,
        to: 'u-lin',
        toName: 'Lin',
        by: 'email',
      },
      {
        classicId: '3',
        name: 'MIA',
        admin: false,
        to: 'u-mia',
        toName: 'Mia',
        by: 'username',
      },
      {
        classicId: '4',
        name: 'Gone',
        admin: false,
        to: null,
        toName: null,
        by: null,
      },
    ]);
  });
});

describe('user ids inside classic records', () => {
  const users = new Map([
    ['1', 'u-root'],
    ['2', 'u-lin'],
  ]);

  it('replaces known user ids under user keys and in collaborators, nothing else', () => {
    const task = {
      humanOwnerId: '2',
      reviewerId: 1,
      createdBy: 'atlas',
      ownerId: '9',
      projectId: '1',
      taskId: '1',
      collaborators: [{ id: '1', name: 'Esther' }],
      events: [{ actor: '2', actorName: 'Lin', note: '1' }],
      steps: [{ owner: 'human', title: 'x' }],
    };
    expect(remapUsers(task, users)).toEqual({
      humanOwnerId: 'u-lin',
      reviewerId: 'u-root',
      createdBy: 'atlas',
      ownerId: '9',
      projectId: '1',
      taskId: '1',
      collaborators: [{ id: 'u-root', name: 'Esther' }],
      events: [{ actor: 'u-lin', actorName: 'Lin', note: '1' }],
      steps: [{ owner: 'human', title: 'x' }],
    });
  });

  it('keeps member roles under the new ids, makes classic admins 管理员, drops people without an account', () => {
    expect(
      remapMembers(
        {
          users: { '1': 'member', '2': 'member', '4': 'admin' },
          updatedBy: '1',
        },
        users,
        new Set(['1']),
      ),
    ).toEqual({
      users: { 'u-root': 'admin', 'u-lin': 'member' },
      updatedBy: 'u-root',
    });
  });
});

describe('a classic row as NocoBase 3 stores it', () => {
  const users = new Map([['2', 'u-lin']]);

  it('keeps id and times, takes only the table columns, parses JSON text and replaces user ids', () => {
    const row = importRow(
      'nrTasks',
      {
        id: '391000000000001',
        createdAt: '2026-09-01T01:02:03.000Z',
        updatedAt: new Date('2026-09-02T00:00:00.000Z'),
        createdById: 2,
        taskKey: 'p1:T-1',
        title: 'T',
        status: 'open',
        projectId: '1',
        evidence: '{"humanOwnerId":"2"}',
        brief: 'b',
      },
      users,
      new Set(),
    );
    expect(row).toEqual({
      id: '391000000000001',
      createdAt: new Date('2026-09-01T01:02:03.000Z'),
      updatedAt: new Date('2026-09-02T00:00:00.000Z'),
      taskKey: 'p1:T-1',
      title: 'T',
      status: 'open',
      projectId: '1',
      evidence: { humanOwnerId: 'u-lin' },
      brief: 'b',
    });
  });

  it('rewrites the members record and refuses unknown tables and rows without an id', () => {
    expect(
      importRow(
        'nrSnapshots',
        { id: '5', key: 'nr-members', payload: { users: { '2': 'admin' } } },
        users,
        new Set(),
      ).payload,
    ).toEqual({ users: { 'u-lin': 'admin' } });
    expect(() => importRow('users', { id: '1' }, users, new Set())).toThrow(
      /不导入/,
    );
    expect(() =>
      importRow('nrSnapshots', { key: 'x' }, users, new Set()),
    ).toThrow(/id/);
  });
});

describe('classic secrets', () => {
  it('decrypts what classic NocoBase encrypted (aes-256-cbc, hex IV then ciphertext)', () => {
    const key = Buffer.alloc(32),
      iv = Buffer.alloc(16, 2);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const sealed =
      iv.toString('hex') +
      Buffer.concat([
        cipher.update('1//refresh-token', 'utf8'),
        cipher.final(),
      ]).toString('hex');
    expect(decryptClassic(sealed, key)).toBe('1//refresh-token');
    // CBC is not authenticated: an arbitrary wrong key can pass its padding check.
    // This fixed wrong key yields invalid padding (last decrypted byte 0x65).
    expect(() => decryptClassic(sealed, Buffer.alloc(32, 2))).toThrow();
  });

  it('imports NocoReach settings only, and not the public DNS', () => {
    expect(isImportedVariable('NOREACH_GOOGLE_REFRESH_1')).toBe(true);
    expect(isImportedVariable('NOREACH_DATAFORSEO_1')).toBe(true);
    expect(isImportedVariable('NOREACH_PUBLIC_DNS')).toBe(false);
    expect(isImportedVariable('OPENAI_API_KEY')).toBe(false);
    expect(isImportedVariable('NOREACH_MOCK_DATASET_MARKER')).toBe(false);
    expect(isImportedVariable('NOREACH_MOCK_SETTINGS')).toBe(false);
  });
});

describe('the nrImport actions', () => {
  function fixture(mock = false) {
    const tables: Record<string, Record<string, unknown>[]> = {
      nrSnapshots: [
        {
          id: '1',
          key: 'daily-analysis:workflow',
          payload: {},
          createdAt: '2026-10-09T00:00:00.000Z',
          updatedAt: '2026-10-09T00:00:00.000Z',
        },
      ] as Record<string, unknown>[],
      nrTasks: [],
      nrGoogleLinks: [],
      nrSyncJobs: [],
      nrSyncPartitions: [],
      nrKeywordRuns: [],
      nrKeywordCandidates: [],
      nrVariables: [],
    };
    const saved: Record<string, { value: string; secret: boolean }> = {};
    let loads = 0;
    const db = {
      getRepository: (name: string) => ({
        count: async () => tables[name]!.length,
        findOne: async ({ filter }: { filter: { name: string } }) =>
          tables[name]!.find((row) => row.name === filter.name),
        // Everything, or (the only filter the import passes) the application's own schedule records.
        find: async ({ filter }: { filter?: unknown }) =>
          tables[name]!.filter(
            (r) => !filter || String(r.key).startsWith('daily-analysis:'),
          ).map((r) => ({
            ...r,
            toJSON: () => ({ ...r }),
          })),
      }),
      table: (name: string) => ({
        createMany: async ({
          values,
        }: {
          values: Record<string, unknown>[];
        }) => {
          tables[name]!.push(...values);
        },
        deleteMany: async () => {
          tables[name]!.splice(0);
        },
      }),
      sequelize: {
        transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}),
      },
    };
    const legacy = new LegacyApp(db as never, console, {
      all: () => ({}),
    } as never);
    const resources = legacy.resources;
    registerClassicImport({
      plugin: { mock: { enabled: mock } },
      legacy,
      users: { find: async () => accounts } as never,
      variables: {
        set: async (name: string, value: string, secret: boolean) => {
          saved[name] = { value, secret };
          tables.nrVariables!.push({ name });
        },
        load: async () => {
          loads++;
        },
      } as never,
    });
    const call = async (
      action: string,
      body: Record<string, unknown>,
      user: string | null = 'u-root',
      root = true,
    ) => {
      const ctx = legacyContext({
        resource: 'nrImport',
        action,
        method: 'POST',
        query: {},
        body,
        header: () => undefined,
        cookie: () => undefined,
        user: user ? { id: user, name: user } : null,
        roles: root ? ['root'] : [],
        app: { db } as never,
        cache: new LegacyCache(),
        logger: console as never,
      });
      await (resources.action('nrImport', action) as LegacyAction)(
        ctx,
        async () => {},
      );
      return ctx.body as any;
    };
    return { tables, saved, call, legacy, loads: () => loads };
  }

  it('refuses every import phase when simulation is enabled or a dataset marker exists', async () => {
    for (const enabled of [true, false]) {
      const { call, tables, legacy } = fixture(enabled);
      if (!enabled)
        tables.nrVariables!.push({
          name: 'NOREACH_MOCK_DATASET_MARKER',
          value: '',
        });
      const before = JSON.stringify(tables);
      for (const action of ['plan', 'begin', 'rows', 'variables', 'finish'])
        await expect(
          call(action, {
            replace: true,
            variables: [{ name: 'NOREACH_MOCK_DATASET_MARKER', value: '' }],
          }),
        ).rejects.toMatchObject({ status: 409 });
      expect(JSON.stringify(tables)).toBe(before);
      expect(legacy.importHold.held).toBe(false);
    }
  });

  it('answers only a signed-in NocoBase root user', async () => {
    const { call } = fixture();
    await expect(call('plan', {}, null)).rejects.toMatchObject({ status: 401 });
    await expect(call('plan', {}, 'u-lin', false)).rejects.toBeInstanceOf(
      LegacyHttpError,
    );
    await expect(call('plan', {}, 'u-lin', false)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('plans, imports rows with users mapped, saves settings, and refuses to mix with existing data', async () => {
    const { call, tables, saved, loads } = fixture();
    const plan = await call('plan', {
      users: [{ id: '1', email: 'x@y.z', admin: true }],
    });
    expect(plan.tables).toMatchObject({ nrSnapshots: 0, nrTasks: 0 });
    expect(plan.users[0]).toMatchObject({
      classicId: '1',
      to: 'u-root',
      by: 'importer',
    });

    await call('begin', { replace: false });
    // The application's own schedule marker is not data: the classic one is skipped, the new one stays.
    const sent = await call('rows', {
      table: 'nrSnapshots',
      rows: [
        { id: '10', key: 'nr-members', payload: { users: {} } },
        {
          id: '12',
          key: 'daily-analysis:workflow',
          payload: { workflowId: 7 },
        },
        { id: '13', key: 'nr-migrations:archive-legacy-1', payload: {} },
      ],
      users: { '1': 'u-root' },
      admins: ['1'],
    });
    await call('rows', {
      table: 'nrTasks',
      rows: [{ id: '11', taskKey: 'p1:T-1', evidence: { reviewerId: '1' } }],
      users: { '1': 'u-root' },
    });
    expect(sent).toEqual({ inserted: 1, skipped: 2 });
    expect(tables.nrSnapshots!.map((r) => r.key)).toEqual([
      'daily-analysis:workflow',
      'nr-members',
    ]);
    expect(tables.nrSnapshots![1]!.payload).toEqual({
      users: { 'u-root': 'admin' },
    });
    expect(tables.nrTasks![0]!.evidence).toEqual({ reviewerId: 'u-root' });

    await call('variables', {
      variables: [
        { name: 'NOREACH_GOOGLE_CLIENT_SECRET', value: 's', secret: true },
        {
          name: 'NOREACH_GOOGLE_BASE_URL',
          value: 'https://studio.example.com',
          secret: false,
        },
      ],
    });
    expect(saved.NOREACH_GOOGLE_CLIENT_SECRET).toEqual({
      value: 's',
      secret: true,
    });
    await expect(
      call('variables', { variables: [{ name: 'PATH', value: 'x' }] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      call('rows', { table: 'user', rows: [] }),
    ).rejects.toMatchObject({ status: 400 });

    const done = await call('finish', {});
    expect(done.tables).toMatchObject({
      nrSnapshots: 1,
      nrTasks: 1,
      nrVariables: 2,
    });
    expect(loads()).toBeGreaterThan(0);

    await expect(call('begin', { replace: false })).rejects.toMatchObject({
      status: 409,
    });
    await call('begin', { replace: true });
    expect(tables.nrTasks).toEqual([]);
    expect(tables.nrSnapshots!.map((r) => r.key)).toEqual([
      'daily-analysis:workflow',
    ]);
    expect(tables.nrVariables).toEqual([]);
  });

  describe('holding NocoReach timers', () => {
    afterEach(() => {
      vi.useRealTimers();
    });
    const timer = (onTick: () => unknown): LegacyJob => ({
      name: 'analysisCron',
      cronTime: '10 * * * * *',
      onTick,
    });

    it('skips timer firings from begin to finish, renews the hold with each call, and lets it lapse when the CLI stops', async () => {
      vi.useFakeTimers();
      const { call, legacy } = fixture();
      let ticks = 0;
      const analysis = timer(async () => {
        ticks++;
      });

      // A dry run holds nothing.
      await call('plan', {});
      expect(await legacy.tick(analysis)).toBe(true);
      await call('begin', { replace: false });
      expect(await legacy.tick(analysis)).toBe(false);
      vi.advanceTimersByTime(IMPORT_HOLD_LEASE_MS - 1000);
      await call('rows', {
        table: 'nrSnapshots',
        rows: [{ id: '10', key: 'project:1', payload: { id: 1 } }],
      });
      vi.advanceTimersByTime(IMPORT_HOLD_LEASE_MS - 1000);
      expect(await legacy.tick(analysis)).toBe(false);
      await call('variables', { variables: [] });
      expect(await legacy.tick(analysis)).toBe(false);
      await call('finish', {});
      expect(await legacy.tick(analysis)).toBe(true);
      expect(ticks).toBe(2);

      // A CLI that dies after a call: the timers run again once the lease has passed since that call ended.
      await call('begin', { replace: true });
      vi.advanceTimersByTime(IMPORT_HOLD_LEASE_MS - 1);
      expect(await legacy.tick(analysis)).toBe(false);
      vi.advanceTimersByTime(1);
      expect(await legacy.tick(analysis)).toBe(true);
      expect(ticks).toBe(3);
    });

    it('begin waits for a firing already running, and refuses without clearing anything when it outlasts the wait', async () => {
      vi.useFakeTimers();
      const { call, legacy, tables } = fixture();
      let end!: () => void;
      const running = legacy.tick(
        timer(() => new Promise<void>((resolve) => (end = resolve))),
      );
      let begun = false;
      const begin = call('begin', { replace: false }).then(() => {
        begun = true;
      });
      await vi.advanceTimersByTimeAsync(5000);
      expect(begun).toBe(false);
      // Held while it waits: no new firing starts.
      expect(await legacy.tick(timer(() => undefined))).toBe(false);
      end();
      await begin;
      expect(await running).toBe(true);
      await call('rows', {
        table: 'nrTasks',
        rows: [{ id: '11', taskKey: 'p1:T-1' }],
      });
      await call('finish', {});

      // Work that does not finish within the wait: begin answers 409, clears nothing and releases the timers.
      void legacy.importHold.track(new Promise(() => {}));
      const refused = call('begin', { replace: true }).catch(
        (error: unknown) => error,
      );
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await refused).toMatchObject({ status: 409 });
      expect(tables.nrTasks).toHaveLength(1);
      expect(legacy.importHold.held).toBe(false);
    });
  });
});
