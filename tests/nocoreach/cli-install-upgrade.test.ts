// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from 'vitest';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
// Exercise the exact locked dependency's generators, not a copied installer.
const cliDist = join(root, 'node_modules/@nocobase/app-cli/dist');
const agentsDist = join(
  root,
  'node_modules/@nocobase/app-plugin-agents/dist/server',
);
const { cliEntry, readCliApplication, runtimeBrand } = await import(
  pathToFileURL(join(cliDist, 'lib/cli-brand.js')).href
);
const { universalLauncherScript } = await import(
  pathToFileURL(join(cliDist, 'lib/cli-pack.js')).href
);
const { createDistService } = await import(
  pathToFileURL(join(agentsDist, 'distribution/dist.service.js')).href
);
const { installScript } = await import(
  pathToFileURL(join(agentsDist, 'routes/runners/install.js')).href
);

test('an existing API-key-only beta.66 install upgrades to the browser-enabled CLI', async () => {
  const temporary = mkdtempSync(join(tmpdir(), 'nocoreach-cli-upgrade-'));
  try {
    const prefix = join(temporary, 'installation');
    const bin = join(temporary, 'bin');
    const fakeBin = join(temporary, 'transport');
    const home = join(temporary, 'home');
    for (const directory of [bin, fakeBin, home]) mkdirSync(directory);
    const application = await readCliApplication(root);
    const version = application.brand.version ?? application.version;
    // beta.66 was distributed without auth; reusing it silently skips new bytes.
    expect(
      version.localeCompare('1.0.0-beta.66', undefined, { numeric: true }),
    ).toBeGreaterThan(0);
    expect(application.brand.auth).toEqual({ clientId: 'nocobase-cli' });

    function fixture(
      directory: string,
      fixtureVersion: string,
      browser: boolean,
    ) {
      mkdirSync(join(directory, 'bin'), { recursive: true });
      const brand = runtimeBrand(application.brand);
      if (!browser) delete brand.auth;
      writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({
          name: 'nocoreach-cli',
          version: fixtureVersion,
          type: 'module',
          nocobase: { cli: brand },
        }),
      );
      writeFileSync(
        join(directory, 'bin/run.js'),
        cliEntry('nocoreach', false),
      );
      writeFileSync(
        join(directory, 'bin/nocoreach'),
        universalLauncherScript('nocoreach'),
        { mode: 0o755 },
      );
      // Only transport/dependency installation is faked: execute the real CLI client.
      symlinkSync(join(root, 'node_modules'), join(directory, 'node_modules'));
    }

    const old = join(prefix, 'versions/1.0.0-beta.66');
    fixture(old, '1.0.0-beta.66', false);
    symlinkSync('versions/1.0.0-beta.66', join(prefix, 'current'));
    symlinkSync(join(prefix, 'current/bin/nocoreach'), join(bin, 'nocoreach'));
    writeFileSync(join(home, 'keep.txt'), 'existing user state');
    const fetchLog = join(temporary, 'requests.json');
    const fetchStub = join(temporary, 'fetch-stub.mjs');
    writeFileSync(
      fetchStub,
      `
      import { writeFileSync } from 'node:fs';
      globalThis.fetch = async (url, options) => {
        if (String(url) !== 'https://unused.example.test/nocoreach/api/auth/device/code') throw new Error('Unexpected fixture request');
        writeFileSync(${JSON.stringify(fetchLog)}, JSON.stringify({ url: String(url), method: options.method, body: JSON.parse(options.body) }));
        return new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 });
      };
    `,
    );
    const env = {
      PATH: `${fakeBin}:${dirname(process.execPath)}:/usr/bin:/bin`,
      HOME: home,
      XDG_CONFIG_HOME: join(home, 'config'),
      XDG_CACHE_HOME: join(home, 'cache'),
      NOCOBASE_NODE: process.execPath,
      FIXTURE_ROOT: temporary,
      NODE_OPTIONS: `--import=${pathToFileURL(fetchStub).href}`,
    };
    const command = join(bin, 'nocoreach');
    const oldLogin = spawnSync(
      command,
      ['login', '--server', 'https://unused.example.test/nocoreach'],
      { env, encoding: 'utf8', timeout: 15_000 },
    );
    expect(oldLogin.status).not.toBe(0);
    expect(oldLogin.stderr).toContain(
      'NocoReach offers no browser sign-in here',
    );
    const help = () =>
      execFileSync(command, ['login', '--help'], {
        env,
        encoding: 'utf8',
        timeout: 15_000,
      });
    expect(existsSync(fetchLog)).toBe(false);

    const artifact = join(temporary, 'nocoreach');
    fixture(artifact, version, true);
    const archive = join(temporary, 'artifact.tar.gz');
    execFileSync('tar', ['-czf', archive, '-C', temporary, 'nocoreach']);
    const checksum = createHash('sha256')
      .update(readFileSync(archive))
      .digest('hex');
    writeFileSync(join(temporary, 'downloads'), '');
    writeFileSync(
      join(fakeBin, 'curl'),
      `#!/bin/sh
set -eu
output=''
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) output="$2"; shift 2 ;;
    *) shift ;;
  esac
done
case "$output" in
  */resolve) cp "$FIXTURE_ROOT/resolve" "$output"; printf 200 ;;
  *.tar.gz) cp "$FIXTURE_ROOT/artifact.tar.gz" "$output"; printf 'download\\n' >> "$FIXTURE_ROOT/downloads" ;;
  *) exit 1 ;;
esac
`,
    );
    chmodSync(join(fakeBin, 'curl'), 0o755);
    const dist = join(temporary, 'dist');
    const product = join(dist, 'stable/nocoreach');
    mkdirSync(product, { recursive: true });
    writeFileSync(
      join(product, 'manifest.json'),
      JSON.stringify({
        schema: 1,
        product: 'nocoreach',
        bin: 'nocoreach',
        versions: {
          [version]: {
            targets: {
              universal: {
                file: `${version}/nocoreach-v${version}-universal.tar.gz`,
                sha256: checksum,
                size: readFileSync(archive).length,
              },
            },
          },
        },
      }),
    );
    const resolved = await createDistService({ dir: dist }).resolve(
      'nocoreach',
      'linux-x64',
    );
    expect(resolved).toMatchObject({
      version,
      sha256: checksum,
      universal: true,
    });
    const script = join(temporary, 'install.sh');
    writeFileSync(script, installScript({ cli: 'nocoreach' }));
    function install(servedVersion: string) {
      writeFileSync(
        join(temporary, 'resolve'),
        `version=${servedVersion}\nurl=/fixture.tar.gz\nsha256=${checksum}\nuniversal=true\n`,
      );
      return execFileSync(
        '/bin/sh',
        [
          script,
          '--server',
          'https://unused.example.test/nocoreach',
          '--token',
          'test-only-download-token',
          '--prefix',
          prefix,
          '--bin-dir',
          bin,
        ],
        { env, encoding: 'utf8', timeout: 15_000 },
      );
    }

    // Reproduce the original defect even when the server advertises new bytes.
    expect(install('1.0.0-beta.66')).toContain('is already installed');
    expect(readFileSync(join(temporary, 'downloads'), 'utf8')).toBe('');
    expect(existsSync(fetchLog)).toBe(false);

    expect(install(version)).toContain('Checksum verified.');
    expect(readlinkSync(join(prefix, 'current'))).toBe(`versions/${version}`);
    expect(readFileSync(join(temporary, 'downloads'), 'utf8')).toBe(
      'download\n',
    );
    expect(help()).toContain('Open the browser to approve');
    const browserLogin = spawnSync(
      command,
      [
        'login',
        '--server',
        'https://unused.example.test/nocoreach',
        '--no-browser',
      ],
      { env, encoding: 'utf8', timeout: 15_000 },
    );
    expect(browserLogin.status).not.toBe(0);
    expect(browserLogin.stderr).not.toContain('offers no browser sign-in here');
    expect(JSON.parse(readFileSync(fetchLog, 'utf8'))).toEqual({
      url: 'https://unused.example.test/nocoreach/api/auth/device/code',
      method: 'POST',
      body: { client_id: 'nocobase-cli' },
    });
    expect(existsSync(join(home, '.nocoreach/config.json'))).toBe(false);
    const installed = JSON.parse(
      readFileSync(join(prefix, 'current/package.json'), 'utf8'),
    );
    expect(installed.version).toBe(manifest.version);
    expect(installed.nocobase.cli.auth).toEqual({ clientId: 'nocobase-cli' });
    expect(
      JSON.parse(readFileSync(join(old, 'package.json'), 'utf8')).nocobase.cli
        .auth,
    ).toBeUndefined();
    expect(readFileSync(join(home, 'keep.txt'), 'utf8')).toBe(
      'existing user state',
    );
    // Re-running is idempotent and does not fetch another archive.
    expect(install(version)).toContain('is already installed');
    expect(readFileSync(join(temporary, 'downloads'), 'utf8')).toBe(
      'download\n',
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}, 60_000);
