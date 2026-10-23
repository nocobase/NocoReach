import { describe, expect, it } from 'vitest';
import {
  RESTART_WINDOW_MS,
  restartOf,
  withStart,
} from '../../server/nocoreach/execution/restarts';

// 2026-10-22 user report: the CI deploys of one afternoon restarted NocoReach eight times, and each restart failed the
// task's run as if the Mac running it had gone away.
const at = (minutes: number) =>
  new Date(Date.parse('2026-10-22T13:00:00Z') + minutes * 60_000).toISOString();
const lost = (
  failureReason: string,
  dispatched: number,
  failed: number,
  status = 'failed',
) => ({
  status,
  failureReason,
  dispatchedAt: at(dispatched),
  finishedAt: at(failed),
});

describe('restartOf', () => {
  it('names the start between handing the run out and the failure', () => {
    for (const reason of ['leaseExpired', 'runnerOffline', 'startTimeout'])
      expect(restartOf(lost(reason, 0, 13), [at(12)])).toBe(at(12));
  });

  it('picks the latest such start when several deploys followed each other', () => {
    expect(
      restartOf(lost('leaseExpired', 0, 25), [at(3), at(24), at(12)]),
    ).toBe(at(24));
  });

  it('prefers the latest attempt when the run carries its executions', () => {
    const run = {
      ...lost('leaseExpired', 0, 13),
      executions: [{ dispatchedAt: at(12.5) }],
    };
    expect(restartOf(run, [at(12)])).toBeUndefined();
  });

  it('leaves out a computer that went away, a run started after the restart and other failures', () => {
    const late = (RESTART_WINDOW_MS + 60_000) / 60_000;
    expect(restartOf(lost('leaseExpired', 0, 12 + late), [at(12)])).toBe(
      undefined,
    );
    expect(restartOf(lost('leaseExpired', 13, 14), [at(12)])).toBeUndefined();
    expect(restartOf(lost('toolAuth', 0, 13), [at(12)])).toBeUndefined();
    expect(restartOf(lost('idleTimeout', 0, 13), [at(12)])).toBeUndefined();
    expect(
      restartOf(lost('leaseExpired', 0, 13, 'cancelled'), [at(12)]),
    ).toBeUndefined();
    expect(restartOf(lost('leaseExpired', 0, 13), [])).toBeUndefined();
    expect(
      restartOf({ status: 'failed', failureReason: 'leaseExpired' }, [at(12)]),
    ).toBeUndefined();
  });
});

describe('withStart', () => {
  it('adds a start once, in order, and keeps the latest fifty', () => {
    expect(withStart([at(1), at(3)], at(2))).toEqual([at(1), at(2), at(3)]);
    expect(withStart([at(1)], at(1))).toEqual([at(1)]);
    const many = Array.from({ length: 60 }, (_, i) => at(i));
    expect(withStart(many, at(60))).toEqual([...many.slice(11), at(60)]);
  });
});
