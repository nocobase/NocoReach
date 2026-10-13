// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  deploy,
  parseEnvelope,
  validateConfig,
} from '../../scripts/ci/deploy-studio.mjs';

const env = {
  NB_STUDIO_SERVER: 'https://studio.example.com/main',
  NB_STUDIO_API_KEY: 'test-key',
  STUDIO_APP_URL: 'https://apps.example.com/nocoreach/',
  STUDIO_TARGET: 'linux-x64',
  STUDIO_NODE_MAJOR: '24',
  STUDIO_CLI: '/tmp/studio-cli/nb-studio',
};
const metadata = {
  repository: 'nocobase/NocoReach',
  sha: 'a'.repeat(40),
  sha256: 'b'.repeat(64),
};

function scenario() {
  const release = {
    id: 'release-1',
    appId: 'nocoreach',
    sourceCommit: metadata.sha,
    checksum: metadata.sha256,
  };
  const uploaded = {
    superseded: false,
    release,
    deployed: {
      appId: 'nocoreach',
      releaseId: release.id,
      deployment: { id: 'deployment-1' } as { id: string } | null,
      request: null as { id: string; status: string; url?: string } | null,
    },
  };
  const deployment = {
    id: 'deployment-1',
    appId: 'nocoreach',
    releaseId: release.id,
    status: 'succeeded',
    release: { ...release },
  };
  const app = { app: { currentDeploymentId: deployment.id } };
  const cli = vi.fn(async (args: string[]) => {
    if (args[0] === 'deploy' && args[1] === '--app') return uploaded;
    if (args[0] === 'deploy' && args[1] === 'get') return deployment;
    if (args[0] === 'release') return release;
    if (args[0] === 'app') return app;
    throw new Error('Unexpected CLI command');
  });
  let time = 0;
  return {
    uploaded,
    deployment,
    release,
    app,
    options: {
      env,
      metadata,
      cli,
      health: vi.fn(async () => {}),
      summary: vi.fn(),
      now: () => time,
      wait: vi.fn(async (ms: number) => {
        time += ms;
      }),
      timeout: 20000,
    },
  };
}

describe('Studio deployment', () => {
  it('uploads the tested archive and verifies the active release before probing health', async () => {
    const { options } = scenario();
    await expect(deploy(options)).resolves.toBe('succeeded');
    expect(options.cli.mock.calls.map(([args]) => args)).toEqual([
      [
        'deploy',
        '--app',
        'nocoreach',
        '--repository',
        metadata.repository,
        '--sha',
        metadata.sha,
        '--file',
        'storage/exports/dist.tar.gz',
        '--json',
      ],
      ['deploy', 'get', 'nocoreach', 'deployment-1', '--json'],
      ['release', 'get', 'nocoreach', 'release-1', '--json'],
      ['app', 'get', 'nocoreach', '--json'],
    ]);
    expect(options.health).toHaveBeenCalledWith(
      'https://apps.example.com/nocoreach/api/healthz',
    );
    expect(options.summary).toHaveBeenCalledWith(
      expect.stringContaining(metadata.sha256),
    );
  });

  it('reports pending approval without claiming a deployment or approving it', async () => {
    const { uploaded, options } = scenario();
    uploaded.deployed.deployment = null;
    uploaded.deployed.request = { id: 'request-1', status: 'pending' };
    await expect(deploy(options)).resolves.toBe('pending');
    expect(options.cli).toHaveBeenCalledTimes(1);
    expect(options.health).not.toHaveBeenCalled();
    expect(options.summary).toHaveBeenCalledWith(
      expect.stringContaining('等待 Studio 审批，尚未上线'),
    );
  });

  it.each(['sourceCommit', 'checksum', 'appId'] as const)(
    'rejects an upload with a mismatched %s',
    async (key) => {
      const { uploaded, options } = scenario();
      uploaded.release[key] = 'wrong';
      await expect(deploy(options)).rejects.toThrow();
      expect(options.cli).toHaveBeenCalledTimes(1);
      expect(options.health).not.toHaveBeenCalled();
    },
  );

  it('rejects a superseded upload', async () => {
    const { uploaded, options } = scenario();
    uploaded.superseded = true;
    await expect(deploy(options)).rejects.toThrow('superseded');
  });

  it.each(['appId', 'releaseId'] as const)(
    'rejects a different deployment %s',
    async (key) => {
      const { deployment, options } = scenario();
      deployment[key] = 'wrong';
      await expect(deploy(options)).rejects.toThrow();
      expect(options.health).not.toHaveBeenCalled();
    },
  );

  it('waits through queued and deploying states', async () => {
    const { deployment, options } = scenario();
    deployment.status = 'queued';
    options.wait.mockImplementation(async () => {
      deployment.status =
        deployment.status === 'queued' ? 'deploying' : 'succeeded';
    });
    await expect(deploy(options)).resolves.toBe('succeeded');
    expect(options.wait).toHaveBeenCalledTimes(2);
  });

  it('fails on a remote deployment failure', async () => {
    const { deployment, options } = scenario();
    deployment.status = 'failed';
    await expect(deploy(options)).rejects.toThrow('Deployment stopped');
    expect(options.health).not.toHaveBeenCalled();
  });

  it('times out without retrying the upload', async () => {
    const { deployment, options } = scenario();
    deployment.status = 'deploying';
    await expect(deploy(options)).rejects.toThrow('timed out');
    expect(
      options.cli.mock.calls.filter(([args]) => args[1] === '--app'),
    ).toHaveLength(1);
    expect(options.health).not.toHaveBeenCalled();
  });

  it('does not accept an older healthy release as success', async () => {
    const { app, options } = scenario();
    app.app.currentDeploymentId = 'deployment-previous';
    await expect(deploy(options)).rejects.toThrow(
      'Target no longer runs this deployment',
    );
    expect(options.health).not.toHaveBeenCalled();
  });

  it('propagates failed health checks', async () => {
    const { options } = scenario();
    options.health.mockRejectedValue(new Error('Health check HTTP 503'));
    await expect(deploy(options)).rejects.toThrow('Health check HTTP 503');
  });

  it('fails before uploading when configuration is missing', async () => {
    const { options } = scenario();
    options.env = { ...env, NB_STUDIO_API_KEY: '' };
    await expect(deploy(options)).rejects.toThrow('Missing NB_STUDIO_API_KEY');
    expect(options.cli).not.toHaveBeenCalled();
  });

  it.each([
    { STUDIO_TARGET: 'linux-arm64' },
    { STUDIO_NODE_MAJOR: '22' },
    { NB_STUDIO_SERVER: 'http://studio.example.com/main' },
    { STUDIO_APP_URL: 'https://user:password@apps.example.com/nocoreach' },
  ])('rejects an incompatible target or invalid URL: %j', (override) => {
    expect(() => validateConfig({ ...env, ...override })).toThrow();
  });

  it('accepts successful CLI envelopes and redacts malformed or failed ones', () => {
    expect(
      parseEnvelope(
        JSON.stringify({
          ok: true,
          status: 'success',
          result: { data: { id: 'release-1' } },
        }),
      ),
    ).toEqual({ id: 'release-1' });
    expect(() => parseEnvelope('secret-ticket invalid json')).toThrow(
      'Studio CLI returned invalid JSON',
    );
    expect(() =>
      parseEnvelope(
        JSON.stringify({ ok: false, error: { message: 'secret-ticket' } }),
      ),
    ).toThrow('Studio CLI did not report success');
    expect(() => parseEnvelope('null')).toThrow(
      'Studio CLI did not report success',
    );
  });
});
