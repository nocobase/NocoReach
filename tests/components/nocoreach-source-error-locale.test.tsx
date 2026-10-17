import { healthText } from '../../client/pages/data-health';
import { assess } from '../../server/nocoreach/data-health';
import { systemMessageText } from '../../shared/i18n/messages';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import english from '../../shared/i18n/en.json';
import legacyKeys from '../../shared/i18n/legacy-keys.json';
import { $t, prepareLocale, translateSourceError } from '../../client/i18n';
import { ChatConnect } from '../../client/pages/chat-connect';
import { HackerNewsConnect } from '../../client/pages/hackernews-connect';
import { XConnect } from '../../client/pages/x-connect';
import { PackagesConnect } from '../../client/pages/packages-connect';

const { authorization } = vi.hoisted(() => ({
  authorization: { can: vi.fn(async () => false), invalidate: vi.fn() },
}));
vi.mock('@nocobase/app-plugin-authorization/client', async (original) => ({
  ...(await original<object>()),
  useAuthorizationClient: () => authorization,
  useAuthorizationRevision: () => 'test-revision',
}));

vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: {
    wrapRequests: () => {},
    action: vi.fn(async (resource: string) => {
      const run = {
        at: '2026-10-12T00:00:00Z',
        ok: false,
        read: 0,
        errors: [] as string[],
      };
      if (resource === 'nrChat')
        return {
          slack: {
            connected: true,
            name: '社区',
            bot: 'bot',
            channels: [],
            lastRun: {
              ...run,
              errors: [
                'Slack：Slack 拒绝了请求：mock_error',
                'Slack #分析：Slack 拒绝了请求：分析。未知',
              ],
            },
          },
          discord: {
            connected: true,
            name: '社区',
            bot: 'bot',
            channels: [],
            lastRun: {
              ...run,
              errors: [
                'Discord #general：Discord 拒绝了请求',
                'Discord #分析：Discord 拒绝了请求：分析',
              ],
            },
          },
        };
      if (resource === 'nrX')
        return {
          connected: true,
          terms: ['分析'],
          spend: { usd: 0, posts: 0, requests: 0 },
          lastRun: {
            ...run,
            errors: [
              'X 接口拒绝了请求',
              'X 接口拒绝了请求：',
              '未知错误：分析。任务',
            ],
          },
        };
      if (resource === 'nrPackages')
        return {
          connected: true,
          packages: [],
          lastSync: {
            ...run,
            errors: [
              '@nocobloom/core：返回的不是有效数据',
              '分析。任务：返回的不是有效数据',
              'nocobloom：未知错误：任务',
            ],
          },
        };
      return {
        connected: true,
        terms: ['分析'],
        lastSync: {
          ...run,
          errors: ['「分析」：来源返回 503', '「分析」：未知错误：任务'],
        },
      };
    }),
  },
}));
afterEach(async () => {
  cleanup();
  await prepareLocale('zh-CN');
});

