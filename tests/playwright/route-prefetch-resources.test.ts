import { test as base, expect, type Route } from '@playwright/test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview, type PreviewServer } from 'vite';
import { routePrefetchPlugin } from '../../scripts/route-prefetch.js';
import { startupMessagesPlugin } from '../../scripts/startup-messages.js';

type Site = {
  url: string;
  resources: string[];
  requests: string[];
  stall: () => void;
};
// Build the real scheduler/import integration. Do not intercept requests in the
// cache-reuse test: Playwright routing disables the browser HTTP cache.
const test = base.extend<{ site: Site }>({
  site: async ({ page }, runFixture) => {
    const root = await mkdtemp(path.join(tmpdir(), 'nr-prefetch-browser-'));
    const app = fileURLToPath(new URL('../../', import.meta.url));
    let server: PreviewServer | undefined;
    const stalled = new Set<import('node:http').ServerResponse>();
    try {
      await mkdir(path.join(root, 'client/pages/strategy'), {
        recursive: true,
      });
      await writeFile(
        path.join(root, 'client/pages/strategy/index.tsx'),
        "import './style.css'; globalThis.pageExecuted = true; export default () => null;",
      );
      await writeFile(
        path.join(root, 'client/pages/strategy/style.css'),
        '.page {color: red}',
      );
      await writeFile(
        path.join(root, 'client/pages/nocoreach-page.tsx'),
        'globalThis.gateExecuted = true; export default () => null;',
      );
      await writeFile(
        path.join(root, 'client/pages/members.tsx'),
        'globalThis.membersExecuted = true; export default () => null;',
      );
      await writeFile(
        path.join(root, 'login.js'),
        'export default () => null;',
      );
      await writeFile(
        path.join(root, 'index.html'),
        '<html><head></head><body><textarea aria-label="Draft"></textarea><button id="login">Login</button><button id="open">Open page</button><div class="page">Content</div><div id="menu"></div><script type="module" src="/entry.js"></script></body></html>',
      );
      await writeFile(
        path.join(root, 'entry.js'),
        `
        import { scheduleRoutePrefetch } from ${JSON.stringify(path.join(app, 'client/routing/route-prefetch.ts'))};
        import { loadRouteModule } from ${JSON.stringify(path.join(app, 'client/routing/route-modules.ts'))};
        import { preloadInitialPageResources } from ${JSON.stringify(path.join(app, 'client/routing/initial-page-resources.ts'))};
        import { reloadOnStaleBuild } from ${JSON.stringify(path.join(app, 'client/lib/stale-build.ts'))};
        import { createElement } from ${JSON.stringify(fileURLToPath(import.meta.resolve('react')))};
        import { createRoot } from ${JSON.stringify(fileURLToPath(import.meta.resolve('react-dom/client')))};
        import { MemoryRouter } from ${JSON.stringify(fileURLToPath(import.meta.resolve('react-router')))};
        import { createTestI18nRuntime, TestI18nProvider } from ${JSON.stringify(fileURLToPath(import.meta.resolve('@nocobase/i18n/testing')))};
        import { AppSidebarProvider } from ${JSON.stringify(path.join(app, 'client/layouts/components/app-sidebar.tsx'))};
        import { NavigationMenu } from ${JSON.stringify(path.join(app, 'client/layouts/components/navigation-menu.tsx'))};
        reloadOnStaleBuild();
        if (new URLSearchParams(location.search).has('initial')) preloadInitialPageResources('/nested');
        window.preloadErrors = 0;
        window.hintErrors = 0;
        window.hintLoads = [];
        window.addEventListener('error', (event) => {
          if (event.target instanceof HTMLLinkElement && event.target.rel === 'prefetch') window.hintErrors++;
        }, true);
        document.addEventListener('load', (event) => {
          if (event.target instanceof HTMLLinkElement && event.target.rel === 'prefetch') window.hintLoads.push(event.target.href);
        }, true);
        window.addEventListener('vite:preloadError', () => window.preloadErrors++);
        const loader = async () => {
          const [page] = await Promise.all([import('./client/pages/strategy/index.tsx'), import('./client/pages/nocoreach-page.tsx')]);
          return page;
        };
        const items = [
          {route: {id:'home', name: 'growth-overview', path: '/home', navigation: {title:'Insights'}, packageName:'fixture', source: 'application', componentLoader: loader}, children: []},
          {route: {id:'members', name: 'members', path: '/members', navigation: {title:'Members'}, packageName:'fixture', source: 'application', componentLoader: () => import('./client/pages/members.tsx')}, children: []},
        ];
        const stop = scheduleRoutePrefetch(items);
        createTestI18nRuntime({strict: false}).then(runtime => {
          createRoot(document.querySelector('#menu')).render(
            createElement(TestI18nProvider, {runtime},
              createElement(MemoryRouter, null,
                createElement(AppSidebarProvider, null,
                  createElement(NavigationMenu, {items, label:'Menu', onPrefetchIntent: (name) => {window.lastIntent=name; stop.prioritize(name);}})
                )
              )
            )
          );
        });
        document.querySelector('#login').onclick = async () => {
          await loadRouteModule(() => import('./login.js'));
          document.querySelector('#login').textContent = 'Login ready';
        };
        document.querySelector('#open').onclick = async () => {
          stop();
          await loadRouteModule(loader);
          document.querySelector('#open').textContent = 'Page ready';
        };
      `,
      );
      const options = {
        root,
        configFile: false as const,
        cacheDir: path.join(root, '.cache'),
        logLevel: 'silent' as const,
        esbuild: { jsx: 'automatic' as const },
      };
      const result = await build({
        ...options,
        base: './',
        plugins: [
          startupMessagesPlugin({ appRoot: app }),
          routePrefetchPlugin(),
        ],
      });
      if (Array.isArray(result) || !('output' in result))
        throw new Error('Unexpected output');
      const manifest = result.output.find((item) =>
        item.fileName.startsWith('assets/route-prefetch-'),
      );
      if (!manifest) throw new Error('Missing manifest');
      const resources: string[] = JSON.parse(
        await readFile(path.join(root, 'dist', manifest.fileName), 'utf8'),
      )['growth-overview'];
      const requests: string[] = [];
      let stall = false;
      server = await preview({
        ...options,
        base: '/nested/',
        plugins: [
          {
            name: 'record-fixture-requests',
            configurePreviewServer(server) {
              server.middlewares.use((request, _response, next) => {
                requests.push(request.url!);
                if (
                  stall &&
                  String(request.headers['sec-purpose']).includes('prefetch')
                ) {
                  stalled.add(_response);
                  _response.on('close', () => stalled.delete(_response));
                  return;
                }
                next();
              });
            },
          },
        ],
        preview: {
          host: '127.0.0.1',
          port: 0,
          headers: { 'Cache-Control': 'public, max-age=3600' },
        },
      });
      const address = server.httpServer.address();
      if (!address || typeof address === 'string')
        throw new Error('No preview address');
      await runFixture({
        url: `http://127.0.0.1:${address.port}/nested/`,
        resources,
        requests,
        stall: () => {
          stall = true;
        },
      });
    } finally {
      for (const response of stalled) response.destroy();
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      if (server)
        await new Promise<void>((resolve, reject) =>
          server!.httpServer.close((error) =>
            error ? reject(error) : resolve(),
          ),
        );
      await rm(root, { recursive: true, force: true });
    }
  },
});

