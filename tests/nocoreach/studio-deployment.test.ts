// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import {
  deploy,
  deploymentApp,
  parseEnvelope,
  runStudioCli,
  validateConfig,
  validateHealth,
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

function createScenario(appId: string) {
  const release = {
    id: 'release-1',
    appId,
    sourceCommit: metadata.sha,
    checksum: metadata.sha256,
  };
  const uploaded = {
    superseded: false,
    release,
    deployed: {
      appId,
      releaseId: release.id,
      deployment: { id: 'deployment-1' } as { id: string } | null,
      request: null as { id: string; status: string; url?: string } | null,
    },
  };
  const deployment = {
    id: 'deployment-1',
    appId,
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
      env: {
        ...env,
        STUDIO_APP_ID: appId,
        GITHUB_EVENT_NAME:
          appId === 'nocoreach-demo' ? 'workflow_dispatch' : 'push',
        STUDIO_APP_URL: `https://apps.example.com/${appId}/`,
      },
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

describe.each(['nocoreach', 'nocoreach-demo'])(
  'Studio deployment to %s',
  (appId) => {
    const scenario = () => createScenario(appId);
    it('uploads the tested archive and verifies the active release before probing health', async () => {
      const { options } = scenario();
      await expect(deploy(options)).resolves.toBe('succeeded');
      expect(options.cli.mock.calls.map(([args]) => args)).toEqual([
        [
          'deploy',
          '--app',
          appId,
          '--repository',
          metadata.repository,
          '--sha',
          metadata.sha,
          '--file',
          'storage/exports/dist.tar.gz',
          '--json',
        ],
        ['deploy', 'get', appId, 'deployment-1', '--json'],
        ['release', 'get', appId, 'release-1', '--json'],
        ['app', 'get', appId, '--json'],
      ]);
      expect(options.health).toHaveBeenCalledWith(
        `https://apps.example.com/${appId}/api/healthz`,
        appId,
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
      options.env = { ...options.env, NB_STUDIO_API_KEY: '' };
      await expect(deploy(options)).rejects.toThrow(
        'Missing NB_STUDIO_API_KEY',
      );
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
  },
);

describe('Studio demo dispatch boundary', () => {
  it('keeps existing regular deployments targeting nocoreach', () => {
    expect(deploymentApp(env)).toBe('nocoreach');
  });

  it.each(['push', 'pull_request', 'schedule', undefined])(
    'rejects demo invocation from %s before uploading',
    async (eventName) => {
      const { options } = createScenario('nocoreach-demo');
      options.env.GITHUB_EVENT_NAME = eventName as string;
      await expect(deploy(options)).rejects.toThrow('requires manual dispatch');
      expect(options.cli).not.toHaveBeenCalled();
    },
  );

  it('rejects an unknown target before uploading', async () => {
    const { options } = createScenario('unexpected-app');
    await expect(deploy(options)).rejects.toThrow(
      'Unsupported Studio application',
    );
    expect(options.cli).not.toHaveBeenCalled();
  });

  it('rejects a regular-app response during demo deployment', async () => {
    const { options, uploaded } = createScenario('nocoreach-demo');
    uploaded.release.appId = 'nocoreach';
    await expect(deploy(options)).rejects.toThrow('Wrong uploaded release app');
    expect(options.health).not.toHaveBeenCalled();
  });
});

describe('Studio preflight and health identity', () => {
  it.each([
    ['nocoreach', 'push', 'refs/heads/main', 0],
    ['nocoreach-demo', 'workflow_dispatch', 'refs/heads/main', 0],
    ['nocoreach-demo', 'push', 'refs/heads/main', 1],
    ['nocoreach-demo', 'workflow_dispatch', 'refs/heads/feature', 1],
    ['nocoreach', 'workflow_dispatch', 'refs/heads/feature', 1],
  ])(
    'preflights %s / %s / %s without a build or upload',
    (appId, event, ref, status) => {
      const result = spawnSync(
        process.execPath,
        ['scripts/ci/deploy-studio.mjs', '--check-config'],
        {
          env: {
            ...env,
            STUDIO_APP_ID: String(appId),
            GITHUB_EVENT_NAME: String(event),
            GITHUB_REF: String(ref),
          },
          encoding: 'utf8',
        },
      );
      expect(result.status).toBe(status);
    },
  );

  it('rejects a healthy regular application at the demo URL', () => {
    expect(() =>
      validateHealth(
        { ok: true, app: { name: 'nocoreach' } },
        'nocoreach-demo',
      ),
    ).toThrow('another app');
    expect(() =>
      validateHealth(
        { ok: true, app: { name: 'nocoreach-demo' } },
        'nocoreach-demo',
      ),
    ).not.toThrow();
    expect(() =>
      validateHealth(
        { ok: false, app: { name: 'nocoreach-demo' } },
        'nocoreach-demo',
      ),
    ).toThrow('ok=true');
  });
});

describe('Studio CLI process boundaries', () => {
  const uploadArgs = [
    'deploy',
    '--app',
    'nocoreach',
    '--file',
    'archive.tar.gz',
    '--json',
  ];
  const success = JSON.stringify({
    ok: true,
    status: 'success',
    result: { data: { id: 'release-1' } },
  });

  it('allows ten minutes for archive uploads', () => {
    const execute = vi.fn(() => success);
    expect(runStudioCli(env, uploadArgs, execute)).toEqual({ id: 'release-1' });
    expect(execute).toHaveBeenCalledExactlyOnceWith(
      env.STUDIO_CLI,
      uploadArgs,
      {
        encoding: 'utf8',
        timeout: 10 * 60_000,
        maxBuffer: 4 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
  });

  it.each([
    ['deploy', 'get', 'nocoreach', 'deployment-1', '--json'],
    ['release', 'get', 'nocoreach', 'release-1', '--json'],
    ['app', 'get', 'nocoreach', '--json'],
  ])('keeps %s %s reads on a short timeout', (...args) => {
    const execute = vi.fn(() => success);
    runStudioCli(env, args, execute);
    expect(execute.mock.calls[0]?.[2]).toMatchObject({ timeout: 3 * 60_000 });
  });

  it.each([
    [{ code: 'ETIMEDOUT', status: null }, 'process timeout after 600s'],
    [{ code: 'ENOBUFS', status: null }, 'output exceeded'],
    [{ code: 'ENOENT', status: null }, 'executable not found'],
    [
      { code: 'EIO', status: null },
      'transport/process error; exit=unavailable',
    ],
    [
      {
        status: 3,
        stdout: JSON.stringify({
          error: { code: 'ACTION_REQUIRED', message: 'secret-ticket' },
        }),
      },
      'ACTION_REQUIRED; exit=3',
    ],
    [
      {
        status: 1,
        stdout: JSON.stringify({ error: { code: 'secret-ticket' } }),
      },
      'transport/process error; exit=1',
    ],
  ])('reports a safe diagnosis without retrying: %j', (failure, expected) => {
    const execute = vi.fn(() => {
      throw Object.assign(new Error('secret-ticket'), {
        stdout: 'secret-ticket',
        stderr: 'secret-ticket',
        ...failure,
      });
    });
    let caught: Error | undefined;
    try {
      runStudioCli(env, uploadArgs, execute);
    } catch (error) {
      caught = error as Error;
    }
    expect(caught?.message).toContain(expected);
    expect(caught?.message).toContain(
      'outcome is unknown and may already exist',
    );
    expect(caught?.message).toContain('do not re-upload automatically');
    expect(caught?.message).not.toContain('secret-ticket');
    expect(caught?.cause).toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('recognizes an actual timed-out child without leaking its output', () => {
    const execute = vi.fn((_file, _args, options) =>
      execFileSync(
        process.execPath,
        [
          '-e',
          "process.stdout.write('secret-ticket'); process.stderr.write('secret-ticket'); setInterval(() => {}, 1000)",
        ],
        { ...options, timeout: 150 },
      ),
    );
    let caught: Error | undefined;
    try {
      runStudioCli(env, uploadArgs, execute);
    } catch (error) {
      caught = error as Error;
    }
    expect(caught?.message).toContain('process timeout after 600s');
    expect(caught?.message).not.toContain('secret-ticket');
    expect(caught?.cause).toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('does not continue or retry after an ambiguous upload outcome', async () => {
    const { options } = createScenario('nocoreach');
    const execute = vi.fn(() => {
      throw Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    });
    options.cli.mockImplementation(async (args) =>
      runStudioCli(env, args, execute),
    );
    await expect(deploy(options)).rejects.toThrow('outcome is unknown');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(options.cli).toHaveBeenCalledTimes(1);
    expect(options.health).not.toHaveBeenCalled();
    expect(options.wait).not.toHaveBeenCalled();
    expect(options.summary.mock.calls.flat().join(' ')).not.toContain(
      '部署成功',
    );
  });
});
