// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  digest,
  inspectArchive,
  selectArtifact,
  validateSource,
  verifyBundle,
} from '../../scripts/ci/artifact.mjs';
import {
  deploy,
  parseEnvelope,
  validateConfig,
} from '../../scripts/ci/deploy.mjs';

const sha = 'a'.repeat(40);
const repository = 'nocobase/nocoreach';
const run = {
  id: 123,
  run_attempt: 1,
  repository: { full_name: repository },
  head_repository: { full_name: repository },
  workflow_id: 42,
  path: '.github/workflows/ci.yml',
  event: 'push',
  head_branch: 'main',
  status: 'completed',
  conclusion: 'success',
  head_sha: sha,
};
const jobs = ['tests', 'build'].map((name) => ({
  name,
  conclusion: 'success',
  head_sha: sha,
}));
const source = { repository, sha, runId: '123', runAttempt: '1' };
const folders: string[] = [];
afterEach(() =>
  folders
    .splice(0)
    .forEach((dir) => rmSync(dir, { recursive: true, force: true })),
);
function bundle() {
  const dir = mkdtempSync(join(tmpdir(), 'ci-release-'));
  folders.push(dir);
  writeFileSync(join(dir, 'dist.tar.gz'), 'verified bytes');
  const metadata = {
    ...source,
    node: 'v24.21.0',
    pnpm: '11.7.0',
    target: 'linux-x64',
    sha256: digest(join(dir, 'dist.tar.gz')),
  };
  writeFileSync(join(dir, 'metadata.json'), JSON.stringify(metadata));
  writeFileSync(join(dir, 'SHA256SUMS'), `${metadata.sha256}  dist.tar.gz\n`);
  return { dir, metadata };
}
describe('CI release provenance', () => {
  it('accepts only the successful main push workflow and both jobs', () => {
    expect(validateSource(run, jobs, repository, 42)).toEqual(source);
    for (const change of [
      { event: 'pull_request' },
      { event: 'workflow_dispatch' },
      { head_branch: 'feature' },
      { workflow_id: 1 },
      { path: '.github/workflows/evil.yml' },
      { conclusion: 'failure' },
      { status: 'in_progress' },
      { head_repository: { full_name: 'fork/repo' } },
      { repository: { full_name: 'other/repo' } },
    ]) {
      expect(() =>
        validateSource({ ...run, ...change }, jobs, repository, 42),
      ).toThrow();
    }
    expect(() => validateSource(run, [jobs[0]], repository, 42)).toThrow();
    expect(() =>
      validateSource(
        run,
        [jobs[0], { ...jobs[1], conclusion: 'skipped' }],
        repository,
        42,
      ),
    ).toThrow();
  });
  it('rejects missing, expired and previous-attempt artifacts', () => {
    const artifact = { id: 1, name: `release-${sha}-123-1`, expired: false };
    expect(selectArtifact([artifact], source).id).toBe(1);
    for (const artifacts of [
      [],
      [{ ...artifact, expired: true }],
      [{ ...artifact, name: `release-${sha}-123-2` }],
    ])
      expect(() => selectArtifact(artifacts, source)).toThrow();
  });
  it('checks SHA, repository, run, attempt and all checksum representations', () => {
    const { dir, metadata } = bundle();
    expect(verifyBundle(dir, source)).toEqual(metadata);
    for (const key of ['sha', 'repository', 'runId', 'runAttempt'])
      expect(() => verifyBundle(dir, { ...source, [key]: 'wrong' })).toThrow();
    writeFileSync(join(dir, 'dist.tar.gz'), 'tampered');
    expect(() => verifyBundle(dir, source)).toThrow(/checksum/);
  });
  it('fails when archive or checksum is absent or checksum file changed', () => {
    const { dir } = bundle();
    writeFileSync(join(dir, 'SHA256SUMS'), 'wrong');
    expect(() => verifyBundle(dir, source)).toThrow();
    rmSync(join(dir, 'dist.tar.gz'));
    expect(() => verifyBundle(dir, source)).toThrow();
  });
});
const env = {
  NB_STUDIO_SERVER: 'https://studio.example/main',
  NB_STUDIO_API_KEY: 'secret',
  STUDIO_APP_ID: 'nocoreach',
  STUDIO_APP_URL: 'https://app.example/nocoreach/',
  STUDIO_CLI: 'nb-studio',
  STUDIO_TARGET: 'linux-x64',
  STUDIO_NODE_MAJOR: '24',
};
function harness(overrides: Record<string, unknown> = {}) {
  const { metadata } = bundle();
  const calls: string[][] = [];
  const summaries: string[] = [];
  let ticks = 0;
  const options = {
    env,
    metadata,
    summary: (s: string) => summaries.push(s),
    wait: async () => {
      ticks += 10000;
    },
    now: () => ticks,
    timeout: 20000,
    health: async (url: string) => {
      expect(url).toBe('https://app.example/nocoreach/api/healthz');
    },
    cli: async (args: string[]) => {
      calls.push(args);
      if (args[0] === 'release')
        return { sourceCommit: sha, checksum: metadata.sha256 };
      if (args[0] === 'app') return { app: { currentDeploymentId: 'd1' } };
      if (args[1] === 'get')
        return {
          appId: 'nocoreach',
          releaseId: 'r1',
          status: 'succeeded',
          release: { checksum: metadata.sha256 },
        };
      return {
        appId: 'nocoreach',
        releaseId: 'r1',
        deployment: { id: 'd1' },
        request: null,
      };
    },
    ...overrides,
  };
  return { options, calls, summaries };
}
describe('Studio deployment boundary', () => {
  it('uses artifact SHA and checks release identity before health', async () => {
    const { options, calls, summaries } = harness();
    expect(await deploy(options)).toBe('succeeded');
    expect(calls[0]).toContain(sha);
    expect(calls[0]).toContain('--repository');
    expect(summaries.join('')).toContain('部署成功');
  });
  it('reports approval without polling or claiming deployed', async () => {
    let healthCalled = false;
    const { options, summaries } = harness({
      cli: async () => ({
        appId: 'nocoreach',
        releaseId: 'r1',
        deployment: null,
        request: { id: 'q1', status: 'pending', url: '/main/requests/q1' },
      }),
      health: async () => {
        healthCalled = true;
      },
    });
    expect(await deploy(options)).toBe('pending');
    expect(healthCalled).toBe(false);
    expect(summaries.join('')).toContain('等待 Studio 审批');
  });
  it('rejects missing credentials and unconfirmed or different targets before uploading', () => {
    for (const change of [
      { NB_STUDIO_API_KEY: '' },
      { STUDIO_APP_ID: 'other' },
      { STUDIO_TARGET: '' },
      { STUDIO_NODE_MAJOR: '26' },
      { NB_STUDIO_SERVER: 'http://insecure' },
    ])
      expect(() => validateConfig({ ...env, ...change })).toThrow();
  });
  it('rejects failed CLI JSON, malformed output and error envelopes', () => {
    for (const text of [
      'not json',
      JSON.stringify({ ok: false, error: { code: 'UNAUTHENTICATED' } }),
      JSON.stringify({ ok: true, status: 'success', result: {} }),
    ])
      expect(() => parseEnvelope(text)).toThrow();
  });
  it('propagates network, CLI and health failures', async () => {
    const network = harness({
      cli: async () => {
        throw Error('network failure');
      },
    });
    await expect(deploy(network.options)).rejects.toThrow('network failure');
    const health = harness({
      health: async () => {
        throw Error('health failure');
      },
    });
    await expect(deploy(health.options)).rejects.toThrow('health failure');
  });
  it.each(['failed', 'unexpected'])(
    'fails terminal/unknown status %s',
    async (status) => {
      const h = harness();
      const original = h.options.cli;
      h.options.cli = async (args: string[]) =>
        args[1] === 'get'
          ? { appId: 'nocoreach', releaseId: 'r1', status }
          : original(args);
      await expect(deploy(h.options)).rejects.toThrow('Deployment stopped');
    },
  );
  it('bounds queued/deploying polling', async () => {
    const h = harness();
    const original = h.options.cli;
    h.options.cli = async (args: string[]) =>
      args[1] === 'get'
        ? { appId: 'nocoreach', releaseId: 'r1', status: 'deploying' }
        : original(args);
    await expect(deploy(h.options)).rejects.toThrow('timed out');
  });
  it('rejects an old deployment despite a healthy endpoint', async () => {
    const h = harness();
    const original = h.options.cli;
    h.options.cli = async (args: string[]) =>
      args[0] === 'release'
        ? { sourceCommit: 'b'.repeat(40), checksum: h.options.metadata.sha256 }
        : original(args);
    await expect(deploy(h.options)).rejects.toThrow('commit mismatch');
  });
});

