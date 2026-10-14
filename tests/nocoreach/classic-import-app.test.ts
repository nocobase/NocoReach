// @vitest-environment node
// `app import-classic` end to end against the application itself: started on a test database, signed in as the initial
// administrator, an API key created through Better Auth, and the command sending over real HTTP. Only the classic
// Postgres is replaced (by the rows below); tests/nocoreach/classic-import.test.ts covers the pieces.
import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { bindAppCommand, runAppCommand } from '@nocobase/app-testing/cli';
import { createAppTest } from '@nocobase/app-testing/server';
import { afterAll, expect, vi } from 'vitest';

import ImportClassic from '../../cli/commands/import-classic.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import { createStandaloneServer } from '../../server/standalone.js';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });

const classic: Record<string, Record<string, unknown>[]> = {
  nrSnapshots: [
    {
      id: '100',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      key: 'project:1',
      payload: { id: 1, name: 'NocoBase', domain: 'nocobase.com' },
    },
    {
      id: '101',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-02T00:00:00Z'),
      key: 'nr-members',
      payload: { users: { '2': 'member' }, updatedBy: '1' },
    },
  ],
  nrTasks: [
    {
      id: '200',
      createdAt: new Date('2026-09-03T00:00:00Z'),
      updatedAt: new Date('2026-09-03T00:00:00Z'),
      taskKey: '1:T-1',
      title: '给字段联动写文档',
      status: 'open',
      projectId: '1',
      evidence: { humanOwnerId: '2', reviewerId: '1' },
      brief: 'b',
    },
  ],
  nrGoogleLinks: [
    {
      id: '300',
      createdAt: new Date('2026-09-01T00:00:00Z'),
      updatedAt: new Date('2026-09-01T00:00:00Z'),
      projectId: '1',
      accountEmail: 'a@example.com',
      status: 'connected',
      scheduleEnabled: true,
      ga4PropertyId: 'properties/1',
      gscSiteUrl: 'sc-domain:nocobase.com',
    },
  ],
  nrSyncPartitions: Array.from({ length: 30 }, (_, i) => ({
    id: String(400 + i),
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    partitionKey: `1:gsc:queries:2026-08-${String(i + 1).padStart(2, '0')}`,
    projectId: '1',
    source: 'gsc',
    resource: 'queries',
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    grain: 'day',
    payload: {
      rows: Array.from({ length: 200 }, (_, j) => ({
        query: `nocobase ${j}`,
        clicks: j,
      })),
    },
  })),
};

vi.mock('../../cli/commands/lib/classic-source.js', async (importOriginal) => {
  const original =
    await importOriginal<
      typeof import('../../cli/commands/lib/classic-source.js')
    >();
  class FakeSource {
    static async open() {
      return new FakeSource();
    }
    async close() {}
    async importColumns(table: string) {
      return table in classic
        ? ['id', 'createdAt', 'updatedAt', 'payload']
        : null;
    }
    async count(table: string) {
      return classic[table]?.length ?? 0;
    }
    async page(
      table: string,
      _columns: string[],
      after: string | null,
      limit: number,
    ) {
      const rows = classic[table] ?? [];
      return rows
        .filter((r) => after === null || BigInt(String(r.id)) > BigInt(after))
        .slice(0, limit);
    }
    async users() {
      return {
        users: [
          {
            id: '1',
            email: 'old-root@example.com',
            username: 'root',
            nickname: 'Esther',
            admin: true,
          },
          {
            id: '2',
            email: 'gone@example.com',
            username: 'gone',
            nickname: 'Gone',
            admin: false,
          },
        ],
        rolesKnown: true,
      };
    }
    async variables() {
      return {
        variables: [
          {
            name: 'NOREACH_GOOGLE_CLIENT_ID',
            value: 'id.apps.googleusercontent.com',
            secret: false,
          },
          {
            name: 'NOREACH_GOOGLE_CLIENT_SECRET',
            value: 'client-secret',
            secret: true,
          },
          {
            name: 'NOREACH_GOOGLE_BASE_URL',
            value: 'http://127.0.0.1:13004',
            secret: false,
          },
          {
            name: 'NOREACH_GOOGLE_REFRESH_1',
            value: 'refresh-token',
            secret: true,
          },
        ],
        plain: 2,
        secret: 2,
        unreadable: [],
      };
    }
  }
  return { ...original, ClassicSource: FakeSource };
});

/** The command's --json document; the application under test runs in this process and logs to the same stdout. */
// Its request log lines can come before or after the document: take the lines from `{` to `}`.
const document = (run: { stdout: string }) => {
  const lines = run.stdout.split('\n');
  const start = lines.indexOf('{'),
    end = lines.indexOf('}', start);
  return JSON.parse(lines.slice(start, end + 1).join('\n')) as {
    ok: boolean;
    status: string;
    result: Record<string, any>;
    error?: { code: string };
  };
};

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

let server: Server | undefined;
afterAll(
  () =>
    new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    ),
);

