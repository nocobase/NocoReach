// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, expect, vi } from 'vitest';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import {
  demoDataToken,
  demoConfigurationToken,
} from '@nocobase/app-plugin-demo-mode/server/tokens';
import { onlineAgentsToken } from '../../server/providers/online-agents';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { createDemoTest, json } from './demo-data-app-fixture';

// Its conversation stays queued, which would block the full cleanup other read-only tests make.
const conversationTest = createDemoTest();

describe('read-only demo conversations', () => {
  const test = conversationTest;
  test('enables integrated demo chat by default and preserves explicit disabled overrides', async ({
    testApp,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const demo = testApp.application.container.resolve(demoDataToken);
    const online = testApp.application.container.resolve(onlineAgentsToken);
    const demoConfiguration = testApp.application.container.resolve(
      demoConfigurationToken,
    );
    const read = vi.fn(async () => 'local result');
    const mock = vi.fn(async () => 'simulated result');
    expect(
      await demoConfiguration.runChatTool('daily_analysis', {
        readOnly: true,
        run: read,
      }),
    ).toBe('local result');
    expect(
      await demoConfiguration.runChatTool('query_data', {
        readOnly: true,
        run: read,
      }),
    ).toBe('local result');
    expect(
      await demoConfiguration.runChatTool('read_page', { run: read, mock }),
    ).toBe('simulated result');
    expect(read).toHaveBeenCalledTimes(2);
    expect(mock).toHaveBeenCalledTimes(1);

    await expect(online.resolveModel()).resolves.toEqual({
      modelService: demo.models.serviceName,
      model: 'demo-chat',
    });
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const initial = await (await admin.fetch('/demoMode/configuration')).json();
    expect(
      (
        await admin.fetch('/demoMode/configuration/chat', {
          method: 'PUT',
          headers: json,
          body: JSON.stringify({
            expectedRevision: initial.data.revision,
            value: { enabled: true, tools: {} },
          }),
        })
      ).status,
    ).toBe(200);
    expect(
      await online.resolveModel({
        modelService: 'real-service',
        model: 'real-model',
      }),
    ).toEqual({ modelService: demo.models.serviceName, model: 'demo-chat' });
    expect(
      (
        await admin.fetch('/demoMode/data/import', {
          method: 'POST',
          headers: json,
          body: JSON.stringify({ language: 'zh-CN' }),
        })
      ).status,
    ).toBe(200);
    await demo.whenIdle();
    const [main] = (await runtime.plugin.projects.all()) as { id: number }[];
    const ask = (projectId: string | null) =>
      admin.fetch('/onlineAgents/conversations', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({
          requestId: randomUUID(),
          agentId: 'online-default',
          projectId,
          text: '最近的搜索流量怎么样？',
        }),
      });
    const refused = await ask(String(main!.id));
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      error: { reason: 'DEMO_READ_ONLY' },
    });
    const configuration = (await (
      await admin.fetch('/demoMode/configuration')
    ).json()) as {
      data: { revision: number };
    };
    expect(
      (
        await admin.fetch('/demoMode/configuration/collections', {
          method: 'PUT',
          headers: json,
          body: JSON.stringify({
            expectedRevision: configuration.data.revision,
            value: ['nrOnlineAgentRecords'],
          }),
        })
      ).status,
    ).toBe(200);
    const allowed = await ask(String(main!.id));
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({
      data: {
        projectId: String(main!.id),
        model: { modelService: 'demo-model' },
      },
    });
    // General chat retains the same ownership checks and explicit persistence permission.
    const general = await ask(null);
    expect(general.status).toBe(200);
    const created = (await general.json()).data;
    const member = await signIn(testApp, {
      email: 'chencheng@acme.example',
      password: 'chencheng123',
    });
    expect(
      (await member.fetch(`/onlineAgents/conversations/${created.id}`)).status,
    ).toBe(404);
    expect(
      (
        await member.fetch('/demoMode/configuration/chat', {
          method: 'PUT',
          headers: json,
          body: JSON.stringify({
            expectedRevision: 2,
            value: { enabled: false, tools: {} },
          }),
        })
      ).status,
    ).toBe(403);
    const current = (
      await (await admin.fetch('/demoMode/configuration')).json()
    ).data;
    expect(
      (
        await admin.fetch('/demoMode/configuration/chat', {
          method: 'PUT',
          headers: json,
          body: JSON.stringify({
            expectedRevision: current.revision,
            value: { enabled: false, tools: {} },
          }),
        })
      ).status,
    ).toBe(200);
    await expect(online.resolveModel()).rejects.toMatchObject({
      reason: 'DEMO_CHAT_DISABLED',
    });
  });
});
