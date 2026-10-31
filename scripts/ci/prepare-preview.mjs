// Readies a pull request preview that runs in Demo Mode: imports the fictional data once, then opens every collection
// to writes so a reviewer can really use the application. Simulated upstreams and models stay on. Safe to run after
// every deployment: a preview keeps its data between deployments, and a new migration may add collections.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { runStudioCli } from './deploy-studio.mjs';

const POLL_INTERVAL = 5_000;
const OPERATION_TIMEOUT = 15 * 60_000;
const WRITABLE_VARIABLE = 'NOCOBASE_DEMO_WRITABLE_COLLECTIONS';

export function previewClient({ baseUrl, fetcher = fetch }) {
  const base = baseUrl.replace(/\/$/u, '');
  const { origin } = new URL(base);
  let cookie = '';
  const request = async (path, { method = 'GET', body } = {}) => {
    const response = await fetcher(`${base}/api${path}`, {
      method,
      redirect: 'manual',
      signal: AbortSignal.timeout(60_000),
      headers: {
        origin,
        ...(cookie ? { cookie } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // A stopped preview answers with Studio's starting page.
    }
    return { status: response.status, ok: response.ok, json, response };
  };
  return {
    request,
    async signIn(email, password) {
      const { status, response } = await request('/auth/sign-in/email', {
        method: 'POST',
        body: { email, password },
      });
      assert.equal(status, 200, `Administrator sign-in answered ${status}`);
      cookie = response.headers
        .getSetCookie()
        .map((line) => line.split(';')[0])
        .join('; ');
      assert(cookie, 'Administrator sign-in set no session cookie');
    },
  };
}

// Polls a read until `done` accepts its data. The App may be starting or restarting, so anything else is retried.
export async function poll(
  client,
  path,
  done,
  { wait = sleep, now = Date.now, timeout = OPERATION_TIMEOUT } = {},
) {
  const deadline = now() + timeout;
  let last;
  for (;;) {
    try {
      const { status, ok, json } = await client.request(path);
      last = status;
      if (ok && json) {
        const result = await done(json.data ?? json);
        if (result !== undefined && result !== false) return result;
      }
    } catch (error) {
      if (error?.name === 'AssertionError') throw error;
      last = 'unreachable';
    }
    assert(
      now() < deadline,
      `${path} did not get ready (last answer: ${last})`,
    );
    await wait(POLL_INTERVAL);
  }
}

export async function importOnce(client, language, options = {}) {
  let started = false;
  return poll(
    client,
    '/demoMode/data',
    async (status) => {
      if (status.present === true) return { imported: started };
      if (status.importing || status.operation) return false;
      assert(
        !started,
        `Demo import did not finish: ${status.failure?.code ?? 'no reason given'}`,
      );
      const { ok, status: answer } = await client.request(
        '/demoMode/data/import',
        { method: 'POST', body: { language } },
      );
      assert(ok, `Demo import answered ${answer}`);
      started = true;
      return false;
    },
    options,
  );
}

const writable = (configuration) =>
  new Set(configuration.fixedCollections ?? []);

// The configuration API refuses more than 100 collections, so the list goes in the deployment's variable.
export async function allowAllWrites({ client, appId, cli, options = {} }) {
  const listed = await poll(
    client,
    '/demoMode/configuration/collections',
    (entries) => (Array.isArray(entries) ? entries : false),
    options,
  );
  const names = [...new Set(listed.map((entry) => entry.name))].sort();
  assert(names.length > 0, 'Demo Mode listed no collections');
  const opened = (configuration) => {
    const allowed = writable(configuration);
    return names.every((name) => allowed.has(name));
  };
  const path = '/demoMode/configuration';
  const current = await poll(client, path, (data) => data, options);
  if (opened(current)) return { collections: names.length, restarted: false };
  await cli([
    'app',
    'env',
    'set',
    appId,
    WRITABLE_VARIABLE,
    names.join(','),
    '--json',
  ]);
  await cli(['app', 'restart', appId, '--json']);
  await poll(client, path, (data) => opened(data) || false, options);
  return { collections: names.length, restarted: true };
}

async function main() {
  const { STUDIO_APP_ID, STUDIO_APP_URL, PREVIEW_ADMIN_PASSWORD } = process.env;
  assert(STUDIO_APP_ID, 'Missing STUDIO_APP_ID');
  assert(STUDIO_APP_URL, 'Missing STUDIO_APP_URL');
  assert(PREVIEW_ADMIN_PASSWORD, 'Missing PREVIEW_ADMIN_PASSWORD');
  const client = previewClient({ baseUrl: STUDIO_APP_URL });
  await poll(client, '/healthz', (health) => health.ok === true);
  await client.signIn(
    process.env.PREVIEW_ADMIN_EMAIL || 'admin@nocobase.com',
    PREVIEW_ADMIN_PASSWORD,
  );
  const { imported } = await importOnce(
    client,
    process.env.PREVIEW_LANGUAGE || 'zh-CN',
  );
  const { collections, restarted } = await allowAllWrites({
    client,
    appId: STUDIO_APP_ID,
    cli: async (args) => runStudioCli(process.env, args),
  });
  console.info(
    `Preview ready: demo data ${imported ? 'imported' : 'already there'}, ${collections} collections writable${restarted ? ', restarted' : ''}.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
