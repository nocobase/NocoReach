import { z } from 'zod';
import { systemMessageText } from '../../../shared/i18n/messages.js';
import { taskResultMaterials } from '../../../shared/task-result.js';
import { fail, type Run } from './model';

const REPORT_AS_OF_MAX_LENGTH = 1000;

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
  // Checked loosely here and cleaned by TaskService: an older Runner may omit it, and a malformed entry must not
  // discard an otherwise valid PR.
  visibleChanges: z.unknown().optional(),
});
const source = z.union([
  z.object({
    title: z.string().max(300),
    url: z.url().refine((value) => {
      try {
        const url = new URL(value);
        return (
          ['http:', 'https:'].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      } catch {
        return false;
      }
    }),
    material: z.never().optional(),
  }),
  z.object({
    title: z.string().max(300),
    material: z.enum(taskResultMaterials),
    url: z.never().optional(),
  }),
]);
const envelope = z.object({
  ok: z.boolean(),
  content: z.string().max(30000).optional(),
  pr: z.record(z.string(), z.unknown()).optional(),
  merged: z.object({ sha: z.string() }).optional(),
  // Checked against the publishing target and the source article by TaskService (article-flow.ts).
  article: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  report: z
    .object({
      kind: z.enum(['communityReply', 'research', 'content']),
      sources: z.array(source).max(30),
      asOf: z.string().max(REPORT_AS_OF_MAX_LENGTH),
      uncertainties: z.array(z.string().max(1000)).max(20),
    })
    .optional(),
});

export function resultRules(mode: Run['mode'], resultKind?: unknown): string[] {
  return [
    '最终回答必须是完整 JSON：{ok:boolean,content:string,pr?:object,merged?:{sha:string},error?:string,message?:string}。失败 ok=false；不要在 JSON 外加文字。',
    ...(typeof resultKind === 'string'
      ? [
          `本次成果类型是 ${String(resultKind)}。成功时 content 是完整 Markdown 正文，另必须返回 report:{kind:"${String(resultKind)}",sources:[{title,url}|{title,material}],asOf:string,uncertainties:[string]}。sources 只列实际读取的来源，asOf 写资料覆盖或抓取时间，不确定和未验证事项放 uncertainties，无则空数组。`,
          `report.asOf 最多 ${REPORT_AS_OF_MAX_LENGTH} 字符，简要写数据截止时间和抓取时间；不同来源的详细时间说明放 content 正文，不确定事项放 uncertainties。`,
          '网页来源使用完整 HTTP/HTTPS url（不含凭据）；任务材料使用 material: context|sources|knowledge|skills，不使用文件路径、file:// 或 nocoreach:// URL。正文 content 最多 30000 字符，sources 最多 30 项，title 最多 300 字符，uncertainties 最多 20 项且每项最多 1000 字符。',
          '研究给出依据、建议和理由；社区回复逐帖给出可供审核的草稿并引用原帖；内容草稿区分事实与建议。没有仓库的研究或草稿无需创建 PR。',
        ]
      : []),
    ...(mode === 'build'
      ? [
          'build 成功必须返回 pr：{url,number,branch,headSha,files:[{path,additions,deletions}],checks:{ok,summary},release,verifyText,pages:[string],changes:[{path,before,after,truncated?:boolean}],visibleChanges:[{page,label,before,after}]}。',
          'visibleChanges 给不看代码的负责人审核：用读者的话列出访客或搜索结果能看到的变化。page 是页面路径或 URL；label 说明是哪一处，如“搜索标题”“搜索描述”“页面开头”“新增链接”；before/after 是改动前后读者看到的文字，原来没有就写空字符串。最多 20 项，每段不超过 1000 字符；不写代码、标签或文件路径。读者看不到变化时返回空数组。',
          'release 是发布说明；verifyText 是改动后可在公开页面找到的独特短句（最多 200 字符）；pages 是待验证的页面 URL。无法通过页面文字验证时，verifyText 返回空字符串、pages 返回空数组，并在 release 说明原因，不得编造。',
          'changes 提供实际修改文本的前后对比，最多 10 个文件，正文合计不超过 40000 字符，截断时标记 truncated=true；二进制文件只列在 files。完整 JSON 不超过 90000 字符。',
        ]
      : []),
    ...(mode === 'article'
      ? [
          'article 是文章写作：不需要仓库，不提交、不推送、不开 PR，也不要调用任何 CMS、网站或发布接口；审核通过后由 NocoReach 发布。',
          'data.article.source 是当前源稿文件（JSON：id、slug、status 和 locales 下各语言的 title、description、body，body 为 Markdown），先完整读取，改写时在源稿基础上修改。data.article.action 为 create 时 source 为 null，是新文章。',
          'article 成功必须返回 article:{slug?,locales:{<语言>:{title?,description?,body?}},verifyText?,summary?}。语言只能取 data.article.target.locales，字段只能取 data.article.target.fields 中该语言支持的字段。',
          '新文章必须给出 slug（小写字母、数字和连字符，最多 200 字符），以及第一个语言的 title 和 body。改写已有文章只返回实际修改的语言和字段，未修改的不要返回；body 必须是该语言的完整正文，不是片段。title 最多 300 字符，description 最多 2000 字符。',
          'verifyText 是发布后能在页面上找到的独特短句，取自修改后的标题或正文原文，8-200 字符；没有合适的就省略。summary 一两句话说明改了什么。content 写给审核人的修改说明（Markdown），列出改动的语言、字段和理由。',
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

export type AgentResult = z.infer<typeof envelope>;
const invalid = (key: string, params: Record<string, unknown> = {}): never =>
  fail(systemMessageText(`agentResult.${key}`, params), 422);

/** Only the exact Runner continuation footer is tolerated, never arbitrary text or a second JSON. */
function summaryJson(summary: string | null, max = 100000): unknown {
  let raw = summary?.trim() || '';
  if (!raw) return invalid('empty');
  if (raw.length > max) return invalid('tooLong');
  raw = raw
    .replace(
      /\n\nLocal continuation saved: [^\r\n]+ \([0-9a-f]{40}\); not pushed\.$/,
      '',
    )
    .trim();
  if (raw.startsWith('```json\n') || raw.startsWith('```\n'))
    raw = raw.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '');
  try {
    return JSON.parse(raw);
  } catch {
    return invalid('json');
  }
}

/** Normalize only known mount aliases; never resolve paths or accept another task's identifier. */
function normalizeSources(value: unknown, taskId?: string): unknown {
  if (!value || typeof value !== 'object') return value;
  const report = (value as { report?: { sources?: unknown } }).report;
  if (!Array.isArray(report?.sources)) return value;
  return {
    ...value,
    report: {
      ...report,
      sources: report.sources.map((item: unknown) => {
        if (!item || typeof item !== 'object') return item;
        const entry = item as Record<string, unknown>;
        if (typeof entry.url !== 'string' || 'material' in entry) return entry;
        const match =
          /^(?:\.\.\/|\.\/)?\.nocoreach-materials\/(sources|knowledge|skills)\.json$/.exec(
            entry.url,
          );
        const material =
          match?.[1] ||
          (taskId && entry.url === `nocoreach://task/${taskId}`
            ? 'context'
            : undefined);
        if (!material) return entry;
        const { url: _url, ...rest } = entry;
        return { ...rest, material };
      }),
    },
  };
}

/** A stopped coding process is not evidence that its business operation succeeded. */
export function resultOf(
  summary: string | null,
  mode?: Run['mode'],
  resultKind?: unknown,
  taskId?: string,
): AgentResult {
  const parsed = envelope.safeParse(
    // An article carries complete bodies for several languages.
    normalizeSources(summaryJson(summary, mode === 'article' ? 800000 : 100000), taskId),
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.map(String).join('.');
    if (issue.code === 'too_big' && path === 'report.asOf')
      return invalid('asOfLimit');
    // Never echo model values or library error text (which can contain credentials or local paths).
    return invalid(path.startsWith('report.sources') ? 'source' : 'field', {
      0: path || 'result',
    });
  }
  const result = parsed.data;
  if (
    result.ok &&
    (mode === 'plan' || mode === 'build' || mode === 'article' || resultKind) &&
    !result.content?.trim()
  )
    return invalid('content');
  if (result.ok && resultKind && result.report?.kind !== resultKind)
    return invalid('kind', {
      0:
        typeof resultKind === 'string'
          ? resultKind
          : 'research|content|communityReply',
    });
  if (result.ok && mode === 'build') {
    const pr = buildPr.safeParse(result.pr);
    if (!pr.success)
      return invalid('pr', {
        0: pr.error.issues[0].path.map(String).join('.'),
      });
    return { ...result, pr: pr.data };
  }
  if (result.ok && mode === 'article' && !result.article)
    return invalid('field', { 0: 'article' });
  if (
    result.ok &&
    mode === 'merge' &&
    !/^[0-9a-f]{7,40}$/.test(result.merged?.sha || '')
  )
    return invalid('field', { 0: 'merged.sha' });
  return result;
}
