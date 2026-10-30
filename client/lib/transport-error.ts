import { $t } from '#i18n';

/** Browser failures have no server response; their diagnostics are not user-facing copy. */
export function transportErrorMessage(error: Error): string | null {
  const { status, payload } = error as Error & {
    status?: number;
    payload?: unknown;
  };
  if (
    payload == null &&
    (status === 0 || (status === undefined && error instanceof TypeError))
  ) {
    return $t('transportError.networkRequestFailedCheckConnection');
  }
  return null;
}

/**
 * NocoReach did not answer: no response at all, or a gateway's 502-504 page without NocoReach's own error. The server
 * was briefly unreachable (often restarting for an update), so the same action is worth trying again in a moment.
 */
export function serviceUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const { status, payload } = error as Error & {
    status?: number;
    payload?: unknown;
  };
  if (status === undefined || status === 0)
    return error instanceof TypeError || status === 0;
  return (
    status >= 502 &&
    status <= 504 &&
    !(payload && typeof payload === 'object' && 'error' in payload)
  );
}
