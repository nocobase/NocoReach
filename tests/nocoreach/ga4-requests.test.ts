import { AsyncLocalStorage } from 'node:async_hooks';
import { afterEach, expect, it, vi } from 'vitest';
import { Ga4Requests } from '../../server/nocoreach/ga4-requests.js';
import { WebsiteReport } from '../../server/nocoreach/website-report.js';

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
      { requests: Array(5).fill({}) },
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

it('coalesces concurrent historical reports and never runs more than five core reports at once', async () => {
  vi.useFakeTimers();
  const f = fixture();
  const window = {
    start: '2026-10-04',
    end: '2026-10-10',
    previousStart: '2026-09-27',
    previousEnd: '2026-10-03',
  };
  const results = Promise.all([
    f.service.period('1', '123', window),
    f.service.period('1', '123', window),
  ]);
  await vi.runAllTimersAsync();
  await results;
  expect(f.calls).toHaveLength(4);
  expect(f.reportPeak()).toBe(5);
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
