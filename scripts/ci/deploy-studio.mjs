import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const ARCHIVE = 'storage/exports/dist.tar.gz';

// Allow ten minutes for archive uploads; ordinary read commands keep the
// shorter process budget. A timeout never proves Studio rejected the upload.
const UPLOAD_PROCESS_TIMEOUT = 10 * 60_000;
const READ_PROCESS_TIMEOUT = 3 * 60_000;

export function runStudioCli(env, args, execute = execFileSync) {
  const uploading =
    args[0] === 'deploy' && args[1] === '--app' && args.includes('--file');
  const timeout = uploading ? UPLOAD_PROCESS_TIMEOUT : READ_PROCESS_TIMEOUT;
  let output;
  try {
    output = execute(env.STUDIO_CLI, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // Never retain child-process errors: stdout/stderr may contain upload tickets.
    let reason;
    if (error.code === 'ETIMEDOUT') {
      reason = `process timeout after ${timeout / 1000}s`;
    } else if (error.code === 'ENOBUFS') {
      reason = 'CLI output exceeded the process buffer';
    } else if (error.code === 'ENOENT') {
      reason = 'CLI executable not found';
    } else {
      let code = 'transport/process error';
      try {
        const reported = JSON.parse(error.stdout).error?.code;
        if (typeof reported === 'string' && /^[A-Z0-9_]{1,80}$/u.test(reported))
          code = reported;
      } catch {
        /* not a JSON response */
      }
      const status = Number.isInteger(error.status)
        ? error.status
        : 'unavailable';
      reason = `${code}; exit=${status}`;
    }
    const recovery = uploading
      ? 'The upload/deployment outcome is unknown and may already exist in Studio. Inspect releases and deployments for this commit before retrying; do not re-upload automatically.'
      : 'Inspect Studio status and logs before retrying.';
    // eslint-disable-next-line preserve-caught-error
    throw new Error(
      `Studio ${uploading ? 'archive upload' : 'read command'} failed: ${reason}. ${recovery}`,
    );
  }
  return parseEnvelope(output);
}

export function parseEnvelope(text) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    // A parse error can quote upload tickets from stdout. Keep the diagnostic static.
    throw new Error('Studio CLI returned invalid JSON');
  }
  assert(
    envelope?.ok === true && envelope.status === 'success',
    'Studio CLI did not report success; inspect Studio logs',
  );
  assert(envelope.result?.data, 'Studio CLI returned no result.data');
  return envelope.result.data;
}
export function deploymentApp(env) {
  const appId = env.STUDIO_APP_ID ?? 'nocoreach';
  assert(
    ['nocoreach', 'nocoreach-demo'].includes(appId),
    'Unsupported Studio application',
  );
  if (appId === 'nocoreach-demo')
    assert.equal(
      env.GITHUB_EVENT_NAME,
      'workflow_dispatch',
      'Demo deployment requires manual dispatch',
    );
  return appId;
}
export function validateConfig(env) {
  deploymentApp(env);
  for (const key of [
    'NB_STUDIO_SERVER',
    'NB_STUDIO_API_KEY',
    'STUDIO_APP_URL',
    'STUDIO_CLI',
  ])
    assert(env[key]?.trim(), `Missing ${key}`);
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
  for (const key of ['NB_STUDIO_SERVER', 'STUDIO_APP_URL']) {
    const url = new URL(env[key]);
    assert(
      url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
      `Invalid HTTPS base URL: ${key}`,
    );
  }
}
export function validateHealth(health, appId) {
  assert.equal(health.ok, true, 'Health endpoint did not report ok=true');
  assert.equal(
    health.app?.name,
    appId,
    'Health endpoint belongs to another app',
  );
}
// Only correlation IDs belong in CI output, never remote messages, logs, URLs,
// or whole response objects (which can contain credentials and upload tickets).
function diagnosticId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value)
    ? value
    : '[unavailable]';
}
export function deploymentState(data, appId, releaseId, deploymentId) {
  assert.equal(data.appId, appId, 'Wrong deployment app');
  assert.equal(data.releaseId, releaseId, 'Wrong deployment release');
  if (data.status === 'succeeded') return 'succeeded';
  if (['queued', 'deploying'].includes(data.status)) return 'waiting';
  // "failed" is the observed server state. Do not echo unknown status values.
  const status = data.status === 'failed' ? 'failed' : 'unknown';
  throw new Error(
    `Deployment stopped (${status}); ci-phase=deployment-poll; app=${diagnosticId(appId)}; release=${diagnosticId(releaseId)}; deployment=${diagnosticId(deploymentId)}. Inspect Studio deployment logs; no automatic retry or rollback.`,
  );
}
export async function deploy({
  env,
  metadata,
  cli,
  health,
  summary,
  wait = sleep,
  now = Date.now,
  timeout = 600000,
}) {
  validateConfig(env);
  const appId = deploymentApp(env);
  summary(
    `目标应用：${appId}\n\n访问地址：${env.STUDIO_APP_URL}\n\n提交：${metadata.sha}\n\nSHA-256：${metadata.sha256}\n\n`,
  );
  summary('开始上传并请求部署；结果返回前，是否已被 Studio 接收尚不确定。\n\n');
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
  // --file returns the uploadArtifact response, whose deployment outcome is nested.
  assert.equal(uploaded.superseded, false, 'Uploaded build was superseded');
  assert.equal(uploaded.release?.appId, appId, 'Wrong uploaded release app');
  assert.equal(
    uploaded.release?.sourceCommit,
    metadata.sha,
    'Uploaded commit mismatch',
  );
  assert.equal(
    uploaded.release?.checksum,
    metadata.sha256,
    'Uploaded checksum mismatch',
  );
  const result = uploaded.deployed;
  assert(result, 'Upload returned no deployment outcome');
  assert.equal(
    result.releaseId,
    uploaded.release.id,
    'Uploaded/outcome release mismatch',
  );
  assert.equal(result.appId, appId, 'Wrong outcome app');
  const releaseId = result.releaseId;
  assert(
    typeof releaseId === 'string' && releaseId,
    'Deployment response missing release ID',
  );
  summary(`Release：${diagnosticId(releaseId)}\n\n`);
  if (result.request) {
    assert.equal(
      result.request.status,
      'pending',
      'Unexpected approval request state',
    );
    assert(!result.deployment, 'Ambiguous deployment and approval response');
    let link = 'Studio 未配置公开审批链接，请在 Studio 部署请求列表查看';
    if (result.request.url) {
      const url = new URL(result.request.url, env.NB_STUDIO_SERVER);
      assert.equal(
        url.origin,
        new URL(env.NB_STUDIO_SERVER).origin,
        'Unexpected approval URL origin',
      );
      link = url.href;
    }
    summary(
      `等待 Studio 审批，尚未上线。请求：${result.request.id}\n\n审批链接：${link}\n\n`,
    );
    return 'pending';
  }
  const deploymentId = result.deployment?.id;
  assert(
    typeof deploymentId === 'string' && deploymentId,
    'Deployment response missing deployment ID',
  );
  summary(`Deployment：${diagnosticId(deploymentId)}\n\n`);
  const deadline = now() + timeout;
  while (now() < deadline) {
    const data = await cli(['deploy', 'get', appId, deploymentId, '--json']);
    if (deploymentState(data, appId, releaseId, deploymentId) === 'succeeded') {
      assert.equal(
        data.release?.checksum,
        metadata.sha256,
        'Deployed bytes differ from verified archive',
      );
      // The read contract exposes sourceCommit and checksum; health alone could be an old release.
      const release = await cli(['release', 'get', appId, releaseId, '--json']);
      assert.equal(
        release.sourceCommit,
        metadata.sha,
        'Deployed commit mismatch',
      );
      assert.equal(
        release.checksum,
        metadata.sha256,
        'Release checksum mismatch',
      );
      const app = await cli(['app', 'get', appId, '--json']);
      assert.equal(
        app.app?.currentDeploymentId,
        deploymentId,
        'Target no longer runs this deployment',
      );
      await health(
        `${env.STUDIO_APP_URL.replace(/\/$/, '')}/api/healthz`,
        appId,
      );
      summary('部署成功，发布提交与归档校验和一致，健康检查通过。\n\n');
      return 'succeeded';
    }
    await wait(10000);
  }
  throw new Error(
    'Deployment timed out after 10 minutes; inspect Studio before retrying (no automatic rollback)',
  );
}
export function deploymentOutcomeMessage(outcome) {
  assert(
    ['pending', 'succeeded'].includes(outcome),
    'Unknown deployment outcome',
  );
  return outcome === 'pending'
    ? 'Studio deployment pending approval; application has not been verified as deployed.'
    : 'Studio deployment succeeded; active release identity and health verified.';
}
async function main() {
  const summary = (text) => {
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  };
  try {
    validateConfig(process.env);
    assert.equal(
      process.env.GITHUB_REF,
      'refs/heads/main',
      'Deploy only from main',
    );
    if (process.argv.includes('--check-config')) return;
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    assert.equal(
      sha,
      process.env.GITHUB_SHA,
      'Checkout does not match dispatched commit',
    );
    assert(process.env.GITHUB_REPOSITORY, 'Missing GITHUB_REPOSITORY');
    const size = statSync(ARCHIVE).size;
    assert(
      size > 0 && size <= 256 * 1024 * 1024,
      'Archive must be nonempty and at most 256 MiB',
    );
    const metadata = {
      repository: process.env.GITHUB_REPOSITORY,
      sha,
      sha256: createHash('sha256').update(readFileSync(ARCHIVE)).digest('hex'),
    };
    const outcome = await deploy({
      env: process.env,
      metadata,
      summary,
      cli: async (args) => runStudioCli(process.env, args),
      health: async (url, appId) => {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        });
        assert(response.ok, `Health check HTTP ${response.status}`);
        validateHealth(await response.json(), appId);
      },
    });
    console.info(deploymentOutcomeMessage(outcome));
  } catch (error) {
    summary(
      `部署未完成：${error.message}\n\n不自动回滚；请按操作手册检查已有 release/deployment，避免重复上传。\n`,
    );
    console.error(error.message);
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();
