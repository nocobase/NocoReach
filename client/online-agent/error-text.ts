import { $t } from '#i18n';
import { OnlineApiError } from './api.js';

const knownErrors = new Set([
  'agentDisabled',
  'modelRequired',
  'modelUnavailable',
  'revisionConflict',
  'requestConflict',
  'runActive',
  'contextLimit',
  'timeout',
  'stalled',
  'interrupted',
  'serviceUnavailable',
  'notContinuable',
  'accessDenied',
  'sessionChanged',
  'modelAuth',
  'modelQuota',
  'modelRateLimit',
  'modelNetwork',
  'modelRejected',
  'unknown',
  'filtered',
  'length',
  'incompleteResponse',
  'emptyResponse',
  'invalidToolCall',
  'toolOutputLimit',
  'transcriptLimit',
  'stepLimit',
  'outputLimit',
]);
/**
 * What went wrong, in one sentence: a reply's stored error code, or a request's failure. A gateway's 502-504 or no
 * answer at all means NocoReach could not be reached (it may be restarting), not that anything is misconfigured.
 */
export function onlineErrorText(error: unknown) {
  if (error instanceof OnlineApiError) {
    if (error.status === 401) return $t('common.sessionExpiredSignAgain');
    if (error.status === 403) return $t('onlineAgent.accessDenied');
    if (error.status === 404) return $t('onlineAgent.notFound');
    if ([502, 503, 504].includes(error.status))
      return $t('onlineAgent.offline');
    // Replies stored before 2026-10-28 named an unexplained failure `modelFailed`.
    const code = error.code === 'modelFailed' ? 'unknown' : error.code;
    return $t(
      knownErrors.has(code)
        ? `onlineAgent.${code}`
        : 'onlineAgent.requestFailed',
    );
  }
  // `fetch` rejects with a TypeError when no answer came at all.
  if (error instanceof TypeError) return $t('onlineAgent.offline');
  return $t('onlineAgent.requestFailed');
}