test('downloads the initial URL assets before page execution and reuses them on authorized opening', async ({
  page,
  site,
}) => {
  await page.goto(site.url + '?initial');
  await page.waitForFunction((files) => {
    const resources = performance.getEntriesByType('resource');
    return files.every((file) =>
      resources.some((entry) =>
        new URL(entry.name).pathname.endsWith('/assets/' + file),
      ),
    );
  }, site.resources);
  expect(
    await page.evaluate(
      () => (globalThis as { pageExecuted?: boolean }).pageExecuted,
    ),
  ).toBeUndefined();
  expect(
    await page.evaluate(
      () => (globalThis as { gateExecuted?: boolean }).gateExecuted,
    ),
  ).toBeUndefined();
  await expect(page.locator('.page')).not.toHaveCSS('color', 'rgb(255, 0, 0)');
  const counts = () =>
    site.resources.map(
      (file) =>
        site.requests.filter((url) =>
          url.split('?')[0].endsWith('/assets/' + file),
        ).length,
    );
  const before = counts();
  await page.locator('#open').click();
  await expect(page.locator('#open')).toHaveText('Page ready');
  await expect(page.locator('.page')).toHaveCSS('color', 'rgb(255, 0, 0)');
  expect(counts()).toEqual(before);
  expect(site.requests.some((url) => url.includes('/api/'))).toBe(false);
});

// A deliberately stalled request can lower Chromium's network-quality estimate
// for later contexts. Keep this cache-reuse fixture on a stable fast connection;
// slow/data-saving guards are covered by the scheduler's unit tests.
test.use({
  launchOptions: {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ['--force-effective-connection-type=4G'],
  },
});

