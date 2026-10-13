import { afterEach, expect, it } from 'vitest';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import mockPlugin from '../../app-plugins/nocoreach-mock/client/index.js';
import applicationRoutes from '../../client/routes.js';

afterEach(() => document.getElementById('nocobase-runtime-config')?.remove());
function setEnvironment(config: unknown) {
  document.getElementById('nocobase-runtime-config')!.textContent =
    JSON.stringify({
      version: 1,
      config: {},
      public: { nocoreachMock: config },
    });
}
it.each([
  undefined,
  { enabled: false, environment: 'demo' },
  { enabled: true, environment: 'production' },
])('omits navigation and direct page route for %j', (config) => {
  setEnvironment(config);
  const plugin = mockPlugin({ page: () => null });
  const resolved = resolveAppClientContributions([
    {
      packageName: '@nocoreach/app-plugin-mock',
      routes: plugin.routes,
      source: 'plugin',
    },
  ]);
  expect(resolved.routes).toEqual([]);
});

it('registers the mock settings page beneath NocoReach Settings with authenticated access and bilingual navigation', async () => {
  setEnvironment({ enabled: true, environment: 'demo' });
  const Page = () => null;
  const plugin = mockPlugin({ page: Page, parent: 'nocoreach:nav-settings' });
  const resolved = resolveAppClientContributions([
    {
      packageName: 'nocoreach',
      routes: applicationRoutes,
      source: 'application',
    },
    {
      packageName: '@nocoreach/app-plugin-mock',
      routes: plugin.routes,
      source: 'plugin',
    },
  ]);
  const settings = resolved.routes.find(
    (route) => route.name === 'nav-settings',
  );
  const route = settings?.children?.find(
    (route) => route.name === 'mock-integrations',
  );
  expect(route).toMatchObject({
    path: '/mock-integrations',
    auth: 'required',
    authz: 'skip',
    navigation: { title: 'mockData', order: 4 },
  });
  await expect(route?.componentLoader?.()).resolves.toEqual({ default: Page });
  expect(plugin.locales).toHaveProperty('en-US');
  expect(plugin.locales).toHaveProperty('zh-CN');
});

it('keeps the compatibility route without a duplicate settings menu when the host owns profile configuration', () => {
  setEnvironment({ enabled: true, environment: 'demo' });
  const plugin = mockPlugin({ page: () => null, navigation: false });
  const resolved = resolveAppClientContributions([
    {
      packageName: '@nocoreach/app-plugin-mock',
      routes: plugin.routes,
      source: 'plugin',
    },
  ]);
  expect(resolved.routes).toHaveLength(1);
  expect(resolved.routes[0]).toMatchObject({
    path: '/mock-integrations',
    auth: 'required',
  });
  expect(resolved.routes[0].navigation).toBeFalsy();
});
