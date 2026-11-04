import { resolveAppUrl } from '@nocobase/app-client';
import { $legacyText, $t } from '#i18n';
import type {
  ArticleRewriteEvent,
  ArticleRewriteInput,
} from '../../../shared/article-edit.js';

// A selection's rewrite as the model writes it (server/routes/manual-tasks.ts, POST /api/nocoreachTasks/rewrite): the
// replacement arrives in pieces as newline-delimited JSON, which the pages' JSON client does not read, so it is
// fetched directly with the sign-in cookie, as the task media requests are.

const failure = (payload: unknown) => {
  const error = (
    payload as {
      error?:
        string | { message?: string; localizedMessage?: { message?: string } };
    }
  )?.error;
  const message =
    typeof error === 'string'
      ? error
      : error?.localizedMessage?.message || error?.message;
  return new Error(
    message ? $legacyText(message) : $t('articleEdit.rewriteFailed'),
  );
};

/** The pieces of the replacement, in order; throws why it stopped when it did not finish. */
export async function* streamRewrite(
  input: ArticleRewriteInput,
  signal: AbortSignal,
): AsyncGenerator<string> {
  const response = await fetch(resolveAppUrl('/api/nocoreachTasks/rewrite'), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson, application/json',
    },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok || !response.body) {
    const payload: unknown = await response.json().catch(() => null);
    throw failure(payload);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffered += decoder.decode(value, { stream: !done });
      const lines = buffered.split('\n');
      buffered = done ? '' : (lines.pop() ?? '');
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ArticleRewriteEvent;
        if ('error' in event) throw failure(event);
        if ('done' in event) return;
        if (event.text) yield event.text;
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  // The stream ended without saying it was done: the connection broke.
  throw new Error($t('articleEdit.rewriteInterrupted'));
}
