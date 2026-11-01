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
  const release = { id: 'release-1', appId, sourceCommit: sha };
  const deployment = { appId, releaseId: release.id, status: 'succeeded' };
  const cli = vi.fn(async (args: string[]) => {
    if (args[0] === 'app' && args[1] === 'ensure')
      return { app: { id: appId } };
    if (args[0] === 'app' && args[1] === 'env') return variables;
    if (args[0] === 'deploy' && args[1] === '--app')
      return {
        release,
        deployed: { deployment: { id: 'deployment-1' }, request: null },
      };
    if (args[0] === 'deploy' && args[1] === 'get') return deployment;
    if (args[0] === 'app' && args[1] === 'get')
      return {
        app: { currentDeploymentId: 'deployment-1' },
        url: `/${appId}/`,
      };
    throw new Error(`unexpected ${args.join(' ')}`);
  });
  return { cli, health: vi.fn(async () => undefined), summary: vi.fn() };
}

describe('Studio preview', () => {
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
    const { cli, health, summary } = scenario();
    await expect(
      publishPreview({ env, metadata, cli, health, summary }),
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
    pending.cli.mockImplementation(async (args: string[]) =>
      args[0] === 'deploy'
        ? {
            release: { id: 'r', appId, sourceCommit: sha },
            deployed: { deployment: { id: 'd' }, request: { id: 'q' } },
          }
        : args[1] === 'env'
          ? demoOn
          : {},
    );
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
      ),
    ).toThrow('not on the Studio server');
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
  });
});
