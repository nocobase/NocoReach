// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const migrations = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];
type Row = { id: string; kind: string; revision: number; payload: string };
const record = (
  id: string,
  kind: string,
  payload: Record<string, unknown>,
  revision = 0,
): Row => ({
  id,
  kind,
  revision,
  payload: JSON.stringify({ id, ...payload }),
});
const rows = async (connection: {
  repository: (name: string) => { findMany: () => AsyncIterable<unknown> };
}) => {
  const found: Row[] = [];
  for await (const row of connection
    .repository('nrOnlineAgentRecords')
    .findMany())
    found.push(row as Row);
  return found;
};
const insert = async (
  connection: {
    repository: (name: string) => {
      createOne: (input: { values: unknown }) => Promise<unknown>;
    };
  },
  values: Row[],
) => {
  for (const row of values)
    await connection.repository('nrOnlineAgentRecords').createOne({
      values: { ownerId: 'u1', groupId: '', status: '', ...row },
    });
};

describeMigration('202610220001_create_insight_threads', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    await expectCollection('nrInsightThreads').toHaveIndex(
      ['ownerId', 'projectId', 'day'],
      { unique: true },
    );
  },
});

describeMigration('202610220002_retire_online_agent_records', {
  sources: migrations,
  reversible: false,
  before: async ({ connection }) => {
    await insert(connection, [
      record(
        'online-default',
        'agent',
        {
          name: 'Online Agent',
          instructions: 'Be brief.',
          enabled: false,
          model: { modelService: 'svc', model: 'm' },
        },
        3,
      ),
      record('online-second', 'agent', { name: 'Second', enabled: true }),
      record('online-chat-1', 'conversation', { title: 'Old question' }),
      record('online-run-1', 'run', { status: 'running' }),
    ]);
  },
  up: async ({ connection }) => {
    const left = await rows(connection);
    expect(left.map((row) => row.id)).toEqual(['online-default']);
    expect(left[0].revision).toBe(3);
    expect(JSON.parse(left[0].payload)).toEqual({
      id: 'online-default',
      enabled: false,
      instructions: 'Be brief.',
      model: { modelService: 'svc', model: 'm' },
      revision: 3,
    });
  },
});

describeMigration('202610220002_retire_online_agent_records', {
  sources: migrations,
  reversible: false,
  before: async ({ connection }) => {
    // No default record: the agent the Agent page showed, the first enabled one, becomes the settings.
    await insert(connection, [
      record('online-a', 'agent', { instructions: 'Off', enabled: false }),
      record('online-b', 'agent', { instructions: 'Chosen', enabled: true }),
    ]);
  },
  up: async ({ connection }) => {
    const left = await rows(connection);
    expect(left.map((row) => row.id)).toEqual(['online-default']);
    expect(JSON.parse(left[0].payload)).toMatchObject({
      enabled: true,
      instructions: 'Chosen',
      model: null,
    });
  },
});
