import { z } from 'zod';
import { fail, type Run } from './model';

// This contract is shared by the Runner instructions and the result boundary. Business checks
// (the registered repository, reviewed commit and allowed paths) still belong to TaskService.
const buildPr = z.object({
  url: z.string(),
  number: z.number().int().positive(),
  branch: z.string(),
  headSha: z.string(),
  files: z.array(
    z.object({
      path: z.string(),
      additions: z.number(),
      deletions: z.number(),
    }),
  ),
  checks: z.object({ ok: z.boolean(), summary: z.string() }),
  release: z.string(),
  verifyText: z.string(),
  pages: z.array(z.string()),
  changes: z.array(
    z.object({
      path: z.string(),
      before: z.string(),
      after: z.string(),
      truncated: z.boolean().optional(),
    }),
  ),
});
const envelope = z.object({
  ok: z.boolean(),
  content: z.string().optional(),
  pr: z.record(z.string(), z.unknown()).optional(),
  merged: z.object({ sha: z.string() }).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export function resultRules(mode: Run['mode']): string[] {
  return [
    '最终回答必须是完整 JSON：{ok:boolean,content:string,pr?:object,merged?:{sha:string},error?:string,message?:string}。失败 ok=false；不要在 JSON 外加文字。',
    ...(mode === 'build'
      ? [
          'build 成功必须返回 pr：{url,number,branch,headSha,files:[{path,additions,deletions}],checks:{ok,summary},release,verifyText,pages:[string],changes:[{path,before,after,truncated?:boolean}]}。',
          'release 是发布说明；verifyText 是改动后可在公开页面找到的独特短句（最多 200 字符）；pages 是待验证的页面 URL。无法通过页面文字验证时，verifyText 返回空字符串、pages 返回空数组，并在 release 说明原因，不得编造。',
          'changes 提供实际修改文本的前后对比，最多 10 个文件，正文合计不超过 40000 字符，截断时标记 truncated=true；二进制文件只列在 files。完整 JSON 不超过 90000 字符。',
        ]
      : []),
    ...(mode === 'merge'
      ? ['merge 成功必须返回 merged.sha，值为实际合并提交的 SHA。']
      : []),
    ...(mode === 'revert'
      ? [
          'revert 成功必须返回 pr.url 和 pr.number，指向新建且尚未合并的回退 PR。',
        ]
      : []),
  ];
}

/** A stopped coding process is not evidence that its business operation succeeded. */
export function resultOf(
  summary: string | null,
  mode?: Run['mode'],
): Record<string, unknown> {
  const raw = summary
    ?.trim()
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(raw || '');
  } catch {
    return fail('Agent 未返回有效成果', 422);
  }
  const parsed = envelope.safeParse(value);
  if (!parsed.success) return fail('Agent 未返回有效成果', 422);
  const result = parsed.data;
  if (result.ok && mode === 'build') {
    const pr = buildPr.safeParse(result.pr);
    if (!pr.success)
      return fail('Agent 成果缺少完整的 PR、发布说明或改动对比', 422);
    return { ...result, pr: pr.data };
  }
  return result;
}
