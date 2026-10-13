import { AsyncLocalStorage } from 'node:async_hooks';
import { expect, test } from 'vitest';
import { ProjectRuns } from '../../server/nocoreach/project-runs.js';

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test('projects start independently, duplicates share work, and four starts are retained', async () => {
  const runs = new ProjectRuns();
  const hold = gate();
  const started: string[] = [];
  const a = runs.run('A', async () => {
    started.push('A');
    await hold.promise;
    return 42;
  });
  expect(runs.run('A', async () => 99)).toBe(a);
  for (const id of ['B', 'C', 'D'])
    runs.start(id, async () => {
      started.push(id);
    });
  await Promise.all(['B', 'C', 'D'].map((id) => runs.wait(id)));
  expect(started).toEqual(['A', 'B', 'C', 'D']);
  expect(runs.has('A')).toBe(true);
  expect(runs.has('B')).toBe(false);
  hold.release();
  expect(await a).toBe(42);
  await runs.wait('A');
  expect(runs.has('A')).toBe(false);
});

test('distinct same-project operations retain their results; changed configuration gets one follow-up', async () => {
  const runs = new ProjectRuns();
  const hold = gate();
  const began = gate();
  let refreshes = 0;
  const a = runs.run(
    'A',
    async () => {
      began.release();
      await hold.promise;
      throw new Error('failed');
    },
    'brand',
  );
  const failed = a.catch((error) => error);
  await began.promise;
  runs.start(
    'A',
    async () => {
      refreshes++;
    },
    'brand',
  );
  runs.start(
    'A',
    async () => {
      refreshes++;
    },
    'brand',
  );
  const keyword = runs.run('A', async () => 'keyword result', 'keyword:one');
  hold.release();
  expect(await failed).toMatchObject({ message: 'failed' });
  expect(await keyword).toBe('keyword result');
  await runs.wait('A');
  expect(refreshes).toBe(1);
  expect(await runs.run('A', async () => 'recovered')).toBe('recovered');
});

test('upstream work remains bounded and preserves each project context', async () => {
  const runs = new ProjectRuns();
  const hold = gate();
  const began = gate();
  const calls: string[] = [];
  const a = runs.run('A', () =>
    runs.request(async () => {
      calls.push('A');
      began.release();
      await hold.promise;
    }),
  );
  await began.promise;
  const b = runs.run('B', () =>
    runs.request(async () => {
      calls.push('B');
    }),
  );
  const rejected = a.catch((error) => error);
  const cancelled = runs.cancel('A');
  expect(runs.has('B')).toBe(true);
  expect(calls).toEqual(['A']);
  hold.release();
  await Promise.all([cancelled, b]);
  expect(await rejected).toMatchObject({ name: 'AbortError' });
  expect(calls).toEqual(['A', 'B']);
});

