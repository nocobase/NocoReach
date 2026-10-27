import { I18nRuntime } from '@nocobase/i18n';
import { I18nProvider } from '@nocobase/i18n/client';
import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import clientLocales from '../../client/locales/index.js';
import serverLocales from '../../server/locales/index.js';
import {
  connectLocale,
  $t,
  $legacyText,
  $legacyFragment,
  setDictionary,
} from '../../client/i18n/index.js';
import { ruleUnitLabel } from '../../client/pages/analysis-rules/labels.js';
import { useScheduleFormatting } from '../../client/pages/schedules/format.js';
import { systemMessageText } from '../../shared/i18n/messages.js';
import { resolveLocale, supportedLocales } from '../../shared/i18n/locales.js';
import { indicatorCopy } from '../../app-plugins/nocoreach-mock/client/indicator-copy.js';

let disconnect: (() => void) | undefined;
afterEach(() => {
  cleanup();
  disconnect?.();
  disconnect = undefined;
  setDictionary(null);
});

async function runtimeFor(locale: string) {
  const runtime = new I18nRuntime({
    defaultLocale: 'en-US',
    locales: [...supportedLocales],
    applicationNamespace: 'nocoreach',
  });
  runtime.registerApplicationNamespace('nocoreach', clientLocales);
  runtime.registerNamespace('@nocobase/app-plugin-agents', {
    'en-US': async () => ({ agents: { title: 'Agents' } }),
  });
  await runtime.init(locale);
  disconnect = connectLocale(runtime);
  return runtime;
}

describe('Korean and Russian application languages', () => {
  it.each([
    ['ko-KR', 'ko_KR', /[가-힣]/u],
    ['ru-RU', 'ru', /[а-яё]/iu],
  ])(
    'loads %s business, server, demo and schedule wording',
    async (locale, alias, script) => {
      expect(resolveLocale(alias)).toBe(locale);
      const runtime = await runtimeFor(locale);
      const server = await serverLocales[locale]();
      const resource = (
        'default' in server ? server.default : server
      ) as Record<string, string>;
      const t = runtime.getFixedT('nocoreach', locale);
      expect(t('nocoreach.nav.tasks')).toMatch(script);
      expect(
        runtime.getFixedT(
          '@nocobase/app-plugin-agents',
          locale,
        )('agents.title'),
      ).toMatch(script);
      expect($t('common.save')).toMatch(script);
      expect(systemMessageText('common.save', {}, locale)).toBe(
        resource['common.save'],
      );
      const userText = 'User-owned name {literal}';
      const message = systemMessageText(
        'dataHealth.retryScheduled',
        { 0: userText },
        locale,
      );
      expect(message).toMatch(script);
      expect(message).toContain(userText);
      expect(message).not.toContain('{0}');
      const signal = systemMessageText(
        'messages.starsUpUsual',
        {
          0: '2026-10-28',
          1: 50,
          2: '2.4 倍',
        },
        'zh-CN',
      );
      expect($legacyText(signal)).toContain('2.4');
      expect($legacyText(signal)).not.toMatch(/[一-鿿]/u);
      expect($legacyFragment('↑ 2.4 倍')).not.toMatch(/[一-鿿]/u);
      expect(indicatorCopy(locale).indicatorBody).toMatch(script);
      const wrapper = ({ children }: { children: ReactNode }) => (
        <I18nProvider runtime={runtime}>{children}</I18nProvider>
      );
      const { result } = renderHook(() => useScheduleFormatting(), { wrapper });
      expect(result.current.cron('0 9 * * *')).toMatch(script);
      const weekly = result.current.cron('0 9 * * 1');
      expect(weekly).toMatch(script);
      expect(weekly).not.toBe(t('schedules.customSchedule'));
    },
  );

  it('adds Korean counters to thresholds while keeping standalone editing labels', async () => {
    await runtimeFor('ko-KR');
    for (const count of [0, 1, 3, 5, 1.5]) {
      expect(ruleUnitLabel('个回答', count)).toBe('개의 답변');
      expect(ruleUnitLabel('个主题', count)).toBe('개의 주제');
    }
    expect($legacyText('个回答')).toBe('답변');
    expect($legacyText('个主题')).toBe('주제');
    expect(ruleUnitLabel('Customer-defined units', 3)).toBe(
      'Customer-defined units',
    );
  });

  it('uses Russian noun forms for one, few, many, teens and fractional thresholds', async () => {
    await runtimeFor('ru-RU');
    for (const [count, answer, page, place] of [
      [1, 'ответ', 'страница', 'место'],
      [2, 'ответа', 'страницы', 'места'],
      [5, 'ответов', 'страниц', 'мест'],
      [11, 'ответов', 'страниц', 'мест'],
      [21, 'ответ', 'страница', 'место'],
      [22, 'ответа', 'страницы', 'места'],
      [1.5, 'ответа', 'страницы', 'места'],
    ] as const) {
      expect(ruleUnitLabel('个回答', count)).toBe(answer);
      expect(ruleUnitLabel('个页面', count)).toBe(page);
      expect(ruleUnitLabel('页', count)).toBe(page);
      expect(ruleUnitLabel('位', count)).toBe(place);
    }
    for (const [unit, one, few, many] of [
      ['个主题', 'тема', 'темы', 'тем'],
      ['字', 'слово', 'слова', 'слов'],
      ['个月', 'месяц', 'месяца', 'месяцев'],
      ['分', 'балл', 'балла', 'баллов'],
    ]) {
      for (const [count, expected] of [
        [0, many],
        [1, one],
        [2, few],
        [5, many],
        [11, many],
        [21, one],
        [22, few],
        [1.5, few],
      ] as const) {
        expect(ruleUnitLabel(unit, count)).toBe(expected);
      }
    }
    expect(ruleUnitLabel('Customer-defined units', 2)).toBe(
      'Customer-defined units',
    );
  });

  it('selects Russian schedule count forms without falling back to English', async () => {
    const runtime = await runtimeFor('ru-RU');
    const t = runtime.getFixedT('nocoreach', 'ru-RU');
    for (const count of [0, 1, 2, 5, 11, 21, 22, 1.5]) {
      const text = t('schedules.items', { count });
      expect(text).toMatch(/[а-яё]/iu);
      expect(text).toContain(String(count));
      expect(text).not.toMatch(/suggestion|\{\{/);
      const summary = t('schedules.summaryClean', { count });
      expect(summary).toMatch(/[а-яё]/iu);
      expect(summary).toContain(String(count));
      const pluginText = runtime.getFixedT(
        '@nocobase/app-plugin-agents',
        'ru-RU',
      )('agents.available.group', { count, tool: 'Codex', runners: 'local' });
      expect(pluginText).toMatch(/[а-яё]/iu);
      expect(pluginText).toContain(String(count));
      expect(pluginText).not.toMatch(/models|\{\{/);
      const delivered = runtime.getFixedT(
        '@nocobase/app-plugin-agents',
        'ru-RU',
      )('transcript.inputDelivered', { count });
      expect(delivered).toMatch(/[а-яё]/iu);
      expect(delivered).toContain(String(count));
    }
  });
});
