import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nRuntime } from '@nocobase/i18n';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';
import aliases from '../../shared/i18n/legacy-keys.json';

afterEach(() => vi.resetModules());

describe('startup message boundary', () => {
  it('keeps shell translations exact while leaving business catalogs for the route loader', async () => {
    vi.resetModules();
    const { messages, loadBusinessMessages } =
      await import('../../client/i18n/message-catalog.js');
    expect(messages.complete).toBe(false);
    expect(Object.keys(messages.chinese).length).toBeLessThan(500);
    expect(messages.chinese['strategy.insights']).toBeUndefined();
    for (const [key, value] of Object.entries(messages.chinese)) {
      expect(value).toBe(chinese[key as keyof typeof chinese]);
      expect(messages.english[key]).toBe(english[key as keyof typeof english]);
    }
    for (const [text, key] of Object.entries(messages.legacy)) {
      expect(key).toBe(aliases[text as keyof typeof aliases]);
      expect(messages.chinese).toHaveProperty([key]);
    }
    const first = loadBusinessMessages();
    expect(loadBusinessMessages()).toBe(first);
    await first;
    expect(messages.complete).toBe(true);
    expect(messages.chinese).toEqual(chinese);
    expect(messages.english).toEqual(english);
    expect(messages.legacy).toEqual(aliases);
  });

  it('attaches business resources to the official runtime and respects a language switch during loading', async () => {
    vi.resetModules();
    const adapter = await import('../../client/i18n/index.js');
    const { default: locales } = await import('../../client/locales/index.js');
    const runtime = new I18nRuntime({
      defaultLocale: 'zh-CN',
      applicationNamespace: 'nocoreach',
    });
    runtime.registerApplicationNamespace('nocoreach', locales);
    await runtime.init();
    const disconnect = adapter.connectLocale(runtime);
    try {
      expect(runtime.getFixedT('nocoreach')('strategy.insights')).toBe(
        'strategy.insights',
      );
      const loading = adapter.prepareBusinessLocale();
      await runtime.changeLanguage('en-US');
      await loading;
      expect(adapter.$t('strategy.insights')).toBe(
        english['strategy.insights'],
      );
      expect(runtime.getFixedT('nocoreach')('strategy.insights')).toBe(
        english['strategy.insights'],
      );
      expect(adapter.$legacyText('保存')).toBe('Save');
      await runtime.changeLanguage('zh-CN');
      expect(adapter.$t('strategy.insights')).toBe(
        chinese['strategy.insights'],
      );
      expect(runtime.getFixedT('nocoreach')('strategy.insights')).toBe(
        chinese['strategy.insights'],
      );
    } finally {
      disconnect();
    }
  });

  it('finishes resource preparation before evaluating a route with module-level translated constants', async () => {
    vi.resetModules();
    const { loadRouteModule } =
      await import('../../client/routing/route-modules.js');
    const { messages } = await import('../../client/i18n/message-catalog.js');
    const { $t } = await import('../../client/i18n/index.js');
    expect(messages.complete).toBe(false);
    const loader = vi.fn(async () => {
      expect(messages.complete).toBe(true);
      expect($t('strategy.insights')).toBe(chinese['strategy.insights']);
      return { default: () => null };
    });
    await Promise.all([loadRouteModule(loader), loadRouteModule(loader)]);
    expect(loader).toHaveBeenCalledOnce();
  });

  it('retries failed catalog preparation without evaluating the page prematurely', async () => {
    vi.resetModules();
    vi.doMock('../../client/i18n/message-catalog.js', async () => {
      const actual = await vi.importActual<
        typeof import('../../client/i18n/message-catalog.js')
      >('../../client/i18n/message-catalog.js');
      return {
        ...actual,
        loadBusinessMessages: vi
          .fn()
          .mockRejectedValueOnce(new Error('Catalog unavailable'))
          .mockImplementation(actual.loadBusinessMessages),
      };
    });
    try {
      const { loadRouteModule } =
        await import('../../client/routing/route-modules.js');
      const loader = vi.fn(async () => ({ default: () => null }));
      await expect(loadRouteModule(loader)).rejects.toThrow(
        'Catalog unavailable',
      );
      expect(loader).not.toHaveBeenCalled();
      await expect(loadRouteModule(loader)).resolves.toHaveProperty('default');
      expect(loader).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock('../../client/i18n/message-catalog.js');
    }
  });
});
