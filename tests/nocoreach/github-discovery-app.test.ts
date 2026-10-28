// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { expect } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { nocoReachToken } from '../../server/providers/nocoreach.js';
import {
  GitHubDiscovery,
  discoveryTokenKey,
} from '../../server/nocoreach/github-discovery/service.js';
import { githubDiscoveryFixture } from '../../app-plugins/nocoreach-mock/server/github-discovery.js';
import { newDiscoveryRule } from '../../shared/github-discovery.js';
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

test('persists isolated rules, seals credentials, scans and reviews through authenticated routes', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.plugin.projects.create({
    name: 'Discovery app test',
    domain: 'discovery.example.test',
  });
  await runtime.plugin.projects.create({
    name: 'Other',
    domain: 'other.example.test',
  });
  const service = new GitHubDiscovery(
    runtime.plugin as unknown as ConstructorParameters<
      typeof GitHubDiscovery
    >[0],
    async (url) =>
      githubDiscoveryFixture(new URL(url)) ||
      new Response('{}', { status: 404 }),
  );
  service.register();
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const call = (
    action: string,
    values: object = {},
    headers: Record<string, string> = {},
  ) =>
    admin.fetch(`/nocoreach/nrGitHubDiscovery/${action}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost',
        ...headers,
      },
      body: JSON.stringify({ projectId: '1', ...values }),
    });
  try {
    expect(
      (
        await testApp.fetch(
          new Request(
            `http://localhost${testApp.publicBasePath}/api/nocoreach/nrGitHubDiscovery/status`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{"projectId":"1"}',
            },
          ),
        )
      ).status,
    ).toBe(401);
    expect((await call('status', { projectId: '999' })).status).toBe(404);
    expect(
      (await call('saveRule', { rule: newDiscoveryRule(true), revision: 0 }))
        .status,
    ).toBe(200);
    const token = 'github_pat_fakeIntegrationOnlyNeverLive12345';
    const credential = await call(
      'setToken',
      { revision: 1 },
      { 'x-nocoreach-discovery-token': token },
    );
    expect(credential.status).toBe(200);
    expect(JSON.stringify(await credential.json())).not.toContain(token);
    const rows = (await connection
      .repository('nrVariables')
      .findMany({ filter: { name: discoveryTokenKey('1') } })) as Record<
      string,
      unknown
    >[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.secret).toBe(true);
    expect(rows[0]?.value).not.toContain(token);
    await runtime.variables.load();
    expect(runtime.variables.get(discoveryTokenKey('1'))).toBe(token);
    expect((await call('scan')).status).toBe(200);
    await service.idle('1');
    expect((await service.list('1', {})).total).toBe(3);
    const repo = await service.get('1', '880001');
    expect(
      (
        await call('review', {
          repositoryId: repo.id,
          revision: repo.revision,
          review: 'confirmed',
          favorite: true,
        })
      ).status,
    ).toBe(200);
    expect((await service.get('1', repo.id)).review).toBe('confirmed');
    expect(
      await (await call('status', { projectId: '2' })).json(),
    ).toMatchObject({
      data: { rules: [], savedCount: 0, credential: 'missing' },
    });
    const reloaded = new GitHubDiscovery(
      runtime.plugin as unknown as ConstructorParameters<
        typeof GitHubDiscovery
      >[0],
      async () => new Response('{}'),
    );
    expect((await reloaded.list('1', {})).total).toBe(3);
    await reloaded.close();
  } finally {
    await service.close();
  }
});
