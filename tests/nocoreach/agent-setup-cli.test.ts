// @vitest-environment node
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { appCliConfigOf } from '@nocobase/app-cli-client';
import { expect, test } from 'vitest';
import { agentSetupCommands } from '../../client/components/agent-setup-prompt.js';

test('the branded package enables the server-accepted device client without changing identity', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  );
  const config = appCliConfigOf(manifest.nocobase.cli, {
    packageRoot: '/fixture',
    version: manifest.version,
  });
  expect(config).toMatchObject({
    bin: 'nocoreach',
    displayName: 'NocoReach',
    envPrefix: 'NOCOREACH',
    auth: { clientId: 'nocobase-cli' },
  });
});

test.each([
  'https://public.example.test/team/reach/',
  "https://public.example.test/team/a'b;$(echo injected)/reach",
])('quotes every installer and login argument for %s', (server) => {
  const token = "fixture-token'; echo injected; '";
  const commands = agentSetupCommands(server, token);
  const base = server.replace(/\/+$/u, '');
  // A shell function captures arguments; no installer, CLI, network or login is executed.
  const login = execFileSync(
    '/bin/sh',
    ['-c', `nocoreach() { printf '%s\\n' "$@"; }; ${commands.login}`],
    { encoding: 'utf8' },
  );
  expect(login.trim().split('\n')).toEqual(['login', '--server', base]);
  const install = execFileSync(
    '/bin/sh',
    ['-c', `curl() { :; }; sh() { printf '%s\\n' "$@"; }; ${commands.install}`],
    { encoding: 'utf8' },
  );
  expect(install.trim().split('\n')).toEqual([
    '-s',
    '--',
    '--server',
    base,
    '--token',
    token,
  ]);
  expect(commands.install).toContain('/api/agents/dist/installScript');
});

test('the configured CLI exposes browser sign-in without connecting or creating a session', () => {
  const script = `
    import { appCliConfigOf, runAppCli } from '@nocobase/app-cli-client';
    import { readFileSync } from 'node:fs';
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    await runAppCli(appCliConfigOf(manifest.nocobase.cli, { packageRoot: process.cwd(), version: manifest.version }), ['login', '--help']);
  `;
  const help = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { encoding: 'utf8', cwd: new URL('../../', import.meta.url) },
  );
  expect(help).toContain('nocoreach login');
  expect(help).toContain('Open the browser to approve');
  expect(help).toContain('NOCOREACH_SERVER');
});
