import { afterEach, expect, it, vi } from 'vitest';
import { nocobaseClient } from '../../client/lib/nocoreach-api';
import {
  bilibiliRequest,
  bilibiliErrorMessage,
  bilibiliMessage,
} from '../../client/pages/bilibili-api';
import { setDictionary } from '../../client/i18n';
import english from '../../client/i18n/en.json';
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
      english[message as keyof typeof english],
    );
    expect(bilibiliMessage(code)).toBe(
      english[message as keyof typeof english],
    );
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
