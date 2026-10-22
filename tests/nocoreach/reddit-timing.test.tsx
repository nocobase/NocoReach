import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';
import {
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import {
  RedditTiming,
  type RedditTimingState,
} from '../../client/pages/reddit-timing';

test('Reddit timing distinguishes attempts, cached success and retry timing in both languages', async () => {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  const disconnect = connectLocale(runtime);
  const state: RedditTimingState = {
    lastRun: {
      at: '2026-10-15T12:00:00Z',
      ok: false,
      lastSuccessAt: '2026-10-12T12:00:00Z',
    },
    schedule: { kind: 'retry', nextAt: '2026-10-15T13:00:00Z' },
    diagnostics: [
      {
        term: 'NocoBase',
        reason: 'temporary',
        providerCode: 20000,
        taskCode: 50401,
        taskId: 'safe-task',
      },
    ],
  };
  function Timing() {
    useNocoReachLocale();
    return <RedditTiming state={state} />;
  }
  try {
    render(
      <I18nProvider runtime={runtime}>
        <Timing />
      </I18nProvider>,
    );
    // One line: the last success and the next search; the last attempt and the codes are in info tips.
    expect(screen.getByText(/Last success:/)).toHaveTextContent(/Oct 12/);
    expect(screen.getByText(/Last success:/)).toHaveTextContent(/Next retry:/);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'no charge was made',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('20000');
    await userEvent.click(
      screen.getByRole('button', { name: 'Search timing' }),
    );
    expect(await screen.findByText(/Last attempt:/)).toHaveTextContent(
      /Oct 15/,
    );
    await userEvent.keyboard('{Escape}');
    await userEvent.click(screen.getByRole('button', { name: 'Diagnostics' }));
    expect(await screen.findByText(/20000 \/ 50401/)).toHaveTextContent(
      'safe-task',
    );
    await userEvent.keyboard('{Escape}');
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(screen.getByText(/上次成功：/)).toHaveTextContent(/下次重试：/);
    expect(screen.getByRole('alert')).toHaveTextContent('没有扣费');
  } finally {
    disconnect();
    cleanup();
    setDictionary(null);
  }
});
