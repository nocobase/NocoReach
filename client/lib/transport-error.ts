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
    return $t('网络请求未完成，请检查网络连接后重试。');
  }
  return null;
}
