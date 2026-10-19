import { test as base, expect, type Route } from '@playwright/test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview, type PreviewServer } from 'vite';
import { routePrefetchPlugin } from '../../scripts/route-prefetch.js';

type Site = { url: string; resources: string[]; requests: string[] };
// Build the real scheduler/import integration. Do not intercept requests in the
// cache-reuse test: Playwright routing disables the browser HTTP cache.
const test = base.extend<{ site: Site }>({
  site: async ({ page }, runFixture) => {
    const root = await mkdtemp(path.join(tmpdir(), 'nr-prefetch-browser-'));
    const app = fileURLToPath(new URL('../../', import.meta.url));
    let server: PreviewServer | undefined;
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
        path.join(root, 'login.js'),
        'export default () => null;',
      );
      await writeFile(
        path.join(root, 'index.html'),
        '<html><head></head><body><textarea aria-label="Draft"></textarea><button id="login">Login</button><button id="open">Open page</button><div class="page">Content</div><script type="module" src="/entry.js"></script></body></html>',
      );
      await writeFile(
        path.join(root, 'entry.js'),
        `
        import { scheduleRoutePrefetch } from ${JSON.stringify(path.join(app, 'client/routing/route-prefetch.ts'))};
        import { loadRouteModule } from ${JSON.stringify(path.join(app, 'client/routing/route-modules.ts'))};
        import { reloadOnStaleBuild } from ${JSON.stringify(path.join(app, 'client/lib/stale-build.ts'))};
        reloadOnStaleBuild();
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
        const stop = scheduleRoutePrefetch([{route: {name: 'growth-overview', source: 'application', componentLoader: loader}, children: []}]);
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
      };
      const result = await build({
        ...options,
        base: './',
        plugins: [routePrefetchPlugin()],
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
      server = await preview({
        ...options,
        base: '/nested/',
        plugins: [
          {
            name: 'record-fixture-requests',
            configurePreviewServer(server) {
              server.middlewares.use((request, _response, next) => {
                requests.push(request.url!);
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
      });
    } finally {
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
  const hints: Route[] = [];
  await page.route('**/assets/**', async (route) => {
    if (route.request().headers()['sec-purpose']?.includes('prefetch'))
      hints.push(route);
    else await route.continue();
  });
  await page.goto(site.url);
  await expect.poll(() => hints.length, { timeout: 15_000 }).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Open page' }).click();
  await expect(page.getByRole('button', { name: 'Page ready' })).toBeVisible({
    timeout: 2000,
  });
});
