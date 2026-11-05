// @vitest-environment node
import { randomBytes } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { post, setup } from './article-rewrite-app-fixture.js';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});

test('the rewrite route refuses without a chat model, and the review card keeps its changes through nrTaskWork', async ({
  testApp,
}) => {
  const { admin, body, project, task, runtime } = await setup(testApp);
  const missing = await post(admin, '/nocoreachTasks/rewrite', body());
  expect(missing.status).toBe(409);
  expect(missing.headers.get('content-type')).toContain('application/json');
  expect(await missing.json()).toMatchObject({
    error: {
      reason: 'ARTICLE_REWRITE_NO_MODEL',
      metadata: { key: 'taskExecution.defaultModelRequired' },
    },
  });
  for (const invalid of [
    body({ selection: '' }),
    body({ instruction: ' ' }),
    body({ extra: 1 }),
    body({ projectId: 'x' }),
  ])
    expect((await post(admin, '/nocoreachTasks/rewrite', invalid)).status).toBe(
      400,
    );
  expect(
    (
      await post(
        admin,
        '/nocoreachTasks/rewrite',
        body({ artifactId: 'older' }),
      )
    ).status,
  ).toBe(409);
  // The kept changes: registered, permitted to whoever may edit the article, and never a change to the task.
  const edit = (values: Record<string, unknown>) =>
    post(admin, '/nocoreach/nrTaskWork/articleEdit', {
      projectId: project,
      taskId: String(task.get('id')),
      artifactId: 'v1',
      ...values,
    });
  const opened = await edit({ op: 'open' });
  expect(opened.status).toBe(200);
  expect((await opened.json()).data).toMatchObject({
    mine: true,
    draft: null,
    lease: { until: expect.any(String) },
  });
  const form = {
    locales: {
      en: { title: 'Hello', description: '', body: '# Hello\n\nShorter.' },
    },
  };
  const saved = await edit({ op: 'save', form, ai: 1 });
  expect(saved.status).toBe(200);
  expect((await saved.json()).data.draft).toMatchObject({
    artifactId: 'v1',
    ai: 1,
    form,
  });
  const stale = await edit({ op: 'save', form, artifactId: 'older' });
  expect(stale.status).toBe(409);
  expect(JSON.stringify(await stale.json())).toContain(
    systemMessageText('taskExecution.articleVersionChanged'),
  );
  const row = await runtime.legacy.db
    .getRepository('nrTasks')
    .findOne({ filter: { id: String(task.get('id')) } });
  expect(
    (row!.get('evidence') as { work: { revision: number } }).work.revision,
  ).toBe(3);
});
