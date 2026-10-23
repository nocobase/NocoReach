import type { ChatAgent } from '@nocobase/app-plugin-agents/shared/conversations';

/** Runner agents only: the plugin's built-in native agent stays out of the panel, which has its own online chat. */
export function runnerAgents(
  agents: readonly ChatAgent[] | undefined,
): ChatAgent[] {
  return (agents ?? []).filter((agent) => agent.id !== 'online');
}
