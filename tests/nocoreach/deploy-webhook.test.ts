// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { deploy } from '../../scripts/ci/deploy-webhook.mjs';

const env = {
  NOCOREACH_DEPLOY_URL: 'https://deploy.example.test/_deploy/nocoreach',
  NOCOREACH_DEPLOY_SECRET: 's'.repeat(64),
  RELEASE_TAG: 'v1.0.0-beta.76',
  IMAGE_DIGEST: `sha256:${'a'.repeat(64)}`,
  GITHUB_RUN_ID: '12345678',
  GITHUB_RUN_ATTEMPT: '1',
};
const job = {
  id: 'release-12345678-1',
  version: '1.0.0-beta.76',
  digest: env.IMAGE_DIGEST,
  status: 'succeeded',
  stage: 'complete',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('submits the verified release identity and waits for API completion', async () => {
  vi.useFakeTimers();
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({ ...job, status: 'queued', stage: 'queued' }),
    )
    .mockResolvedValueOnce(Response.json(job));
  vi.stubGlobal('fetch', fetch);
  const result = deploy(env);
  await vi.runAllTimersAsync();
  await expect(result).resolves.toEqual(job);
  expect(fetch).toHaveBeenCalledTimes(2);
  const [url, options] = fetch.mock.calls[0];
  expect(String(url)).toBe(env.NOCOREACH_DEPLOY_URL);
  expect(options.method).toBe('POST');
  expect(JSON.parse(options.body)).toEqual({
    request_id: job.id,
    version: job.version,
    digest: job.digest,
  });
  expect(options.headers['X-Deploy-Signature']).toMatch(/^[0-9a-f]{64}$/u);
  expect(options.redirect).toBe('error');
  expect(String(fetch.mock.calls[1][0])).toBe(
    `${env.NOCOREACH_DEPLOY_URL}/${job.id}`,
  );
  expect(fetch.mock.calls[1][1].method).toBe('GET');
});

it.each([
  { digest: `sha256:${'b'.repeat(64)}` },
  { id: 'another-deployment' },
  { version: '1.0.0-beta.75' },
  { status: 'failed' },
  { status: 'manual_recovery' },
  { status: 'unknown' },
])('rejects an unsuccessful or mismatched API result: %j', async (override) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ ...job, ...override })),
  );
  await expect(deploy(env)).rejects.toThrow();
});

it('rejects non-HTTPS endpoints before sending credentials', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await expect(
    deploy({
      ...env,
      NOCOREACH_DEPLOY_URL: 'http://deploy.example.test/_deploy/nocoreach',
    }),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
