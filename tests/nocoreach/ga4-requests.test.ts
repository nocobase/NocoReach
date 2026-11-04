import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, expect, it, vi } from 'vitest';
import { Ga4Requests } from '../../server/nocoreach/ga4-requests.js';
import {
  RETRY_429_MS,
  WebsiteReport,
  withGa4RetryDeadline,
} from '../../server/nocoreach/website-report.js';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('shares identical in-flight work, isolates projects/scenarios and releases failures for retry', async () => {
  const requests = new Ga4Requests();
  const slow = Promise.withResolvers<string>();
  const operation = vi.fn(() => slow.promise);
  const run = (project = '1', scope = 'a') =>
    requests.run([project, scope], '123', 'runReport', {}, operation);
  const first = run(),
    second = run(),
    other = run('2'),
    scenario = run('1', 'b');
  await Promise.resolve();
  expect(operation).toHaveBeenCalledTimes(3);
  const settled = Promise.allSettled([first, second, other, scenario]);
  slow.reject(new Error('quota exceeded'));
  expect((await settled).every((r) => r.status === 'rejected')).toBe(true);
  operation.mockResolvedValue('recovered');
  expect(await run()).toBe('recovered');
  expect(operation).toHaveBeenCalledTimes(4);
});

it('counts reports inside batches, shares property limits across projects and preserves each queued async context', async () => {
  const requests = new Ga4Requests();
  const context = new AsyncLocalStorage<string>();
  const release = Promise.withResolvers<void>();
  const seen: (string | undefined)[] = [];
  const first = context.run('project one', () =>
    requests.run(
      ['1'],
      '123',
      'batchRunReports',
      { requests: Array(9).fill({}) },
      async () => {
        seen.push(context.getStore());
        await release.promise;
      },
    ),
  );
  const second = context.run('project two', () =>
    requests.run(['2'], '123', 'runReport', {}, async () => {
      seen.push(context.getStore());
    }),
  );
  const independent = requests.run(
    ['3'],
    '456',
    'runReport',
    {},
    async () => 'other property',
  );
  expect(await independent).toBe('other property');
  expect(seen).toEqual(['project one']);
  release.resolve();
  await Promise.all([first, second]);
  expect(seen).toEqual(['project one', 'project two']);
});

function fixture() {
  let active = 0,
    peak = 0,
    reportPeak = 0,
    reports = 0;
  const calls: { method: string; body: Record<string, unknown> }[] = [];
  const token = vi.fn(async () => 'access');
  const report = (body: {
    dimensions: { name: string }[];
    metrics: { name: string }[];
  }) => ({
    dimensionHeaders: body.dimensions.map(({ name }) => ({ name })),
    metricHeaders: body.metrics.map(({ name }) => ({ name })),
    rows: [],
  });
  const host = {
    token,
    googleFetch: () => async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      const method = String(url).split(':').at(-1)!;
      calls.push({ method, body });
      active++;
      const weight = body.requests?.length || 1;
      reports += weight;
      peak = Math.max(peak, active);
      reportPeak = Math.max(reportPeak, reports);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      reports -= weight;
      return Response.json(
        method === 'batchRunReports'
          ? { reports: body.requests.map(report) }
          : report(body),
      );
    },
  };
  const service = new WebsiteReport(host);
  return {
    service,
    calls,
    token,
    peak: () => peak,
    reportPeak: () => reportPeak,
  };
}

it('coalesces whole realtime refreshes even when some parts have already finished, caches for a minute and caps concurrency', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const first = f.service.realtime('1', '123');
  await vi.advanceTimersByTimeAsync(6);
  const duplicate = f.service.realtime('1', '123');
  await vi.runAllTimersAsync();
  const [a, b] = await Promise.all([first, duplicate]);
  expect(a).toEqual(b);
  expect(f.calls).toHaveLength(7);
  expect(f.peak()).toBe(4);
  expect(f.token).toHaveBeenCalledTimes(1);
  await f.service.realtime('1', '123');
  expect(f.calls).toHaveLength(7);
  await vi.advanceTimersByTimeAsync(60000);
  const next = f.service.realtime('1', '123');
  await vi.runAllTimersAsync();
  await next;
  expect(f.calls).toHaveLength(14);
});

it('coalesces concurrent historical reports and runs nine core reports at once, in batches of five and four', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const window = {
    start: '2026-10-04',
    end: '2026-10-10',
    previousStart: '2026-09-27',
    previousEnd: '2026-10-03',
  };
  // The page's first part twice and its other tables: seven reports and nine, as five and two, then five and four.
  const results = Promise.all([
    f.service.period('1', '123', window),
    f.service.period('1', '123', window),
    f.service.periodTables('1', '123', window),
  ]);
  await vi.runAllTimersAsync();
  await results;
  expect(f.calls).toHaveLength(4);
  expect(
    f.calls.map((c) => (c.body.requests as unknown[] | undefined)?.length),
  ).toEqual([5, 2, 5, 4]);
  // One fewer than GA4's ten, for what reaches it outside this queue.
  expect(f.reportPeak()).toBe(9);
});

