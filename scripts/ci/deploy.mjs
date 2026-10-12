import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { verifyBundle } from './artifact.mjs';

export function parseEnvelope(text) {
  const envelope = JSON.parse(text);
  assert(
    envelope.ok === true && envelope.status === 'success',
    `Studio CLI failure (${envelope.error?.code ?? 'invalid envelope'})`,
  );
  assert(envelope.result?.data, 'Studio CLI returned no result.data');
  return envelope.result.data;
}
export function validateConfig(env) {
  for (const key of [
    'NB_STUDIO_SERVER',
    'NB_STUDIO_API_KEY',
    'STUDIO_APP_ID',
    'STUDIO_APP_URL',
    'STUDIO_CLI',
  ])
    assert(env[key]?.trim(), `Missing ${key}`);
  assert.equal(
    env.STUDIO_APP_ID,
    'nocoreach',
    'Only the nocoreach app is supported',
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
export function deploymentState(data, appId, releaseId) {
  assert.equal(data.appId, appId, 'Wrong deployment app');
  assert.equal(data.releaseId, releaseId, 'Wrong deployment release');
  if (data.status === 'succeeded') return 'succeeded';
  if (['queued', 'deploying'].includes(data.status)) return 'waiting';
  throw new Error(
    `Deployment stopped (${data.status}); inspect Studio deployment logs`,
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
  summary(
    `目标应用：${env.STUDIO_APP_ID}\n\n访问地址：${env.STUDIO_APP_URL}\n\n`,
  );
  const result = await cli([
    'deploy',
    '--app',
    env.STUDIO_APP_ID,
    '--repository',
    metadata.repository,
    '--sha',
    metadata.sha,
    '--file',
    'release/dist.tar.gz',
    '--json',
  ]);
  assert.equal(result.appId, env.STUDIO_APP_ID, 'Wrong outcome app');
  const releaseId = result.releaseId;
  assert(
    typeof releaseId === 'string' && releaseId,
    'Deployment response missing release ID',
  );
  summary(`Release：${releaseId}\n\n`);
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
  summary(`Deployment：${deploymentId}\n\n`);
  const deadline = now() + timeout;
  while (now() < deadline) {
    const data = await cli([
      'deploy',
      'get',
      env.STUDIO_APP_ID,
      deploymentId,
      '--json',
    ]);
    if (deploymentState(data, env.STUDIO_APP_ID, releaseId) === 'succeeded') {
      assert.equal(
        data.release?.checksum,
        metadata.sha256,
        'Deployed bytes differ from verified archive',
      );
      // The read contract exposes sourceCommit and checksum; health alone could be an old release.
      const release = await cli([
        'release',
        'get',
        env.STUDIO_APP_ID,
        releaseId,
        '--json',
      ]);
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
      const app = await cli(['app', 'get', env.STUDIO_APP_ID, '--json']);
      assert.equal(
        app.app?.currentDeploymentId,
        deploymentId,
        'Target no longer runs this deployment',
      );
      await health(`${env.STUDIO_APP_URL.replace(/\/$/, '')}/api/healthz`);
      summary('部署成功，发布提交与归档校验和一致，健康检查通过。\n\n');
      return 'succeeded';
    }
    await wait(10000);
  }
  throw new Error(
    'Deployment timed out after 10 minutes; inspect Studio before retrying (no automatic rollback)',
  );
}
async function main() {
  const summary = (text) => {
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  };
  try {
    const metadata = verifyBundle(
      'release',
      JSON.parse(readFileSync('source.json', 'utf8')),
    );
    await deploy({
      env: process.env,
      metadata,
      summary,
      cli: async (args) => {
        let output;
        try {
          output = execFileSync(process.env.STUDIO_CLI, args, {
            encoding: 'utf8',
            timeout: 180000,
            maxBuffer: 4 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (error) {
          // CLI stderr and upload responses can contain tickets: never echo them.
          let code = 'transport/process error';
          try {
            code = JSON.parse(error.stdout).error?.code ?? code;
          } catch {
            /* not a JSON response */
          }
          // Do not retain child-process errors: their stdout/stderr may contain upload credentials.
          // eslint-disable-next-line preserve-caught-error
          throw new Error(
            `Studio ${args.slice(0, 2).join(' ')} failed: ${code}; exit=${error.status ?? 'timeout/network'}. Check credentials, connectivity and Studio logs.`,
          );
        }
        return parseEnvelope(output);
      },
      health: async (url) => {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30000),
          redirect: 'error',
        });
        assert(response.ok, `Health check HTTP ${response.status}`);
        assert.equal(
          (await response.json()).ok,
          true,
          'Health endpoint did not report ok=true',
        );
      },
    });
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
