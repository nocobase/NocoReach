import { ApiError, apiErrorStatusFromHttp } from '@nocobase/app-server/router';

export class OnlineAgentError extends Error {
  constructor(
    readonly code: string,
    readonly status = 409,
  ) {
    super(code);
  }
}

/** The API error a refusal answers with, wherever it is thrown (an application route or the Agents plugin's). */
export function onlineApiError(error: OnlineAgentError) {
  return new ApiError({
    status: apiErrorStatusFromHttp(error.status),
    domain: 'onlineAgent',
    reason: error.code,
    message: error.code,
  });
}

/** The Agents plugin's answer for a conversation that is not there or not the caller's; any other failure is not. */
export const conversationMissing = (error: unknown) =>
  (error as { code?: unknown } | null)?.code === 'CONVERSATION_NOT_FOUND';
