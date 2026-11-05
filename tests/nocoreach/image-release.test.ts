// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import {
  imageRelease,
  validateImageArtifact,
} from '../../scripts/ci/image-release.mjs';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function release(version = '1.0.0-beta.75') {
  const root = mkdtempSync(join(tmpdir(), 'nocoreach-image-'));
  directories.push(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Image test');
  git('config', 'user.email', 'image@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  const manifest = {
    name: 'nocoreach',
    version,
    dependencies: { '@nocobase/db-postgres': '0.1.0-beta.5' },
    nocobase: { relocatable: true },
  };
  writeFileSync(join(root, 'package.json'), JSON.stringify(manifest));
  git('add', '.');
  git('commit', '-m', 'Release fixture');
  git('tag', `v${version}`);
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  const sha = git('rev-parse', 'HEAD');
  const env = {
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: 'refs/heads/main',
    RELEASE_TAG: `v${version}`,
    RELEASE_SHA: sha,
  };
  return { root, git, sha, env, manifest };
}

it.each(['1.0.0-beta.75', '1.0.0'])(
  'selects the exact released image for %s',
  (version) => {
    const { root, env, sha } = release(version);
    expect(imageRelease(root, env)).toEqual({
      version,
      sha,
      image: `registry.cn-beijing.aliyuncs.com/nocobase/nocoreach:${version}`,
    });
  },
);

it('rejects a different commit, tag, event or dispatch branch', () => {
  const { root, env } = release();
  for (const override of [
    { RELEASE_SHA: '0'.repeat(40) },
    { RELEASE_TAG: 'v1.0.0\nimage=other' },
    { GITHUB_EVENT_NAME: 'pull_request' },
    { GITHUB_REF: 'refs/heads/feature' },
  ])
    expect(() => imageRelease(root, { ...env, ...override })).toThrow();
});

it('rejects release tags on commits outside main', () => {
  const { root, git, env } = release();
  git('checkout', '-b', 'unmerged');
  git('commit', '--allow-empty', '-m', 'Unmerged change');
  git('tag', '-f', env.RELEASE_TAG);
  expect(() =>
    imageRelease(root, { ...env, RELEASE_SHA: git('rev-parse', 'HEAD') }),
  ).toThrow();
});

it('rejects mismatched versions and an artifact missing the production driver', () => {
  const { root, manifest } = release();
  mkdirSync(join(root, 'dist'));
  const artifact = join(root, 'dist/package.json');
  writeFileSync(artifact, JSON.stringify(manifest));
  expect(() => validateImageArtifact(root, manifest.version)).not.toThrow();
  expect(() => validateImageArtifact(root, '1.0.0')).toThrow('version');
  writeFileSync(artifact, JSON.stringify({ ...manifest, dependencies: {} }));
  expect(() => validateImageArtifact(root, manifest.version)).toThrow(
    'PostgreSQL',
  );
});