test('cancel skips pending work and close drains every project and rejects future work', async () => {
  const runs = new ProjectRuns();
  const hold = gate();
  const began = gate();
  let lateWrites = 0;
  const a = runs.run('A', async () => {
    began.release();
    await hold.promise;
    runs.assertActive();
    lateWrites++;
  });
  await began.promise;
  const queued = runs.run(
    'A',
    async () => {
      lateWrites++;
    },
    'keyword',
  );
  const b = runs.run('B', async () => {
    await hold.promise;
    runs.assertActive();
    lateWrites++;
  });
  const results = Promise.allSettled([a, queued, b]);
  const closed = runs.close();
  hold.release();
  await closed;
  expect((await results).map((r) => r.status)).toEqual([
    'rejected',
    'rejected',
    'rejected',
  ]);
  expect(lateWrites).toBe(0);
  expect(runs.has('A')).toBe(false);
  expect(runs.has('B')).toBe(false);
  await expect(runs.run('C', async () => undefined)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

test('legacy request adapters preserve receiver and arguments and reject invalid methods', async () => {
  const runs = new ProjectRuns();
  const service = {
    prefix: 'project:',
    async read(id: string) {
      return this.prefix + id;
    },
  };
  runs.bindRequest(service, 'read');
  expect(await service.read('A')).toBe('project:A');
  expect(() => runs.bindRequest(null, 'read')).toThrow(TypeError);
  expect(() => runs.bindRequest(service, 'missing')).toThrow(TypeError);
  await runs.close();
  await expect(service.read('B')).rejects.toMatchObject({ name: 'AbortError' });
});

test('queued operations retain their submitting context and the project cancellation scope', async () => {
  const settings = new AsyncLocalStorage<number>();
  const runs = new ProjectRuns();
  const hold = gate();
  const began = gate();
  const followupBegan = gate();
  const followupHold = gate();
  const seen: (number | undefined)[] = [];
  const first = settings.run(1, () =>
    runs.run('A', async () => {
      began.release();
      await hold.promise;
      seen.push(settings.getStore());
    }),
  );
  await began.promise;
  const second = settings.run(2, () =>
    runs.run(
      'A',
      async () => {
        seen.push(settings.getStore());
        followupBegan.release();
        await followupHold.promise;
        runs.assertActive();
        seen.push(99);
      },
      'other',
    ),
  );
  const result = second.catch((error: unknown) => error);
  hold.release();
  await followupBegan.promise;
  const cancelled = runs.cancel('A');
  followupHold.release();
  await Promise.all([first, cancelled]);
  expect(seen).toEqual([1, 2]);
  expect(await result).toMatchObject({ name: 'AbortError' });
  await runs.close();
});

test('disconnect commits reject new project work and recover after a failed commit', async () => {
  const runs = new ProjectRuns();
  const began = gate();
  const hold = gate();
  const stop = runs.cancel('A', async () => {
    began.release();
    await hold.promise;
    throw new Error('disconnect failed');
  });
  const failed = stop.catch((error: unknown) => error);
  await began.promise;
  await expect(runs.run('A', async () => 1)).rejects.toMatchObject({
    name: 'AbortError',
  });
  expect(await runs.run('B', async () => 2)).toBe(2);
  hold.release();
  expect(await failed).toMatchObject({ message: 'disconnect failed' });
  expect(await runs.run('A', async () => 3)).toBe(3);
  await runs.close();
});

test('overlapping disconnects stay fenced until their commits drain, including shutdown', async () => {
  const runs = new ProjectRuns();
  const firstBegan = gate();
  const firstHold = gate();
  const secondBegan = gate();
  const secondHold = gate();
  const commits: string[] = [];
  const first = runs.cancel('A', async () => {
    firstBegan.release();
    await firstHold.promise;
    commits.push('first');
  });
  await firstBegan.promise;
  const second = runs.cancel('A', async () => {
    secondBegan.release();
    await secondHold.promise;
    commits.push('second');
  });
  firstHold.release();
  await secondBegan.promise;
  expect(commits).toEqual(['first']);
  await expect(runs.run('A', async () => undefined)).rejects.toMatchObject({
    name: 'AbortError',
  });
  const closed = runs.close().then(() => commits.push('closed'));
  await first;
  expect(commits).toEqual(['first']);
  secondHold.release();
  await Promise.all([second, closed]);
  expect(commits).toEqual(['first', 'second', 'closed']);
});

test('background work started inside a connection remains owned until it drains', async () => {
  const runs = new ProjectRuns();
  const began = gate();
  const hold = gate();
  let wrote = false;
  await runs.run(
    'A',
    async () => {
      runs.start('A', async () => {
        began.release();
        await hold.promise;
        runs.assertActive();
        wrote = true;
      });
    },
    'connect',
  );
  await began.promise;
  expect(runs.has('A')).toBe(true);
  let closed = false;
  const closing = runs.close().then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  hold.release();
  await closing;
  expect(wrote).toBe(false);
});

test('cancellation keeps its stable status and exposes semantic bilingual API metadata', async () => {
  const { businessApiError } =
    await import('../../server/nocoreach/api-error.js');
  const runs = new ProjectRuns();
  await runs.close();
  const error = await runs
    .run('A', async () => undefined)
    .catch((value: Error) => value);
  expect(error).toMatchObject({
    name: 'AbortError',
    status: 409,
    message: 'projectRuns.cancelled',
  });
  if (!(error instanceof Error)) throw new Error('Expected cancellation');
  for (const [locale, message] of [
    ['zh-CN', '采集已取消。'],
    ['en-US', 'Collection was cancelled.'],
  ]) {
    expect(
      businessApiError(409, error.message, undefined, locale).toPayload(),
    ).toMatchObject({
      code: 409,
      localizedMessage: { locale, message },
      metadata: { ns: 'nocoreach', key: 'projectRuns.cancelled' },
    });
  }
});
