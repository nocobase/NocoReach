import { nocobaseClient as api } from '#lib/nocoreach-api';
export type AgentStatus = {
  revision: number;
  repo: {
    repo: string;
    baseBranch: string;
    allowedPaths?: string[];
    contentCheck?: boolean;
  } | null;
};
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
