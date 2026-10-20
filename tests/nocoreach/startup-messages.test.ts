import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nRuntime } from '@nocobase/i18n';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';
import aliases from '../../shared/i18n/legacy-keys.json';

afterEach(() => vi.resetModules());

describe('startup message boundary', () => {
  it('keeps browser playbook identities equal to the server after loading only workspace copy', async () => {
    vi.resetModules();
    const { loadBusinessMessages } =
      await import('../../client/i18n/message-catalog.js');
    await loadBusinessMessages('workspace');
    const client = await import('../../client/pages/playbook-catalog.js');
    const server = await import('../../shared/playbook-catalog.js');
    expect(client.SYSTEM_PLAYBOOKS).toEqual(server.SYSTEM_PLAYBOOKS);
    for (const playbook of server.SYSTEM_PLAYBOOKS)
      expect(client.stagesFor(playbook)).toEqual(server.stagesFor(playbook));
  });

  it('loads workspace copy with every historical alias, then fills other pages without changing existing values', async () => {
    vi.resetModules();
    const { messages, loadBusinessMessages } =
      await import('../../client/i18n/message-catalog.js');
    const first = loadBusinessMessages('workspace');
    expect(loadBusinessMessages('workspace')).toBe(first);
    await first;
    expect(messages.complete).toBe(false);
    expect(Object.keys(messages.chinese).length).toBeLessThan(6000);
    expect(messages.chinese['strategy.insights']).toBe(
      chinese['strategy.insights'],
    );
    expect(messages.chinese['optimizationWork.statuses']).toBe(
      chinese['optimizationWork.statuses'],
    );
    expect(messages.legacy).toEqual(aliases);
    const templates = (catalog: Record<string, string>) =>
      Object.entries(catalog).filter(([, value]) => /\{\d+\}/.test(value));
    expect(templates(messages.chinese)).toEqual(templates(chinese));
    expect(messages.english['mock.externalWritesDisabled']).toBe(
      english['mock.externalWritesDisabled'],
    );
    expect(messages.english['publicSources.singleReadExceeded']).toBe(
      english['publicSources.singleReadExceeded'],
    );
    for (const [key, value] of Object.entries(messages.chinese)) {
      expect(value).toBe(chinese[key as keyof typeof chinese]);
      expect(messages.english[key]).toBe(english[key as keyof typeof english]);
    }
    await loadBusinessMessages();
    expect(messages.complete).toBe(true);
    expect(templates(messages.chinese)).toEqual(templates(chinese));
    expect(messages.chinese).toEqual(chinese);
    expect(messages.english).toEqual(english);
    expect(messages.legacy).toEqual(aliases);
  });

  it('prepares only workspace resources before evaluating the three main menu pages', async () => {
    vi.resetModules();
    const adapter = await import('../../client/i18n/index.js');
    const { loadRouteModule } =
      await import('../../client/routing/route-modules.js');
    const { messages } = await import('../../client/i18n/message-catalog.js');
    const loader = vi.fn(async () => {
      expect(messages.complete).toBe(false);
      expect(adapter.$t('strategy.insights')).toBe(
        chinese['strategy.insights'],
      );
      return { default: () => null };
    });
    await loadRouteModule(loader, 'workspace');
    expect(loader).toHaveBeenCalledOnce();
    await adapter.prepareBusinessLocale();
    expect(messages.complete).toBe(true);
    expect(adapter.$t('strategy.insights')).toBe(chinese['strategy.insights']);
  });

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
    await Promise.all([
      loadRouteModule(loader, 'all'),
      loadRouteModule(loader, 'all'),
    ]);
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
      await expect(loadRouteModule(loader, 'all')).rejects.toThrow(
        'Catalog unavailable',
      );
      expect(loader).not.toHaveBeenCalled();
      await expect(loadRouteModule(loader, 'all')).resolves.toHaveProperty(
        'default',
      );
      expect(loader).toHaveBeenCalledOnce();
    } finally {
      vi.doUnmock('../../client/i18n/message-catalog.js');
    }
  });
});
