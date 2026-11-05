import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const IMAGE_REPOSITORY =
  'registry.cn-beijing.aliyuncs.com/nocobase/nocoreach';

export function imageRelease(root, env) {
  assert.equal(
    env.GITHUB_EVENT_NAME,
    'workflow_dispatch',
    'Images require the Release workflow or manual recovery',
  );
  assert.equal(
    env.GITHUB_REF,
    'refs/heads/main',
    'Run image publication from main',
  );
  const tag = env.RELEASE_TAG;
  assert(
    /^v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/u.test(tag ?? ''),
    'Invalid release tag',
  );
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const sha = git('rev-parse', 'HEAD');
  assert.equal(
    git('rev-parse', `refs/tags/${tag}^{commit}`),
    sha,
    'Release tag must identify the checked-out commit',
  );
  if (env.RELEASE_SHA)
    assert.equal(sha, env.RELEASE_SHA, 'Release commit mismatch');
  git('merge-base', '--is-ancestor', sha, 'origin/main');
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'nocoreach', 'Unexpected application');
  assert.equal(
    tag,
    `v${manifest.version}`,
    'Release tag and package version differ',
  );
  assert(
    manifest.dependencies?.['@nocobase/db-postgres'],
    'PostgreSQL must be a production dependency',
  );
  return {
    version: manifest.version,
    sha,
    image: `${IMAGE_REPOSITORY}:${manifest.version}`,
  };
}

function releaseVersion(tag) {
  const match = /^v(\d+)\.(\d+)\.(\d+)(?:-(alpha|beta|rc)\.(\d+))?$/u.exec(tag);
  if (!match) return null;
  const stage = { alpha: 0n, beta: 1n, rc: 2n };
  return [
    BigInt(match[1]),
    BigInt(match[2]),
    BigInt(match[3]),
    match[4] ? stage[match[4]] : 3n,
    BigInt(match[5] ?? 0),
  ];
}

export function shouldPublishLatest(tag, releases) {
  const candidate = releaseVersion(tag);
  assert(candidate, 'Invalid release tag');
  const published = releases.filter((release) => !release.draft);
  assert(
    published.some((release) => release.tag_name === tag),
    'Release is not published',
  );
  return !published.some((release) => {
    const version = releaseVersion(release.tag_name);
    if (!version) return false;
    for (let index = 0; index < candidate.length; index++) {
      if (version[index] !== candidate[index])
        return version[index] > candidate[index];
    }
    return false;
  });
}

export function validateImageArtifact(root, version) {
  const artifact = JSON.parse(
    readFileSync(join(root, 'dist/package.json'), 'utf8'),
  );
  assert.equal(artifact.name, 'nocoreach', 'Unexpected artifact application');
  assert.equal(
    artifact.version,
    version,
    'Artifact version differs from release',
  );
  assert(
    artifact.dependencies?.['@nocobase/db-postgres'],
    'Artifact omits the PostgreSQL driver',
  );
  assert.equal(
    artifact.nocobase?.relocatable,
    true,
    'Artifact must support runtime mount paths',
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const result = imageRelease(process.cwd(), process.env);
    if (process.argv[2] === 'artifact')
      validateImageArtifact(process.cwd(), result.version);
    else if (process.argv[2] === 'latest') {
      const pages = JSON.parse(
        execFileSync(
          'gh',
          [
            'api',
            '--paginate',
            '--slurp',
            `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`,
          ],
          { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
        ),
      );
      assert(process.env.GITHUB_OUTPUT, 'Missing workflow output file');
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `publish=${shouldPublishLatest(process.env.RELEASE_TAG, pages.flat())}\n`,
      );
    } else {
      assert.equal(
        process.argv[2],
        'metadata',
        'Expected metadata, artifact or latest',
      );
      assert(process.env.GITHUB_OUTPUT, 'Missing workflow output file');
      for (const [key, value] of Object.entries(result))
        appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
