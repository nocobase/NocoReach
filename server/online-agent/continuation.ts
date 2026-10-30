import type {
  ModelMessage,
  ModelToolCall,
} from '@nocobase/app-plugin-agents/server/tokens';
import type { OnlineEvent, OnlineRun } from '../../shared/online-agent.js';

/** Told to the model after the part of its reply that was kept, when the owner continues a reply that stopped partway. */
export const CONTINUE_PROMPT =
  'Your previous reply was cut off before it was finished. The reader already sees everything you wrote above. ' +
  'Continue exactly where it ends: do not repeat any of it, do not start over or summarize it, and add no preface. ' +
  'Use the tool results above rather than reading the same data again.';

/**
 * What a reply that stopped partway keeps when it is continued. Its last, unfinished line is dropped (half a table row
 * or sentence), so the continuation starts on a fresh line and the reply reads as one; tool calls that never got their
 * result are dropped too, so the model reads that data again. Text with no line break is kept whole.
 */
export function keptPart(
  run: Pick<OnlineRun, 'events' | 'output'>,
): Pick<OnlineRun, 'events' | 'output'> {
  const answered = new Set(
    run.events.flatMap((event) =>
      event.type === 'toolResult' ? [event.id] : [],
    ),
  );
  const events = run.events
    .filter((event) => event.type !== 'toolCall' || answered.has(event.id))
    .map((event) => ({ ...event }));
  let start = events.length;
  while (
    start > 0 &&
    !['toolCall', 'toolResult'].includes(events[start - 1].type)
  )
    start--;
  const trailing = events
    .slice(start)
    .flatMap((event) => (event.type === 'text' ? [event.text] : []))
    .join('');
  const lineEnd = trailing.lastIndexOf('\n');
  let drop = lineEnd < 0 ? 0 : trailing.length - lineEnd - 1;
  const output = run.output.slice(0, run.output.length - drop);
  for (let index = events.length - 1; drop > 0 && index >= start; index--) {
    const event = events[index];
    if (event.type !== 'text') continue;
    const cut = Math.min(drop, event.text.length);
    event.text = event.text.slice(0, event.text.length - cut);
    drop -= cut;
  }
  return {
    events: events.filter((event) => event.type !== 'text' || event.text),
    output,
  };
}

/**
 * A reply's stored events as the model messages that produced them: each step's text and the tool calls that got a
 * result, followed by those results. Calls without a result are left out, as the model must not see a call unanswered.
 */
export function replay(events: readonly OnlineEvent[]): ModelMessage[] {
  const messages: ModelMessage[] = [];
  let text = '',
    calls: ModelToolCall[] = [],
    results = new Map<string, string>();
  const close = () => {
    const done = calls.filter((call) => results.has(call.id));
    if (text || done.length)
      messages.push({
        role: 'assistant',
        content: text,
        ...(done.length ? { toolCalls: done } : {}),
      });
    for (const call of done)
      messages.push({
        role: 'tool',
        toolCallId: call.id,
        content: results.get(call.id)!,
      });
    text = '';
    calls = [];
    results = new Map();
  };
  for (const event of events) {
    if (event.type === 'toolResult') results.set(event.id, event.output);
    else if (event.type === 'text' || event.type === 'toolCall') {
      // Results end a step: what follows them is the model's next call.
      if (results.size) close();
      if (event.type === 'text') text += event.text;
      else calls.push({ id: event.id, name: event.name, args: event.args });
    }
  }
  close();
  return messages;
}

/** The current turn as the model reads it when the owner continues it: what it kept, then the request to go on. */
export function continuation(events: readonly OnlineEvent[]): ModelMessage[] {
  const kept = replay(events);
  // After tool results the model simply takes its next step; only text it was writing needs the request.
  return kept.at(-1)?.role === 'assistant'
    ? [...kept, { role: 'user', content: CONTINUE_PROMPT }]
    : kept;
}