describe('archive contents', () => {
  function fixture(extra?: string) {
    const dir = mkdtempSync(join(tmpdir(), 'ci-archive-'));
    folders.push(dir);
    const files: Record<string, string> = {
      'config.example.yml': 'app: {}',
      'dist/package.json': JSON.stringify({
        version: '1.0.0',
        nocobase: {
          relocatable: true,
          buildTarget: {
            platform: 'linux',
            arch: 'x64',
            libc: 'glibc',
            nodeAbi: 137,
            nodeMajor: 24,
          },
        },
      }),
      'dist/server/standalone.js': '',
      'dist/client/index.html': '',
      'dist/cli/index.js': '',
      'dist/variables.json': '{}',
      'dist/node_modules/package/index.js': '',
    };
    for (const product of ['nocoreach', 'nocobase-runner']) {
      const prefix = `dist/runners/stable/${product}/`;
      const archive = `1.0.0/${product}-v1.0.0-universal.tar.gz`;
      files[prefix + archive] = 'distribution bytes';
      const temp = join(dir, product);
      writeFileSync(temp, files[prefix + archive]);
      files[prefix + 'manifest.json'] = JSON.stringify({
        schema: 1,
        product,
        versions: {
          '1.0.0': {
            targets: {
              universal: { file: archive, sha256: digest(temp), size: 18 },
            },
          },
        },
      });
      rmSync(temp);
    }
    if (extra) files[extra] = 'runtime secret';
    for (const [name, content] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), content);
    }
    const file = join(dir, 'bundle.tar.gz');
    const pack = () =>
      execFileSync('tar', [
        '-czf',
        file,
        '-C',
        dir,
        'dist',
        'config.example.yml',
      ]);
    pack();
    return { dir, file, pack };
  }
  it('accepts complete contents and rejects tampered distribution bytes', () => {
    const f = fixture();
    expect(() => inspectArchive(f.file)).not.toThrow();
    writeFileSync(
      join(
        f.dir,
        'dist/runners/stable/nocoreach/1.0.0/nocoreach-v1.0.0-universal.tar.gz',
      ),
      'tampered',
    );
    f.pack();
    expect(() => inspectArchive(f.file)).toThrow(/Distribution/);
  });
  it.each([
    'dist/config.yml',
    'dist/.env',
    'dist/.env.local',
    'dist/storage/upload',
    'dist/database.sqlite',
  ])('rejects runtime data %s', (name) => {
    expect(() => inspectArchive(fixture(name).file)).toThrow(/Runtime data/);
  });
  it('rejects missing client and missing Runner manifests', () => {
    for (const name of [
      'dist/client/index.html',
      'dist/runners/stable/nocobase-runner/manifest.json',
    ]) {
      const f = fixture();
      rmSync(join(f.dir, name));
      f.pack();
      expect(() => inspectArchive(f.file)).toThrow(/Missing/);
    }
  });
});
