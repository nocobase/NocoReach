import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  appendFileSync,
} from 'node:fs';
import { pathToFileURL } from 'node:url';

export const digest = (file) =>
  createHash('sha256').update(readFileSync(file)).digest('hex');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
export function validateSource(run, jobs, repository, workflowId) {
  assert.equal(
    run.repository?.full_name,
    repository,
    'Wrong source repository',
  );
  assert.equal(
    run.head_repository?.full_name,
    repository,
    'Wrong head repository',
  );
  assert.equal(run.workflow_id, workflowId, 'Wrong workflow ID');
  assert.equal(run.path, '.github/workflows/ci.yml', 'Wrong workflow path');
  assert.equal(run.event, 'push', 'Only push builds may deploy');
  assert.equal(run.head_branch, 'main', 'Only main builds may deploy');
  assert.equal(run.status, 'completed', 'CI has not completed');
  assert.equal(run.conclusion, 'success', 'CI did not succeed');
  assert.match(run.head_sha, /^[a-f0-9]{40}$/, 'Invalid source SHA');
  for (const name of ['tests', 'build']) {
    const matches = jobs.filter((job) => job.name === name);
    assert.equal(matches.length, 1, `Missing/ambiguous ${name} job`);
    assert.equal(matches[0].conclusion, 'success', `${name} did not succeed`);
    assert.equal(matches[0].head_sha, run.head_sha, `${name} SHA mismatch`);
  }
  return {
    repository,
    sha: run.head_sha,
    runId: String(run.id),
    runAttempt: String(run.run_attempt),
  };
}
export function selectArtifact(artifacts, source) {
  const name = `release-${source.sha}-${source.runId}-${source.runAttempt}`;
  const matches = artifacts.filter((a) => a.name === name && !a.expired);
  assert.equal(
    matches.length,
    1,
    'Release artifact missing, expired or ambiguous; rerun CI',
  );
  return matches[0];
}
export function verifyBundle(dir, source) {
  const metadata = json(`${dir}/metadata.json`);
  for (const key of ['repository', 'sha', 'runId', 'runAttempt']) {
    assert.equal(metadata[key], source[key], `Artifact ${key} mismatch`);
  }
  assert.equal(metadata.target, 'linux-x64', 'Wrong platform');
  assert.match(metadata.node, /^v24\./, 'Wrong Node major');
  assert.match(metadata.pnpm, /^11\.7\.0$/, 'Wrong pnpm version');
  const checksum = digest(`${dir}/dist.tar.gz`);
  assert.equal(metadata.sha256, checksum, 'Archive checksum mismatch');
  assert.equal(
    readFileSync(`${dir}/SHA256SUMS`, 'utf8'),
    `${checksum}  dist.tar.gz\n`,
    'Checksum file mismatch',
  );
  return metadata;
}
export function inspectArchive(file) {
  const names = execFileSync('tar', ['-tzf', file], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .trim()
    .split('\n')
    .map((n) => n.replace(/^\.\//, ''));
  for (const name of names) {
    assert(
      !name.startsWith('/') && !name.split('/').includes('..'),
      'Unsafe archive path',
    );
    assert(
      name === 'config.example.yml' || name.startsWith('dist/'),
      `Unexpected archive entry: ${name}`,
    );
    // Dependency fixtures may use these names; application runtime data never belongs in a release.
    if (!name.startsWith('dist/node_modules/')) {
      assert(
        !/(^|\/)(config\.yml|\.env(?:\.[^/]*)?|storage)(\/|$)|\.(sqlite|sqlite3|db)(-|$)/.test(
          name,
        ),
        `Runtime data in archive: ${name}`,
      );
    }
  }
  for (const required of [
    'config.example.yml',
    'dist/package.json',
    'dist/server/standalone.js',
    'dist/client/index.html',
    'dist/cli/index.js',
    'dist/variables.json',
  ]) {
    assert(names.includes(required), `Missing archive entry: ${required}`);
  }
  assert(
    names.some((n) => n.startsWith('dist/node_modules/') && !n.endsWith('/')),
    'Missing runtime dependencies',
  );
  const readEntry = (name) =>
    execFileSync('tar', ['-xOzf', file, name], {
      maxBuffer: 128 * 1024 * 1024,
    });
  const pkg = JSON.parse(readEntry('dist/package.json'));
  assert.deepEqual(
    pkg.nocobase?.buildTarget,
    {
      platform: 'linux',
      arch: 'x64',
      libc: 'glibc',
      nodeAbi: 137,
      nodeMajor: 24,
    },
    'Archive build target mismatch',
  );
  assert.equal(pkg.nocobase?.relocatable, true, 'Archive must be relocatable');
  for (const product of ['nocoreach', 'nocobase-runner']) {
    const prefix = `dist/runners/stable/${product}/`;
    assert(
      names.includes(`${prefix}manifest.json`),
      `Missing ${product} manifest`,
    );
    const manifest = JSON.parse(readEntry(`${prefix}manifest.json`));
    assert.equal(manifest.product, product, 'Distribution product mismatch');
    assert.equal(manifest.schema, 1, 'Unknown distribution manifest schema');
    const versions = Object.entries(manifest.versions ?? {});
    assert(versions.length > 0, `Empty ${product} manifest`);
    for (const [version, entry] of versions) {
      if (product === 'nocoreach')
        assert.equal(version, pkg.version, 'CLI/app version mismatch');
      const target = entry.targets?.universal;
      assert(target, `Missing ${product} universal target`);
      assert(
        typeof target.file === 'string' &&
          !target.file.startsWith('/') &&
          !target.file.split('/').includes('..'),
        'Invalid distribution path',
      );
      const name = `${prefix}${target.file}`;
      assert(names.includes(name), `Missing distribution archive: ${name}`);
      const bytes = readEntry(name);
      assert.equal(bytes.length, target.size, 'Distribution size mismatch');
      assert.equal(
        createHash('sha256').update(bytes).digest('hex'),
        target.sha256,
        'Distribution checksum mismatch',
      );
    }
  }
}
async function github(path) {
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  assert(response.ok, `GitHub ${path}: HTTP ${response.status}`);
  return response.json();
}
async function list(path, key) {
  const values = [];
  for (let page = 1; page <= 100; page++) {
    const result = await github(
      `${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`,
    );
    values.push(...result[key]);
    if (values.length >= result.total_count) return values;
  }
  throw new Error('GitHub pagination limit exceeded');
}
async function main(command) {
  if (command === 'pack') {
    const file = 'storage/exports/dist.tar.gz';
    inspectArchive(file);
    assert(
      readFileSync(file).length <= 268435456,
      'Archive exceeds Studio upload limit (256 MiB)',
    );
    const metadata = {
      repository: process.env.GITHUB_REPOSITORY,
      sha: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      node: process.version,
      pnpm: execFileSync('pnpm', ['--version'], { encoding: 'utf8' }).trim(),
      target: 'linux-x64',
      sha256: digest(file),
    };
    mkdirSync('release', { recursive: true });
    copyFileSync(file, 'release/dist.tar.gz');
    writeFileSync(
      'release/metadata.json',
      JSON.stringify(metadata, null, 2) + '\n',
    );
    writeFileSync('release/SHA256SUMS', `${metadata.sha256}  dist.tar.gz\n`);
  } else if (command === 'source') {
    const id = process.env.SOURCE_RUN_ID;
    assert.match(id ?? '', /^[1-9][0-9]*$/, 'Invalid CI run ID');
    const repo = await github('');
    assert.equal(
      repo.default_branch,
      'main',
      'Default branch changed; review workflows',
    );
    const workflow = await github('actions/workflows/ci.yml');
    const run = await github(`actions/runs/${id}`);
    assert.equal(String(run.id), id, 'Run ID mismatch');
    const jobs = await list(
      `actions/runs/${id}/attempts/${run.run_attempt}/jobs`,
      'jobs',
    );
    const source = validateSource(
      run,
      jobs,
      process.env.GITHUB_REPOSITORY,
      workflow.id,
    );
    const artifact = selectArtifact(
      await list(`actions/runs/${id}/artifacts`, 'artifacts'),
      source,
    );
    writeFileSync('source.json', JSON.stringify(source));
    appendFileSync(process.env.GITHUB_OUTPUT, `artifact_id=${artifact.id}\n`);
  } else if (command === 'verify') {
    const metadata = verifyBundle('release', json('source.json'));
    inspectArchive('release/dist.tar.gz');
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `源提交：${metadata.sha}\n\nCI run：${metadata.runId} / attempt ${metadata.runAttempt}\n\nSHA-256：${metadata.sha256}\n\n`,
    );
  } else throw new Error('Expected pack, source or verify');
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
