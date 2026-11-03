import { $t } from '#i18n';
import { confirmAction } from '#components/reach/confirm';

/** Both confirmations belong to the same project, revision and authenticated owner. */
export async function confirmCollectorClear(
  resource: string,
  signal: AbortSignal,
) {
  const platform = () =>
    resource === 'nrXiaohongshu'
      ? $t('collectorPage.xiaohongshu')
      : resource === 'nrBilibili'
        ? 'Bilibili'
        : 'YouTube';
  if (
    !(await confirmAction({
      title: () => $t('collectorClear.title', { 0: platform() }),
      description: () =>
        // Clearing YouTube or Bilibili also pauses daily reading; Xiaohongshu is read by hand.
        $t(
          resource === 'nrXiaohongshu'
            ? 'collectorClear.help'
            : 'collectorClear.youtubeHelp',
          { 0: platform() },
        ),
      action: () => $t('collectorClear.continue'),
      destructive: false,
      signal,
    }))
  )
    return false;
  if (signal.aborted) return false;
  return confirmAction({
    title: () => $t('collectorClear.finalTitle'),
    description: () => $t('collectorClear.finalHelp', { 0: platform() }),
    action: () => $t('collectorClear.confirm'),
    signal,
  });
}
