import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

// GitHub's runners reach Alibaba Cloud's registry across borders, where a
// login can be reset and a layer upload can stall for an hour without failing.
// Each attempt is stopped after its limit and the command runs again. Only
// pass commands that are safe to repeat: pushing an image again uploads only
// the layers the registry does not have yet. The image job copies this file
// out of the workflow's own commit, so import only Node's built-ins.

export const RETRY_DELAY = 30_000;
// Time a stopped attempt gets to exit after SIGTERM before SIGKILL.
const KILL_GRACE = 10_000;

// Runs the command once in its own process group, so stopping it also stops
// anything it started (such as `docker login` behind `bash -c`). A cancelled
// step's SIGTERM or SIGINT is passed on to that group and ends the retries.
export function runAttempt(command, args, limit, { grace = KILL_GRACE } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', detached: true });
    let timedOut = false;
    let interrupted = false;
    let forceKill;
    const signal = (name) => {
      try {
        process.kill(-child.pid, name);
      } catch {
        // The group has already exited.
      }
    };
    const stop = () => {
      if (timedOut || interrupted) return;
      signal('SIGTERM');
      forceKill = setTimeout(() => signal('SIGKILL'), grace);
    };
    const interrupt = () => {
      stop();
      interrupted = true;
    };
    process.on('SIGTERM', interrupt);
    process.on('SIGINT', interrupt);
    const timer = setTimeout(() => {
      stop();
      timedOut = true;
    }, limit);
    const done = (result) => {
      clearTimeout(timer);
      clearTimeout(forceKill);
      // Whatever outlived a stopped command must not keep pushing beside the
      // next attempt.
      if (timedOut || interrupted) signal('SIGKILL');
      process.off('SIGTERM', interrupt);
      process.off('SIGINT', interrupt);
      resolve({ ...result, timedOut, interrupted });
    };
    child.once('error', (error) =>
      done({ code: 127, reason: error.code ?? 'spawn error' }),
    );
    child.once('close', (code, name) =>
      done({ code: code ?? 1, reason: name ?? `exit ${code}` }),
    );
  });
}

export async function retry(
  command,
  args,
  {
    attempts,
    limit,
    delay = RETRY_DELAY,
    run = runAttempt,
    wait = sleep,
    log = console.error,
  },
) {
  for (let attempt = 1; ; attempt += 1) {
    const result = await run(command, args, limit);
    if (result.code === 0 && !result.timedOut && !result.interrupted) return 0;
    const code = result.code === 0 ? 1 : result.code;
    if (result.interrupted) {
      log(`${command}: interrupted; not retrying.`);
      return code;
    }
    const cause = result.timedOut
      ? `stopped after ${limit / 1000}s`
      : `failed (${result.reason})`;
    if (attempt >= attempts) {
      log(`${command}: attempt ${attempt}/${attempts} ${cause}; giving up.`);
      return code;
    }
    log(
      `${command}: attempt ${attempt}/${attempts} ${cause}; retrying in ${delay / 1000}s.`,
    );
    await wait(delay);
  }
}

// node scripts/ci/retry.mjs --attempts 3 --minutes 10 -- docker push "$IMAGE"
export function parseArguments(argv) {
  const separator = argv.indexOf('--');
  assert(separator >= 0, 'Expected -- before the command');
  const options = { '--attempts': NaN, '--minutes': NaN };
  const flags = argv.slice(0, separator);
  for (let index = 0; index < flags.length; index += 2) {
    assert(Object.hasOwn(options, flags[index]), `Unknown ${flags[index]}`);
    options[flags[index]] = Number(flags[index + 1]);
  }
  const attempts = options['--attempts'];
  const minutes = options['--minutes'];
  assert(Number.isInteger(attempts) && attempts >= 1, 'Invalid --attempts');
  assert(minutes > 0, 'Invalid --minutes');
  const [command, ...args] = argv.slice(separator + 1);
  assert(command, 'Missing command');
  return { command, args, attempts, limit: minutes * 60_000 };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const { command, args, attempts, limit } = parseArguments(
      process.argv.slice(2),
    );
    process.exitCode = await retry(command, args, { attempts, limit });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
