import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { fold, NOTES } from '../fold-changelog.mjs';

function parseVersion(version) {
  const match =
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(alpha|beta|rc)\.(0|[1-9]\d*))?$/u.exec(
      version,
    );
  assert(
    match,
    'Use a stable version or an alpha.N, beta.N or rc.N prerelease',
  );
  return {
    core: match.slice(1, 4).map(BigInt),
    channel: match[4],
    number: BigInt(match[5] ?? 0),
  };
}

export function releaseVersion(current, requested = '') {
  const before = parseVersion(current);
  const next =
    requested.trim().replace(/^v/u, '') ||
    (before.channel
      ? `${before.core.join('.')}-${before.channel}.${before.number + 1n}`
      : `${before.core[0]}.${before.core[1]}.${before.core[2] + 1n}`);
  const after = parseVersion(next);
  const rank = (channel) => ['alpha', 'beta', 'rc', undefined].indexOf(channel);
  const a = [...before.core, BigInt(rank(before.channel)), before.number];
  const b = [...after.core, BigInt(rank(after.channel)), after.number];
  const different = a.findIndex((part, index) => part !== b[index]);
  assert(
    different >= 0 && b[different] > a[different],
    'Release version must increase',
  );
  return next;
}

function git(root, ...args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function requireClean(root) {
  assert.equal(
    git(root, 'status', '--porcelain'),
    '',
    'Release checkout must be clean',
  );
}

export function prepareRelease(
  root,
  { sourceSha, requestedVersion, notesFile },
) {
  requireClean(root);
  assert.equal(
    git(root, 'rev-parse', 'HEAD'),
    sourceSha,
    'Checkout must match the dispatched commit',
  );
  assert.equal(
    git(root, 'rev-parse', 'origin/main'),
    sourceSha,
    'main has moved; start a new Release run',
  );
  const manifestPath = join(root, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const version = releaseVersion(manifest.version, requestedVersion);
  const tag = `v${version}`;
  assert.equal(
    git(root, 'tag', '--list', tag),
    '',
    'Release tag already exists; recover that release instead',
  );

  // Read notes before folding removes them, then use the fold's chronological order.
  const before = git(root, 'ls-files', NOTES)
    .split('\n')
    .filter((name) => name.endsWith('.md') && !name.endsWith('/README.md'));
  const notes = new Map(
    before.map((name) => [name, readFileSync(join(root, name), 'utf8').trim()]),
  );
  const folded = fold(root);
  manifest.version = version;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(
    notesFile,
    folded.length
      ? `${folded.map((name) => notes.get(`${NOTES}/${name}`)).join('\n\n')}\n`
      : `Release of NocoReach ${version}.\n`,
  );
  git(root, 'add', '-A', '--', 'package.json', 'CHANGELOG.md', NOTES);
  git(root, 'commit', '-m', `chore(release): prepare ${tag}`);
  return {
    version,
    tag,
    sha: git(root, 'rev-parse', 'HEAD'),
    base_sha: sourceSha,
    prerelease: String(Boolean(parseVersion(version).channel)),
  };
}

export function publishRelease(root, { version, sha, baseSha }) {
  parseVersion(version);
  assert(
    /^[a-f0-9]{40}$/u.test(sha) && /^[a-f0-9]{40}$/u.test(baseSha),
    'Invalid release commit',
  );
  requireClean(root);
  assert.equal(
    git(root, 'rev-parse', 'HEAD'),
    sha,
    'Release commit changed after validation',
  );
  assert.equal(
    git(root, 'rev-parse', 'HEAD^'),
    baseSha,
    'Release must directly follow the selected main commit',
  );
  assert.equal(
    JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version,
    version,
    'Release version changed after validation',
  );
  git(root, 'fetch', 'origin', 'main', '--tags');
  assert.equal(
    git(root, 'rev-parse', 'origin/main'),
    baseSha,
    'main has moved; nothing was published. Start a new Release run',
  );
  const tag = `v${version}`;
  assert.equal(
    git(root, 'tag', '--list', tag),
    '',
    'Release tag already exists; recover that release instead',
  );
  git(root, 'tag', '-a', tag, '-m', `Release ${tag}`, sha);
  // A rejected branch or tag rejects both refs; never force-push either one.
  git(
    root,
    'push',
    '--atomic',
    'origin',
    `${sha}:refs/heads/main`,
    `refs/tags/${tag}:refs/tags/${tag}`,
  );
}

function main() {
  assert.equal(
    process.env.GITHUB_EVENT_NAME,
    'workflow_dispatch',
    'Release requires manual dispatch',
  );
  assert.equal(
    process.env.GITHUB_REF,
    'refs/heads/main',
    'Release runs only from main',
  );
  const root = process.cwd();
  if (process.argv[2] === 'prepare') {
    assert(
      process.env.GITHUB_OUTPUT && process.env.RELEASE_NOTES_FILE,
      'Missing release output paths',
    );
    const result = prepareRelease(root, {
      sourceSha: process.env.GITHUB_SHA,
      requestedVersion: process.env.RELEASE_VERSION,
      notesFile: process.env.RELEASE_NOTES_FILE,
    });
    for (const [key, value] of Object.entries(result))
      appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    console.info(
      `Prepared ${result.tag} at ${result.sha}; nothing has been published.`,
    );
  } else {
    assert.equal(process.argv[2], 'publish', 'Expected prepare or publish');
    publishRelease(root, {
      version: process.env.RELEASE_VERSION,
      sha: process.env.RELEASE_SHA,
      baseSha: process.env.RELEASE_BASE_SHA,
    });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
