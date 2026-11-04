// Google ends the authorization of an app left in Testing status seven days after it was given, when the app asks for
// more than basic sign-in (NocoReach reads Analytics and Search Console). The refusal is noticed at the next request,
// which may be the next daily sync, so a refusal from just before seven days to about a day after most likely ended that
// way; Data sources › Google then says how to stop it (client/pages/google-connection.tsx).
export const TESTING_AUTHORIZATION_MS = 7 * 86400000;
const EARLIEST_MS = TESTING_AUTHORIZATION_MS - 3600000;
const LATEST_MS = TESTING_AUTHORIZATION_MS + 86400000 + 3600000;

/** Whether an authorization given at `authorizedAt` and refused at `failedAt` lasted about the seven days of Testing. */
export function lastedTestingWeek(
  authorizedAt: unknown,
  failedAt: unknown,
): boolean {
  if (typeof authorizedAt !== 'string' || typeof failedAt !== 'string')
    return false;
  const lasted = Date.parse(failedAt) - Date.parse(authorizedAt);
  return (
    Number.isFinite(lasted) && lasted >= EARLIEST_MS && lasted <= LATEST_MS
  );
}

/** The last authorization attempt that failed, as google-oauth-callback.ts recorded it on the Google link. */
export function failedAttempt(
  link: { get(field: string): unknown } | null | undefined,
): { at: string; reason: string } | null {
  const at = link?.get('authAttemptFailedAt');
  if (typeof at !== 'string' || !at) return null;
  const reason = link?.get('authAttemptReason');
  return {
    at,
    reason: typeof reason === 'string' && reason ? reason : 'callback_failed',
  };
}
