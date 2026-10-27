// @vitest-environment node
import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdir, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { extract } from 'tar';
import { createDatabaseManager } from '@nocobase/db';
import { createTestAppConfig } from '@nocobase/app-testing/server';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { expect, test } from 'vitest';

// Run after building with the selected dialect in production dependencies.
test.runIf(process.env.NOCOREACH_TEST_DIST === '1')(
  'the production artifact serves assets, authenticates, writes to the selected database and survives restart',
  async () => {
    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve) => reservation.close(() => resolve()));
    const origin = `http://127.0.0.1:${port}`;
    const basePath = '/reach-test';
    const config = await createTestAppConfig({
      config: {
        app: { publicOrigin: origin },
        secrets: {
          keys: [{ version: 1, key: randomBytes(32).toString('hex') }],
        },
        jobs: { default: 'memory' },
        queue: { default: 'memory' },
      },
    });
    const database = createDatabaseManager({
      connections: { main: config.testDatabases.connectionConfig('main') },
    });
    const release = path.join(config.directory, 'release');
    const environment = () => {
      const env = { ...process.env };
      for (const key of Object.keys(env))
        if (key.startsWith('DB_')) delete env[key];
      delete env.NODE_PATH;
      return {
        ...env,
        NODE_ENV: 'production',
        NOCOBASE_STRICT_STARTUP: 'true',
        APP_CONFIG_FILE: config.path,
        APP_STORAGE_DIR: path.join(config.directory, 'storage'),
        APP_PUBLIC_ORIGIN: origin,
        APP_BASE_PATH: basePath,
        APP_SERVER_HOST: '127.0.0.1',
        APP_SERVER_PORT: String(port),
      };
    };
    let child: ChildProcess | undefined;
    let logs = '';
    const stop = async () => {
      if (!child || child.exitCode !== null || child.signalCode !== null)
        return;
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      const timer = setTimeout(() => child?.kill('SIGKILL'), 10_000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
        child = undefined;
      }
    };
    const boot = async () => {
      child = spawn(process.execPath, ['dist/server/standalone.js'], {
        cwd: release,
        env: environment(),
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      for (const stream of [child.stdout, child.stderr]) {
        stream?.on('data', (data: Buffer) => {
          logs = (logs + data.toString()).slice(-20_000);
        });
      }
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline) {
        if (child.exitCode !== null || child.signalCode !== null)
          throw new Error(`Production server exited before readiness: ${logs}`);
        try {
          const response = await fetch(`${origin}${basePath}/api/healthz`);
          if (response.ok && (await response.json()).ok === true) return;
        } catch {
          // The socket is unavailable until initialization completes.
        }
        await delay(250);
      }
      throw new Error(`Production server did not become ready: ${logs}`);
    };
    const target = {
      publicBasePath: basePath,
      fetch: (request: Request) => {
        const url = new URL(request.url);
        const headers = new Headers(request.headers);
        headers.set('origin', origin);
        return fetch(
          new Request(
            `${origin}${url.pathname}${url.search}`,
            new Request(request, { headers }),
          ),
        );
      },
    };
    try {
      // Extract outside the checkout so missing runtime dependencies cannot resolve from source node_modules.
      await mkdir(release);
      await extract({
        file: path.resolve(
          import.meta.dirname,
          '../../storage/exports/dist.tar.gz',
        ),
        cwd: release,
      });
      const manifest = JSON.parse(
        await readFile(path.join(release, 'dist/package.json'), 'utf8'),
      );
      expect(manifest.dependencies).toHaveProperty(
        `@nocobase/db-${process.env.NOCOBASE_TEST_DB_DIALECT || 'sqlite'}`,
      );
      for (const args of [
        ['config', 'check'],
        ['db', 'apply'],
      ]) {
        const { stdout } = await promisify(execFile)(
          process.execPath,
          ['dist/cli/index.js', ...args, '--json'],
          {
            cwd: release,
            env: environment(),
            timeout: 180_000,
            maxBuffer: 4 * 1024 * 1024,
          },
        );
        expect(JSON.parse(stdout).ok).toBe(true);
      }
      await boot();
      const page = await fetch(`${origin}${basePath}/`);
      expect(page.status).toBe(200);
      const html = await page.text();
      const script = html.match(/<script[^>]+src="([^"]+)"/);
      expect(script).not.toBeNull();
      const asset = await fetch(new URL(script![1], page.url));
      expect(asset.status).toBe(200);
      expect(asset.headers.get('content-type')).toMatch(/javascript/);
      expect((await fetch(`${origin}${basePath}/api/swagger`)).status).toBe(
        401,
      );
      const admin = await signIn(target, DEFAULT_ADMIN_CREDENTIALS);
      const specification = await (await admin.fetch('/swagger')).json();
      expect(specification.paths['/api/nocoreachTasks']).toBeDefined();
      const post = (route: string, body: unknown) =>
        admin.fetch(route, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
      const projectResponse = await post('/nocoreach/nrProjects/create', {
        name: 'Deployment persistence',
        domain: 'deployment.example.test',
      });
      expect(projectResponse.status).toBe(200);
      const project = (await projectResponse.json()).data;
      const taskResponse = await post('/nocoreachTasks', {
        projectId: String(project.id),
        requestId: randomUUID(),
        title: 'Persist across deployment restarts',
        description: 'Verify the deployed database and authentication session.',
        attachmentIds: [],
      });
      expect(taskResponse.status).toBe(201);
      const task = (await taskResponse.json()).data;
      expect(database.connection().dialect).toBe(
        process.env.NOCOBASE_TEST_DB_DIALECT || 'sqlite',
      );
      const stored = await database
        .repository('nrTasks')
        .findOne({ filter: { id: task.id } });
      expect(stored).toMatchObject({
        title: task.title,
        projectId: String(project.id),
      });
      await stop();
      await delay(1001 - (Date.now() % 1000));
      await boot();
      const detail = await post('/nocoreach/nrTaskWork/get', {
        projectId: String(project.id),
        taskId: task.id,
      });
      expect(detail.status).toBe(200);
      expect((await detail.json()).data.task).toMatchObject({
        id: task.id,
        title: task.title,
      });
      await signIn(target, DEFAULT_ADMIN_CREDENTIALS);
    } finally {
      await stop();
      await database.disconnect();
      await config.dispose();
    }
  },
  360_000,
);
