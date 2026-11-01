// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  assertDemoEntry,
  previewApp,
  previewUrl,
  publishPreview,
  validatePreviewConfig,
  validatePreviewHealth,
} from '../../scripts/ci/preview-studio.mjs';
import {
  assertDemoData,
  verificationFailure,
} from '../../scripts/ci/verify-preview.mjs';

const sha = 'a'.repeat(40);
const env = {
  NB_STUDIO_SERVER: 'https://studio.example.com/main',
  NB_STUDIO_API_KEY: 'test-key',
  STUDIO_CLI: '/tmp/studio-cli/nb-studio',
  STUDIO_TARGET: 'linux-x64',
  STUDIO_NODE_MAJOR: '24',
  PREVIEW_PR_NUMBER: '332',
  PREVIEW_HEAD_SHA: sha,
};
const metadata = {
  repository: 'nocobase/NocoReach',
  sha,
  sha256: 'b'.repeat(64),
};
const appId = 'nocoreach-pr-332';
const demoOn = [
  { name: 'NOCOBASE_DEMO_MODE', value: 'true', source: 'app' },
  { name: 'API_TIMEOUT', value: null, source: 'unset' },
];

function scenario(variables: unknown = demoOn) {
  const release = {
    id: 'release-1',
    appId,
    sourceCommit: sha,
    checksum: metadata.sha256,
  };
  const deployment = {
    appId,
    releaseId: release.id,
    status: 'succeeded',
    release,
  };
  const uploaded = {
    superseded: false,
    reused: false,
    release,
    deployed: {
      appId,
      releaseId: release.id,
      deployment: { id: 'deployment-1' },
      request: null as object | null,
    },
  };
  const cli = vi.fn(async (args: string[]) => {
    if (args[0] === 'app' && args[1] === 'ensure')
      return { app: { id: appId } };
    if (args[0] === 'app' && args[1] === 'env') return variables;
    if (args[0] === 'deploy' && args[1] === '--app') return uploaded;
    if (args[0] === 'release' && args[1] === 'get') return release;
    if (args[0] === 'deploy' && args[1] === 'get') return deployment;
    if (args[0] === 'app' && args[1] === 'get')
      return {
        app: { currentDeploymentId: 'deployment-1' },
        url: `/${appId}/`,
      };
    throw new Error(`unexpected ${args.join(' ')}`);
  });
  return {
    cli,
    release,
    deployment,
    uploaded,
    health: vi.fn(async () => undefined),
    verify: vi.fn(async () => undefined),
    summary: vi.fn(),
  };
}

