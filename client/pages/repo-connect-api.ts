import { nocobaseClient as api } from '#lib/nocoreach-api';
export type AgentStatus = {
  revision: number;
  agentId: string | null;
  repo: {
    repo: string;
    baseBranch: string;
    allowedPaths?: string[];
    contentCheck?: boolean;
  } | null;
  online: boolean;
  options: {
    id: string;
    name: string;
    online?: boolean;
    busy?: number;
  }[];
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
