// @vitest-environment node
import { expect, it } from 'vitest';
import {
  resultOf,
  resultRules,
} from '../../server/nocoreach/execution/agent-result';
it('accepts only result fields, never model-supplied business identifiers', () => {
  expect(
    resultOf(
      JSON.stringify({
        ok: true,
        content: 'report',
        taskId: 'other',
        runId: 'other',
      }),
    ),
  ).toEqual({ ok: true, content: 'report' });
  expect(() => resultOf('no result')).toThrow('Agent 未返回有效成果');
});

it('requires release evidence and file comparisons for a successful build', () => {
  const pr = {
    url: 'https://github.com/org/site/pull/1',
    number: 1,
    branch: 'nocoreach/task-1',
    headSha: 'abc1234',
    files: [{ path: 'page.html', additions: 1, deletions: 1 }],
    checks: { ok: true, summary: 'Tests passed' },
    release: '新增演示入口',
    verifyText: '立即体验 Demo',
    pages: ['https://example.com/demo'],
    changes: [{ path: 'page.html', before: 'Before', after: '立即体验 Demo' }],
  };
  const result = { ok: true, content: '完成修改', pr };
  expect(resultOf(JSON.stringify(result), 'build')).toEqual(result);
  for (const key of ['release', 'verifyText', 'pages', 'changes']) {
    const incomplete = { ...pr } as Record<string, unknown>;
    delete incomplete[key];
    expect(() =>
      resultOf(JSON.stringify({ ...result, pr: incomplete }), 'build'),
    ).toThrow('Agent 成果缺少');
    expect(resultRules('build').join('\n')).toContain(key);
  }
  expect(
    resultOf(JSON.stringify({ ok: false, error: 'checks_failed' }), 'build'),
  ).toEqual({ ok: false, error: 'checks_failed' });
  expect(() =>
    resultOf(
      JSON.stringify({
        ...result,
        pr: { ...pr, verifyText: '', pages: [], changes: [] },
      }),
      'build',
    ),
  ).not.toThrow();
});

const observedAsOf =
  '任务同步指标截至 2026-10-08；sources capturedAt 为 2026-10-12T05:08:31.097Z，相关原帖抓取于 2026-10-12T05:08:31.206Z 至 05:08:32.144Z；现有网站内容读取自仓库提交 2f6947fc44dfaf092ce504f38d25f523c78f5e55。';
const reportResult = (asOf: unknown) => ({
  ok: true,
  content: 'Complete draft',
  report: { kind: 'content', sources: [], asOf, uncertainties: [] },
});

it.each([observedAsOf, '时'.repeat(1000)])(
  'preserves valid multi-source timing descriptions without truncation',
  (asOf) => {
    const result = reportResult(asOf);
    expect(resultOf(JSON.stringify(result), 'plan', 'content')).toEqual(result);
  },
);

it('identifies the field and limit for oversized timing descriptions', () => {
  expect(() =>
    resultOf(
      JSON.stringify(reportResult('时'.repeat(1001))),
      'plan',
      'content',
    ),
  ).toThrow('Agent 成果的 report.asOf 超过 1000 字符，请缩短资料时间说明');
  expect(resultRules('plan', 'content').join('\n')).toContain(
    'report.asOf 最多 1000 字符',
  );
});

it('still rejects malformed report fields', () => {
  expect(() =>
    resultOf(JSON.stringify(reportResult(123)), 'plan', 'content'),
  ).toThrow('Agent 成果字段 report.asOf 无效');
});

const footer =
  '\n\nLocal continuation saved: /home/runner/work/repository (' +
  'a'.repeat(40) +
  '); not pushed.';
const complete = (sources: unknown[] = []) => ({
  ...reportResult('2026-10-16'),
  report: { ...reportResult('').report, sources },
});

it('normalizes only known material aliases while preserving all evidence', () => {
  const sources = [
    { title: 'Web', url: 'https://example.com/source' },
    { title: 'Task', url: 'nocoreach://task/123' },
    ...['sources', 'knowledge', 'skills'].map((material) => ({
      title: material,
      url: `../.nocoreach-materials/${material}.json`,
    })),
    { title: 'Explicit', material: 'context' },
  ];
  const value = resultOf(
    JSON.stringify(complete(sources)),
    'plan',
    'content',
    '123',
  );
  expect(value.report?.sources).toEqual([
    sources[0],
    { title: 'Task', material: 'context' },
    ...['sources', 'knowledge', 'skills'].map((material) => ({
      title: material,
      material,
    })),
    sources[5],
  ]);
});

it.each([
  'file:///etc/passwd',
  '../other.json',
  '../../.nocoreach-materials/sources.json',
  'nocoreach://task/999',
  'javascript:alert(1)',
  'https://user:secret@example.com',
])('rejects unsupported source %s with field-level feedback', (url) => {
  expect(() =>
    resultOf(
      JSON.stringify(complete([{ title: 'Source', url }])),
      'plan',
      'content',
      '123',
    ),
  ).toThrow('report.sources.0');
});
it.each([
  { title: 'Unknown', material: 'secrets' },
  { title: 'Ambiguous', material: 'context', url: 'https://example.com' },
])('rejects ambiguous or unknown material references', (source) => {
  expect(() =>
    resultOf(JSON.stringify(complete([source])), 'plan', 'content'),
  ).toThrow('report.sources.0');
});
it.each([false, true])(
  'accepts the exact continuation footer after JSON (fenced: %s)',
  (fenced) => {
    const result = complete();
    const json = JSON.stringify(result);
    expect(
      resultOf(
        (fenced ? '```json\n' + json + '\n```' : json) + footer,
        'plan',
        'content',
      ),
    ).toEqual(result);
  },
);
it.each([
  '\nAdditional notes',
  '\n{}',
  footer + '\nextra',
  '\n\nLocal continuation saved: missing commit; not pushed.',
])('rejects unknown trailing text rather than guessing a result', (suffix) => {
  expect(() => resultOf(JSON.stringify(complete()) + suffix)).toThrow(
    '完整 JSON',
  );
});
it('preserves a legitimate negative result despite the Runner footer', () => {
  expect(
    resultOf(JSON.stringify({ ok: false, error: 'checks_failed' }) + footer),
  ).toEqual({ ok: false, error: 'checks_failed' });
});
it('rejects missing/oversized content and a wrong report kind before staging', () => {
  for (const content of ['', ' ', 'x'.repeat(30001)])
    expect(() =>
      resultOf(JSON.stringify({ ...complete(), content }), 'plan', 'content'),
    ).toThrow(/content/);
  expect(() =>
    resultOf(JSON.stringify(complete()), 'plan', 'research'),
  ).toThrow('report.kind');
  expect(() => resultOf(null)).toThrow('最终回答为空');
});
it('does not expose rejected source credentials in diagnostics', () => {
  try {
    resultOf(
      JSON.stringify(
        complete([{ title: 'secret', url: 'https://user:secret@example.com' }]),
      ),
    );
  } catch (error) {
    expect((error as Error).message).not.toContain('secret');
  }
});
