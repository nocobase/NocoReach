// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { post, setup } from './article-rewrite-app-fixture.js';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
// The simulation, as tests/nocoreach/mock-app.test.ts starts it: no model, network or credentials are reached.
const test = createAppTest({
  createServer: createStandaloneServer,
  env: {
    ...process.env,
    NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
      tmpdir(),
      `nocoreach-rewrite-app-${randomUUID()}`,
    ),
  },
  server: {
    env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
  },
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
    nocoreachMock: {
      enabled: true,
      environment: 'test',
      initializeData: false,
    },
    agents: { vectors: { store: false } },
    nocoreach: { publicDns: '' },
  },
});

test('in simulation the rewrite streams NDJSON pieces and a done line, without a model', async ({
  testApp,
}) => {
  const { admin, body, project } = await setup(testApp);
  const session = (await (await admin.fetch('/auth/get-session')).json())
    .session.id;
  const call = async (
    resource: string,
    action: string,
    values: Record<string, unknown>,
  ) => {
    // Saving a profile is application-wide; selecting it is the project's.
    const scoped =
      action === 'save' ? values : { projectId: project, ...values };
    const response = await post(
      admin,
      `/nocoreach/${resource}/${action}`,
      scoped,
      { 'X-NocoReach-Confirmation-Session': session },
    );
    expect(response.status).toBe(200);
    return (await response.json()).data;
  };
  const profile = await call('nrProxyProfiles', 'save', {
    kind: 'mock',
    name: `Mock ${project}`,
    mock: {
      scenario: 'normal',
      seed: 'rewrite',
      clock: new Date().toISOString(),
    },
  });
  await call('nrProxyProfiles', 'selectAll', { profileId: profile.id });
  const response = await post(
    admin,
    '/nocoreachTasks/rewrite',
    body({
      history: [
        {
          instruction: 'More formal',
          result: 'A formal first sentence. More.',
        },
      ],
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toContain(
    'application/x-ndjson',
  );
  const events = (await response.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  expect(events.length).toBeGreaterThan(2);
  expect(events.at(-1)).toEqual({ done: true });
  expect(
    events
      .slice(0, -1)
      .map((event: { text: string }) => event.text)
      .join(''),
  ).toBe('A formal first sentence. (rewritten: Make it shorter)');
});
