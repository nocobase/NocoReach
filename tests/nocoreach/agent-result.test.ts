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
