import { afterEach, expect, it, vi } from 'vitest';

const configElement = document.getElementById('nocobase-runtime-config')!;
const originalConfig = configElement.textContent;

afterEach(() => {
  configElement.textContent = originalConfig;
  vi.resetModules();
});

it.each([false, true])(
  'registers Demo management and its navigation only when demo mode is %s',
  async (enabled) => {
    const payload = JSON.parse(originalConfig!);
    payload.public = { demoMode: { enabled } };
    configElement.textContent = JSON.stringify(payload);
    vi.resetModules();
    const { nocoReachRoutes } =
      await import('../../client/nocoreach-routes.js');
    const settings = nocoReachRoutes.routes.find(
      (route) => route.name === 'nav-settings',
    );
    const demo = settings?.children?.find(
      (route) => route.name === 'demo-data',
    );
    if (enabled) {
      expect(demo).toMatchObject({
        path: '/demo-data',
        navigation: { title: 'nocoreach.nav.demoData' },
        auth: 'required',
        authz: {
          resource: { type: 'page', id: 'demo-data' },
          action: 'access',
        },
      });
      await expect(demo!.componentLoader!()).resolves.toMatchObject({
        default: expect.any(Function),
      });
    } else {
      expect(demo).toBeUndefined();
    }
    expect(settings?.children?.some((route) => route.name === 'members')).toBe(
      true,
    );
  },
);