test('saved source failures switch locales without translating channel names, queries or upstream details', async () => {
  render(
    <>
      <ChatConnect projectId={1} platform='slack' onChange={() => {}} />
      <ChatConnect projectId={1} platform='discord' onChange={() => {}} />
      <XConnect projectId={1} onChange={() => {}} />
      <HackerNewsConnect projectId={1} onChange={() => {}} />
    </>,
  );
  await screen.findByText(/Slack：Slack 拒绝了请求：mock_error/);
  await act(() => prepareLocale('en-US'));
  expect(
    screen.getByText(/Slack: Slack rejected the request: mock_error/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Discord #general: Discord rejected the request/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Slack #分析: Slack rejected the request: 分析。未知/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Discord #分析: Discord rejected the request: 分析/),
  ).toBeInTheDocument();
  expect(screen.getAllByText(/The X API rejected the request/)).toHaveLength(2);
  expect(
    screen.getByText(/「分析」: The source returned 503/),
  ).toBeInTheDocument();
  expect(screen.getByText(/未知错误：分析。任务/)).toBeInTheDocument();
  expect(screen.getByText(/「分析」：未知错误：任务/)).toBeInTheDocument();
  await act(() => prepareLocale('zh-CN'));
  expect(
    screen.getByText(/Slack：Slack 拒绝了请求：mock_error/),
  ).toBeInTheDocument();
  expect(screen.getByText(/「分析」：来源返回 503/)).toBeInTheDocument();
});

test('recognizes only service error grammar and preserves empty or unknown details', async () => {
  await prepareLocale('en-US');
  for (const [raw, expected] of [
    ['Slack 拒绝了请求：', 'Slack rejected the request: '],
    ['Discord 拒绝了请求', 'Discord rejected the request'],
    ['Discord 拒绝了请求：', 'Discord rejected the request: '],
    ['X 接口拒绝了请求', 'The X API rejected the request'],
    [
      'X 接口拒绝了请求：分析。任务',
      'The X API rejected the request: 分析。任务',
    ],
    ['来源返回 503', 'The source returned 503'],
    ['「任务：分析」：来源返回 503', '「任务：分析」: The source returned 503'],
    [
      'Slack：Discord #分析：Discord 拒绝了请求',
      'Slack: Discord #分析: Discord rejected the request',
    ],
    ['分析', '分析'],
    ['未知错误：分析。任务', '未知错误：分析。任务'],
    ['Discord 拒绝了请求用户备注', 'Discord 拒绝了请求用户备注'],
    ['来源返回 分析', '来源返回 分析'],
  ])
    expect(translateSourceError(raw)).toBe(expected);
  expect(translateSourceError(undefined)).toBe('');
  expect(translateSourceError('')).toBe('');
});

test('saved package malformed-data failures translate while package titles stay literal', async () => {
  render(<PackagesConnect projectId={1} onChange={() => {}} />);
  await screen.findByText(/@nocobloom\/core：返回的不是有效数据/);
  await act(() => prepareLocale('en-US'));
  expect(
    screen.getByText(/@nocobloom\/core: Returned data isn't valid/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/分析。任务: Returned data isn't valid/),
  ).toBeInTheDocument();
  expect(screen.getByText(/nocobloom：未知错误：任务/)).toBeInTheDocument();
  await act(() => prepareLocale('zh-CN'));
  expect(
    screen.getByText(/分析。任务：返回的不是有效数据/),
  ).toBeInTheDocument();
});

test('existing known transport failures still translate inside source context', async () => {
  await prepareLocale('en-US');
  const messages = [
    'Slack 请求太频繁，明天会再试',
    'Slack token 无效，请复制应用的 Bot User OAuth Token（xoxb- 开头）',
    '机器人没有权限读这个频道：请给它“查看频道”和“读取消息历史”',
    'X 的 Bearer Token 无效或已撤销，请重新复制',
    '来源读取超时，请重试',
    '来源访问受限或限流，请稍后重试',
    'Hacker News 搜索返回的不是有效数据',
  ] as const;
  for (const message of messages) {
    expect(english[legacyKeys[message]]).toBeTruthy();
    expect(translateSourceError(`「分析」：${message}`)).toBe(
      `「分析」: ${english[legacyKeys[message]]}`,
    );
  }
});

test.each(['channels:history,groups:history', '', '分析。任务，{0}'])(
  'Slack missing_scope preserves permission detail %j',
  async (permissions) => {
    const raw = systemMessageText('messages.slackAppMissingPermissionsAdd', {
      0: permissions,
    });
    await prepareLocale('en-US');
    expect(translateSourceError(raw)).toBe(
      `The Slack app is missing permissions: ${permissions}. Add them in OAuth & Permissions and reinstall`,
    );
    expect(translateSourceError(`Slack #分析：${raw}`)).toBe(
      `Slack #分析: The Slack app is missing permissions: ${permissions}. Add them in OAuth & Permissions and reinstall`,
    );
    await prepareLocale('zh-CN');
    expect(translateSourceError(raw)).toBe(raw);
  },
);

test.each([
  [
    'Slack：Slack 拒绝了请求：mock_error',
    'Slack: Slack rejected the request: mock_error',
  ],
  [
    'Discord #分析：Discord 拒绝了请求',
    'Discord #分析: Discord rejected the request',
  ],
  ['「任务」：来源返回 503', '「任务」: The source returned 503'],
  ['未知错误：分析。任务', '未知错误：分析。任务'],
])(
  'health descriptors render source failure %s and retain raw snapshots',
  async (raw, translated) => {
    const result = assess({
      lastSuccessAt: null,
      attempt: { at: '2026-10-12T00:00:00Z', ok: false, errors: [raw] },
    });
    await prepareLocale('en-US');
    expect(healthText(result.message, result.messageText)).toBe(
      $t('dataHealth.extendedFailure', { 0: translated }),
    );
    expect(healthText(raw)).toBe(raw);
    await prepareLocale('zh-CN');
    expect(healthText(result.message, result.messageText)).toBe(result.message);
  },
);
