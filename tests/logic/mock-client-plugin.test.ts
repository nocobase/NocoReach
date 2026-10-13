import { expect, it } from 'vitest';
import { resolveAppClientContributions } from '@nocobase/app-client/plugins';
import mockPlugin from '../../app-plugins/nocoreach-mock/client/index.js';
import applicationRoutes from '../../client/routes.js';

it('registers the mock settings page beneath NocoReach Settings with authenticated access and bilingual navigation', async () => {
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