it('does not reuse realtime results after the simulated network scope changes', async () => {
  vi.useFakeTimers();
  const f = fixture();
  let scope = 'one';
  f.service.p.network = { mockCacheKey: () => scope };
  const first = f.service.realtime('1', '123');
  await vi.runAllTimersAsync();
  await first;
  scope = 'two';
  const second = f.service.realtime('1', '123');
  await vi.runAllTimersAsync();
  await second;
  expect(f.calls).toHaveLength(14);
});

it('coalesces today and row reads independently and reuses their completed caches', async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.service.timeZone = async () => 'UTC';
  const window = {
    start: '2026-10-04',
    end: '2026-10-10',
    previousStart: '2026-09-27',
    previousEnd: '2026-10-03',
  };
  const row = {
    table: 'sourceMedium',
    dims: { sessionSource: 'google', sessionMedium: 'organic' },
  };
  const read = () =>
    Promise.all([
      f.service.today('1', '123'),
      f.service.today('1', '123'),
      f.service.row('1', '123', window, row),
      f.service.row('1', '123', window, row),
    ]);
  const results = read();
  await vi.runAllTimersAsync();
  await results;
  expect(f.calls).toHaveLength(2);
  await read();
  expect(f.calls).toHaveLength(2);
});

it('asks GA4 again three times after a 429, waiting outside the queue, then fails; other errors fail at once', async () => {
  vi.useFakeTimers();
  const warn = vi.fn();
  const service = new WebsiteReport({ app: { logger: { warn } } } as never);
  const internals = service as unknown as {
    token: () => Promise<string>;
    json: ReturnType<typeof vi.fn>;
  };
  internals.token = async () => 'token';
  const busy = Object.assign(
    new Error('Exhausted concurrent requests quota.'),
    {
      status: 429,
      code: 'google_api_error',
    },
  );
  const nine = { requests: Array(9).fill({}) };
  // The batch is refused twice; anything else is answered.
  let refusals = 2;
  internals.json = vi.fn(
    async (_id: string, _url: string, init: { body: string }) => {
      if (JSON.parse(init.body).requests && refusals-- > 0) throw busy;
      return { rows: [] };
    },
  );
  const answered = service.post('1', '123', 'batchRunReports', nine);
  await vi.advanceTimersByTimeAsync(1);
  // While it waits, its nine slots are free for the property's other reads.
  expect(await service.post('1', '123', 'runReport', { other: 1 })).toEqual({
    rows: [],
  });
  await vi.advanceTimersByTimeAsync(RETRY_429_MS[0] - 2);
  expect(internals.json).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(2);
  expect(internals.json).toHaveBeenCalledTimes(3);
  await vi.advanceTimersByTimeAsync(RETRY_429_MS[1]);
  expect(await answered).toEqual({ rows: [] });
  expect(internals.json).toHaveBeenCalledTimes(4);
  expect(warn).toHaveBeenCalledTimes(2);
  internals.json = vi.fn().mockRejectedValue(busy);
  const failed = service
    .post('1', '123', 'runReport', { b: 1 })
    .catch((e: unknown) => e);
  await vi.advanceTimersByTimeAsync(
    RETRY_429_MS.reduce((total, wait) => total + wait, 0),
  );
  expect(await failed).toBe(busy);
  expect(internals.json).toHaveBeenCalledTimes(4);
  const refused = Object.assign(new Error('Invalid dimension'), {
    status: 400,
    code: 'google_api_error',
  });
  internals.json = vi.fn().mockRejectedValue(refused);
  await expect(service.post('1', '123', 'runReport', { c: 1 })).rejects.toBe(
    refused,
  );
  expect(internals.json).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

it("fails at once when the hourly token quota is used up, and stops waiting at a reader's deadline", async () => {
  vi.useFakeTimers();
  const service = new WebsiteReport({} as never);
  const internals = service as unknown as {
    token: () => Promise<string>;
    json: ReturnType<typeof vi.fn>;
  };
  internals.token = async () => 'token';
  const tokens = Object.assign(
    new Error('Exhausted property tokens per project per hour.'),
    { status: 429, code: 'google_api_error' },
  );
  internals.json = vi.fn().mockRejectedValue(tokens);
  await expect(service.post('1', '123', 'runReport', { a: 1 })).rejects.toBe(
    tokens,
  );
  expect(internals.json).toHaveBeenCalledTimes(1);
  const busy = Object.assign(
    new Error('Exhausted concurrent requests quota.'),
    {
      status: 429,
      code: 'google_api_error',
    },
  );
  internals.json = vi.fn().mockRejectedValue(busy);
  // 15 seconds allow the first wait (10) but not the second (30).
  const failed = withGa4RetryDeadline(Date.now() + 15000, () =>
    service.post('1', '123', 'runReport', { b: 1 }),
  ).catch((e: unknown) => e);
  await vi.advanceTimersByTimeAsync(RETRY_429_MS[0]);
  expect(await failed).toBe(busy);
  expect(internals.json).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});
