// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { parseArguments, retry, runAttempt } from '../../scripts/ci/retry.mjs';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

type Outcome = {
  code: number;
  reason: string;
  timedOut: boolean;
  interrupted: boolean;
};
const ok: Outcome = {
  code: 0,
  reason: 'exit 0',
  timedOut: false,
  interrupted: false,
};
const failed: Outcome = { ...ok, code: 1, reason: 'exit 1' };
const stalled: Outcome = { ...ok, code: 1, reason: 'SIGTERM', timedOut: true };

function attempts(...outcomes: Outcome[]) {
  const run = vi.fn();
  for (const outcome of outcomes) run.mockResolvedValueOnce(outcome);
  const wait = vi.fn().mockResolvedValue(undefined);
  const log = vi.fn();
  return { run, wait, log };
}

it('runs a successful command once', async () => {
  const fakes = attempts(ok);
  await expect(
    retry('docker', ['push', 'image'], {
      attempts: 3,
      limit: 60_000,
      ...fakes,
    }),
  ).resolves.toBe(0);
  expect(fakes.run).toHaveBeenCalledTimes(1);
  expect(fakes.run).toHaveBeenCalledWith('docker', ['push', 'image'], 60_000);
  expect(fakes.wait).not.toHaveBeenCalled();
});

it('runs a failed or stalled attempt again after the delay', async () => {
  const fakes = attempts(failed, stalled, ok);
  await expect(
    retry('docker', ['push'], { attempts: 3, limit: 600_000, ...fakes }),
  ).resolves.toBe(0);
  expect(fakes.run).toHaveBeenCalledTimes(3);
  expect(fakes.wait).toHaveBeenCalledTimes(2);
  expect(fakes.wait).toHaveBeenCalledWith(30_000);
  expect(fakes.log.mock.calls.flat()).toEqual([
    'docker: attempt 1/3 failed (exit 1); retrying in 30s.',
    'docker: attempt 2/3 stopped after 600s; retrying in 30s.',
  ]);
});

it('gives up after the last attempt with its exit code', async () => {
  const fakes = attempts(failed, { ...failed, code: 2, reason: 'exit 2' });
  await expect(
    retry('docker', ['login'], { attempts: 2, limit: 1_000, ...fakes }),
  ).resolves.toBe(2);
  expect(fakes.run).toHaveBeenCalledTimes(2);
  expect(fakes.log).toHaveBeenLastCalledWith(
    'docker: attempt 2/2 failed (exit 2); giving up.',
  );
});

it('never reports success for an attempt stopped at its limit', async () => {
  const fakes = attempts({ ...stalled, code: 0 });
  await expect(
    retry('docker', ['pull'], { attempts: 1, limit: 1_000, ...fakes }),
  ).resolves.toBe(1);
});

it('stops retrying once the step is cancelled', async () => {
  const fakes = attempts({ ...failed, code: 143, interrupted: true }, ok);
  await expect(
    retry('docker', ['push'], { attempts: 3, limit: 1_000, ...fakes }),
  ).resolves.toBe(143);
  expect(fakes.run).toHaveBeenCalledTimes(1);
  expect(fakes.wait).not.toHaveBeenCalled();
});

it('reads the attempts, the limit in minutes and the command', () => {
  expect(
    parseArguments([
      '--attempts',
      '3',
      '--minutes',
      '2.5',
      '--',
      'docker',
      'push',
      '--quiet',
    ]),
  ).toEqual({
    command: 'docker',
    args: ['push', '--quiet'],
    attempts: 3,
    limit: 150_000,
  });
  for (const argv of [
    ['--attempts', '3', '--minutes', '2', 'docker'],
    ['--attempts', '0', '--minutes', '2', '--', 'docker'],
    ['--attempts', '3', '--', 'docker'],
    ['--attempts', '3', '--minutes', '2', '--retries', '1', '--', 'docker'],
    ['--attempts', '3', '--minutes', '2', '--'],
  ])
    expect(() => parseArguments(argv)).toThrow();
});

it('passes on the exit code of a real command', async () => {
  await expect(
    runAttempt(process.execPath, ['-e', 'process.exit(3)'], 10_000),
  ).resolves.toMatchObject({ code: 3, timedOut: false, interrupted: false });
});

it('stops a stalled command and everything it started', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'nocoreach-retry-'));
  directories.push(directory);
  const pidFile = join(directory, 'pid');
  // The command starts a child that ignores SIGTERM, as a stalled upload
  // behind a shell would, and then waits forever itself.
  const script = `
    const { spawn } = require('node:child_process');
    const { writeFileSync } = require('node:fs');
    const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' });
    writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
    setInterval(() => {}, 1000);
  `;
  const result = await runAttempt(process.execPath, ['-e', script], 1_000, {
    grace: 300,
  });
  expect(result).toMatchObject({ timedOut: true, interrupted: false });
  const pid = Number(readFileSync(pidFile, 'utf8'));
  await vi.waitFor(() => expect(() => process.kill(pid, 0)).toThrow(), {
    timeout: 5_000,
  });
});
