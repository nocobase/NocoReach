import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen } from '@testing-library/react';
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
    expect(screen.getByText(/Last attempt:/)).toHaveTextContent(/Oct 15/);
    expect(screen.getByText(/Last successful query:/)).toHaveTextContent(
      /Oct 12/,
    );
    expect(screen.getByText(/Next retry eligible from:/)).toHaveTextContent(
      /hourly scan/,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('20000 / 50401');
    expect(screen.getByRole('alert')).toHaveTextContent('safe-task');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'reported cost is zero',
    );
    await act(() => runtime.changeLanguage('zh-CN'));
    expect(screen.getByText(/最近尝试：/)).toBeInTheDocument();
    expect(screen.getByText(/最近成功查询：/)).toBeInTheDocument();
    expect(screen.getByText(/下次重试最早时间：/)).toHaveTextContent(
      '按小时扫描',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('费用为零');
  } finally {
    disconnect();
    cleanup();
    setDictionary(null);
  }
});