test('failed or stalled background resources never reload the page or hold up unrelated navigation', async ({
  page,
  site,
}) => {
  const hints: Route[] = [];
  await page.route('**/assets/**', async (route) => {
    if (route.request().headers()['sec-purpose']?.includes('prefetch'))
      hints.push(route);
    else await route.continue();
  });
  let navigations = 0;
  page.on('domcontentloaded', () => {
    navigations++;
  });
  await page.goto(site.url);
  await page.getByRole('textbox', { name: 'Draft' }).fill('unsaved draft');
  await expect.poll(() => hints.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Login ready' })).toBeVisible({
    timeout: 2000,
  });
  await hints.shift()!.fulfill({ status: 404, body: 'missing' });
  await expect.poll(() => hints.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await hints.shift()!.fulfill({ status: 404, body: 'missing' });
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, 'hintErrors')))
    .toBe(2);
  await expect(page.getByRole('textbox', { name: 'Draft' })).toHaveValue(
    'unsaved draft',
  );
  expect(
    await page.evaluate(() => ({
      errors: Reflect.get(globalThis, 'preloadErrors'),
      page: Reflect.get(globalThis, 'pageExecuted'),
      gate: Reflect.get(globalThis, 'gateExecuted'),
    })),
  ).toEqual({ errors: 0, page: undefined, gate: undefined });
  expect(navigations).toBe(1);
});

test('opening a successfully prefetched page reuses JS and CSS without executing them early', async ({
  page,
  site,
}) => {
  await page.goto(site.url);
  await page.getByRole('textbox', { name: 'Draft' }).fill('unsaved draft');
  await expect
    .poll(
      () => page.evaluate(() => Reflect.get(globalThis, 'hintLoads').length),
      { timeout: 15_000 },
    )
    .toBe(site.resources.length);
  expect(
    await page.evaluate(() => [
      Reflect.get(globalThis, 'pageExecuted'),
      Reflect.get(globalThis, 'gateExecuted'),
    ]),
  ).toEqual([undefined, undefined]);
  await expect(page.locator('.page')).not.toHaveCSS('color', 'rgb(255, 0, 0)');
  await page.getByRole('button', { name: 'Open page' }).click();
  await expect(page.getByRole('button', { name: 'Page ready' })).toBeVisible({
    timeout: 2000,
  });
  await expect(page.locator('.page')).toHaveCSS('color', 'rgb(255, 0, 0)');
  expect(
    await page.evaluate(() => [
      Reflect.get(globalThis, 'pageExecuted'),
      Reflect.get(globalThis, 'gateExecuted'),
    ]),
  ).toEqual([true, true]);
  for (const file of site.resources) {
    expect(
      site.requests.filter((url) => url === `/nested/assets/${file}`),
      file,
    ).toHaveLength(1);
  }
  await expect(page.getByRole('textbox', { name: 'Draft' })).toHaveValue(
    'unsaved draft',
  );
});

test('opening the same page while its speculative request is stalled does not wait for the hint', async ({
  page,
  site,
}) => {
  site.stall();
  await page.goto(site.url);
  await expect
    .poll(
      () =>
        site.requests.some((url) =>
          site.resources.some((file) => url.endsWith('/' + file)),
        ),
      { timeout: 15000 },
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Open page' }).click();
  await expect(page.getByRole('button', { name: 'Page ready' })).toBeVisible({
    timeout: 2000,
  });
});

test('real menu hover and keyboard focus warm only the intended non-idle page', async ({
  page,
  site,
}) => {
  await page.goto(site.url);
  const target = page.getByRole('link', { name: 'Members', exact: true });
  await expect(target).toBeVisible();
  await expect
    .poll(
      () => page.evaluate(() => Reflect.get(globalThis, 'hintLoads').length),
      { timeout: 15000 },
    )
    .toBe(site.resources.length);
  expect(site.requests.some((url) => /members-.*\.js/.test(url))).toBe(false);
  await target.hover();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, 'lastIntent')))
    .toBe('members');
  await expect
    .poll(() => site.requests.some((url) => /members-.*\.js/.test(url)))
    .toBe(true);
  expect(
    await page.evaluate(() => Reflect.get(globalThis, 'membersExecuted')),
  ).toBeUndefined();
  await page.reload();
  await page.mouse.move(1000, 700);
  await target.focus();
  await expect
    .poll(() => page.evaluate(() => Reflect.get(globalThis, 'lastIntent')))
    .toBe('members');
  await expect
    .poll(() =>
      page.evaluate(() =>
        Reflect.get(globalThis, 'hintLoads').some((url: string) =>
          /members-.*\.js/.test(url),
        ),
      ),
    )
    .toBe(true);
  expect(
    await page.evaluate(() => Reflect.get(globalThis, 'membersExecuted')),
  ).toBeUndefined();
});
