import type { DemoConfigurationService } from '@nocobase/app-plugin-demo-mode/server/tokens';
import type { Connections } from '../plugin.js';
import type { DemoHost } from './host.js';
import {
  executeDemoAgent,
  pageText,
  type DemoAgentInput,
} from './demo-agent.js';
import { demoProjectsOf } from './index.js';

/** The catalog is explicit: shared snapshots, identities and credentials are never blanket-writable here. */
export function registerDemoAdapters(
  connections: Connections,
  configuration: DemoConfigurationService,
): void {
  const host = connections as DemoHost;
  configuration.registerWrite({
    id: 'nocoreach.tasks',
    title: 'Tasks',
    collection: 'nrTasks',
    operations: ['update'],
    scopes: [
      { id: 'demo-projects', title: 'Demo projects: task workflow' },
      { id: 'all', title: 'All records in this collection' },
    ],
    async checkScope(scope, input) {
      const value = input as { projectId?: string; taskId?: string };
      if (scope !== 'demo-projects' || !value.projectId || !value.taskId)
        return false;
      if (!(await demoProjectsOf(host, value.projectId)).length) return false;
      return Boolean(
        await host.db.getRepository('nrTasks').findOne({
          filter: { id: value.taskId, projectId: value.projectId },
        }),
      );
    },
  });
  configuration.registerWrite({
    id: 'nocoreach.taskWork',
    title: 'Task workflow',
    collection: 'nrSnapshots',
    operations: ['insert', 'update', 'delete'],
    scopes: [{ id: 'demo-projects', title: 'Demo projects: task workflow' }],
    async checkScope(scope, input) {
      const value = input as { projectId?: string; taskId?: string };
      if (scope !== 'demo-projects' || !value.projectId || !value.taskId)
        return false;
      if (!(await demoProjectsOf(host, value.projectId)).length) return false;
      return Boolean(
        await host.db.getRepository('nrTasks').findOne({
          filter: { id: value.taskId, projectId: value.projectId },
        }),
      );
    },
  });
  configuration.registerWrite({
    id: 'nocoreach.keywordCandidates',
    title: 'Keyword candidates',
    collection: 'nrKeywordCandidates',
    operations: ['insert', 'update', 'delete'],
    scopes: [{ id: 'all', title: 'All records in this collection' }],
  });
  configuration.registerWrite({
    id: 'nocoreach.knowledge',
    title: 'Project knowledge',
    collection: 'nrSnapshots',
    operations: ['insert', 'update', 'delete'],
    scopes: [{ id: 'demo-projects', title: 'Demo projects: knowledge only' }],
    async checkScope(scope, input) {
      const value = input as { projectId?: string };
      return (
        scope === 'demo-projects' &&
        Boolean(value.projectId) &&
        (await demoProjectsOf(host, value.projectId)).length > 0
      );
    },
  });
  for (const [id, title, collection, operations] of [
    ['nocoreach.taskCreation', 'Demo task creation', 'nrTasks', ['insert']],
    [
      'nocoreach.opportunities',
      'Demo opportunity handoff',
      'nrSnapshots',
      ['insert', 'update', 'delete'],
    ],
  ] as const)
    configuration.registerWrite({
      id,
      title,
      collection,
      operations,
      scopes: [{ id: 'demo-projects', title: 'Demo projects' }],
      async checkScope(scope, input) {
        const value = input as { projectId?: string };
        return (
          scope === 'demo-projects' &&
          Boolean(value.projectId) &&
          (await demoProjectsOf(host, String(value.projectId))).length > 0
        );
      },
    });
  // Authorized personal conversations, with optional demo project context.
  configuration.registerWrite({
    id: 'nocoreach.onlineConversations',
    title: 'Online Agent conversations',
    collection: 'nrOnlineAgentRecords',
    operations: ['insert', 'update'],
    scopes: [
      {
        id: 'demo-projects',
        title: 'Own conversations, including general chat',
      },
    ],
    async checkScope(scope, input) {
      const value = input as { projectId?: string | null };
      return (
        scope === 'demo-projects' &&
        (!value.projectId ||
          (await demoProjectsOf(host, String(value.projectId))).length > 0)
      );
    },
  });
  configuration.registerMock({
    id: 'nocoreach.sources',
    title: 'External source fixtures',
    kind: 'tool',
    scope: 'demo-projects',
    defaultEnabled: true,
    async invoke(input) {
      const value = input as {
        projectId: string;
        url: string | URL;
        init: RequestInit;
      };
      if (!(await host.demoProjects.recognize(value.projectId)))
        throw new Error('Demo source scope is required.');
      return host.demoProjects.fixtureRequest(
        value.projectId,
        value.url,
        value.init,
      );
    },
  });
  connections.demoAgent = configuration.registerAgent({
    id: 'nocoreach.runner',
    title: 'NocoReach Demo Agent',
    defaultEnabled: true,
    execute: (input: DemoAgentInput) =>
      executeDemoAgent(input, async (projectId, url) => {
        // The demo site's own page, from the fixtures the demo projects' requests are answered with.
        const response = await host.demoProjects.fixtureRequest(projectId, url);
        if (response.status === 404) return 'missing';
        return response.ok ? pageText(await response.text()) : null;
      }),
  });
}