/** The application under test on a real port, so the command reaches it with fetch as it would reach Studio. */
async function listen(
  fetchApp: (request: Request) => Response | Promise<Response>,
) {
  server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const response = await fetchApp(
      new Request(`http://127.0.0.1${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(body && req.method !== 'GET' ? { body } : {}),
      }),
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

test('imports the classic rows, users and secrets into the running application over HTTP', async ({
  testApp,
  connection,
}) => {
  // This test verifies imported row counts, before task reconciliation can create business snapshots.
  testApp.application.container
    .resolve(nocoReachToken)
    .plugin.taskExecution.stop();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const created = await admin.fetch('/auth/api-key/create', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'import' }),
  });
  expect(created.status).toBe(200);
  const { key } = (await created.json()) as { key: string };
  const origin = await listen(testApp.fetch);
  const to = `${origin}${testApp.publicBasePath}`;

  const keyFile = path.join(testApp.config.directory, 'aes_key.dat');
  await writeFile(keyFile, randomBytes(32));
  const Bound = bindAppCommand(ImportClassic, {
    rootDir: process.cwd(),
    id: 'app:import-classic',
  });
  process.env.NOCOREACH_API_KEY = key;
  try {
    const dry = await runAppCommand(Bound, [
      '--to',
      to,
      '--classic-aes-key',
      keyFile,
      '--dry-run',
      '--json',
    ]);
    expect(document(dry)).toMatchObject({ ok: true, status: 'success-noop' });
    expect(await connection.repository('nrTasks').count()).toBe(0);

    // Small batches, so a table goes in several requests.
    const run = await runAppCommand(Bound, [
      '--to',
      to,
      '--classic-aes-key',
      keyFile,
      '--batch-bytes',
      '60000',
      '--json',
    ]);
    expect(document(run)).toMatchObject({ ok: true, status: 'success' });
    const result = document(run).result as {
      imported: { tables: Record<string, number>; variables: number };
    };
    expect(result.imported.tables).toMatchObject({
      nrSnapshots: 2,
      nrTasks: 1,
      nrGoogleLinks: 1,
      nrSyncPartitions: 30,
      nrVariables: 4,
    });

    const [task] = (await connection
      .repository('nrTasks')
      .findMany({})) as Record<string, unknown>[];
    expect(String(task!.id)).toBe('200');
    expect(task!.evidence).toEqual({
      humanOwnerId: '2',
      reviewerId: admin.user.id,
    });
    const members = (await connection
      .repository('nrSnapshots')
      .findMany({})) as Record<string, unknown>[];
    expect(members.find((r) => r.key === 'nr-members')!.payload).toEqual({
      users: { [admin.user.id]: 'admin' },
      updatedBy: admin.user.id,
    });

    // Secrets sealed with this application's keys, readable by NocoReach; Google comes back to the new address.
    const stored = (await connection
      .repository('nrVariables')
      .findMany({})) as Record<string, unknown>[];
    const refresh = stored.find((r) => r.name === 'NOREACH_GOOGLE_REFRESH_1')!;
    expect(refresh.secret).toBe(true);
    expect(refresh.value).not.toContain('refresh-token');
    const variables = testApp.application.container
      .resolve(nocoReachToken)
      .variables.all();
    expect(variables.NOREACH_GOOGLE_REFRESH_1).toBe('refresh-token');
    expect(variables.NOREACH_GOOGLE_BASE_URL).toBe(origin);

    // A second run refuses to mix; --replace starts over.
    const again = await runAppCommand(Bound, ['--to', to, '--json']);
    expect(document(again)).toMatchObject({
      ok: false,
      error: { code: 'TARGET_NOT_EMPTY' },
    });
    const originalTime = classic.nrTasks![0]!.createdAt;
    classic.nrTasks![0]!.createdAt = '2026-09-03T00:00:00';
    try {
      const invalid = await runAppCommand(Bound, [
        '--to',
        to,
        '--replace',
        '--json',
      ]);
      expect(document(invalid)).toMatchObject({ ok: false });
      // The all-source preflight must fail before begin can erase already imported data.
      expect(await connection.repository('nrTasks').count()).toBe(1);
      expect(
        (
          await connection
            .repository('nrTasks')
            .findOne({ filter: { id: '200' } })
        )?.createdAt,
      ).toBe('2026-09-03T00:00:00.000Z');
      expect(
        document(
          await runAppCommand(Bound, [
            '--to',
            to,
            '--replace',
            '--dry-run',
            '--json',
          ]),
        ),
      ).toMatchObject({ ok: false });
      const proven = await runAppCommand(Bound, [
        '--to',
        to,
        '--replace',
        '--source-time-zone',
        'UTC',
        '--json',
      ]);
      expect(document(proven)).toMatchObject({ ok: true });
      expect(
        (
          await connection
            .repository('nrTasks')
            .findOne({ filter: { id: '200' } })
        )?.createdAt,
      ).toBe('2026-09-03T00:00:00.000Z');
    } finally {
      classic.nrTasks![0]!.createdAt = originalTime;
    }
    const replaced = await runAppCommand(Bound, [
      '--to',
      to,
      '--classic-aes-key',
      keyFile,
      '--replace',
      '--json',
    ]);
    expect(document(replaced)).toMatchObject({ ok: true });
    expect(await connection.repository('nrSyncPartitions').count()).toBe(30);

    // A key of someone who is not a root user is refused.
    process.env.NOCOREACH_API_KEY = 'wrong';
    const refused = await runAppCommand(Bound, [
      '--to',
      to,
      '--dry-run',
      '--json',
    ]);
    expect(document(refused)).toMatchObject({
      ok: false,
      error: { code: 'TARGET_FAILED' },
    });
  } finally {
    delete process.env.NOCOREACH_API_KEY;
  }
});
