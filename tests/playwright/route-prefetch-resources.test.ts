import { test, expect, type Route } from '@playwright/test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, preview, type PreviewServer } from 'vite';
import { routePrefetchPlugin } from '../../scripts/route-prefetch.js';

// A built fixture exercises real browser resource hints and Vite imports without a signed-in app.
test('failed or stalled background resources never reload the page or hold up navigation', async ({
  page,
}) => {
  const root = await mkdtemp(path.join(tmpdir(), 'nr-prefetch-browser-'));
  const app = fileURLToPath(new URL('../../', import.meta.url));
  let server: PreviewServer | undefined;
  try {
    await mkdir(path.join(root, 'client/pages/strategy'), { recursive: true });
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
    await writeFile(path.join(root, 'login.js'), 'export default () => null;');
    await writeFile(
      path.join(root, 'index.html'),
      '<textarea aria-label="Draft"></textarea><button id="login">Login</button><script type="module" src="/entry.js"></script>',
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
      window.addEventListener('error', (event) => {
        if (event.target instanceof HTMLLinkElement && event.target.rel === 'prefetch') window.hintErrors++;
      }, true);
      window.addEventListener('vite:preloadError', () => window.preloadErrors++);
      scheduleRoutePrefetch([{route: {name: 'growth-overview', source: 'application',
        componentLoader: () => Promise.all([import('./client/pages/strategy/index.tsx'), import('./client/pages/nocoreach-page.tsx')])}, children: []}]);
      document.querySelector('#login').onclick = async () => {
        await loadRouteModule(() => import('./login.js'));
        document.querySelector('#login').textContent = 'Login ready';
      };
    `,
    );
    const options = {
      root,
      configFile: false as const,
      cacheDir: path.join(root, '.cache'),
      logLevel: 'silent' as const,
    };
    await build({ ...options, base: './', plugins: [routePrefetchPlugin()] });
    server = await preview({
      ...options,
      base: '/nested/',
      preview: { host: '127.0.0.1', port: 0 },
    });
    const address = server.httpServer.address();
    if (!address || typeof address === 'string')
      throw new Error('No preview address');
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
    await page.goto(`http://127.0.0.1:${address.port}/nested/`);
    await page.getByRole('textbox', { name: 'Draft' }).fill('unsaved draft');
    await expect
      .poll(() => hints.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Login ready' })).toBeVisible(
      { timeout: 2000 },
    );
    // Fail two independent resources after the foreground navigation succeeds.
    await hints.shift()!.fulfill({ status: 404, body: 'missing' });
    await expect
      .poll(() => hints.length, { timeout: 15_000 })
      .toBeGreaterThan(0);
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
});
