import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import { createStandaloneServer } from '../../server/standalone';

// Shared by the demo-data-*-app tests. The slowest demo checks live in files of their own so Vitest runs them on
// separate workers, and CI on separate shards, instead of one after another in a single file.
vi.setConfig({ testTimeout: 300000, hookTimeout: 300000 });
// The demo's synthetic traffic is keyed by calendar date while its observation windows sit a set number of days before
// today, so which conclusion a measured task reaches moves from day to day (Acme CRM's flat task read "up" on 2026-10-30).
// Fix the day so every outcome stays covered; the clock still advances, so timeouts and timestamps behave as usual.
vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
vi.setSystemTime(new Date('2026-10-29T12:00:00Z'));
// Play the demo Agent's runs back without the pauses a visitor sees.
process.env.NOCOREACH_DEMO_AGENT_PACE = '0';
export const createDemoTest = (enabled = true) =>
  createAppTest({
    createServer: createStandaloneServer,
    env: {
      ...process.env,
      NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
        tmpdir(),
        `nocoreach-demo-data-${randomUUID()}`,
      ),
    },
    server: {
      env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: 'http://localhost' },
    },
    config: {
      app: { publicOrigin: 'http://localhost' },
      users: {
        initialAdmin: { ...DEFAULT_ADMIN_CREDENTIALS, name: 'Demo data admin' },
      },
      secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
      nocoreach: { publicDns: '' },
      demoMode: { enabled },
    },
  });

export const json = {
  'Content-Type': 'application/json',
  origin: 'http://localhost',
};
