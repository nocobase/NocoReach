// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { sign } from '../../scripts/ci/deploy-webhook.mjs';

it('passes deployment isolation, rollback, authentication and retention tests', () => {
  execFileSync(
    'python3',
    [fileURLToPath(new URL('./deploy_webhook_test.py', import.meta.url))],
    { stdio: 'pipe' },
  );
});

it('signs exactly the same canonical request as the server', () => {
  const expected = execFileSync(
    'python3',
    [
      '-c',
      "from scripts.deploy.service import signature; print(signature('s'*64, 'POST', '/_deploy/nocoreach', '1793872800', 'a'*32, b'{}'))",
    ],
    { encoding: 'utf8' },
  ).trim();
  expect(
    sign(
      's'.repeat(64),
      'POST',
      '/_deploy/nocoreach',
      '1793872800',
      'a'.repeat(32),
      '{}',
    ),
  ).toBe(expected);
});
