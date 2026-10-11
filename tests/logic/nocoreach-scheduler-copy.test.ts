import { createTestI18nRuntime } from '@nocobase/i18n/testing';
import { describe, expect, it } from 'vitest';
import {
  scheduleCopy,
  scheduleReason,
} from '../../client/pages/settings/scheduler/pages/nocoreach-copy.js';
import {
  systemSchedule,
  systemOccurrence,
  missingModelEnglish,
  unknownError,
} from '../fixtures/nocoreach-schedule.js';

const namespace = '@nocobase/app-plugin-scheduler';
const runtime = await createTestI18nRuntime({
  namespaces: {
    [namespace]: {
      'en-US': () =>
        import('../../client/pages/settings/scheduler/locales/en-US.js'),
      'zh-CN': () =>
        import('../../client/pages/settings/scheduler/locales/zh-CN.js'),
    },
  },
});
const en = runtime.getFixedT(namespace, 'en-US');
const zh = runtime.getFixedT(namespace, 'zh-CN');
await runtime.changeLanguage('zh-CN');

describe('code-defined Scheduler copy', () => {
  it('localizes exact built-in fields without mutating persisted data', () => {
    const source = structuredClone(systemSchedule);
    const original = structuredClone(source);
    expect(scheduleCopy(source, en)).toEqual({
      title: 'NocoReach daily analysis',
      description: en('page.dailyAnalysis.description'),
      targetLabel: 'NocoReach daily analysis',
      targetDescription: en('page.dailyAnalysis.targetDescription'),
    });
    expect(scheduleCopy(source, zh)).toEqual({
      title: source.title,
      description: source.description,
      targetLabel: source.targetSummary.targetLabel,
      targetDescription: source.targetSummary.description,
    });
    expect(source).toEqual(original);
  });

  it.each([{ key: 'custom' }, { key: undefined }, { targetType: 'custom' }])(
    'requires both stable identity fields: %j',
    (identity) => {
      const item = { ...systemSchedule, ...identity };
      expect(scheduleCopy(item, en).title).toBe(systemSchedule.title);
      expect(scheduleCopy(item, en).description).toBe(
        systemSchedule.description,
      );
      expect(scheduleCopy(item, en).targetLabel).toBe(
        systemSchedule.targetSummary.targetLabel,
      );
      expect(scheduleCopy(item, en).targetDescription).toBe(
        systemSchedule.targetSummary.description,
      );
    },
  );

  it('preserves edited names, descriptions and interpolation-looking text', () => {
    const custom = '自定义 NocoReach 每日分析 {{id}} {0}';
    const item = {
      ...systemSchedule,
      title: custom,
      description: custom,
      targetSummary: { targetLabel: custom, description: custom },
    };
    for (const t of [en, zh])
      expect(scheduleCopy(item, t)).toEqual({
        title: custom,
        description: custom,
        targetLabel: custom,
        targetDescription: custom,
      });
    expect(
      scheduleCopy({ ...systemSchedule, title: custom }, en).targetLabel,
    ).toBe('NocoReach daily analysis');
  });

  it.each([
    [
      '运行被中断（服务重启）',
      'Execution was interrupted by a server restart.',
    ],
    ['每日分析没有注册', 'Daily analysis is not registered.'],
    ['项目不存在', 'The project does not exist.'],
    ['分析失败', 'Analysis failed'],
  ])('localizes a known system reason: %s', (reason, english) => {
    const occurrence = { ...systemOccurrence, reason };
    expect(scheduleReason(systemSchedule, occurrence, en)).toBe(english);
    expect(scheduleReason(systemSchedule, occurrence, zh)).toBe(reason);
  });

  it('translates verified project wrappers while preserving upstream error bytes', () => {
    const original = structuredClone(systemOccurrence);
    expect(scheduleReason(systemSchedule, systemOccurrence, en)).toBe(
      `Project 1: ${missingModelEnglish}; Project 2: ${unknownError}; Project 3: Analysis failed`,
    );
    expect(scheduleReason(systemSchedule, systemOccurrence, zh)).toBe(
      systemOccurrence.reason,
    );
    expect(systemOccurrence).toEqual(original);
  });

  it.each([
    { scheduleId: 'different' },
    { target: { type: 'custom' } },
    { target: undefined },
    { resultSummary: undefined },
    { resultSummary: { projects: { '1': { ok: false, error: 'different' } } } },
    { resultSummary: { projects: { '1': { error: 'missing ok' } } } },
    { resultSummary: { projects: { '1': { ok: false, error: 503 } } } },
    { reason: systemOccurrence.reason.slice(0, 60) },
    { reason: unknownError },
  ])('keeps unknown, mismatched or truncated history: %j', (change) => {
    const occurrence = { ...systemOccurrence, ...change };
    expect(scheduleReason(systemSchedule, occurrence, en)).toBe(
      occurrence.reason,
    );
  });

  it('does not translate system-looking errors on a custom schedule', () => {
    expect(
      scheduleReason(
        { ...systemSchedule, key: 'custom' },
        { ...systemOccurrence, reason: '运行被中断（服务重启）' },
        en,
      ),
    ).toBe('运行被中断（服务重启）');
  });
});
