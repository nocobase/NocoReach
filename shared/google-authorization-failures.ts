import type { MessageKey } from './i18n/messages.js';

/** What each reason a Google authorization callback fails with (server/nocoreach/oauth-errors.ts) tells the person:
 * on Data sources › Google right after the redirect and while the attempt is recorded, and in Data health. */
export const GOOGLE_AUTHORIZATION_FAILURES: Readonly<
  Record<string, MessageKey>
> = {
  network_timeout: 'google.serverTimedOutConnectingGoogle',
  network_unreachable: 'google.serverCannotReachGoogleCheck',
  state_expired: 'google.authorizationSessionNoLongerValid',
  authorization_denied: 'google.googleNotApproveAuthorizationCheck',
  initiator_access_denied: 'google.initiatorAccessDenied',
  missing_token: 'google.googleNotReturnCompleteOffline',
  missing_permissions: 'google.authorizationLacksReadAccessAnalytics',
  invalid_grant: 'google.googleAuthorizationCodeExpiredAlready',
  invalid_client: 'google.googleRejectedClientAskAdmin',
  google_api_error: 'google.googleApiReturnedErrorTry',
  save_failed: 'google.notSaveGoogleAuthorizationAsk',
  callback_failed: 'google.authorizationCallbackFailedAskAdmin',
};

/** The message key for a callback reason; the reason may come from the address, so only listed ones count. */
export function authorizationFailureKey(
  reason: string,
): MessageKey | undefined {
  return Object.hasOwn(GOOGLE_AUTHORIZATION_FAILURES, reason)
    ? GOOGLE_AUTHORIZATION_FAILURES[reason]
    : undefined;
}
