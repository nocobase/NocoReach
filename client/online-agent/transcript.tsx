/* eslint-disable @eslint-react/no-array-index-key -- durable events are append-only within one keyed run */
import { $t, isChinese } from '#i18n';
import { Markdown } from '../pages/doc-view.js';
import type { OnlineRun } from '../../shared/online-agent.js';
import { OnlineApiError } from './api.js';
import { OnlineError } from './controls.js';
export function OnlineTranscript({
  run,
  status = run.status,
}: {
  run: OnlineRun;
  status?: OnlineRun['status'];
}) {
  return (
    <article className='flex min-w-0 flex-col gap-3 break-words'>
      <p className='text-sm text-muted-foreground'>
        {run.agentName} · {run.model.model} ·{' '}
        <span role='status'>{$t(`onlineAgent.status.${status}`)}</span>
      </p>
      {run.events.map((event, index) =>
        event.type === 'text' ? (
          <Markdown key={index} content={event.text} />
        ) : event.type === 'toolCall' || event.type === 'toolResult' ? (
          <details
            key={index}
            className='min-w-0 rounded-md border p-3 text-sm'
          >
            <summary className='cursor-pointer break-all'>
              {$t(
                event.type === 'toolCall'
                  ? 'onlineAgent.toolCall'
                  : 'onlineAgent.toolResult',
              )}{' '}
              · {event.name}
            </summary>
            <pre className='mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-all'>
              {event.type === 'toolCall'
                ? JSON.stringify(event.args, null, 2)
                : event.output}
            </pre>
          </details>
        ) : null,
      )}
      {!run.events.length && run.output && <Markdown content={run.output} />}
      {run.error && <OnlineError error={new OnlineApiError(409, run.error)} />}
      <p className='text-xs text-muted-foreground'>
        {$t('onlineAgent.usage', {
          0: run.usage.inputTokens,
          1: run.usage.outputTokens,
        })}{' '}
        ·{' '}
        {new Date(run.createdAt).toLocaleString(
          isChinese() ? 'zh-CN' : 'en-US',
        )}
      </p>
    </article>
  );
}
