import { nocobaseClient as api } from '#lib/nocoreach-api';

// Website source repositories (2026-10-29, shared/repo-routing.ts): each serves some of the site's addresses and keeps
// its latest check (server/nocoreach/execution/agent.ts).
export type RepoCheck = {
  at: string;
  repo: 'ok' | 'missing' | 'unknown';
  branch: 'ok' | 'missing' | 'unknown';
  runner: 'online' | 'offline';
  detail?: string;
};
export type RepoSettings = {
  id: string;
  repo: string;
  baseBranch: string;
  allowedPaths: string[];
  contentCheck?: boolean;
  urls: string[];
  check?: RepoCheck | null;
};
/** `nrAgent.repos`: the repositories, the pull request the Agent last opened in each, and the website's addresses. */
export type RepoList = {
  revision: number;
  repos: (RepoSettings & {
    lastPr: {
      number: number;
      url: string;
      title: string;
      at: string;
      taskId: string;
    } | null;
  })[];
  sites: string[];
};
/** `nrAgent.status`, as far as the Data sources page reads it. */
export type AgentStatus = { revision: number; repos: RepoSettings[] };
export const agentRequest = <T>(
  action: string,
  projectId: number,
  body: object = {},
) =>
  api.action<T>('nrAgent', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
  });
