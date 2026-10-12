import { systemMessageKey } from '../../shared/i18n/messages';
import { afterEach, expect, it, vi } from 'vitest';
import { nocobaseClient } from '../../client/lib/nocoreach-api';
import {
  bilibiliRequest,
  bilibiliErrorMessage,
  bilibiliMessage,
  isBilibiliCancellation,
} from '../../client/pages/bilibili-api';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { BILIBILI_MESSAGES } from '../../server/nocoreach/bilibili-adapter';

vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: vi.fn(), wrapRequests: vi.fn() },
}));
afterEach(() => setDictionary(null));

it('sends the initiating confirmation session independently of project and revision', async () => {
  await bilibiliRequest(2, 'disconnect', { revision: 'revision' }, 'session-a');
  expect(nocobaseClient.action).toHaveBeenCalledWith(
    'nrBilibili',
    'disconnect',
    {
      method: 'POST',
      body: { projectId: '2', revision: 'revision' },
      unwrap: 'data',
      headers: { 'X-NocoReach-Confirmation-Session': 'session-a' },
    },
  );
});

it.each(Object.entries(BILIBILI_MESSAGES))(
  'translates the exact application-owned %s error across locale changes',
  (code, message) => {
    const error = Object.assign(new Error('already translated'), {
      payload: { error: { message } },
    });
    setDictionary(english);
    expect(bilibiliErrorMessage(error)).toBe(
      english[systemMessageKey(message)!],
    );
    expect(bilibiliMessage(code)).toBe(english[systemMessageKey(message)!]);
    setDictionary(null);
    expect(bilibiliErrorMessage(error)).toBe(message);
  },
);

it('preserves unknown upstream error text literally', () => {
  const raw = 'Upstream 未知：正在读取… {0}';
  setDictionary(english);
  expect(bilibiliErrorMessage(new Error(raw))).toBe(raw);
  expect(bilibiliMessage(raw)).toBe(raw);
});

it('recognizes only the exact server cancellation response across UI locales', () => {
  const cancelled = Object.assign(new Error('already translated'), {
    status: 409,
    payload: { error: { message: BILIBILI_MESSAGES.cancelled } },
  });
  for (const dictionary of [null, english]) {
    setDictionary(dictionary);
    expect(isBilibiliCancellation(cancelled)).toBe(true);
    for (const error of [
      Object.assign(new Error(BILIBILI_MESSAGES.cancelled), { status: 409 }),
      Object.assign(new Error('denied'), {
        status: 403,
        payload: cancelled.payload,
      }),
      Object.assign(new Error('conflict'), {
        status: 409,
        payload: { error: { message: BILIBILI_MESSAGES.conflict } },
      }),
      Object.assign(new Error('busy'), {
        status: 409,
        payload: { error: { message: BILIBILI_MESSAGES.busy } },
      }),
      new TypeError('Failed to fetch'),
    ])
      expect(isBilibiliCancellation(error)).toBe(false);
  }
});
