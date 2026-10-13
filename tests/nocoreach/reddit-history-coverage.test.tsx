import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test } from 'vitest';
import { NotesTip } from '../../client/components/reach/info-tip';
import {
  connectLocale,
  setDictionary,
  useNocoReachLocale,
} from '../../client/i18n';
import locales from '../../client/locales';
import { DataViews, windowFor } from '../../server/nocoreach/data-views';
import { RedditSource } from '../../server/nocoreach/reddit-source';

let disconnect: (() => void) | undefined;
afterEach(() => {
  disconnect?.();
  disconnect = undefined;
  cleanup();
  setDictionary(null);
});

test('known historical Reddit posts have an accurate coverage explanation in both languages', async () => {
  const state = {
    terms: ['NocoBase'],
    status: 'active',
    retainedFrom: '2026-10-10',
    posts: {
      known: {
        id: 'known',
        title: 'Historical post',
        subreddit: 'nocode',
        postedAt: '2026-10-05',
        firstSeenAt: '2026-10-10T12:00:00.000Z',
      },
    },
  };
  const host = {
    mock: { enabled: true, clock: () => '2026-10-12T12:00:00.000Z' },
    sync: { snapshots: async () => [] },
    reddit: { state: async () => state },
  };
  const reddit = new RedditSource(host);
  reddit.state = async () => state;
  const detail = await reddit.view('1', { range: '28' }, windowFor);
  const overview = await new DataViews(host).overview('1', { range: '28' });
  expect(detail.posts[0].postedAt).toBe('2026-10-05');
  expect(detail.kpis[0]).toMatchObject({
    value: 1,
    complete: false,
    change: null,
  });
  expect(
    overview.cards.find((card: { id: string }) => card.id === 'reddit')
      .metrics[0].value,
  ).toBe(1);

  const runtime = new I18nRuntime({
    defaultLocale: 'zh-CN',
    locales: ['zh-CN', 'en-US'],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', locales);
  await runtime.init();
  disconnect = connectLocale(runtime);
  function Coverage() {
    useNocoReachLocale();
    return <NotesTip notes={detail.notes} />;
  }
  render(
    <I18nProvider runtime={runtime}>
      <Coverage />
    </I18nProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: '数据说明' }));
  expect(
    await screen.findByText(
      '从 2026-10-10 开始记录，较早时段覆盖不完整，统计包含已采集的历史帖子',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/前段没有数据/)).toBeNull();
  await act(() => runtime.changeLanguage('en-US'));
  expect(
    await screen.findByText(
      'Recording since 2026-10-10; earlier coverage is incomplete, and counts include historical posts already collected',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByText(/has no data/)).toBeNull();
});
