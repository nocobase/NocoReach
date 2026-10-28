import { Info } from 'lucide-react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import {
  onlineRunContinuable,
  onlineRunPartial,
  type OnlineRun,
} from '../../shared/online-agent.js';
import { OnlineApiError } from './api.js';
import { onlineErrorText } from './error-text.js';

/**
 * A reply that stopped partway through no fault of the question (`onlineRunContinuable`): why, in one quiet line, and
 * Continue on the conversation's latest turn, which picks the reply up where it stopped (Try again when it had written
 * nothing yet). Other failures keep the red alert and are sent again by hand.
 */
export function OnlineCutOff({
  run,
  onContinue,
  busy = false,
}: {
  run: OnlineRun;
  /** Given only for the conversation's latest turn, which is the one that can be continued. */
  onContinue?: () => void;
  busy?: boolean;
}) {
  if (!onlineRunContinuable(run)) return null;
  return (
    <div
      className='flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-2 text-sm text-muted-foreground'
      data-cut-off={run.error}
    >
      <p role='status' className='flex min-w-0 flex-1 items-start gap-1.5'>
        <Info className='mt-0.5 size-4 shrink-0' aria-hidden='true' />
        <span className='wrap-anywhere'>
          {onlineErrorText(new OnlineApiError(409, run.error!))}
        </span>
      </p>
      {onContinue && (
        <Button
          type='button'
          size='sm'
          variant='outline'
          disabled={busy}
          onClick={onContinue}
        >
          {busy
            ? $t('common.working')
            : $t(
                onlineRunPartial(run) ? 'onlineAgent.continue' : 'common.retry',
              )}
        </Button>
      )}
    </div>
  );
}
