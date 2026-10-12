import { nocobaseClient as api } from '#lib/nocoreach-api';
export const xiaohongshuRequest = <T>(
  projectId: number,
  action: string,
  values: object = {},
  confirmationSessionId?: string,
) =>
  api.action<T>('nrXiaohongshu', action, {
    method: 'POST',
    body: { projectId, ...values },
    unwrap: 'data',
    headers: confirmationSessionId
      ? { 'X-NocoReach-Confirmation-Session': confirmationSessionId }
      : undefined,
  });
