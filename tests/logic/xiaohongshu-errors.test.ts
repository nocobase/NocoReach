// @vitest-environment node
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';
import { setDictionary } from '../../client/i18n';
import english from '../../client/i18n/en.json';
import { xiaohongshuErrorMessage } from '../../client/pages/xiaohongshu-errors';
import { XHS_MESSAGES } from '../../server/nocoreach/xiaohongshu-adapter';

afterEach(() => setDictionary(null));
const source = readFileSync(
  new URL('../../server/nocoreach/xiaohongshu-source.ts', import.meta.url),
  'utf8',
);
const fixed = [...source.matchAll(/fail\('([^']+)'/g)].map((m) => m[1]);
it('covers all eight fixed service errors and eleven adapter errors in both languages', () => {
  expect(fixed).toHaveLength(8);
  for (const message of [...fixed, ...Object.values(XHS_MESSAGES)]) {
    const error = new Error(message);
    setDictionary(null);
    expect(xiaohongshuErrorMessage(error)).toBe(message);
    setDictionary(english);
    const translated = (english as Record<string, string>)[message];
    expect(translated).toBeTruthy();
    expect(translated).not.toBe(message);
    expect(xiaohongshuErrorMessage(error)).toBe(translated);
  }
});
it.each([
  '保存连接',
  '网络超时；用户自己的错误',
  'prefix 小红书连接已变更，请刷新后重试。',
  'External <error> {0}',
])('keeps unknown upstream error %s byte-for-byte', (message) => {
  setDictionary(english);
  expect(xiaohongshuErrorMessage(new Error(message))).toBe(message);
});
