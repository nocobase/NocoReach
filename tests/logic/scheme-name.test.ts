import { afterEach, expect, it } from 'vitest';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { schemeName } from '../../client/pages/analysis-rules/scheme-name';

afterEach(() => setDictionary(null));

// The default scheme is stored under its Chinese name, so English readers saw it untranslated on Analysis rules and,
// since 2026-11-17, in Skills › Used in daily analysis.
it("shows the stored default scheme name in the reader's language and leaves the person's own names as written", () => {
  setDictionary(english);
  expect(schemeName('默认分析')).toBe('Default analysis');
  expect(schemeName('新品发布')).toBe('新品发布');
  expect(schemeName('Launch week')).toBe('Launch week');
  expect(schemeName(undefined)).toBe('');
  setDictionary(null);
  expect(schemeName('默认分析')).toBe('默认分析');
});
