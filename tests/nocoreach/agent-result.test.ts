// @vitest-environment node
import { expect, it } from 'vitest';
import { resultOf } from '../../server/nocoreach/execution/agents-runtime';
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
