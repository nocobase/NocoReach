// @vitest-environment node
import {
  resolveAppClientContributions,
  type AppClientRegisteredRoute,
} from '@nocobase/app-client/plugins';
import { I18nRuntime } from '@nocobase/i18n';
import { describe, expect, it } from 'vitest';
import routes from '../../client/routes.js';
import plugins from '../../client/plugins.js';
import locales from '../../client/locales/index.js';

const resolved = resolveAppClientContributions([
  { packageName: 'nocoreach', source: 'application', routes },
  ...plugins.plugins.map((plugin) => ({
    packageName: plugin.packageName,
    source: 'plugin' as const,
    routes: plugin.routes,
  })),
]);
const flatten = (
  tree: readonly AppClientRegisteredRoute[],
): AppClientRegisteredRoute[] =>
  tree.flatMap((route) => [route, ...flatten(route.children ?? [])]);
const pages = flatten(resolved.routes);

describe('migrated management routes', () => {
  it.each([
    ['/settings/users', 'page', 'users', 'access'],
    ['/settings/api-keys', 'page', 'api-keys', 'access'],
    ['/settings/schedules', 'settings', 'scheduler.schedules', 'read'],
    [
      '/settings/schedules/:scheduleId',
      'settings',
      'scheduler.schedules',
      'read',
    ],
    ['/settings/notifications/logs', 'page', 'notification.logs', 'access'],
    ['/settings/database-explorer', 'page', 'database-explorer', 'access'],
    [
      '/settings/authorization/permission-sets',
      'settings',
      'authorization.permission-sets',
      'read',
    ],
    [
      '/settings/authorization/inspector',
      'settings',
      'authorization.inspector',
      'inspect',
    ],
    [
      '/settings/authorization/default-access',
      'settings',
      'authorization.default-access',
      'read',
    ],
    [
      '/settings/authorization/sharing-rules',
      'settings',
      'authorization.sharing-rules',
      'read',
    ],
    [
      '/settings/authorization/restriction-rules',
      'settings',
      'authorization.restriction-rules',
      'read',
    ],
  ])('preserves %s and its stored grant', (path, type, id, action) => {
    const matches = pages.filter(
      (route) => route.path === path && route.componentLoader,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      auth: 'required',
      source: 'application',
      authz: { resource: { type, id }, action },
    });
  });

  it('keeps the official invitation route and removes Workflow pages', () => {
    expect(
      pages.filter((route) => route.path === '/invite/:token'),
    ).toHaveLength(1);
    expect(
      pages.some((route) => route.path.startsWith('/settings/workflow')),
    ).toBe(false);
  });

  it.each(['en-US', 'zh-CN'])(
    'resolves management menu labels in %s',
    async (locale) => {
      const i18n = new I18nRuntime({
        defaultLocale: 'en-US',
        locales: ['en-US', 'zh-CN'],
        applicationNamespace: 'nocoreach',
      });
      for (const plugin of plugins.plugins) {
        if (plugin.locales)
          i18n.registerNamespace(plugin.packageName, plugin.locales);
      }
      i18n.registerApplicationNamespace('nocoreach', locales);
      await i18n.init(locale);
      for (const route of pages.filter(
        (entry) => entry.path.startsWith('/settings') && entry.navigation,
      )) {
        const key = route.navigation!.title;
        const translated = i18n.getFixedT(route.packageName)(key);
        expect(translated, `${locale}: ${route.path}`).not.toBe(key);
        expect(translated, `${locale}: ${route.path}`).not.toContain(':');
      }
    },
  );
});
