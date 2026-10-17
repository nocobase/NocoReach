// @vitest-environment node
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { x } from 'tar';
import { afterAll, beforeAll, expect, test } from 'vitest';
import { z } from 'zod';

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, '../..');
let temporary: string;
let unpacked: string;
let files: string[];

beforeAll(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'nocoreach-source-package-'));
  const { stdout } = await run(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    [
      'pack',
      '--json',
      '--ignore-scripts',
      '--pack-destination',
      temporary,
      '--cache',
      path.join(temporary, 'npm-cache'),
    ],
    {
      cwd: root,
      env: { ...process.env, npm_config_update_notifier: 'false' },
      maxBuffer: 4 * 1024 * 1024,
      timeout: 30_000,
    },
  );
  const [archive] = z
    .array(
      z.object({
        filename: z.string(),
        files: z.array(z.object({ path: z.string() })),
      }),
    )
    .length(1)
    .parse(JSON.parse(stdout));
  files = archive.files.map((file) => file.path);
  const destination = path.join(temporary, 'unpacked');
  await mkdir(destination);
  await x({ file: path.join(temporary, archive.filename), cwd: destination });
  unpacked = path.join(destination, 'package');
  // Reuse installed external dependencies only. All application sources must
  // resolve from the unpacked archive, which has no link to the source checkout.
  await symlink(
    path.join(root, 'node_modules'),
    path.join(unpacked, 'node_modules'),
    'junction',
  );
}, 30_000);

afterAll(async () => {
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

test('ships the shared catalog required by both application consumers', async () => {
  expect(files).toEqual(
    expect.arrayContaining([
      'shared/playbook-catalog.ts',
      'client/pages/playbook-snapshot.ts',
      'server/nocoreach/execution/playbook.ts',
    ]),
  );
  expect(
    await readFile(path.join(unpacked, 'shared/playbook-catalog.ts')),
  ).toEqual(await readFile(path.join(root, 'shared/playbook-catalog.ts')));
});

test('loads the actual server consumer and shared catalog from the archive', async () => {
  const { stdout } = await run(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      `const catalog = await import('./shared/playbook-catalog.ts');
const consumer = await import('./server/nocoreach/execution/playbook.ts');
console.log(JSON.stringify({
  sameCatalog: consumer.SYSTEM_PLAYBOOKS === catalog.SYSTEM_PLAYBOOKS,
  count: consumer.SYSTEM_PLAYBOOKS.length,
  stages: catalog.SYSTEM_PLAYBOOKS.every(p => consumer.stagesFor(p).length > 0),
}));`,
    ],
    { cwd: unpacked, timeout: 10_000 },
  );
  expect(JSON.parse(stdout)).toEqual({
    sameCatalog: true,
    count: 12,
    stages: true,
  });
});

test('excludes private configuration, runtime state and verification outputs', () => {
  expect(
    files.filter((file) =>
      /(^|\/)(?:\.env(?:\.[^/]*)?|config\.(?:yml|toml)|storage|node_modules|test-results|playwright-report|coverage|\.git|\.agents|test-credentials\.json|integration-fixtures\.json)(?:\/|$)/u.test(
        file,
      ),
    ),
  ).toEqual([]);
});

test('ships and loads the read-only Xiaohongshu collector with its shared transport', async () => {
  expect(files).toEqual(
    expect.arrayContaining([
      'collectors/xiaohongshu.mjs',
      'collectors/read-only-browser.mjs',
      'client/pages/xiaohongshu-errors.ts',
      'server/nocoreach/browser-collector-config.ts',
    ]),
  );
  const { stdout } = await run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `const collector = await import('./collectors/xiaohongshu.mjs');
console.log(JSON.stringify({args: collector.searchArguments('QA phrase'), factory: typeof collector.createCollector}));`,
    ],
    { cwd: unpacked, timeout: 10_000 },
  );
  expect(JSON.parse(stdout)).toEqual({
    args: [
      'xiaohongshu',
      'search',
      'QA phrase',
      '--limit',
      '20',
      '--format',
      'json',
    ],
    factory: 'function',
  });
});

test('ships both Bilibili upstreams and keeps OpenCLI as the default', async () => {
  expect(files).toEqual(
    expect.arrayContaining([
      'collectors/bilibili.mjs',
      'collectors/bilibili-public-http.mjs',
      'collectors/browser-research.mjs',
      'collectors/licenses/bpi-py.txt',
      'client/pages/bilibili-connect.tsx',
      'server/nocoreach/bilibili-source.ts',
    ]),
  );
  const { stdout } = await run(
    process.execPath,
    [
      '--input-type=module',
      '--eval',
      `
const { createBilibiliUpstreamHandlers } = await import('./collectors/bilibili-public-http.mjs');
const commands = [];
await createBilibiliUpstreamHandlers({ run: async args => { commands.push(args); return '1.0.0'; } }).health();
const anonymous = await createBilibiliUpstreamHandlers({ upstream: 'anonymous-http', fetcher: () => { throw Error('Health must not contact the platform'); } }).health();
console.log(JSON.stringify({ commands, anonymous }));`,
    ],
    { cwd: unpacked, timeout: 10_000 },
  );
  expect(JSON.parse(stdout)).toEqual({
    commands: [['--version']],
    anonymous: {
      upstream: 'anonymous-http',
      platformVerified: false,
      browser: 'not_required',
      login: 'not_used',
    },
  });
});

test('ships the YouTube Collector client and deployment instructions without local install requirements', async () => {
  expect(files).not.toContain('requirements-youtube.txt');
  for (const file of [
    'server/nocoreach/youtube-collector.ts',
    'docs/YOUTUBE.md',
    'docs/COLLECTOR-CONNECTIONS.md',
    'docs/XIAOHONGSHU-COLLECTOR.md',
    'docs/BILIBILI-COLLECTOR.md',
    'server/nocoreach/youtube-provider.ts',
    'server/nocoreach/youtube-source.ts',
    'client/pages/youtube-api.ts',
  ]) {
    expect(files).toContain(file);
    expect(await readFile(path.join(unpacked, file))).toEqual(
      await readFile(path.join(root, file)),
    );
  }
  const { stdout } = await run(
    process.execPath,
    [
      '--import',
      'tsx',
      '--input-type=module',
      '--eval',
      `const provider = await import('./server/nocoreach/youtube-provider.ts'); console.log(JSON.stringify({ id: provider.videoId('https://www.youtube.com/watch?v=Im69kzhpR3I'), factory: typeof provider.YouTubeProvider }));`,
    ],
    { cwd: unpacked, timeout: 10000 },
  );
  expect(JSON.parse(stdout)).toEqual({
    id: 'Im69kzhpR3I',
    factory: 'function',
  });
});

test('ships relocated developer guidance with both mock and YouTube constraints', async () => {
  expect(files).toEqual(
    expect.arrayContaining([
      'AGENTS.md',
      'CHANGELOG.md',
      'docs/DEVELOPMENT.md',
    ]),
  );
  const guidance = await readFile(
    path.join(unpacked, 'docs/DEVELOPMENT.md'),
    'utf8',
  );
  expect(guidance).toContain('### Simulated integrations');
  expect(guidance).toContain('nrMock/status');
  const changelog = await readFile(path.join(unpacked, 'CHANGELOG.md'), 'utf8');
  expect(changelog).toContain('Persist YouTube research videos');
  expect(changelog).toContain(
    'Correct four issues found during mock integration QA',
  );
});
