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
