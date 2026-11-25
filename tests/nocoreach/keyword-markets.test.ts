import { expect, test } from 'vitest';
import {
  KEYWORD_COUNTRIES,
  countryLanguages,
  defaultLanguage,
  isKeywordMarket,
  marketName,
} from '../../shared/keyword-markets';
import { researchQueryUsd } from '../../shared/keyword-research';

test('the market list: each country once with its main language first, only the pairs DataForSEO supports', () => {
  const codes = KEYWORD_COUNTRIES.map(([code]) => code);
  expect(new Set(codes).size).toBe(codes.length);
  expect(defaultLanguage(2702)).toBe('en');
  expect(countryLanguages(2702)).toEqual(['en', 'zh-CN']);
  expect(defaultLanguage(2158)).toBe('zh-TW');
  expect(isKeywordMarket(2702, 'zh-CN')).toBe(true);
  expect(isKeywordMarket('2702', 'zh-CN')).toBe(true);
  expect(isKeywordMarket(2702, 'ja')).toBe(false);
  expect(isKeywordMarket(2156, 'zh-CN')).toBe(false);
  expect(isKeywordMarket(2702, undefined)).toBe(false);
});

test('a market is named in the reader’s language, Chinese by its script', () => {
  expect(marketName({ locationCode: 2702, language: 'zh-CN' })).toBe(
    'Singapore · Simplified Chinese',
  );
  expect(marketName({ locationCode: 2702, language: 'zh-CN' }, 'zh-CN')).toBe(
    '新加坡 · 简体中文',
  );
  expect(
    marketName({ locationCode: 2158, language: 'zh-TW' }, 'en-US', () => 'X'),
  ).toBe('X · Traditional Chinese');
});

test('each research method is one query at the list price', () => {
  expect(researchQueryUsd('related', 100)).toBe(0.024);
  expect(researchQueryUsd('serp', 20)).toBe(0.002);
});
