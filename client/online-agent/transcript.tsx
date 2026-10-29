/* eslint-disable @eslint-react/no-array-index-key -- durable events are append-only within one keyed run */
import { CornerDownRight, WrenchIcon } from 'lucide-react';
import { cn } from 'cn';
import { $t } from '#i18n';
import { formatDateTime } from '#lib/format';
import { ChatMarkdown } from '../extensions/nocobase-agent-chat/chat-markdown.js';
import {
  onlineRunActive,
  type OnlineEvent,
  type OnlineRun,
} from '../../shared/online-agent.js';
import { OnlineApiError } from './api.js';
import { OnlineError } from './controls.js';
import { parseQuote } from './quote.js';
import { toolCard, toolLabel } from './tool-cards.js';
export function OnlineTranscript({ run }: { run: OnlineRun }) {
  // Markdown must see a complete text segment, not one renderer per streaming delta.
  const parts: Extract<OnlineEvent, { type: 'text' | 'toolCall' }>[] = [];
  const results = new Map<
    string,
    Extract<OnlineEvent, { type: 'toolResult' }>
  >();
  for (const event of run.events) {
    if (event.type === 'toolResult') results.set(event.id, event);
    else if (event.type === 'text') {
      const previous = parts.at(-1);
      if (previous?.type === 'text') previous.text += event.text;
      else parts.push({ ...event });
    } else if (event.type === 'toolCall') parts.push(event);
  }
  const active = onlineRunActive(run),
    { quote, question } = parseQuote(run.input);
  const hasText = parts.some(
    (part) => part.type === 'text' && part.text.trim(),
  );
  const status =
    run.cancelRequested && active
      ? 'stopping'
      : run.status === 'running'
        ? hasText
          ? 'replying'
          : 'thinking'
        : `status.${run.status}`;
  return (
    <article className='flex min-w-0 flex-col gap-6'>
      <div className='flex justify-end' data-chat-message='user'>
        <div className='max-w-[85%] rounded-2xl bg-primary/10 px-4 py-3 text-sm'>
          <span className='sr-only'>{$t('onlineAgent.you')}</span>
          {quote && (
            <p className='mb-1 flex items-center gap-1 text-xs text-muted-foreground'>
              <CornerDownRight className='size-3 shrink-0' aria-hidden='true' />
              {quote}
            </p>
          )}
          <p className='whitespace-pre-wrap wrap-anywhere'>{question}</p>
        </div>
      </div>
      <div
        className='flex min-w-0 flex-col gap-2'
        data-chat-message='assistant'
        aria-busy={active}
      >
        <p className='flex items-center gap-2 text-sm font-medium text-muted-foreground'>
          <span
            aria-hidden='true'
            className={cn(
              'size-2 shrink-0 rounded-full',
              active ? 'bg-primary' : 'bg-muted-foreground/50',
            )}
          />
          <span className='wrap-anywhere'>{run.agentName}</span>
        </p>
        {parts.map((part, index) => {
          if (part.type === 'text')
            return <ChatMarkdown key={index} content={part.text} />;
          const card = toolCard(part.name, results.get(part.id));
          if (card)
            return <card.Card key={part.id} run={run} output={card.output} />;
          return (
            <details
              key={part.id}
              className='min-w-0 text-sm text-muted-foreground'
            >
              <summary className='cursor-pointer rounded-sm py-1 wrap-anywhere focus-visible:outline-2 focus-visible:outline-ring'>
                <WrenchIcon className='mx-1 inline size-4' aria-hidden='true' />
                {toolLabel(part.name)}
                {' · '}
                {results.has(part.id)
                  ? $t(
                      results.get(part.id)!.ok
                        ? 'onlineAgent.status.completed'
                        : 'onlineAgent.status.failed',
                    )
                  : $t(`onlineAgent.status.${run.status}`)}
              </summary>
              <div className='mt-2 flex min-w-0 flex-col gap-2 rounded-lg bg-muted p-3'>
                <p>{$t('onlineAgent.toolCall')}</p>
                <pre className='max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs'>
                  {JSON.stringify(part.args, null, 2)}
                </pre>
                {results.has(part.id) && (
                  <>
                    <p>{$t('onlineAgent.toolResult')}</p>
                    <pre className='max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs'>
                      {results.get(part.id)!.output}
                    </pre>
                  </>
                )}
              </div>
            </details>
          );
        })}
        {!hasText && run.output && <ChatMarkdown content={run.output} />}
        {(active || run.status === 'cancelled' || run.status === 'failed') && (
          <p role='status' className='text-sm text-muted-foreground'>
            {$t(`onlineAgent.${status}`)}
          </p>
        )}
        {run.error && (
          <OnlineError error={new OnlineApiError(409, run.error)} />
        )}
        {!active && (
          <details className='text-xs text-muted-foreground'>
            <summary className='w-fit cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring'>
              {$t('onlineAgent.replyDetails')}
            </summary>
            <p className='mt-1 wrap-anywhere'>
              {run.model.model} · {$t(`onlineAgent.status.${run.status}`)} ·{' '}
              {$t('onlineAgent.usage', {
                0: run.usage.inputTokens,
                1: run.usage.outputTokens,
              })}{' '}
              · {formatDateTime(run.createdAt)}
            </p>
          </details>
        )}
      </div>
    </article>
  );
}
