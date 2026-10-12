import { systemMessageKey } from '../../shared/i18n/messages';
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import english from '../../shared/i18n/en.json';
import { DataHealth, assess } from '../../server/nocoreach/data-health';

const raw = '分析。任务。';
const modelError = '请先在“AI 团队 → 模型”配置默认模型';
const at = new Date().toISOString();
const failed = { at, ok: false, errors: [raw], lastSuccessAt: null };
const plugin = (title?: string) => ({
  link: async () => null,
  env: () => '',
  community: {
    state: async () => ({
      origin: 'https://example.invalid',
      title,
      topics: { one: {} },
      retainedFrom: '2026-10-01',
      lastSync: failed,
    }),
  },
  packages: {
    state: async () => ({
      packages: [{ title: raw }],
      daily: {},
      lastSync: failed,
    }),
  },
  hackernews: {
    state: async () => ({
      terms: [raw],
      mentions: { one: {} },
      retainedFrom: '2026-10-01',
      lastSync: failed,
    }),
  },
  reddit: {
    state: async () => ({ terms: [raw], posts: { one: {} }, lastRun: failed }),
  },
  trends: {
    state: async () => ({ terms: [raw], keywords: [{}], lastRun: failed }),
  },
  competitors: {
    state: async () => ({ list: [{ name: raw }], track: {}, lastRun: failed }),
  },
  xSource: { state: async () => ({ terms: [raw], cap: 5, lastRun: failed }) },
  analysis: {
    status: async () => ({
      last: { ...failed, errors: [modelError] },
      schedule: { enabled: true, cron: null },
    }),
  },
});

describe('live health presentation metadata', () => {
  it('retains assess legacy messages while separating system prefixes from raw upstream errors', () => {
    const now = Date.now();
    for (const [ok, lastSuccessAt, key] of [
      [false, null, '同步失败超过 1 天：{0}'],
      [
        false,
        new Date(now - 3600000).toISOString(),
        '上次同步失败，将自动重试：{0}',
      ],
      [true, new Date(now - 3600000).toISOString(), '部分数据未更新：{0}'],
    ] as const) {
      const item = assess({
        now,
        lastSuccessAt,
        attempt: { at, ok, errors: [raw] },
      });
      expect(item.message).toBe(key.replace('{0}', raw));
      expect(item.messageText).toEqual({
        key: systemMessageKey(key),
        params: { 0: { systemError: raw } },
      });
    }
  });

  it('distinguishes a custom forum name equal to a system key from the default forum name', async () => {
    const custom = (
      await new DataHealth(plugin('社区论坛')).list('1')
    ).items.find((item) => item.id === 'discourse')!;
    expect(custom.name).toBe('社区论坛');
    expect(custom).not.toHaveProperty('nameText');
    const fallback = (await new DataHealth(plugin()).list('1')).items.find(
      (item) => item.id === 'discourse',
    )!;
    expect(fallback.name).toBe('社区论坛');
    expect(fallback.nameText).toEqual({
      key: systemMessageKey('社区论坛'),
      params: {},
    });
  });

  it('keeps package labels, queries and competitor names as raw values without persistent changes', async () => {
    const { items } = await new DataHealth(plugin(raw)).list('1');
    const byId = (id: string) => items.find((item) => item.id === id)!;
    expect(byId('packages').note).toBe(raw);
    expect(byId('packages')).not.toHaveProperty('noteText');
    expect(byId('hackernews').note).toBe(
      `搜索 ${raw}，已保存 1 条，从 2026-10-01 开始`,
    );
    for (const id of ['hackernews', 'reddit', 'trends', 'competitors', 'x']) {
      expect(byId(id).note).toContain(raw);
      expect(byId(id).noteText.params[0]).toBe(raw);
    }
    expect(byId('daily-analysis').message).toBe(
      `同步失败超过 1 天：${modelError}`,
    );
    expect(byId('daily-analysis').messageText.params[0]).toEqual({
      systemError: modelError,
    });
    expect(byId('daily-analysis').note).toBe('由 NocoBase 工作流按 计划 运行');
  });

  it('has English entries for every Chinese system template, including nested suffixes', async () => {
    const { items } = await new DataHealth(plugin()).list('1');
    const inspect = (
      text: { key: string; params?: Record<string, unknown> } | undefined,
    ) => {
      if (!text) return;
      expect(text.key).not.toMatch(/[一-鿿]/u);
      if (text.key.includes('.'))
        expect(Object.hasOwn(english, text.key)).toBe(true);
      for (const value of Object.values(text.params || {})) {
        if (value && typeof value === 'object' && 'key' in value)
          inspect(value as { key: string });
      }
    };
    for (const item of items) {
      inspect(item.nameText);
      inspect(item.noteText);
      inspect(item.messageText);
    }
  });
});
