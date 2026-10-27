// @vitest-environment node

import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
});
