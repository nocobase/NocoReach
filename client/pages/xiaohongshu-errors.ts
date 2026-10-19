import { systemMessageKey } from '../i18n/message-catalog';
import { $legacyText, $t } from '#i18n';
import { transportErrorMessage } from '#lib/transport-error';

// Only exact application-owned errors are translatable; upstream text stays intact.
const knownErrors = new Set([
  'xiaohongshu.cannotReachXiaohongshuCollectorCheck',
  'xiaohongshu.collectorAuthenticationFailedAskAdministrator',
  'common.opencliNotInstalledCollectorAsk',
  'xiaohongshu.collectorCannotReachBrowserOpen',
  'xiaohongshu.signXiaohongshuYourselfCollectorBrowser',
  'xiaohongshu.xiaohongshuRequiresVerificationRestrictedAccess',
  'xiaohongshu.collectionTimedOutPreviousSuccessful',
  'xiaohongshu.collectorReturnedIncompleteInvalidData',
  'common.collectorBusyAnotherRequestTry',
  'xiaohongshu.noVerifiableNotesReturnedCurrent',
  'xiaohongshu.collectionCanceledPreviousSuccessfulResults',
  'xiaohongshu.errors.collectorUnavailable',
  'xiaohongshu.errors.connectionChanged',
  'xiaohongshu.errors.invalidQuery',
  'xiaohongshu.errors.connectionRequired',
  'xiaohongshu.errors.resultsNotSaved',
  'xiaohongshu.errors.collectionEnded',
  'xiaohongshu.errors.alreadySaving',
]);

// Why the last collection did not finish, by its stored error code.
const runMessages: Record<string, string> = {
  collector_unreachable: 'xiaohongshu.cannotReachXiaohongshuCollectorCheck',
  collector_unauthorized:
    'xiaohongshu.collectorAuthenticationFailedAskAdministrator',
  tool_missing: 'common.opencliNotInstalledCollectorAsk',
  browser_unavailable: 'xiaohongshu.collectorCannotReachBrowserOpen',
  login_required: 'xiaohongshu.signXiaohongshuYourselfCollectorBrowser',
  security_block: 'xiaohongshu.xiaohongshuRequiresVerificationRestrictedAccess',
  timeout: 'xiaohongshu.collectionTimedOutPreviousSuccessful',
  invalid_response: 'xiaohongshu.collectorReturnedIncompleteInvalidData',
  busy: 'common.collectorBusyAnotherRequestTry',
  no_results: 'xiaohongshu.noVerifiableNotesReturnedCurrent',
  cancelled: 'xiaohongshu.collectionCanceledPreviousSuccessfulResults',
};

export function xiaohongshuRunMessage(code: string | undefined): string {
  return $t(runMessages[code || ''] || runMessages.invalid_response);
}

export function xiaohongshuErrorMessage(error: Error): string {
  const transportMessage = transportErrorMessage(error);
  if (transportMessage) return transportMessage;
  // The shared request wrapper localizes message; retain the original payload for locale changes.
  const payload = (
    error as Error & { payload?: { error?: { message?: string } } }
  ).payload;
  const message = payload?.error?.message ?? error.message;
  return knownErrors.has(systemMessageKey(message) ?? message)
    ? $legacyText(message)
    : message;
}
