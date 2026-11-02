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
    // The codes say whose problem a failure is (shared/run-failure.ts); the task page turns them into what to do.
    '失败时 error 写原因代码：missing_tool（电脑上缺少这一步离不开的工具）、tool_signed_out（这一步离不开的工具没有登录或没有权限）、quota_exhausted（额度用完或被限流），其他原因写 agent_failed；message 用负责人看得懂的一句话说明缺少什么、需要在电脑上做什么，不写命令输出。已经拿到的内容仍放在 content（研究可同时返回 report），负责人可以直接使用，再试时也会交给你接着做。',
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
          'release 是给负责人看的发布说明，最多三行，用读者能懂的话说改了什么，不写时间戳和规则名；verifyText 是改动后可在公开页面找到的独特短句（最多 200 字符）；pages 是待验证的页面 URL。无法通过页面文字验证时，verifyText 返回空字符串、pages 返回空数组，并在 release 说明原因，不得编造。',
          'changes 提供实际修改文本的前后对比，最多 10 个文件，正文合计不超过 40000 字符，截断时标记 truncated=true；二进制文件只列在 files。完整 JSON 不超过 90000 字符。',
        ]
      : []),
    ...(mode === 'article'
      ? [
          'article 是文章写作：不需要仓库，不提交、不推送、不开 PR，也不要调用任何 CMS、网站或发布接口；审核通过后由 NocoReach 发布。',
          'data.article.source 是当前源稿文件（JSON：id、slug、status 和 locales 下各语言的 title、description、body，body 为 Markdown），先完整读取，改写时在源稿基础上修改。data.article.action 为 create 时 source 为 null，是新文章。',
          'article 成功必须返回 article:{slug?,status?,locales:{<语言>:{title?,description?,body?}},verifyText?,summary?}；verifyText 和 summary 都放在 article 里面。语言只能取 data.article.target.locales，字段只能取 data.article.target.fields 中该语言支持的字段。',
          'status 只能是 draft 或 published，仅在 data.article.target.status 为 true 时有效：新文章默认 draft，任务明确要求直接公开时才写 published；改写已有文章时不要改变状态，除非任务明确要求。提交前先用 JSON 解析器检查结果是合法 JSON。',
          '新文章必须给出 slug（小写字母、数字和连字符，最多 200 字符），以及主语言 data.article.languages.primary 的 title 和 body。改写已有文章只返回实际修改的语言和字段，未修改的不要返回；body 必须是该语言的完整正文，不是片段。title 最多 300 字符，description 最多 2000 字符。',
          'verifyText 是发布后能在页面上找到的独特短句，取自修改后的标题或正文原文，8-200 字符；没有合适的就省略。',
          // The article's language is never the project's (2026-10-27, T-47: with the project, the brief and the
          // outline in Chinese, the Agent wrote a Chinese-only article for a target whose first language is English).
          '文章用哪种语言写只看 data.article.languages，和 data.language 无关。data.language 是项目语言，只用于 content、summary 这些给审核人看的说明；任务标题和说明、大纲、上一步的成果、留言和资料用什么语言，都不改变文章的语言，需要时先理解其中的意思，再用文章的语言来写。locales 的键是语言代码，每种语言的 title、description、body 都要真的用这种语言写，例如 en 用英语、zh 用中文、ja 用日语。',
          'phase 为 primary 时只写主语言 languages.primary，其他语言（languages.others）在审核通过后再翻译，这次不要写、不要返回；按审核意见修改时也只改主语言。phase 为 all 时一次写 languages.write 里需要的语言，新文章至少要有主语言。',
          // 2026-10-30 (T-58): asked for another primary language, the Agent told the person to change it in an article
          // setting that does not exist. The primary is changed on the review card, which reruns the step in it.
          '主语言由任务决定（languages.primary），你不能自己换。审核意见要求换主语言时，这次仍按 languages.primary 写，并在 summary 里告诉负责人：可以在任务页文章审核卡片上的“主语言”里改，改了会用新的主语言重写这一版。主语言刚换过时，上一版的草稿或说明里已经有这种语言的内容，可以直接拿来用。做不到的要求，只说负责人在任务页上能怎么做，不要提到任务页上没有的设置或按钮。',
          'task result 提示语言不符时（例如“新文章必须有英语（en）的标题和正文，这次只写了：中文（zh）”），说明文章写成了别的语言，不是配置问题，也不要因此报告失败：按提示用要求的语言重写标题、摘要和正文，再重新提交。这种情况不受“保留正文、只修正格式”的限制。',
          'phase 为 translate 时，languages.approved 是要翻译的原文（title、description、body），即已经审核通过的主语言版本，或者翻译已发布文章时文章现在的原文：把 languages.approved.fields 列出的字段翻译成 languages.write 里的每种语言，只返回这些语言，不要改主语言。翻译要忠实于原意，保持段落、标题层级、Markdown、链接和图片不变，用当地读者习惯的说法，不要逐字硬译；产品名、代码和专有名词保持原样。summary 写翻译了哪些语言，以及需要人留意的地方（如某个说法没有对应的本地用语）。',
          // 2026-10-28 (T-53): updating an existing article re-translated the whole new primary, replacing the other
          // languages' wording; their own text is now edited with the primary's changes instead.
          'phase 为 update 时，这是一篇已有文章：主语言已经改好并审核通过，languages.update 里的语言文章原来就有，要把主语言的改动同样做到这些语言上，不是重新翻译。每种语言以 data.article.source 里它现在的文字为底稿。languages.changes 是主语言改了的字段：title、description 给出改前 before 和改后 after；body 的 edits 逐处列出改前 before 和改后 after（before 为空是新增，after 为空是删除），near 是这处改动前面没有变的一段主语言原文，用来在底稿里找到对应的位置；truncated 为 true 时没有逐处列出，请自己对比 source 里主语言的正文和 languages.approved.body。在每种语言里做对应的修改：只改 changes 里的字段，正文只增加、删除或改写对应的段落，新写的内容按上面的翻译要求译成这种语言；其余段落和原来的译法保持原样，不要润色或重新翻译没有改动的部分。主语言只改了标题或摘要时，只改这些字段，不要返回正文。每种语言只返回改过的字段，值是改后的完整内容（body 是完整正文，不是片段）。languages.translate 里的语言文章还没有，把 languages.approved 整篇翻译成这些语言。只返回 languages.write 里的语言，不要改主语言。summary 按语言写改了哪些地方，以及需要人留意的地方。',
          '提交前确认 article.locales 里是这一步要写的语言（languages.write）。task result 提示没有要写的语言时，说明交的不是这次写的结果（例如之前留下的文件）：用这次写好的内容重新提交。',
          'summary 必填，是审核人最先看到的说明：纯文本，最多三行，用读者能懂的话说这次改了什么；按审核意见修改时先说按意见做了什么，例如“按你的意见换了 5 张截图（NocoBase、Teable）；标题和摘要沿用上一版”。不要写时间戳、规则名、证据细节，也不要重复改前改后的标题和摘要，审核页会显示文章预览和逐项对比。',
          'content 是完整的修改说明（Markdown），审核人需要时才展开：列出改动的语言、字段、理由和依据。',
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
    // Say where it went wrong (a position only, never the model's text) so the Agent can correct it: a complete
    // value followed by more text (often a bracket closed too early), or text that is not JSON there.
    const end = firstValueEnd(raw);
    let complete = false;
    if (end > 0 && end < raw.length) {
      try {
        JSON.parse(raw.slice(0, end));
        complete = true;
      } catch {
        /* the first value itself is malformed */
      }
    }
    if (complete) return invalid('jsonTrailing', { 0: end });
    if (!/^[{[]/.test(raw)) return invalid('json');
    return invalid('jsonSyntax', {
      0: Math.max(1, end > 0 ? end : raw.length),
    });
  }
}

/** Where the first top-level object or array closes (index after it), or -1. Strings and escapes are respected. */
function firstValueEnd(raw: string): number {
  let depth = 0,
    inString = false,
    escaped = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return i + 1;
      if (depth < 0) return -1;
    }
  }
  return -1;
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
    normalizeSources(
      summaryJson(summary, mode === 'article' ? 800000 : 100000),
      taskId,
    ),
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
