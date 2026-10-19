import { nocobaseClient as api } from '#lib/nocoreach-api';
import { googleLocalFreshness } from '../../shared/google-cache.js';
import type { InsightsOverview } from '../../shared/insights-overview.js';
import type { StrategyState } from '../../shared/strategy-model.js';
import type { Area, SourceCard } from './strategy/insights-view.js';
import type { PlaybookList } from './playbook-model.js';
import { taskRecords } from './reach-data.js';
import { request } from './strategy/service.js';
import { useFreshData } from './workspace-cache.js';

// Hand a navigation's just-finished reads to its page without immediately
// repeating them. Older snapshots stay visible while the page revalidates.
export const navigationFreshness = { staleTime: 1000 };
type Query<T> = {
  key: string;
  read: () => Promise<T>;
  freshness?: { staleTime: number; retryDelay?: number };
};
export function useWorkspaceQuery<T>(query: Query<T> | null) {
  return useFreshData(
    query?.key ?? null,
    () => query!.read(),
    query?.freshness ?? navigationFreshness,
  );
}
export const tasksQuery = <T>(projectId: number): Query<T[]> => ({
  key: `project-tasks:${projectId}`,
  read: () => taskRecords<T>(projectId),
});
export const insightsQuery = (projectId: number): Query<InsightsOverview> => ({
  key: `insights-overview:${projectId}`,
  read: () => request<InsightsOverview>(projectId, 'overview'),
});
export const strategyQuery = (projectId: number): Query<StrategyState> => ({
  key: `strategy-state:${projectId}`,
  read: () => request<StrategyState>(projectId, 'state'),
});
export const situationQuery = (
  projectId: number,
): Query<{ areas: Area[] }> => ({
  key: `insights-summary:${projectId}`,
  read: () =>
    api.action('nrInsights', 'summary', {
      method: 'POST',
      body: { projectId },
      unwrap: 'data',
    }),
});
export const metricsQuery = (
  projectId: number,
): Query<{ cards: SourceCard[] }> => ({
  key: `data-view:overview:${projectId}:${JSON.stringify({ range: '28' })}`,
  read: () =>
    api.action('nrDataViews', 'overview', {
      method: 'POST',
      body: { projectId, range: '28' },
      unwrap: 'data',
    }),
  freshness: googleLocalFreshness,
});
export const playbooksQuery = (projectId: number): Query<PlaybookList> => ({
  key: `project-playbooks:${projectId}`,
  read: () =>
    api.action('nrPlaybooks', 'list', {
      method: 'POST',
      body: { projectId: String(projectId) },
      unwrap: 'data',
    }),
});
export type TaskMember = { id: string; name: string };
export const taskMembersQuery = (projectId: number): Query<TaskMember[]> => ({
  key: `task-members:${projectId}`,
  read: async () => {
    const members = await api.action<TaskMember[]>('nrTaskWork', 'members', {
      method: 'POST',
      body: { projectId: String(projectId) },
      unwrap: 'data',
    });
    return Array.isArray(members) ? members : [];
  },
});

// No page components or mutation/analysis endpoints belong in this map.
export const navigationQueries: Record<
  string,
  (projectId: number) => Query<unknown>[]
> = {
  'growth-overview': (id) => [
    insightsQuery(id),
    tasksQuery(id),
    situationQuery(id),
    metricsQuery(id),
  ],
  'opportunity-library': (id) => [
    strategyQuery(id),
    tasksQuery(id),
    playbooksQuery(id),
    taskMembersQuery(id),
  ],
  'action-center': (id) => [tasksQuery(id)],
};
