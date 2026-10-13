// Run with: pnpm exec tsx --test tests/nocoreach/task-table-layout.browser.ts
// Browser checks are separate from the jsdom suite and require Playwright Chromium.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { chromium, expect, type Browser } from '@playwright/test';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { createServer, type ViteDevServer } from 'vite';
// eslint-disable-next-line vitest/no-import-node-test -- Keep this opt-in browser runner outside the jsdom suite.
import { after, before, test } from 'node:test';

let server: ViteDevServer;
let browser: Browser;
let cacheDir: string;
let url: string;
const root = resolve(import.meta.dirname, '../..');
before(
  async () => {
    cacheDir = await mkdtemp(resolve(tmpdir(), 'pm-290-vite-'));
    server = await createServer({
      configFile: false,
      root,
      cacheDir,
      plugins: [
        {
          name: 'fixture-membership',
          enforce: 'pre',
          load(id) {
            if (id === resolve(root, 'client/pages/me.tsx'))
              return 'export const useMe = () => ({ can: () => !new URLSearchParams(location.search).has("readonly") });';
          },
        },
        react({ exclude: [/node_modules/, /\/deps\//] }),
        tailwind(),
      ],
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { entries: ['tests/fixtures/task-table.html'] },
      resolve: { dedupe: ['react', 'react-dom'] },
    });
    await server.listen();
    url = server.resolvedUrls!.local[0];
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    });
    await mkdir(resolve(root, 'storage/pm-290/screenshots'), {
      recursive: true,
    });
  },
  { timeout: 90000 },
);
after(async () => {
  await browser?.close();
  await server?.close();
  if (cacheDir) await rm(cacheDir, { recursive: true, force: true });
});

for (const width of [375, 390, 941, 1440]) {
  for (const preset of ['compact', 'default']) {
    test(
      `${width}px ${preset}: readable titles and keyboard actions`,
      { timeout: 90000 },
      async () => {
        const page = await browser.newPage({
          viewport: { width, height: 844 },
        });
        page.setDefaultTimeout(15000);
        // Cold Vite dependency optimization can take longer than an interaction.
        page.setDefaultNavigationTimeout(60000);
        const errors: string[] = [];
        page.on('pageerror', (error) => {
          errors.push(error.message);
          console.error(error.message);
        });
        await page.goto(
          `${url}tests/fixtures/task-table.html?locale=${preset === 'default' ? 'en' : 'zh'}`,
        );
        await page.evaluate((preset) => {
          document.documentElement.dataset.theme = preset;
          document.documentElement.classList.toggle(
            'dark',
            preset === 'default',
          );
        }, preset);
        await page.locator('.nr-task-table-title').first().waitFor();
        const table = page.locator('.nr-task-table');
        const metrics = await table.evaluate((el) => ({
          client: el.clientWidth,
          scroll: el.scrollWidth,
        }));
        expect(metrics.scroll).toBeLessThanOrEqual(metrics.client + 1);
        const titles = page.locator('.nr-task-table-title');
        expect(await titles.count()).toBe(3);
        for (const title of await titles.all()) {
          const geometry = await title.evaluate((el) => ({
            client: el.clientWidth,
            scroll: el.scrollWidth,
            whiteSpace: getComputedStyle(el).whiteSpace,
          }));
          expect(geometry.whiteSpace).toBe('normal');
          expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
          expect(geometry.client).toBeGreaterThan(140);
        }
        expect(
          await page
            .locator('tbody tr')
            .first()
            .locator('td')
            .nth(4)
            .isVisible(),
        ).toBe(width === 1440);
        expect(
          await page.locator('.nr-task-table-summary').first().isVisible(),
        ).toBe(width < 768);
        await titles.first().focus();
        await page.keyboard.press('Enter');
        expect(await page.locator('output').textContent()).toBe('open:2');
        await page.keyboard.press('Tab');
        const menu = page
          .locator('tbody tr')
          .first()
          .getByRole('button')
          .last();
        expect(await menu.evaluate((el) => el === document.activeElement)).toBe(
          true,
        );
        const box = await menu.boundingBox();
        expect(box!.x + box!.width).toBeLessThanOrEqual(width);
        await page.keyboard.press('Enter');
        await page.getByRole('menuitem').first().waitFor();
        await page.keyboard.press('Enter');
        expect(await page.locator('output').textContent()).toBe('close:2');
        await page.screenshot({
          path: resolve(
            root,
            `storage/pm-290/screenshots/${width}-${preset}.png`,
          ),
          fullPage: true,
        });
        expect(errors).toEqual([]);
        await page.close();
      },
    );
  }
}

test(
  'read-only tasks keep titles accessible without mutation menus',
  { timeout: 90000 },
  async () => {
    const page = await browser.newPage({
      viewport: { width: 390, height: 844 },
    });
    await page.goto(`${url}tests/fixtures/task-table.html?readonly`);
    await page.locator('.nr-task-table-title').first().waitFor();
    expect(await page.locator('tbody button').count()).toBe(3);
    await page.close();
  },
);
