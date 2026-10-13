import { systemMessageKey } from '../../shared/i18n/messages';
import { $t, $legacyText } from '#i18n';
import { transportErrorMessage } from '#lib/transport-error';
import { nocobaseClient as api } from '#lib/nocoreach-api';
export interface BilibiliVideo {
  id: string;
  title: string | null;
  url: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  publishedAt: string | null;
  publishedAtPrecision: 'minute' | null;
  collectedAt: string;
  completeness: 'search_summary' | 'video_metadata';
  fromEarlierConfig: boolean;
  sources: { kind: 'search' | 'video'; value: string; url: string }[];
}
export interface BilibiliStatus {
  connected: boolean;
  configured: boolean;
  revision: string | null;
  collectors: { id: string; name: string }[];
  collectorId: string | null;
  terms: string[];
  bvids: string[];
  verifiedAt: string | null;
  checking: boolean;
  requestId: string | null;
  total: number;
  recent: BilibiliVideo[];
  lastRun: {
    at: string;
    ok: boolean;
    errorCode: string | null;
    retryAt: string | null;
    found: number;
    added: number;
    capped: boolean;
    partial: boolean;
  } | null;
}
export function bilibiliRequest<T>(
  projectId: number,
  action: string,
  body: object = {},
  confirmationSessionId?: string,
) {
  return api.action<T>('nrBilibili', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
    headers: confirmationSessionId
      ? { 'X-NocoReach-Confirmation-Session': confirmationSessionId }
      : undefined,
  });
}
const messages: Record<string, string> = {
  collector_unreachable: 'bilibili.cannotReachBilibiliCollectorCheck',
  collector_unauthorized: 'bilibili.bilibiliCollectorAuthenticationFailedAsk',
  tool_missing: 'common.opencliNotInstalledCollectorAsk',
  browser_unavailable: 'bilibili.collectorCannotReachBrowserOpen',
  login_required: 'bilibili.bilibiliRequiresLoginCollectionStopped',
  security_block: 'bilibili.bilibiliRequiresVerificationDeniedAccess',
  rate_limited: 'bilibili.bilibiliRequestsRateLimitedWait',
  not_found: 'bilibili.bilibiliVideoMissingDeletedUnavailable',
  invalid_response: 'bilibili.bilibiliResponseNotVerifiedNot',
  timeout: 'bilibili.bilibiliCollectionTimedOutSaved',
  unsupported: 'bilibili.collectorNotSelectedBilibiliCapability',
  unconfirmed_empty: 'bilibili.noVerifiableResultsReturnedNot',
  busy: 'common.collectorBusyAnotherRequestTry',
  invalid_input: 'bilibili.selectAvailableCollectorEnterUp',
  conflict: 'bilibili.bilibiliConfigurationChangedReloadBefore',
  not_connected: 'bilibili.saveAvailableBilibiliCollectorConfiguration',
  cancelled: 'bilibili.bilibiliCollectionStoppedSavedData',
};

export function bilibiliMessage(code: string) {
  return messages[code] ? $t(messages[code]) : code;
}

const knownErrors = new Set(Object.values(messages));
export function isBilibiliCancellation(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const response = error as Error & {
    status?: number;
    payload?: { error?: { message?: string } };
  };
  // The legacy API shares a generic 409 reason; only this exact server message
  // identifies a cancelled read, independently of the current UI locale.
  return (
    response.status === 409 &&
    systemMessageKey(response.payload?.error?.message ?? '') ===
      messages.cancelled
  );
}

export function bilibiliErrorMessage(error: Error): string {
  const transportMessage = transportErrorMessage(error);
  if (transportMessage) return transportMessage;
  // Preserve the server payload across locale changes; unknown upstream text is literal.
  const payload = (
    error as Error & { payload?: { error?: { message?: string } } }
  ).payload;
  const message = payload?.error?.message ?? error.message;
  return knownErrors.has(systemMessageKey(message) ?? message)
    ? $legacyText(message)
    : message;
}
