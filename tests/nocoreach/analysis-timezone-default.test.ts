// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { DailyAnalysis } from '../../server/nocoreach/daily-analysis';
import { snoozeInstant } from '../../server/nocoreach/execution/snooze';

afterEach(() => vi.unstubAllEnvs());
it.each([
  ['UTC', '2026-11-11T09:00:00.000Z'],
  ['Asia/Shanghai', '2026-11-11T01:00:00.000Z'],
  ['America/New_York', '2026-11-11T14:00:00.000Z'],
])(
  'reports the effective server timezone when none is configured in %s',
  async (timezone, instant) => {
    vi.stubEnv('TZ', timezone);
    const analysis = new DailyAnalysis({}, async () => ({ text: '' }));
    vi.spyOn(analysis, 'state').mockResolvedValue({});
    const definition = {
      id: 'schedule',
      enabled: true,
      config: { repeat: '0 9 * * *', timezone: null },
    };
    vi.spyOn(analysis, 'workflow').mockResolvedValue({
      get: (key: keyof typeof definition) => definition[key],
    });
    expect((await analysis.status('1')).schedule.timezone).toBe(timezone);
    expect(
      snoozeInstant(
        '2026-11-11',
        (await analysis.status('1')).schedule.timezone,
      )?.toISOString(),
    ).toBe(instant);
    expect(snoozeInstant('2026-11-11')?.toISOString()).toBe(instant);
    expect(definition.config.timezone).toBeNull();
  },
);
it('retains an explicit configured timezone and leaves absent schedules absent', async () => {
  vi.stubEnv('TZ', 'UTC');
  const analysis = new DailyAnalysis({}, async () => ({ text: '' }));
  vi.spyOn(analysis, 'state').mockResolvedValue({});
  const workflow = vi.spyOn(analysis, 'workflow').mockResolvedValue({
    get: (key: string) =>
      key === 'config'
        ? { repeat: '0 9 * * *', timezone: 'Asia/Shanghai' }
        : key === 'id'
          ? 'schedule'
          : true,
  });
  expect((await analysis.status('1')).schedule.timezone).toBe('Asia/Shanghai');
  workflow.mockResolvedValue(null);
  expect((await analysis.status('1')).schedule).toBeNull();
});
