// @vitest-environment node

import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../../scripts/ci/deploy-studio.mjs', import.meta.url),
);
const version = '1.2.3-beta.4';
let directory: string;
let releaseSha: string;
let unmergedSha: string;

function git(...args: string[]) {
  return execFileSync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'nocoreach-studio-release-'));
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Deployment test');
  git('config', 'user.email', 'deployment-test@example.com');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  writeFileSync(join(directory, 'package.json'), JSON.stringify({ version }));
  git('add', 'package.json');
  git('commit', '-m', 'Release fixture');
  releaseSha = git('rev-parse', 'HEAD');
  git('tag', '-a', `v${version}`, '-m', 'Annotated release fixture');
  git('update-ref', 'refs/remotes/origin/main', releaseSha);
  git('switch', '-c', 'unmerged');
  git('commit', '--allow-empty', '-m', 'Unmerged fixture');
  unmergedSha = git('rev-parse', 'HEAD');
});

afterAll(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});

function preflight(
  override: Record<string, string> = {},
  flag = '--check-release',
  sha = releaseSha,
) {
  git('checkout', '--detach', sha);
  return spawnSync(process.execPath, [script, flag], {
    cwd: directory,
    env: {
      PATH: process.env.PATH,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: `refs/tags/v${version}`,
      GITHUB_SHA: sha,
      STUDIO_APP_ID: 'reach',
      ...override,
    },
    encoding: 'utf8',
  });
}

describe('Studio release preflight', () => {
  it.each([
    ['nocoreach', 'push'],
    ['nocoreach', 'workflow_dispatch'],
    ['reach', 'push'],
    ['reach', 'workflow_dispatch'],
  ])(
    'checks an annotated release on main for %s / %s without credentials or an archive',
    (appId, event) => {
      const result = preflight({
        STUDIO_APP_ID: appId,
        GITHUB_EVENT_NAME: event,
      });
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
    },
  );

  it.each([
    'refs/heads/main',
    'refs/heads/feature',
    'refs/tags/v1.2.3',
    'refs/tags/v1.2.3-beta.5',
    'refs/tags/release-1.2.3-beta.4',
  ])('rejects a ref that does not match the package version: %s', (ref) => {
    const result = preflight({ GITHUB_REF: ref });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Release tag must match package.json');
  });

  it.each(['pull_request', 'schedule'])(
    'rejects an unsupported event: %s',
    (event) => {
      const result = preflight({ GITHUB_EVENT_NAME: event });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('tag push or manual dispatch');
    },
  );

  it('rejects a checkout that differs from the triggering commit', () => {
    const result = preflight({ GITHUB_SHA: unmergedSha });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Checkout does not match release commit');
  });

  it('rejects a matching release tag whose commit is not on main', () => {
    const result = preflight({}, '--check-release', unmergedSha);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Release commit must belong to origin/main',
    );
  });

  it('rejects the internal demo target even during manual release dispatch', () => {
    const result = preflight({
      STUDIO_APP_ID: 'nocoreach-demo',
      GITHUB_EVENT_NAME: 'workflow_dispatch',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('only deploy nocoreach or reach');
  });

  const deploymentConfig = {
    NB_STUDIO_SERVER: 'https://studio.example.com/main',
    NB_STUDIO_API_KEY: 'test-key',
    STUDIO_APP_URL: 'https://apps.example.com/reach/',
    STUDIO_TARGET: 'linux-x64',
    STUDIO_NODE_MAJOR: '24',
    STUDIO_CLI: '/unused/nb-studio',
  };

  it('accepts a verified release during deployment configuration checks', () => {
    const result = preflight(deploymentConfig, '--check-config');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it('rechecks main ancestry before deployment rather than trusting the build job', () => {
    const result = preflight(deploymentConfig, '--check-config', unmergedSha);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      'Release commit must belong to origin/main',
    );
  });

  it('still requires deployment credentials for a valid release', () => {
    const result = preflight(
      { ...deploymentConfig, NB_STUDIO_API_KEY: '' },
      '--check-config',
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Missing NB_STUDIO_API_KEY');
  });

  it('exits unsuccessfully when Studio accepts an upload but requires approval', () => {
    mkdirSync(join(directory, 'storage/exports'), { recursive: true });
    writeFileSync(
      join(directory, 'storage/exports/dist.tar.gz'),
      'fixture archive',
    );
    const cli = join(directory, 'pending-cli.mjs');
    writeFileSync(
      cli,
      `#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const checksum = createHash('sha256').update(readFileSync('storage/exports/dist.tar.gz')).digest('hex');
console.log(JSON.stringify({ ok: true, status: 'success', result: { data: {
  superseded: false,
  release: { id: 'release-1', appId: 'reach', sourceCommit: process.env.GITHUB_SHA, checksum },
  deployed: { appId: 'reach', releaseId: 'release-1', request: { id: 'request-1', status: 'pending' } }
} } }));
`,
    );
    chmodSync(cli, 0o755);
    const result = preflight(
      {
        ...deploymentConfig,
        STUDIO_CLI: cli,
        GITHUB_REPOSITORY: 'example/repository',
      },
      '',
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Studio deployment pending approval');
    expect(result.stdout).not.toContain('deployment succeeded');
  });

  it('verifies the new release commit passed by a workflow dispatched on main', () => {
    const result = preflight(
      {
        ...deploymentConfig,
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main',
        GITHUB_SHA: 'a'.repeat(40),
        STUDIO_RELEASE_TAG: `v${version}`,
        STUDIO_RELEASE_SHA: releaseSha,
      },
      '--check-config',
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
  });

  it.each([
    { STUDIO_RELEASE_SHA: '' },
    { STUDIO_RELEASE_TAG: '' },
    { STUDIO_RELEASE_TAG: 'v1.2.3-beta.4\nref=bad' },
    { STUDIO_RELEASE_SHA: 'main' },
    { GITHUB_REF: 'refs/heads/feature' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { STUDIO_APP_ID: 'nocoreach' },
  ])('rejects an invalid release workflow source: %j', (override) => {
    const result = preflight(
      {
        ...deploymentConfig,
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REF: 'refs/heads/main',
        STUDIO_RELEASE_TAG: `v${version}`,
        STUDIO_RELEASE_SHA: releaseSha,
        ...override,
      },
      '--check-config',
    );
    expect(result.status).toBe(1);
  });

  it('rejects a main commit that is different from the release tag', () => {
    git('checkout', '--detach', releaseSha);
    git('commit', '--allow-empty', '-m', 'Later main commit');
    const later = git('rev-parse', 'HEAD');
    git('update-ref', 'refs/remotes/origin/main', later);
    try {
      const result = preflight({}, '--check-release', later);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Release tag does not point to the checked-out commit',
      );
    } finally {
      git('update-ref', 'refs/remotes/origin/main', releaseSha);
    }
  });
});
