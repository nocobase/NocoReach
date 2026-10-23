import type { Agents } from '@nocobase/app-plugin-agents/server/tokens';
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

/** The owner's conversation, or null when it is not there or not theirs; any other failure is thrown. */
export const conversationOrNull = (
  agents: Agents,
  ownerId: string,
  id: string,
) =>
  agents.conversations.get(ownerId, id).catch((error: unknown) => {
    if (conversationMissing(error)) return null;
    throw error;
  });
