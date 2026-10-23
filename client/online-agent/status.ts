import { $t } from '#i18n';

/** Translate the OnlineAgent's durable execution notice on every conversation surface. */
export function executionStatusText(part: {
  readonly id?: string;
  readonly data: { readonly type?: string };
}): string | null {
  if (part.id !== 'execution-status') return null;
  switch (part.data.type) {
    case 'approval':
      return $t('onlineAgent.statusApproval');
    case 'cancelled':
      return $t('onlineAgent.statusCancelled');
    case 'failed':
      return $t('onlineAgent.statusInterrupted');
    default:
      return null;
  }
}
