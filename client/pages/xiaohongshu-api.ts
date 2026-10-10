import { nocobaseClient as api } from '#lib/nocoreach-api';
export const xiaohongshuRequest = <T>(
  projectId: number,
  action: string,
  values: object = {},
) =>
  api.action<T>('nrXiaohongshu', action, {
    method: 'POST',
    body: { projectId, ...values },
    unwrap: 'data',
  });