describe('Studio preview', () => {
  it('does not expose browser request cookies in failure diagnostics', () => {
    const failure = verificationFailure(
      new Error('Request failed; cookie: private-session-value'),
    );
    expect(failure.message).toContain('Preview verification failed');
    expect(failure.message).not.toContain('private-session-value');
    expect(failure.cause).toBeUndefined();
  });
  it('names only the pull request’s own preview App', () => {
    expect(previewApp(env)).toBe(appId);
    for (const number of ['', '0', '12a', '../nocoreach', '1234567890'])
      expect(() => previewApp({ ...env, PREVIEW_PR_NUMBER: number })).toThrow();
  });

  it('requires the configuration and the pull request head', () => {
    expect(() => validatePreviewConfig(env)).not.toThrow();
    expect(() =>
      validatePreviewConfig({ ...env, NB_STUDIO_API_KEY: '' }),
    ).toThrow('Missing NB_STUDIO_API_KEY');
    expect(() =>
      validatePreviewConfig({ ...env, PREVIEW_HEAD_SHA: 'main' }),
    ).toThrow('PREVIEW_HEAD_SHA');
    expect(() =>
      validatePreviewConfig({
        ...env,
        NB_STUDIO_SERVER: 'http://studio.example.com',
      }),
    ).toThrow('Invalid HTTPS base URL');
  });

  it('deploys nothing unless the App runs in Demo Mode', async () => {
    for (const variables of [
      [],
      [{ name: 'NOCOBASE_DEMO_MODE', value: 'false', source: 'app' }],
      [{ name: 'NOCOBASE_DEMO_MODE', value: null, source: 'unset' }],
    ]) {
      const { cli, health, summary } = scenario(variables);
      await expect(
        publishPreview({ env, metadata, cli, health, summary }),
      ).rejects.toThrow('NOCOBASE_DEMO_MODE=true');
      expect(cli.mock.calls.some(([args]) => args[0] === 'deploy')).toBe(false);
    }
    expect(() => assertDemoEntry(demoOn, appId)).not.toThrow();
  });

  it('publishes the head to its preview and checks the running App', async () => {
    const { cli, health, verify, summary } = scenario();
    await expect(
      publishPreview({ env, metadata, cli, health, verify, summary }),
    ).resolves.toBe(`https://studio.example.com/${appId}/`);
    expect(cli).toHaveBeenCalledWith([
      'app',
      'ensure',
      appId,
      '--environment',
      'preview',
      '--json',
    ]);
    expect(cli).toHaveBeenCalledWith(
      expect.arrayContaining(['deploy', '--app', appId, '--sha', sha]),
    );
    expect(health).toHaveBeenCalledWith(
      `https://studio.example.com/${appId}/api/healthz`,
      appId,
    );
    expect(verify).toHaveBeenCalledWith(`https://studio.example.com/${appId}/`);
    expect(verify.mock.invocationCallOrder[0]).toBeGreaterThan(
      health.mock.invocationCallOrder[0],
    );
    expect(summary.mock.calls.at(-1)?.[0]).toContain('Preview ready:');
  });

  it('refuses another commit, an approval request or another App', async () => {
    const other = scenario();
    await expect(
      publishPreview({
        env,
        metadata: { ...metadata, sha: 'c'.repeat(40) },
        ...other,
      }),
    ).rejects.toThrow('not the pull request head');
    const pending = scenario();
    pending.uploaded.deployed.request = { id: 'q' };
    await expect(publishPreview({ env, metadata, ...pending })).rejects.toThrow(
      'deployment approval',
    );
    expect(() =>
      validatePreviewHealth({ ok: true, basePath: '/nocoreach' }, appId),
    ).toThrow('another app');
    expect(() =>
      previewUrl(
        { url: 'https://elsewhere.example.com/x/' },
        env.NB_STUDIO_SERVER,
        appId,
      ),
    ).toThrow('not on the Studio server');
    expect(() =>
      previewUrl({ url: '/main/' }, env.NB_STUDIO_SERVER, appId),
    ).toThrow('another App');
  });

  it('requires completed, populated demo data before declaring readiness', async () => {
    const data = {
      enabled: true,
      available: true,
      datasetId: 'nocoreach',
      present: true,
      state: 'ready',
      failure: null,
      finishedAt: '2026-11-01T00:00:00Z',
      counts: { projects: 2, accounts: 6, tasks: 86, opportunities: 10 },
    };
    expect(() => assertDemoData(data)).not.toThrow();
    for (const invalid of [
      { ...data, present: false, state: null },
      { ...data, state: 'importing' },
      { ...data, state: 'failed' },
      { ...data, counts: { ...data.counts, tasks: 0 } },
    ]) {
      const value = scenario();
      value.verify.mockImplementation(async () => assertDemoData(invalid));
      await expect(
        publishPreview({ env, metadata, ...value }),
      ).rejects.toThrow();
      expect(value.health).toHaveBeenCalledOnce();
      expect(
        value.summary.mock.calls.some(([text]) =>
          text.includes('Preview ready:'),
        ),
      ).toBe(false);
      expect(
        value.cli.mock.calls.some(([args]) =>
          args.some((arg) => ['import', 'clear', 'reset'].includes(arg)),
        ),
      ).toBe(false);
    }
  });

  it('blocks readiness when native entry or a representative page fails', async () => {
    const value = scenario();
    value.verify.mockRejectedValue(new Error('visitor page unavailable'));
    await expect(publishPreview({ env, metadata, ...value })).rejects.toThrow(
      'visitor page unavailable',
    );
    expect(
      value.summary.mock.calls.some(([text]) =>
        text.includes('Preview ready:'),
      ),
    ).toBe(false);
  });

  it('pins fresh archive checksums and independently checks reused releases', async () => {
    const fresh = scenario();
    fresh.release.checksum = 'c'.repeat(64);
    await expect(publishPreview({ env, metadata, ...fresh })).rejects.toThrow(
      'checksum mismatch',
    );
    expect(fresh.health).not.toHaveBeenCalled();
    expect(fresh.verify).not.toHaveBeenCalled();

    const reused = scenario();
    reused.uploaded.reused = true;
    reused.release.checksum = 'c'.repeat(64);
    await publishPreview({ env, metadata, ...reused });
    expect(
      reused.cli.mock.calls.filter(([args]) => args[0] === 'release'),
    ).toHaveLength(2);
    expect(
      reused.summary.mock.calls.some(([text]) =>
        text.includes(`Release SHA-256: ${'c'.repeat(64)}`),
      ),
    ).toBe(true);

    const corrupt = scenario();
    corrupt.uploaded.reused = true;
    corrupt.cli.mockImplementation(async (args: string[]) => {
      if (args[0] === 'app' && args[1] === 'ensure') return {};
      if (args[0] === 'app' && args[1] === 'env') return demoOn;
      if (args[0] === 'deploy') return corrupt.uploaded;
      if (args[0] === 'release')
        return { ...corrupt.release, checksum: 'c'.repeat(64) };
      throw new Error('unexpected read');
    });
    await expect(publishPreview({ env, metadata, ...corrupt })).rejects.toThrow(
      'checksum mismatch',
    );
    expect(corrupt.health).not.toHaveBeenCalled();
  });

  it('rejects superseded builds and checksum drift in the running deployment', async () => {
    const superseded = scenario();
    superseded.uploaded.superseded = true;
    await expect(
      publishPreview({ env, metadata, ...superseded }),
    ).rejects.toThrow('superseded');
    const drift = scenario();
    drift.deployment.release = { ...drift.release, checksum: 'd'.repeat(64) };
    await expect(publishPreview({ env, metadata, ...drift })).rejects.toThrow(
      'Deployed checksum mismatch',
    );
    expect(drift.verify).not.toHaveBeenCalled();
  });

  it('runs only for labeled pull requests from this repository, with the preview key', () => {
    const workflow = readFileSync('.github/workflows/preview.yml', 'utf8');
    expect(workflow).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    );
    expect(workflow).toContain(
      "contains(github.event.pull_request.labels.*.name, 'preview')",
    );
    expect(workflow).toContain(
      'ref: ${{ github.event.pull_request.head.sha }}',
    );
    expect(workflow).toContain('secrets.NB_STUDIO_PREVIEW_API_KEY');
    expect(workflow).not.toContain('secrets.NB_STUDIO_API_KEY');
    expect(workflow).not.toContain('pull_request_target');
    expect(workflow).toContain('name: studio-preview');
    expect(workflow).toContain(
      'name: Preview PR ${{ github.event.pull_request.number }} at ${{ github.event.pull_request.head.sha }}',
    );
    expect(workflow.split('secrets.NB_STUDIO_PREVIEW_API_KEY')).toHaveLength(2);
    expect(
      workflow.indexOf('secrets.NB_STUDIO_PREVIEW_API_KEY'),
    ).toBeGreaterThan(workflow.indexOf('name: Publish the preview'));
  });
});
