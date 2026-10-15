// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { expect, vi } from 'vitest';
import { createStandaloneServer } from '../../server/standalone';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { databaseManagerToken } from '@nocobase/db';
import { manualTasksToken } from '../../server/providers/manual-tasks';

vi.setConfig({ hookTimeout: 120000, testTimeout: 30000 });
const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
  },
});
for (const zone of ['UTC', 'Asia/Shanghai', 'Australia/Melbourne']) {
  test(`task list API preserves the database instant, refresh and update in ${zone}`, async ({
    testApp,
  }) => {
    const previousZone = process.env.TZ;
    process.env.TZ = zone;
    try {
      const runtime = testApp.application.container.resolve(nocoReachToken);
      const client = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
      const schema = await client.fetch('/swagger');
      expect(schema.status).toBe(200);
      const document = (await schema.json()) as {
        paths: Record<string, unknown>;
      };
      expect(
        Object.keys(document.paths).some((path) => path.includes('nocoreach')),
      ).toBe(true);
      const repo = runtime.legacy.db.getRepository('nrTasks');
      await runtime.legacy.db.getRepository('nrSnapshots').create({
        values: {
          key: 'project:1',
          payload: {
            id: 1,
            name: 'Synthetic project',
            domain: 'example.test',
          },
        },
      });
      const updatedAt = new Date(Date.now() - 20 * 60000).toISOString();
      const row = await repo.create({
        values: {
          projectId: '1',
          title: 'Synthetic timestamp task',
          createdAt: '2026-07-14T15:00:00+10:00',
          updatedAt,
        },
      });
      const list = async () => {
        const response = await client.fetch('/nocoreach/nrTaskWork/list', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            origin: 'http://localhost',
          },
          body: JSON.stringify({ projectId: '1' }),
        });
        const payload = (await response.json()) as {
          data: Array<Record<string, unknown>>;
        };
        expect(response.status).toBe(200);
        return payload.data.find((item) => String(item.id) === String(row.id))!;
      };
      expect(await list()).toMatchObject({
        createdAt: '2026-07-14T05:00:00.000Z',
        updatedAt,
      });
      const database =
        testApp.application.container.resolve(databaseManagerToken);
      await database.reconnect();
      expect(await list()).toMatchObject({
        createdAt: '2026-07-14T05:00:00.000Z',
        updatedAt,
      });
      await repo.update({
        filterByTk: row.id,
        values: { title: 'Updated synthetic task' },
      });
      const updated = await list();
      expect(updated.createdAt).toBe('2026-07-14T05:00:00.000Z');
      expect(String(updated.updatedAt)).toMatch(/Z$/);
      expect(Date.parse(String(updated.updatedAt))).toBeGreaterThan(
        Date.now() - 5000,
      );
      const form = new FormData();
      const png = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6n6AAAAAASUVORK5CYII=',
        'base64',
      );
      form.set('file', new File([png], 'synthetic.png', { type: 'image/png' }));
      const upload = await client.fetch(
        `/nocoreachTasks/media?projectId=1&requestId=${randomUUID()}`,
        { method: 'POST', headers: { origin: 'http://localhost' }, body: form },
      );
      expect(upload.status).toBe(201);
      const mediaId = ((await upload.json()) as { data: { id: string } }).data
        .id;
      const media = database.repository('nrTaskMedia');
      const file = (await media.findOne({ filter: { id: mediaId } }))!;
      expect(String(file.createdAt)).toMatch(/Z$/);
      expect(String(file.updatedAt)).toMatch(/Z$/);
      expect(String(file.expiresAt)).toMatch(/Z$/);
      expect(
        Date.parse(String(file.expiresAt)) - Date.parse(String(file.createdAt)),
      ).toBeGreaterThan(23 * 3600000);
      const service = testApp.application.container.resolve(manualTasksToken);
      await service.cleanup();
      expect(await media.count({ filter: { id: mediaId } })).toBe(1);
      await media.updateMany({
        filter: { id: mediaId },
        values: { expiresAt: new Date(Date.now() - 1000) },
      });
      await service.cleanup();
      expect(await media.count({ filter: { id: mediaId } })).toBe(0);
    } finally {
      if (previousZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousZone;
    }
  });
}
