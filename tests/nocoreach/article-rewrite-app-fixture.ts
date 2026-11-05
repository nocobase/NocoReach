import { randomUUID } from 'node:crypto';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { nocoReachToken } from '../../server/providers/nocoreach.js';

// The rewrite route's application tests (article-rewrite-app.test.ts, article-rewrite-mock-app.test.ts).

export type Client = Awaited<ReturnType<typeof signIn>>;
export type TestApp = Parameters<typeof signIn>[0];
export const post = (
  client: Client,
  url: string,
  body: unknown,
  headers = {},
) =>
  client.fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'http://localhost',
      ...headers,
    },
    body: JSON.stringify(body),
  });

/** A project with an article task whose first version waits for review, written straight into the database. */
export async function setup(testApp: TestApp) {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const project = String(
    (
      await runtime.plugin.projects.create({
        name: `Rewrite ${randomUUID()}`,
        domain: `rewrite-${randomUUID()}.example`,
      })
    ).id,
  );
  const at = new Date().toISOString();
  const work = {
    schemaVersion: 2,
    revision: 3,
    stage: 'flow',
    plan: null,
    planVersion: 0,
    step: 0,
    results: [
      {
        id: 'v1',
        stepId: 'write',
        planVersion: 0,
        version: 1,
        content: 'Wrote the post.',
        createdAt: at,
        createdBy: 'agent',
        article: {
          targetId: 'cms',
          articleId: null,
          baseKey: null,
          baseVersion: null,
          draft: {
            slug: 'hello',
            locales: {
              en: {
                title: 'Hello',
                body: '# Hello\n\nA long first sentence. Another one.',
              },
            },
          },
          changes: ['en.title', 'en.body'],
        },
      },
      null,
    ],
    history: [],
    operations: [],
    receipt: null,
    verification: null,
    flow: {
      id: 'blog-post',
      name: 'Blog post',
      version: 1,
      stages: [
        { key: 'write', name: 'Write', kind: 'agent' },
        { key: 'review', name: 'Review', kind: 'review' },
      ],
    },
    stageIndex: 1,
  };
  const task = await runtime.legacy.db.getRepository('nrTasks').create({
    values: {
      projectId: project,
      taskKey: randomUUID(),
      title: 'Write the hello post',
      brief: 'A short welcome',
      evidence: { work },
    },
  });
  const body = (over: Record<string, unknown> = {}) => ({
    projectId: project,
    taskId: String(task.get('id')),
    artifactId: 'v1',
    locale: 'en',
    title: 'Hello',
    description: '',
    body: '# Hello\n\nA long first sentence. Another one.',
    selection: 'A long first sentence. Another one.',
    instruction: 'Make it shorter',
    ...over,
  });
  return { runtime, admin, project, task, body };
}
