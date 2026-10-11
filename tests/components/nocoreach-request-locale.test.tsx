import { afterEach, describe, expect, it, vi } from 'vitest';
import { $t, setDictionary } from '../../client/i18n';
import english from '../../client/i18n/en.json';
import {
  nocobaseClient,
  NocoReachHttpError,
} from '../../client/lib/nocoreach-api';

afterEach(() => {
  setDictionary(null);
  vi.unstubAllGlobals();
});
describe('NocoReach request error language', () => {
  it('uses the current language on each failed request without changing status, reason or payload', async () => {
    const payload = {
      error: { reason: 'FORBIDDEN', message: '只有管理员能管理网络出口' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 403 })),
    );
    for (const dictionary of [english, null, english]) {
      setDictionary(dictionary);
      const error = await nocobaseClient
        .action('nrProxies', 'list')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(NocoReachHttpError);
      expect(error).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        payload,
        message: $t(payload.error.message),
      });
    }
  });
  it('keeps the original server message available after a failed request when the language changes', async () => {
    const payload = {
      error: { reason: 'FORBIDDEN', message: '只有管理员能管理网络出口' },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 403 })),
    );
    setDictionary(english);
    const error = await nocobaseClient
      .action('nrProxies', 'list')
      .catch((e: unknown) => e);
    for (const dictionary of [null, english, null]) {
      setDictionary(dictionary);
      expect(error).toMatchObject({
        status: 403,
        code: 'FORBIDDEN',
        payload,
        message: $t(payload.error.message),
      });
    }
  });
  it('keeps aborts and external error messages intact', async () => {
    setDictionary(english);
    const error = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw error;
      }),
    );
    await expect(nocobaseClient.action('nrSources', 'list')).rejects.toBe(
      error,
    );
  });
});
