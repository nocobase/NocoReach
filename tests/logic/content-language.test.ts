// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  contentLanguageName,
  contentLanguageOf,
  contentLanguages,
} from '../../client/pages/content-language';
import { supportedLocales } from '../../shared/i18n/locales';
import { LANGUAGES } from '../../server/nocoreach/language.js';

describe('project content languages', () => {
  it('offers every UI language, the same list the server accepts', () => {
    expect([...contentLanguages]).toEqual([...supportedLocales]);
    expect(LANGUAGES).toEqual([...supportedLocales]);
  });

  it('names each language in itself, as the account menu does', () => {
    expect(contentLanguages.map(contentLanguageName)).toEqual([
      'English',
      '简体中文',
      '繁體中文',
      '日本語',
      'Español',
      'Português',
      'Français',
      'Deutsch',
      'Tiếng Việt',
      'Bahasa Indonesia',
    ]);
  });

  it('reads a project without a known language as Chinese', () => {
    expect(contentLanguageOf('ja-JP')).toBe('ja-JP');
    expect(contentLanguageOf(undefined)).toBe('zh-CN');
    expect(contentLanguageOf('fr')).toBe('zh-CN');
  });
});
