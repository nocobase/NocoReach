import { afterEach, expect, it } from 'vitest';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { bilibiliErrorMessage } from '../../client/pages/bilibili-api';
import { xiaohongshuErrorMessage } from '../../client/pages/xiaohongshu-errors';

afterEach(() => setDictionary(null));
const chinese = '网络请求未完成，请检查网络连接后重试。';
const translated =
  'The network request failed. Check your connection and try again.';

for (const format of [bilibiliErrorMessage, xiaohongshuErrorMessage]) {
  it.each([
    new TypeError('Failed to fetch'),
    new TypeError('NetworkError when attempting to fetch resource.'),
    new TypeError(
      'Load failed: https://example.test/?token=private-diagnostic',
    ),
    Object.assign(new Error('private transport diagnostic'), { status: 0 }),
  ])(
    `${format.name} localizes transport failures without exposing diagnostics: %s`,
    (error) => {
      setDictionary(null);
      expect(format(error)).toBe(chinese);
      setDictionary(english);
      expect(format(error)).toBe(translated);
      setDictionary(null);
      expect(format(error)).toBe(chinese);
    },
  );

  it(`${format.name} preserves an actual server diagnostic even when it resembles a browser failure`, () => {
    const error = Object.assign(new TypeError('Failed to fetch'), {
      status: 502,
      payload: { error: { message: 'Upstream: public resource unavailable' } },
    });
    for (const dictionary of [null, english]) {
      setDictionary(dictionary);
      expect(format(error)).toBe('Upstream: public resource unavailable');
    }
  });
}
