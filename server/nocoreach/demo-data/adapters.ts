import type { DemoConfigurationService } from '@nocobase/app-plugin-demo-mode/server/tokens';
import type { Connections } from '../plugin.js';
import type { DemoHost } from './host.js';
import {
  executeDemoAgent,
  pageText,
  type DemoAgentInput,
} from './demo-agent.js';

/** The demo's simulations: external sources answered by the demo world, and the Demo Agent. */
export function registerDemoAdapters(
  connections: Connections,
  configuration: DemoConfigurationService,
): void {
  const host = connections as DemoHost;
  configuration.registerMock({
    id: 'nocoreach.sources',
    title: 'External sources',
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
      return host.demoProjects.worldRequest(
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
        // The demo site's own page, from the world the demo projects' requests are answered with.
        const response = await host.demoProjects.worldRequest(projectId, url);
        if (response.status === 404) return 'missing';
        return response.ok ? pageText(await response.text()) : null;
      }),
  });
}
