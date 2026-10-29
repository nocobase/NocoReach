// @vitest-environment node
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  prepareRelease,
  publishRelease,
  releaseVersion,
} from '../../scripts/ci/release.mjs';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function repository() {
  const directory = mkdtempSync(join(tmpdir(), 'nocoreach-release-'));
  directories.push(directory);
  const root = join(directory, 'checkout');
  const remote = join(directory, 'remote.git');
  const notesFile = join(directory, 'release-notes.md');
  mkdirSync(root);
  const git = (...args: string[]) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '--initial-branch=main');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('config', 'tag.gpgsign', 'false');
  git('init', '--bare', '--initial-branch=main', remote);
  git('remote', 'add', 'origin', remote);
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify(
      {
        name: 'nocoreach',
        version: '1.0.0-beta.72',
        nocobase: { defaultTemplateVersion: '1.0.0-beta.68' },
      },
      null,
      2,
    ) + '\n',
  );
  writeFileSync(
    join(root, 'CHANGELOG.md'),
    '# Changes\n\n## Older\n\n- Older change.\n',
  );
  mkdirSync(join(root, 'changelog/unreleased'), { recursive: true });
  writeFileSync(join(root, 'changelog/unreleased/README.md'), '# Notes\n');
  writeFileSync(
    join(root, 'changelog/unreleased/fix-example.md'),
    '## Example\n\n- Fixed an example.\n',
  );
  git('add', '.');
  git('commit', '-m', 'Source to release');
  git('push', '-u', 'origin', 'main');
  const sourceSha = git('rev-parse', 'HEAD');
  const prepare = (requestedVersion = '') =>
    prepareRelease(root, { sourceSha, requestedVersion, notesFile });
  return { root, remote, notesFile, git, sourceSha, prepare };
}

describe('release versions', () => {
  it.each([
    ['1.0.0-beta.72', '', '1.0.0-beta.73'],
    ['1.2.3', '', '1.2.4'],
    ['1.0.0-rc.1', '', '1.0.0-rc.2'],
    ['1.0.0-beta.72', 'v1.0.0', '1.0.0'],
    ['1.0.0-beta.9', '1.0.0-beta.10', '1.0.0-beta.10'],
    ['1.0.0', '1.1.0-beta.1', '1.1.0-beta.1'],
  ])('selects %s -> %s', (current, requested, expected) => {
    expect(releaseVersion(current, requested)).toBe(expected);
  });

  it.each([
    '1.0.0-beta.72',
    '1.0.0-beta.2',
    '0.9.0',
    '1.0.0-alpha.99',
    '1.0.0-beta.073',
    '1.0.0-beta.73\nsha=bad',
    '$(echo bad)',
    'latest',
  ])('rejects a non-increasing or invalid version: %s', (version) => {
    expect(() => releaseVersion('1.0.0-beta.72', version)).toThrow();
  });
});

describe('release publication', () => {
  it('prepares version and folded notes locally, then publishes matching main and tag', () => {
    const { root, notesFile, git, sourceSha, prepare } = repository();
    const release = prepare();
    expect(release).toMatchObject({
      version: '1.0.0-beta.73',
      tag: 'v1.0.0-beta.73',
      base_sha: sourceSha,
      prerelease: 'true',
    });
    expect(
      JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')),
    ).toMatchObject({
      version: release.version,
      nocobase: { defaultTemplateVersion: '1.0.0-beta.68' },
    });
    expect(existsSync(join(root, 'changelog/unreleased/fix-example.md'))).toBe(
      false,
    );
    expect(readFileSync(notesFile, 'utf8')).toBe(
      '## Example\n\n- Fixed an example.\n',
    );
    expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toContain(
      '## Example',
    );
    expect(git('ls-remote', 'origin', 'refs/heads/main').split(/\s/u)[0]).toBe(
      sourceSha,
    );
    expect(git('ls-remote', 'origin', `refs/tags/${release.tag}`)).toBe('');
    expect(git('status', '--porcelain')).toBe('');

    publishRelease(root, {
      version: release.version,
      sha: release.sha,
      baseSha: release.base_sha,
    });
    expect(git('ls-remote', 'origin', 'refs/heads/main').split(/\s/u)[0]).toBe(
      release.sha,
    );
    expect(
      git('ls-remote', 'origin', `refs/tags/${release.tag}^{}`).split(/\s/u)[0],
    ).toBe(release.sha);
  });

  it('refuses a dirty checkout before changing its version', () => {
    const { root, git, prepare } = repository();
    writeFileSync(join(root, 'unrelated.txt'), 'Keep my work');
    expect(prepare).toThrow('clean');
    expect(git('diff', '--', 'package.json')).toBe('');
  });

  it('refuses an existing version tag before folding notes', () => {
    const { root, git, prepare } = repository();
    git('tag', 'v1.0.0-beta.73');
    expect(prepare).toThrow('already exists');
    expect(existsSync(join(root, 'changelog/unreleased/fix-example.md'))).toBe(
      true,
    );
    expect(git('status', '--porcelain')).toBe('');
  });

  it('publishes nothing if main advances during validation', () => {
    const { root, git, sourceSha, prepare } = repository();
    const release = prepare();
    git('checkout', '-b', 'concurrent', sourceSha);
    git('commit', '--allow-empty', '-m', 'Concurrent change');
    const concurrent = git('rev-parse', 'HEAD');
    git('push', 'origin', 'HEAD:main');
    git('checkout', '--detach', release.sha);
    expect(() =>
      publishRelease(root, {
        version: release.version,
        sha: release.sha,
        baseSha: release.base_sha,
      }),
    ).toThrow('main has moved');
    expect(git('ls-remote', 'origin', 'refs/heads/main').split(/\s/u)[0]).toBe(
      concurrent,
    );
    expect(git('ls-remote', 'origin', `refs/tags/${release.tag}`)).toBe('');
  });

  it('leaves no remote tag if branch protection rejects the atomic push', () => {
    const { root, remote, git, sourceSha, prepare } = repository();
    const release = prepare();
    const hook = join(remote, 'hooks/update');
    writeFileSync(
      hook,
      '#!/bin/sh\nif [ "$1" = refs/heads/main ]; then exit 1; fi\n',
    );
    chmodSync(hook, 0o755);
    expect(() =>
      publishRelease(root, {
        version: release.version,
        sha: release.sha,
        baseSha: release.base_sha,
      }),
    ).toThrow();
    expect(git('ls-remote', 'origin', 'refs/heads/main').split(/\s/u)[0]).toBe(
      sourceSha,
    );
    expect(git('ls-remote', 'origin', `refs/tags/${release.tag}`)).toBe('');
  });

  it('refuses a changed release tree after tests and build', () => {
    const { root, prepare } = repository();
    const release = prepare();
    writeFileSync(join(root, 'CHANGELOG.md'), 'Changed after validation');
    expect(() =>
      publishRelease(root, {
        version: release.version,
        sha: release.sha,
        baseSha: release.base_sha,
      }),
    ).toThrow('clean');
  });
});
