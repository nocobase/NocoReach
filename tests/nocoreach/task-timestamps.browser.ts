// Run: pnpm exec tsx --test tests/nocoreach/task-timestamps.browser.ts
// Actual list and board components reading disposable SQLite through a local test-only endpoint.
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { createTestDatabase } from '@nocobase/app-testing/server';
import { SnowflakeIdGenerator } from '@nocobase/snowflake';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { createServer } from 'vite';
// eslint-disable-next-line vitest/no-import-node-test -- Separate opt-in browser runner.
import { test } from 'node:test';
import { LegacyDatabase } from '../../server/nocoreach/legacy/database';

test(
  'real list/board, refresh and update agree across browser timezones',
  { timeout: 120000 },
  async () => {
    const db = await createTestDatabase({
      migrations: [
        {
          packageName: 'nocoreach',
          directory: fileURLToPath(
            new URL('../../database/main/migrations', import.meta.url),
          ),
        },
      ],
    });
    const legacy = new LegacyDatabase(
      db.database,
      new SnowflakeIdGenerator({ workerId: 0 }),
    );
    const repo = legacy.getRepository('nrTasks');
    const at = new Date(Date.now() - 20 * 60000).toISOString();
    const row = await repo.create({
      values: {
        title: 'Synthetic timestamp verification',
        brief: '',
        status: 'open',
        createdAt: at,
        updatedAt: at,
        evidence: { no: 16 },
      },
    });
    const cacheDir = await mkdtemp(join(tmpdir(), 'pm375-vite-'));
    const shots = resolve(process.env.TMPDIR || tmpdir(), 'pm375-screenshots');
    await mkdir(shots, { recursive: true });
    const root = resolve(import.meta.dirname, '../..');
    const server = await createServer({
      configFile: false,
      root,
      cacheDir,
      plugins: [
        {
          name: 'timestamp-fixture',
          enforce: 'pre',
          load(id) {
            if (id === resolve(root, 'client/pages/me.tsx'))
              return 'export const useMe = () => ({ can: () => false });';
          },
          configureServer(vite) {
            vite.middlewares.use('/timestamp-fixture', (request, response) => {
              void (async () => {
                if (request.method === 'POST')
                  await repo.update({
                    filterByTk: row.id,
                    values: { title: 'Updated synthetic task' },
                  });
                const tasks = await repo.find({ filterByTk: row.id });
                response.setHeader('Content-Type', 'application/json');
                response.end(
                  JSON.stringify(
                    tasks.map((task) => ({
                      ...task.toJSON(),
                      id: Number(task.id),
                    })),
                  ),
                );
              })().catch(() => {
                response.statusCode = 500;
                response.end();
              });
            });
          },
        },
        react({ exclude: [/node_modules/, /\/deps\//] }),
        tailwind(),
      ],
      server: { host: '127.0.0.1', port: 0 },
      optimizeDeps: { entries: ['tests/fixtures/task-timestamps.html'] },
      resolve: { dedupe: ['react', 'react-dom'] },
    });
    let browser;
    try {
      await server.listen();
      browser = await chromium.launch();
      for (const zone of ['UTC', 'Asia/Shanghai', 'Australia/Melbourne']) {
        // Restore a synthetic recent update without changing createdAt or relying on wall-clock parsing.
        await db.connection
          .repository('nrTasks')
          .updateMany({ filter: { id: row.id }, values: { updatedAt: at } });
        const context = await browser.newContext({
          timezoneId: zone,
          viewport: { width: 1440, height: 900 },
        });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(
          `${server.resolvedUrls!.local[0]}tests/fixtures/task-timestamps.html`,
        );
        await expect(page.getByText('20 min ago', { exact: true })).toHaveCount(
          2,
        );
        await page
          .getByRole('button', { name: 'Refresh', exact: true })
          .click();
        await expect(page.getByText('20 min ago', { exact: true })).toHaveCount(
          2,
        );
        await page.screenshot({
          path: join(shots, `${zone.replaceAll('/', '-')}-recent-en.png`),
          fullPage: true,
        });
        await page
          .getByRole('button', { name: 'Update task', exact: true })
          .click();
        await expect(page.getByText('Just now', { exact: true })).toHaveCount(
          2,
        );
        await page.reload();
        await expect(page.getByText('Just now', { exact: true })).toHaveCount(
          2,
        );
        await page.screenshot({
          path: join(shots, `${zone.replaceAll('/', '-')}-updated-en.png`),
          fullPage: true,
        });
        expect(errors).toEqual([]);
        await context.close();
      }
      console.log(`English screenshots: ${shots}`);
    } finally {
      await browser?.close();
      await server.close();
      await db.destroy();
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
);
