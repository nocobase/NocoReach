import assert from 'node:assert/strict';
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function sign(secret, method, path, timestamp, nonce, body) {
  return createHmac('sha256', secret)
    .update(
      [
        method,
        path,
        timestamp,
        nonce,
        createHash('sha256').update(body).digest('hex'),
      ].join('\n'),
    )
    .digest('hex');
}

export async function deploy(env = process.env) {
  const url = new URL(env.NOCOREACH_DEPLOY_URL);
  assert(
    url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash,
  );
  assert.equal(url.pathname, '/_deploy/nocoreach');
  const secret = env.NOCOREACH_DEPLOY_SECRET;
  assert(secret?.length >= 64, 'Missing deployment signing secret');
  const version = env.RELEASE_TAG?.replace(/^v/, '');
  assert(
    /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/u.test(version ?? ''),
    'Invalid release version',
  );
  assert(
    /^sha256:[0-9a-f]{64}$/u.test(env.IMAGE_DIGEST ?? ''),
    'Invalid image digest',
  );
  const id = `release-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`;
  assert(/^[a-zA-Z0-9_-]{8,80}$/u.test(id));
  const deadline = Date.now() + 30 * 60_000;
  async function request(method, path, data) {
    const body = data ? JSON.stringify(data) : '';
    for (let attempt = 0; attempt < 3; attempt++) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const nonce = randomBytes(16).toString('hex');
      try {
        const response = await fetch(new URL(path, url), {
          method,
          redirect: 'error',
          signal: AbortSignal.timeout(15_000),
          headers: {
            'Content-Type': 'application/json',
            'X-Deploy-Timestamp': timestamp,
            'X-Deploy-Nonce': nonce,
            'X-Deploy-Signature': sign(
              secret,
              method,
              path,
              timestamp,
              nonce,
              body,
            ),
          },
          ...(data ? { body } : {}),
        });
        if (!response.ok)
          throw new Error(`Deployment API returned HTTP ${response.status}`);
        return await response.json();
      } catch {
        if (attempt === 2)
          throw new Error(
            `Deployment request failed; inspect task ${id} before retrying`,
          );
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  let job = await request('POST', url.pathname, {
    request_id: id,
    version,
    digest: env.IMAGE_DIGEST,
  });
  let lastStage;
  while (Date.now() < deadline) {
    assert.equal(job.id, id, 'Unexpected deployment task');
    assert.equal(job.version, version, 'Unexpected deployment version');
    assert.equal(job.digest, env.IMAGE_DIGEST, 'Unexpected deployment digest');
    assert(
      ['queued', 'running', 'succeeded', 'failed', 'manual_recovery'].includes(
        job.status,
      ),
    );
    if (job.stage !== lastStage) {
      assert(/^[a-z-]{1,40}$/u.test(job.stage));
      console.log(`Deployment ${id}: ${job.stage}`);
      lastStage = job.stage;
    }
    if (job.status === 'succeeded') {
      if (env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          env.GITHUB_STEP_SUMMARY,
          `Deployed NocoReach ${version}\n\nDigest: \`${env.IMAGE_DIGEST}\`\n\nTask: \`${id}\`\n`,
        );
      return job;
    }
    assert(
      !['failed', 'manual_recovery'].includes(job.status),
      `Deployment ${id} ${job.status} at ${job.stage}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 5000));
    job = await request('GET', `${url.pathname}/${id}`);
  }
  throw new Error(
    `Deployment ${id} timed out; inspect its state before retrying`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  deploy().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
