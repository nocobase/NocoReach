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
