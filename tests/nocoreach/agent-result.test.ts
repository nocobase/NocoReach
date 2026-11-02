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
  // The reader-facing comparison is requested but optional, so older Runners keep working.
  expect(resultRules('build').join('\n')).toContain('visibleChanges');
  const visibleChanges = [
    { page: '/demo', label: '页面开头', before: '', after: '立即体验 Demo' },
  ];
  expect(
    resultOf(
      JSON.stringify({ ...result, pr: { ...pr, visibleChanges } }),
      'build',
    ),
  ).toEqual({ ...result, pr: { ...pr, visibleChanges } });
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
it('says where malformed JSON goes wrong without echoing the model text', () => {
  // The 2026-10-18 article run: `article` closed early, so a complete object ends before a stray brace.
  const early =
    '{"ok":true,"content":"c","article":{"locales":{}},"verifyText":"secret phrase"}}';
  expect(() => resultOf(early, 'article')).toThrow(
    /第 79 个字符后还有多余内容/,
  );
  expect(() => resultOf('{"ok":true,"content":"c"', 'plan')).toThrow(
    /第 24 个字符附近无法解析/,
  );
  expect(() => resultOf('Here is the result', 'plan')).toThrow(
    '不能附加说明文字',
  );
  try {
    resultOf(early, 'article');
  } catch (e) {
    expect((e as Error).message).not.toContain('secret phrase');
  }
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

it('asks article runs for a short summary the reviewer reads first, and keeps the details in content', () => {
  const rules = resultRules('article').join('\n');
  expect(rules).toContain('summary 必填');
  expect(rules).toContain('最多三行');
  expect(rules).toContain('不要重复改前改后的标题和摘要');
  expect(rules).toContain('content 是完整的修改说明');
  expect(resultRules('build').join('\n')).toContain(
    'release 是给负责人看的发布说明，最多三行',
  );
});

// 2026-10-27 (T-47): the article was written in the project's language instead of the target's primary one.
it('tells article runs the article language is the primary one, not the project language, and to rewrite when told so', () => {
  const rules = resultRules('article').join('\n');
  expect(rules).toContain(
    '文章用哪种语言写只看 data.article.languages，和 data.language 无关',
  );
  expect(rules).toContain('data.language 是项目语言，只用于 content、summary');
  expect(rules).toContain(
    '以及主语言 data.article.languages.primary 的 title 和 body',
  );
  expect(rules).toContain('phase 为 all 时一次写 languages.write');
  // The readable rejection is a writing instruction, not a setting to fix.
  expect(rules).toContain('不是配置问题，也不要因此报告失败');
  expect(rules).toContain('不受“保留正文、只修正格式”的限制');
  expect(resultRules('plan').join('\n')).not.toContain(
    'data.article.languages',
  );
});

// 2026-10-30 (T-58): asked for another primary language, the Agent sent the person to an article setting that does
// not exist; it now names the review card's Primary language and never a setting the task page lacks.
it('article rules say where the primary language is changed and to name only what the task page has', () => {
  const rules = resultRules('article').join('\n');
  expect(rules).toContain(
    '主语言由任务决定（languages.primary），你不能自己换',
  );
  expect(rules).toContain('任务页文章审核卡片上的“主语言”');
  expect(rules).toContain('不要提到任务页上没有的设置或按钮');
});
