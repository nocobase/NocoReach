import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { deploymentState, runStudioCli } from './deploy-studio.mjs';

// Publishes a pull request's head to its own preview App in Studio's Preview environment. The main deployment is
// deploy-studio.mjs's; this script names only nocoreach-pr-<number> Apps, so it cannot deploy anything else.

const ARCHIVE = 'storage/exports/dist.tar.gz';
const DEPLOYMENT_POLL_TIMEOUT = 30 * 60_000;
const HEALTH_RETRY_WINDOW = 3 * 60_000;
const HEALTH_RETRY_INTERVAL = 10_000;

export function previewApp(env) {
  const number = env.PREVIEW_PR_NUMBER ?? '';
  assert(
    /^[1-9]\d{0,8}$/u.test(number),
    'Missing or invalid PREVIEW_PR_NUMBER',
  );
  return `nocoreach-pr-${number}`;
}

export function validatePreviewConfig(env) {
  previewApp(env);
  for (const key of ['NB_STUDIO_SERVER', 'NB_STUDIO_API_KEY', 'STUDIO_CLI'])
    assert(env[key]?.trim(), `Missing ${key}`);
  assert(
    /^[a-f0-9]{40}$/u.test(env.PREVIEW_HEAD_SHA ?? ''),
    'Missing or invalid PREVIEW_HEAD_SHA',
  );
  assert.equal(
    env.STUDIO_TARGET,
    'linux-x64',
    'Administrator must confirm STUDIO_TARGET=linux-x64',
  );
  assert.equal(
    env.STUDIO_NODE_MAJOR,
    '24',
    'Administrator must confirm STUDIO_NODE_MAJOR=24',
  );
  const url = new URL(env.NB_STUDIO_SERVER);
  assert(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
    'Invalid HTTPS base URL: NB_STUDIO_SERVER',
  );
}

/**
 * A preview is opened by people who hold no account in it, so it must run as a demo: visitors enter with generated
 * fictional data and requests cannot change it. Without the App's own NOCOBASE_DEMO_MODE=true there is no safe way in,
 * and nothing is deployed.
 */
export function assertDemoEntry(variables, appId) {
  assert(Array.isArray(variables), 'Studio returned no variable list');
  const demo = variables.find((v) => v?.name === 'NOCOBASE_DEMO_MODE');
  assert(
    demo?.value === 'true' && ['app', 'environment'].includes(demo.source),
    `Set NOCOBASE_DEMO_MODE=true on the ${appId} App in Studio, then run this job again; a preview needs Demo Mode as its only way in`,
  );
}

/** The App's address from Studio's answer: a path under the Studio server, or an absolute URL on the same origin. */
export function previewUrl(app, server) {
  const base = new URL(server);
  assert(typeof app?.url === 'string' && app.url, 'Studio returned no App URL');
  const url = new URL(app.url, base.origin);
  assert.equal(
    url.origin,
    base.origin,
    'Preview URL is not on the Studio server',
  );
  return url.href.endsWith('/') ? url.href : `${url.href}/`;
}

export function validatePreviewHealth(health, appId) {
  assert.equal(health?.ok, true, 'Health endpoint did not report ok=true');
  assert.equal(
    health?.basePath,
    `/${appId}`,
    'Health endpoint belongs to another app',
  );
}

class HealthUnavailable extends Error {}

async function probe(url, appId, request = fetch) {
  let response;
  try {
    response = await request(url, {
      signal: AbortSignal.timeout(30000),
      redirect: 'error',
    });
  } catch (error) {
    throw new HealthUnavailable('Health check request failed', {
      cause: error,
    });
  }
  if (!response.ok)
    throw new HealthUnavailable(`Health check HTTP ${response.status}`);
  let health;
  try {
    health = JSON.parse(await response.text());
  } catch {
    throw new Error('Health endpoint returned invalid JSON');
  }
  validatePreviewHealth(health, appId);
}

export async function publishPreview({
  env,
  metadata,
  cli,
  health = probe,
  summary,
  wait = sleep,
  now = Date.now,
  timeout = DEPLOYMENT_POLL_TIMEOUT,
}) {
  validatePreviewConfig(env);
  const appId = previewApp(env);
  assert.equal(
    metadata.sha,
    env.PREVIEW_HEAD_SHA,
    'Checkout is not the pull request head',
  );
  await cli(['app', 'ensure', appId, '--environment', 'preview', '--json']);
  assertDemoEntry(await cli(['app', 'env', 'list', appId, '--json']), appId);
  summary(
    `Preview App: ${appId}\n\nCommit: ${metadata.sha}\n\nArchive SHA-256: ${metadata.sha256}\n\n`,
  );
  const uploaded = await cli([
    'deploy',
    '--app',
    appId,
    '--repository',
    metadata.repository,
    '--sha',
    metadata.sha,
    '--file',
    ARCHIVE,
    '--json',
  ]);
  assert.equal(uploaded.release?.appId, appId, 'Wrong uploaded release app');
  assert.equal(
    uploaded.release?.sourceCommit,
    metadata.sha,
    'Uploaded commit mismatch',
  );
  const releaseId = uploaded.release.id;
  const result = uploaded.deployed;
  assert(result?.deployment?.id, 'Preview deployment was not started');
  assert(!result.request, 'A preview must not need a deployment approval');
  const deploymentId = result.deployment.id;
  const deadline = now() + timeout;
  for (;;) {
    const data = await cli(['deploy', 'get', appId, deploymentId, '--json']);
    if (deploymentState(data, appId, releaseId, deploymentId) === 'succeeded')
      break;
    assert(
      now() < deadline,
      'Preview deployment timed out; inspect it in Studio',
    );
    await wait(10000);
  }
  const app = await cli(['app', 'get', appId, '--json']);
  assert.equal(
    app.app?.currentDeploymentId,
    deploymentId,
    'The preview no longer runs this deployment',
  );
  const url = previewUrl(app, env.NB_STUDIO_SERVER);
  const stop = Math.min(now() + HEALTH_RETRY_WINDOW, deadline);
  for (;;) {
    try {
      await health(`${url}api/healthz`, appId);
      break;
    } catch (error) {
      if (
        !(error instanceof HealthUnavailable) ||
        now() + HEALTH_RETRY_INTERVAL > stop
      )
        throw error;
    }
    await wait(HEALTH_RETRY_INTERVAL);
  }
  summary(
    `Preview ready: ${url}\n\nIt runs ${metadata.sha} in Demo Mode; open it to enter with demo data.\n\n`,
  );
  return url;
}

async function main() {
  const summary = (text) => {
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  };
  try {
    validatePreviewConfig(process.env);
    if (process.argv.includes('--check-config')) return;
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    assert(process.env.GITHUB_REPOSITORY, 'Missing GITHUB_REPOSITORY');
    const size = statSync(ARCHIVE).size;
    assert(
      size > 0 && size <= 256 * 1024 * 1024,
      'Archive must be nonempty and at most 256 MiB',
    );
    const url = await publishPreview({
      env: process.env,
      metadata: {
        repository: process.env.GITHUB_REPOSITORY,
        sha,
        sha256: createHash('sha256')
          .update(readFileSync(ARCHIVE))
          .digest('hex'),
      },
      cli: async (args) => runStudioCli(process.env, args),
      summary,
    });
    console.info(`Preview ready: ${url}`);
  } catch (error) {
    summary(`Preview not published: ${error.message}\n`);
    console.error(error.message);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
