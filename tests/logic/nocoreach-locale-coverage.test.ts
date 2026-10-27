// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import english from '../../shared/i18n/en.json';
import chinese from '../../shared/i18n/zh.json';
import legacyKeys from '../../shared/i18n/legacy-keys.json';
import { systemMessageKey } from '../../shared/i18n/messages';
import { SYSTEM_PLAYBOOKS, stagesFor } from '../../shared/playbook-catalog';

const root = fileURLToPath(new URL('../..', import.meta.url));
const dictionary: Record<string, string> = english;
const sourceFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.tsx?$/u.test(entry.name)
        ? [file]
        : [];
  });
const sources = sourceFiles(path.join(root, 'client'))
  .filter((file) => !/[\\/](?:i18n|locales)[\\/]/u.test(file))
  .map((file) =>
    ts.createSourceFile(
      file,
      fs.readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    ),
  );
const location = (node: ts.Node) =>
  path.relative(root, node.getSourceFile().fileName) +
  ':' +
  (node.getSourceFile().getLineAndCharacterOfPosition(node.pos).line + 1);

// Inspect result leaves only: condition operands are business values, not translation keys.
function keyLeaves(node: ts.Expression): ts.StringLiteralLike[] {
  if (ts.isStringLiteralLike(node)) return [node];
  if (ts.isParenthesizedExpression(node)) return keyLeaves(node.expression);
  if (ts.isConditionalExpression(node))
    return [...keyLeaves(node.whenTrue), ...keyLeaves(node.whenFalse)];
  return [];
}

describe('NocoReach semantic-key translations', () => {
  it('uses matching, unique semantic keys for both languages and valid legacy aliases', () => {
    const keys = Object.keys(dictionary);
    expect(Object.keys(chinese).sort()).toEqual([...keys].sort());
    expect(new Set(keys.map((key) => key.toLowerCase())).size).toBe(
      keys.length,
    );
    expect(
      keys.filter(
        (key) => !/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/.test(key),
      ),
    ).toEqual([]);
    // New semantic keys need no fabricated historical Chinese alias.
    expect(
      Object.values(legacyKeys).filter((key) => !keys.includes(key)),
    ).toEqual([]);
    expect(new Set(Object.values(legacyKeys)).size).toBe(
      Object.values(legacyKeys).length,
    );
    // A legacy alias keeps its historical source text when the visible copy changes.
    const changedLegacyCopy: Record<string, string> = {
      // Task page copy without positions (2026-10-23: the Agent moved to the right column in #241).
      '{0} {1}。第 7、28 天自动和上线前对比，结果在右侧“效果观察”。':
        '{0} {1}。第 7、28 天自动和上线前对比，结果见“数据表现”。',
      '交付的内容保存在下方成果中。': '交付的内容已保存在成果中。',
      '从 {0} 开始观察效果，第 7、28 天自动和上线前对比，结果在右侧“效果观察”。':
        '从 {0} 开始观察效果，第 7、28 天自动和上线前对比，结果见“数据表现”。',
      '没有关联页面，无法对比。在上方“关联页面”选一个页面后开始观察。':
        '没有关联页面，无法对比。选一个关联页面后开始观察。',
      '由 {0} 把关，你可以在下面留言': '由 {0} 把关，你可以在动态里留言',
      '需要调整步骤时，在下方“历史与执行记录”中编辑方案。':
        '需要调整步骤时，在“历史与执行记录”中编辑方案。',
      // Playbook step names in formal wording (2026-10-22), quoted.
      '有“Agent 修改”时，系统会在最后接上“上线 → 观察效果”；最后一步不是审核时会自动加上“看效果并发布”。':
        '有“Agent 修改”时，系统会在最后接上“发布上线 → 观察效果”；最后一步不是审核时会自动加上“审核”。',
      '（不改仓库）': '（不修改仓库）',
      // Playbook step names in formal wording (2026-10-22).
      出方案: '制定方案',
      看方案: '审核方案',
      看效果并发布: '审核并发布',
      你审核: '由你审核',
      看过后通过或要求修改: '审核后通过或要求修改',
      '你确认 · 系统执行': '确认后由系统执行',
      不改仓库: '不修改仓库',
      '不改仓库，写出一份文档': '不修改仓库，产出一份文档',
      '改仓库、开 PR': '修改仓库并创建 PR',
      // Task detail in formal words (2026-10-21), closed card.
      '已关闭 · {0}': '关闭时：{0}',
      '{0} 关闭。': '关闭于 {0}。',
      // Space between Chinese and Agent (UI review A16).
      '给{0}留言，下一次运行会读到': '给 {0} 留言，下次运行时会读取',
      // Space between Chinese and Agent (UI review A16).
      'PR #{0} 等Agent 关闭（分支保留）': 'PR #{0} 等 Agent 关闭（分支保留）',
      交给Agent: '交给 Agent',
      '发布和观察只用于包含Agent 修改仓库的流程':
        '发布和观察只用于包含 Agent 修改仓库的流程',
      '审核通过的内容更新到网站后记录一下。接入Agent 后，这一步改为确认合并 PR。':
        '审核通过的内容更新到网站后记录一下。接入 Agent 后，这一步改为确认合并 PR。',
      '已交给Agent，马上开始。': '已交给 Agent，马上开始。',
      '帮你干活的 AI：在线 AI 每天分析数据、提出机会；所有任务交给Agent 去做。':
        '帮你干活的 AI：在线 AI 每天分析数据、提出机会；所有任务交给 Agent 去做。',
      // Accept and start (2026-10-24): the hand-over starts the next task.
      '接受，交给Agent“{0}”': '接受并开始{0}',
      '由Agent 执行，{0}。': '由 Agent 执行，{0}。',
      '私有仓库也可以：Agent 用执行任务那台电脑上的 GitHub 登录读取和推送，NocoReach 不保存 GitHub 凭据。不接仓库也能用Agent 做调研、关键词调研、内容大纲这类只写文档的任务。':
        '私有仓库也可以：Agent 用执行任务那台电脑上的 GitHub 登录读取和推送，NocoReach 不保存 GitHub 凭据。不接仓库也能用 Agent 做调研、关键词调研、内容大纲这类只写文档的任务。',
      '等Agent 接手': '等 Agent 接手',
      '等Agent 开回退 PR（撤回 PR #{0}）': '等 Agent 开回退 PR（撤回 PR #{0}）',
      '这一步由Agent 完成：{0}': '这一步由 Agent 完成：{0}',
      // Task detail in formal words (2026-10-21), review wording.
      'Agent 还没有开始。看过任务说明、选好做法再开始；不需要就关闭任务。':
        'Agent 尚未开始。请阅读任务说明、选择做法后开始；不需要时可关闭任务。',
      '{0}改好了并开了 PR。看过改动后通过，或在下方写意见让它重做。':
        '{0}已完成改动并创建 PR。审核后通过，或填写意见要求修改。',
      '只合并你看过的那次提交，合并后自动核实上线。':
        '只合并你审核过的提交，合并后自动核实上线。',
      '将合并 PR #{0}（你看过的版本）': '将合并 PR #{0}（你审核过的版本）',
      'Agent 改了 {0} 个文件。看过改动后点发布，或在下方写意见让它重改。':
        'Agent 修改了 {0} 个文件。审核后发布，或填写意见要求修改。',
      '超出允许范围：{0}。我已看过，确认这些改动没有问题':
        '超出允许范围：{0}。我已审核，确认这些改动无误',
      '这个任务由“{0}”交接而来，它交付的文档就是任务说明。Agent 还没有开始，看过再开始。':
        '这个任务由“{0}”交接而来，它交付的文档就是任务说明。Agent 尚未开始，请先阅读再开始。',
      // Task detail in formal words (2026-10-21).
      改好后你看过效果再发布: '改动完成后，由你检查效果再发布',
      '已停止，请检查此前已推送的改动或外部操作':
        '已停止。如果网站已经改动，请开发人员检查。',
      // Opportunities empty states (2026-10-21).
      '现在没有观察中的变化。': '现在没有观察中的变化',
      // Community pages in plain words (2026-10-21), second pass.
      'X 上提到产品的帖子，用你们自己的 X API 每天查一次。':
        'X 上提到产品的帖子，每天通过 X API 查询一次。',
      '{0} 选中频道里的消息和提问，每天读一次。':
        '{0} 所选频道中的消息和提问，每天读取一次。',
      '用你们自己建的 Discord 机器人，粘贴 token、选频道就行，免费。':
        '通过项目自建的 Discord 机器人读取所选频道，不产生费用。',
      '用工作区里的内部应用，粘贴 token、选频道就行，免费。':
        '通过工作区中的内部应用读取所选频道，不产生费用。',
      '的主题、回复与无人回复的问题。': '的主题、回复和无人回复的问题。',
      '社区论坛（Discourse）的主题、回复与无人回复的问题。':
        '社区论坛的主题、回复和无人回复的问题。',
      '来源：YouTube（yt-dlp） · 读取于 {0}': '更新于 {0}',
      '推算发布日：{0}': '估算发布日期：{0}',
      '每次最多 20 条，仅保留最近 1,000 条采集笔记。点赞为页面显示值，缩写保留原文；缺失值未知。推算发布日期不是准确发布时间。':
        '每次最多 20 条，仅保留最近 1,000 条采集笔记。点赞为页面显示值，缩写保留原文；缺失值未知。估算发布日期不是准确发布时间。',
      // Community pages in plain words (2026-10-21).
      '所选时间内没有。': '所选时间内没有涉及的版块。',
      'Reddit 上提到产品的帖子，每周在 Google 里搜一次。':
        'Reddit 上提到产品的帖子，每周通过 Google 搜索一次。',
      // Preserve historical aliases when source labels and instructions change.
      '认证信息加密保存，不会返回到浏览器。':
        '认证信息加密保存。密码不会返回到浏览器。',
      'YouTube 配置已被修改，请重新打开后重试':
        'YouTube 设置或当前运行已变更，请重新打开面板后重试。',
      'Issues 仅包含最近更新的最多 20 个返回项中的非 PR 条目，Releases 最多 5 条；不代表全量或统计周期。':
        'Issues 仅包含最近更新的最多 20 个返回项中的非 PR 条目；另行采集最多 5 条 Releases。这些列表不代表全量数据或特定统计周期。',
      个关键词已选: '已选关键词：',
      个包已选: '已选包：',
      个回答已选: '已选回答：',
      个来源已选: '已选来源：',
      个查询已选: '已选查询：',
      个问题已选: '已选问题：',
      '个页面。请选择要纳入分析的类型：': '请选择要纳入分析的类型：',
      个页面已选: '已选页面：',
      '做法#title': '做法',
      '处理洞察“需要留意”里的：{0}': '处理“洞察 › 当前状况”里的：{0}',
      '按问号和“怎么、如何、how”这类疑问词判断出来的消息。':
        '通过问号、how 等英语疑问词，以及“如何”等中文疑问表达识别为问题的消息。',
      '机会#title': '机会',
      '由 NocoBase 工作流按 {0} 运行': '由 NocoBase 工作流按以下调度运行：{0}',
      '竞品#title': '竞品',
      '给{0}里没人回复的{1}各起草一条回复，审核后复制去回复':
        '{0} — {1}：为每条选中内容起草回复，审核后复制去回复',
      '观察中#tab': '观察中',
      '遵守确认范围，核对事实与引用，不虚构外部执行。':
        '遵守确认范围，核对事实与引用，不声称已执行实际未执行的外部操作。',
      '需要留意#heading': '需要留意',
      项已选: '已选：',
      '给依据里的每个帖子起草一条回复。先打开原帖看完整内容和已有回复，再在仓库文档和知识库里找答案。每个帖子写一节，格式固定：第一行“## 原帖标题”，接着四行“- 链接：原帖网址”“- 在问：一句话概括”“- 引用：用到的文档标题和网址或仓库路径（没有写“无”）”“- 文档缺口：文档里没写清、需要补的内容（没有写“无”）”，然后一行“### 回复”，下面是回复正文。回复用原帖的语言，像社区成员一样友好、直接：先回答问题，再给文档链接；不确定的地方说清楚并建议怎么确认，不编造功能、配置或版本号。全部帖子之后写“## 小结”，列出需要补的文档。只写草稿，不发帖，不修改仓库。':
        '为依据里的每篇帖子起草一条回复。先打开原帖，阅读完整内容和已有回复，再到仓库文档和知识库中查找答案。每篇帖子单独写一节，使用固定格式：第一行是“## 原帖标题”，接着四行是“- Link: 原帖网址”“- Asking: 一句话概括问题”“- References: 用到的文档标题和网址或仓库路径，没有则写 None”“- Docs gap: 文档未解释清楚、需要补充的内容，没有则写 None”。然后写“### Reply”，下面是回复正文。字段名 Link、Asking、References、Docs gap、回复小标题 Reply 和空值标记 None 必须保持原样。字段内容和回复正文使用原帖语言，语气像社区成员一样友好、直接：先回答问题，再给文档链接；说清不确定的地方并建议如何确认，不编造功能、配置或版本号。所有帖子之后写“## Summary”，列出需要补充的文档。只写草稿，不发帖，不修改仓库。',

      // Hand-off objectives describe requested outcomes, not existing results.
      '这些查询在 Google 里排进前 5 名：{0}':
        '让这些查询在 Google 里排进前 5 名：{0}',
      '这些页面在 Google 里获得更多点击：{0}':
        '让这些页面在 Google 里获得更多点击：{0}',
      '这些页面被 Google 正常编入索引，规范网址和富媒体结果没有问题：{0}':
        '让这些页面被 Google 正常编入索引，并解决规范网址和富媒体结果的问题：{0}',

      // The discovery findings open in a dialog (2026-10-21).
      '完成。需要授权的项目可以随时点“去授权”，也可以在下方目录中管理。':
        '完成。需要授权的来源可以点“去授权”，也可以关闭后在目录中管理。',
      // Connection drawers describe each source plainly (2026-10-21).
      'AI 搜索用已接入的 DataForSEO 查，不用另外接：在“搜索 → AI 搜索”里查品牌提及或问 AI，点了才查，花费算进 DataForSEO 的月度预算。':
        'AI 搜索使用已接入的 DataForSEO，不需要另外接入：在“搜索 → AI 搜索”中查询品牌提及或向 AI 提问，点击后才查询，费用计入 DataForSEO 的月度预算。',
      'DataForSEO 按查询次数收费。我会带你填写 API 账号并设置每月预算上限；之后在关键词、竞品、AI 搜索里点查询就查，不再逐次弹出费用，花了多少在这里看，花到预算就停；30 天内同样的查询不重复收费。':
        'DataForSEO 按查询次数收费。填写 API 账号并设置每月预算上限后，关键词、竞品和 AI 搜索中的查询会直接执行，不再逐次提示费用；花费在此查看，达到预算即停止。30 天内相同的查询不重复收费。',
      'Discussions 和 GitHub Traffic 用同一个只读 token：接入仓库并填好 token 后，我每天读取近 90 天的讨论，整理讨论最多和还没解决的问题。不需要另外的权限。':
        'Discussions 与 GitHub Traffic 使用同一个只读 token。接入仓库并填写 token 后，每天读取近 90 天的讨论，整理讨论最多和尚未解决的问题，不需要额外权限。',
      'GA4 与 Search Console 使用同一次 Google 授权。授权后选择对应网站的 GA4 属性，我会开始首次同步。':
        'GA4 与 Search Console 共用一次 Google 授权。授权后选择网站对应的 GA4 属性和 Search Console 站点，再点“立即同步”拉取数据，默认拉取最近 56 天。',
      'Traffic 需要仓库的只读管理权限。我会一步步教你创建一个只授权这个仓库、只读的细粒度 token。GitHub 只保留最近 14 天的数据，接入后我每天归档，越早接入历史越完整。':
        'Traffic 需要仓库的只读管理权限，通过一个只授权此仓库的只读细粒度 token 获取，创建步骤见下方。GitHub 只保留最近 14 天的数据，接入后每天归档，越早接入，历史越完整。',
      'X 的接口现在只按条付费（每读一条约 $0.005），所以要用你们自己的 X API Bearer Token。我每天查一次：近一天提到产品的帖子数，以及新帖子的内容和点赞、转发；不含转发，也可以排除官方账号自己发的。你设一个每月上限（默认 $5，约 1,000 条），到了就停，下个月继续。':
        'X 的接口按读取条数收费（每条约 $0.005），因此需要使用自己的 X API Bearer Token。每天查询一次：近一天提到产品的帖子数，以及新帖子的内容、点赞和转发；不计转发，也可以排除官方账号发布的帖子。设置每月上限（默认 $5，约 1,000 条），达到后停止，下个月继续。',
      '只读细粒度 token（我会教你创建）': '只读细粒度 token（创建步骤见下方）',
      '告诉我产品名或网站域名（最多 5 个词），我在 Hacker News 上找提到它们的帖子和评论。这是公开数据，不需要账号，也不保存作者；先读最近 30 天给你看，确认后补读一年，之后每天更新。':
        '按产品名或网站域名（最多 5 个词）查找 Hacker News 上提到它们的帖子和评论。这是公开数据，不需要账号，也不保存作者。先读取最近 30 天供你查看，确认后补读一年，之后每天更新。',
      '告诉我产品名（最多 5 个词），我每周在 Google 里搜一次 Reddit 上提到它的帖子，记下标题、版块和链接。Reddit 官方接口用于品牌监测要签付费的商业协议，所以走 Google；这样只看得到 Google 收录了的帖子，也看不到点赞和评论数。需要先接入 DataForSEO，每次搜索约 $0.002。':
        '按产品名（最多 5 个词）每周在 Google 中搜索一次 Reddit 上提到它的帖子，记录标题、版块和链接。Reddit 官方接口用于品牌监测需要签订付费商业协议，因此通过 Google 搜索；只能看到 Google 已收录的帖子，也看不到点赞和评论数。需要先接入 DataForSEO，每次搜索约 $0.002。',
      '告诉我产品名，竞品自动用“竞品”页的列表（最多 4 个），我每周查一次 Google Trends：过去 12 个月大家对它们的关注度，以及和产品相关、正在上升的搜索。Google 官方的 Trends 接口还在内测、要申请，所以通过已接入的 DataForSEO 查，每次约 $0.022，算进月度预算。':
        '填写产品名，竞品取自“竞品”页的列表（最多 4 个）。每周查询一次 Google Trends：过去 12 个月的关注度，以及与产品相关、正在上升的搜索。Google 官方的 Trends 接口仍在内测且需要申请，因此通过已接入的 DataForSEO 查询，每次约 $0.022，计入月度预算。',
      '告诉我你的包叫什么（npm、PyPI 或 Docker Hub，可以贴包的页面地址）。这些都是公开数据，不需要账号；我先读出来给你确认，之后每天记录下载量。':
        '支持 npm、PyPI 和 Docker Hub，填写包名或粘贴包的页面地址。这些是公开数据，不需要账号；先读取一次供你确认，之后每天记录下载量。',
      '告诉我最多 5 个竞品的官网和 GitHub 仓库，我每周看一次：官网 sitemap 里新出现的页面（读几页的标题）、GitHub 的新版本和 Star 变化。全部用公开数据，不花钱；第一次只记下现状。关键词和流量估算在“竞品 › 查域名”里查。':
        '填写最多 5 个竞品的官网和 GitHub 仓库，每周检查一次：官网 sitemap 中新出现的页面（读取部分页面的标题）、GitHub 的新版本和 Star 变化。全部使用公开数据，不产生费用；首次检查只记录现状。关键词和流量估算在“竞品 › 查域名”中查询。',
      '告诉我网站源码放在哪个 GitHub 仓库。任务由Agent 在这个仓库里分析和修改，改动开 PR 给你审核；PR 只会开在这个仓库里，不会开到上游。':
        '填写网站源码所在的 GitHub 仓库。Agent 在这个仓库中分析和修改，改动以 PR 提交给你审核；PR 只开在这个仓库，不会提交到上游。',
      '在你们的 Slack 工作区建一个内部应用（读取不限速），加上 channels:read、channels:history、channels:join 权限后安装。把 Bot User OAuth Token（xoxb- 开头）粘贴过来，我先检查、列出公开频道，你选好后每天读一次：消息数、提问，以及超过一天没人回的问题。消息内容只保存 30 天，不保存作者。':
        '在 Slack 工作区创建一个内部应用（读取不限速），添加 channels:read、channels:history、channels:join 权限后安装。粘贴 Bot User OAuth Token（以 xoxb- 开头）后，先检查并列出公开频道；选好频道后每天读取一次：消息数、提问，以及超过一天无人回复的问题。消息内容只保存 30 天，不保存作者。',
      '我会带你完成 Google 授权，并选择要分析的 Search Console 站点。授权只读取数据，不会修改你的网站或 Google 账号设置。':
        '完成 Google 授权后，选择要分析的 Search Console 站点。授权只读取数据，不会修改网站或 Google 账号设置。',
      '把 GitHub 仓库链接发给我。公开仓库不需要任何凭据，我会先读取预览，你确认后接入；之后每天记录 Star、Fork、Release，并整理近 90 天讨论最多的 Issues。':
        '每天记录仓库的 Star、Fork 和 Release，并整理近 90 天讨论最多的 Issues。公开仓库不需要凭据；填写地址后先显示预览，确认后接入。',
      '把官网地址发给我。我会读取网站的 sitemap，识别博客、文档、落地页各有多少页，列给你确认后开始采集。文档站在单独的域名时（如 docs.example.com），可以再添加一个网址。不需要仓库或密钥。':
        '读取网站的 sitemap，统计博客、文档和落地页各有多少页，确认后开始采集。文档站使用单独的域名时（如 docs.example.com），可以再添加一个网址。不需要仓库或密钥。',
      '把社区论坛地址发给我。目前支持 Discourse 论坛的公开分类，不需要账号；我只读取帖子内容与互动数据，不保存用户名。首次同步需要一两分钟，会在后台完成。':
        '支持 Discourse 论坛的公开分类，不需要账号。只读取帖子内容和互动数据，不保存用户名。首次同步约需一两分钟，在后台完成。',
      '用你们自己建的 Discord 机器人：在开发者后台建一个应用和机器人、打开 Message Content Intent，邀请进服务器（只要“查看频道”和“读取消息历史”）。把机器人 token 粘贴过来，我先检查、列出它能读的频道，你选好后每天读一次：消息数、提问，以及超过一天没人回的问题。消息内容只保存 30 天，不保存作者。':
        '使用自己创建的 Discord 机器人：在开发者后台创建应用和机器人，开启 Message Content Intent，并邀请进服务器（只需要“查看频道”和“读取消息历史”权限）。粘贴机器人 token 后，先检查并列出它能读取的频道；选好频道后每天读取一次：消息数、提问，以及超过一天无人回复的问题。消息内容只保存 30 天，不保存作者。',
      '需要你提供：': '需要准备',
      // Opportunities expire 14 days after the last analysis that raised them, not at the next one.
      '已过期：最新的分析没有再提出': '已过期：{0} 天内的分析都没有再提出',
      // Metadata-only collection no longer reads captions; historical aliases remain valid.
      '每词最多 5 条结果，合计最多 15 个视频；不代表完整搜索结果。字幕优先人工，再自动，最多保留 30,000 字符。':
        '每词最多 5 条结果，每次合计最多 15 个视频；不代表完整或最新搜索结果。仅获取视频信息和公开播放、点赞、评论数据，不读取字幕。',
      '每词最多 5 条结果，每次合计最多 15 个视频；不代表完整或最新搜索结果。字幕优先人工，再自动，最多保留 30,000 字符。':
        '每词最多 5 条结果，每次合计最多 15 个视频；不代表完整或最新搜索结果。仅获取视频信息和公开播放、点赞、评论数据，不读取字幕。',
      '相关视频的内容、公开互动计数和可用字幕': '相关视频的信息和公开互动计数',
      // Collector connection setup moved into the platform panels.
      '请管理员按部署文档登记一次已授权的只读采集器，各项目即可选择。采集器必须能从 NocoReach 服务端访问；服务端的回环地址不代表你的电脑。':
        '请管理员在接入面板填写采集器地址和访问令牌。',
      '连接已保存，尚未验证浏览器和登录状态。':
        '采集条件已保存，可以立即搜索。',
      '尚未验证浏览器和小红书登录状态。': '尚未成功采集',
      '请管理员部署采集器，并为此项目启用 Bilibili。':
        '请管理员在接入面板填写采集器地址和访问令牌。',

      '服务器尚未安装 yt-dlp，请管理员按 YouTube 接入文档安装后重试':
        'Collector 尚未安装 yt-dlp，请管理员在 Collector 主机按文档安装后重试',
      '请选择团队可调用的 Agent': '请选择已启用且可调用的 Agent',
      'Agent 和在线 AI 按做法完成的工作，需要你确认时会停下来。':
        'Agent 按做法完成的工作，需要你确认时会停下来。',
      // The Agent page names each AI by what it does (2026-10-20); agents on a runtime are local agents (2026-10-21).
      'Runner Agent': '本地 Agent',
      '任务执行 Agent': '本地 Agent',
      '请选择任务执行 Agent': '请选择本地 Agent',
      '执行 Agent': '本地 Agent',
      '执行 Agent 已保存': '本地 Agent 已保存',
      '把执行 Agent 改为“{0}”': '把本地 Agent 改为“{0}”',
      '任务已完成，不能更换执行 Agent': '任务已完成，不能更换本地 Agent',
      '项目使用允许所有成员调用的 Runner Agent。':
        '项目使用允许所有成员调用的本地 Agent。',
      '包含仓库改动的任务需要 Runner Agent，请重新选择':
        '包含仓库改动的任务需要本地 Agent，请重新选择',
      '创建项目后，在数据接入中选择任务执行 Agent；Runner 可供多个项目共用。':
        '创建项目后，在数据接入中选择本地 Agent；Runner 可供多个项目共用。',
      '在线 Agent': '对话 Agent',
      // The task page reworded for marketers: no PR, Runner or push wording.
      'PR 审核已通过。合并并上线后点确认，之后开始观察效果。':
        '已审核通过。改动上线后点确认，之后开始观察效果。',
      发送并要求修改: '发送意见',
      要求修改: '提修改意见',
      '停止不会撤销已经推送的改动或外部操作。': '停止不会撤销已经做出的改动。',
      '项目默认（未设置或不可用）': '项目默认（未设置）',
      '暂无团队可调用的 Runner Agent，请先创建或联系管理员。':
        '还没有可用的 Agent，请管理员在 AI 团队里接入。',
      '请为这个任务选择一个可用的 Runner Agent。': '请选一个可用的 Agent。',
      'Agent 暂时离线，开始后将等待可用的 Runner。':
        '这个 Agent 现在不在线，开始后会等它连上再做。',

      'AI 写的内容用的语言': 'AI 内容语言',
      '项目模拟已停用，上游请求已阻止。请联系管理员在“模拟数据”中启用此项目。':
        '项目模拟已暂停，上游请求已阻止。请联系管理员为此项目选择模拟网络 Profile。',
      // Preserve historical aliases while reflecting the deliberate Network Profile UI rename.
      '代理 Profile': '网络 Profile',
      '代理 Profile 已保存': '网络 Profile 已保存',
      '代理 Profile 已删除': '网络 Profile 已删除',
      '删除代理 Profile': '删除网络 Profile',
      '尚未添加代理 Profile': '尚未添加网络 Profile',
      '最多添加 50 个代理 Profile': '最多添加 50 个网络 Profile',
      '编辑代理 Profile': '编辑网络 Profile',
      '集中管理代理，由每个接入选择网络出口。':
        '集中管理网络 Profile，在各接入点选择真实代理或模拟响应。',
      // The daily analysis runs on the Scheduler now; pausing it is under Settings › Automatic runs.
      每日分析工作流已停用: '每日分析已暂停',
      // A weekly change carries its own sign, so a fall reads "−7/week" rather than "+-7/week" (2026-10-21).
      '+{0}/周': '{0}/周',
      '（近一周 {0}{1}）': '（近一周 {0}）',
      // Website & product pages in plain words, GitHub's terms in Chinese where it has them (2026-10-21).
      '这个仓库没有开启 Discussions。':
        '这个仓库没有开启讨论区（Discussions）。',
      '讨论最多的 Discussions 合成一个任务，让 Agent 归类问题、看哪些能用文档回答，确认后立即开始。':
        '讨论最多的讨论帖合成一个任务，由 Agent 归类问题、找出可以用文档回答的部分，确认后立即开始。',
      '讨论最多的 Issues 合成一个任务，让 Agent 分出哪些能用文档回答、哪些要改产品，确认后立即开始。':
        '讨论最多的 Issue 合成一个任务，由 Agent 区分哪些可以用文档回答、哪些需要改产品，确认后立即开始。',
      // Search & market pages in plain words, one sentence each (2026-10-21).
      '竞品的官网新页面和 GitHub 新版本，每周看一次，免费。':
        '竞品官网的新页面和 GitHub 新版本，每周检查一次。',
      '查任何网站（包括竞品）在 Google 里排名的关键词和热门页面。DataForSEO 的市场估算，点了查询才收费。':
        '查询任意网站（包括竞品）在 Google 上排名的关键词和热门页面。',
      '输入一个域名（默认是本站），看看它在 Google 里排名的关键词。':
        '输入域名（默认为本站），查看它在 Google 上排名的关键词。',
      '产品、竞品和你关注的关键词在 Google 的关注度，每周用 Google Trends 查一次。':
        '产品、竞品和关注的关键词在 Google 上的关注度变化。',
      'AI 根据官网先建议一批关键词；也可以自己找新词。保存后对照本站在 Google 里的排名，想看准确名次的可以每周跟踪。':
        '查找、保存并跟踪关键词，对照本站在 Google 上的排名。',
      '用户在 ChatGPT、Google AI 概览里问什么，哪些回答提到了我们、哪些是机会，以及 AI 引用了谁。数据来自 DataForSEO，按查询收费。':
        '用户在 ChatGPT 和 Google AI 概览中问什么、哪些回答提到了我们，以及 AI 引用了哪些网站。',
      // Tab counts follow the tab name without brackets, as Opportunities' tabs do (2026-10-21).
      '全部 ({0})': '全部 {0}',
      '关键词 ({0})': '关键词 {0}',
      '已出现 ({0})': '已出现 {0}',
      '接近首页 ({0})': '接近首页 {0}',
      '机会 ({0})': '机会 {0}',
      '没有品牌 ({0})': '没有品牌 {0}',
      // Data sources cards without role tags (2026-10-22): the manual collectors say they are not updated daily.
      'Agent 在这个仓库里修改内容、开 PR 给你审核；之后还会把网址对应到源文件':
        'Agent 在这个仓库里修改网站，开 PR 给你审核',
      '公开视频搜索摘要和指定视频详情，手动读取供调研':
        '公开视频搜索摘要和指定视频详情，手动读取供调研，不会每天自动更新',
      已授权浏览器中搜索到的产品笔记和页面显示的点赞:
        '已授权浏览器中搜索到的产品笔记和页面显示的点赞，手动采集，不会每天自动更新',
      ' · 查询于 {0}': ' · 更新于 {0}',
      ' · 上次查找 {0}': ' · 更新于 {0}',
      ' · 上次读取 {0}': ' · 更新于 {0}',
      ' · 上次 {0}': ' · 更新于 {0}',
      '最近成功读取：{0}': '更新于 {0}',
      '上次成功采集 {0}': '更新于 {0}',
      '上次查看 {0}，之后每周一次': '更新于 {0}',
      '上次查看 {0}，之后每周一次。': '更新于 {0}，之后每周一次。',
      '每周检查一次（Google 桌面前 100 名）· 跟踪 {0} 个{1}':
        '跟踪 {0} 个关键词{1}',
      '搜索：{0}': '搜索词：{0}',
      '搜索：{0}{1}': '搜索词：{0}{1}',
      '每天提到产品的帖子（不含转发）': '每天提到产品的帖子',
      '关注度（每周，最高为 100）': '每周关注度',
      添加或移除竞品: '管理竞品',
      暂无任务: '没有任务',
      // A failed run's kept content, not only a saved draft (2026-10-24).
      '此内容仅已暂存，尚未通过任务验收。':
        'Agent 没有做完这一步，这些内容还没有经过审核。',
      // Sync language versions became Translate into other languages (2026-10-25), for articles as well as pages.
      同步多语言版本: '翻译成其他语言',
      '把页面改动同步到其他语言版本。': '补上缺失的语言，或按原文更新译文。',
      '把指定页面的最新改动同步到其他语言版本：内容保持一致，术语遵循项目记忆；缺失的语言版本按需新建。':
        '把指定的页面或文章翻译成其他语言版本：补上缺失的语言，或按原文的最新内容更新已有译文。内容与原文一致，术语遵循项目记忆；原文不改。',
    };
    for (const [oldKey, key] of Object.entries(legacyKeys)) {
      expect(chinese[key as keyof typeof chinese]).toBe(
        changedLegacyCopy[oldKey] ??
          oldKey.replace(/#(title|tab|heading)$/, ''),
      );
    }
    expect(legacyKeys['AI 写的内容用的语言']).toBe(
      'common.languageAiWrittenContent',
    );
    expect(chinese['common.languageAiWrittenContent']).toBe('AI 内容语言');
    expect(dictionary['common.languageAiWrittenContent']).toBe(
      'AI content language',
    );
  });
  it('has exact English translations for every built-in playbook display field', () => {
    // These dynamic server-produced strings are invisible to the literal-call scan below.
    const copy = new Set(
      SYSTEM_PLAYBOOKS.flatMap((playbook) => [
        playbook.name,
        playbook.description,
        ...playbook.steps.flatMap((step) => [
          step.name,
          step.instruction,
          ...(step.checklist ?? []).map((item) => item.label),
        ]),
        ...stagesFor(playbook).map((stage) => stage.name),
      ]),
    );
    expect(SYSTEM_PLAYBOOKS).toHaveLength(12);
    expect(
      [...copy].filter(
        (text) =>
          text &&
          /[一-鿿]/u.test(text) &&
          (!systemMessageKey(text) ||
            !dictionary[systemMessageKey(text)!].trim()),
      ),
    ).toEqual([]);
  });

  it('translates every literal $t and $tj result, including nested conditional leaves', () => {
    const missing: string[] = [];
    let checked = 0;
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ['$t', '$tj'].includes(node.expression.getText()) &&
        node.arguments[0]
      ) {
        for (const leaf of keyLeaves(node.arguments[0])) {
          const key = leaf.text;
          if (/[一-鿿]/u.test(key))
            missing.push(
              'Retired Chinese key: ' + key + ' (' + location(node) + ')',
            );
          if (key.includes('.')) {
            checked++;
            if (dictionary[key] === undefined)
              missing.push(key + ' (' + location(node) + ')');
            const context = node.arguments[2];
            if (
              context &&
              ts.isStringLiteralLike(context) &&
              dictionary[`${key}#${context.text}`] === undefined
            )
              missing.push(`${key}#${context.text} (${location(node)})`);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    sources.forEach(visit);
    expect(checked).toBeGreaterThan(3000);
    expect(missing).toEqual([]);
  });

  it('uses semantic literals in server message producers', () => {
    const missing: string[] = [];
    let count = 0;
    for (const file of [
      ...sourceFiles(path.join(root, 'server')),
      ...sourceFiles(path.join(root, 'shared')),
    ]) {
      const source = ts.createSourceFile(
        file,
        fs.readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      );
      const visit = (node: ts.Node) => {
        if (
          ts.isCallExpression(node) &&
          node.expression.getText() === 'systemMessageText' &&
          node.arguments[0] &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          count++;
          const key = node.arguments[0].text;
          if (!Object.hasOwn(dictionary, key) || /[一-鿿]/u.test(key))
            missing.push(key + ' (' + location(node) + ')');
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
    expect(count).toBeGreaterThan(1000);
    expect(missing).toEqual([]);
  });

  it('does not freeze translated labels at module evaluation time', () => {
    const frozen: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isFunctionLike(node)) return;
      if (
        ts.isCallExpression(node) &&
        ['$t', '$tj', 'isChinese'].includes(node.expression.getText())
      )
        frozen.push(location(node));
      ts.forEachChild(node, visit);
    };
    sources.forEach(visit);
    expect(frozen).toEqual([]);
  });

  it('defers persistent messages, confirmations and memoized table headers', () => {
    const frozen: string[] = [];
    const hasEagerTranslation = (node: ts.Node): boolean => {
      if (ts.isFunctionLike(node)) return false;
      if (
        ts.isCallExpression(node) &&
        ['$t', '$tj'].includes(node.expression.getText())
      )
        return true;
      return node.getChildren().some(hasEagerTranslation);
    };
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node)) {
        const name = node.expression.getText();
        if (
          /^(?:set(?:Error|LoadError|Notice|Done)|confirmAction|toast\.(?:error|success|warning|info))$/u.test(
            name,
          ) &&
          node.arguments.some(hasEagerTranslation)
        )
          frozen.push(location(node));
        if (
          name === 'useMemo' &&
          node.arguments[0] &&
          ts.isArrowFunction(node.arguments[0])
        ) {
          const checkHeaders = (child: ts.Node) => {
            if (
              ts.isPropertyAssignment(child) &&
              child.name.getText() === 'header' &&
              hasEagerTranslation(child.initializer)
            )
              frozen.push(location(child));
            ts.forEachChild(child, checkHeaders);
          };
          checkHeaders(node.arguments[0].body);
        }
      }
      ts.forEachChild(node, visit);
    };
    sources
      .filter((source) => !source.fileName.includes('/extensions/'))
      .forEach(visit);
    expect(frozen).toEqual([]);
  });

  it('preserves interpolation slots and only keeps the language endonym untranslated', () => {
    const slots = (value: string) =>
      [...new Set(value.match(/\{\d+\}/gu) || [])].sort();
    expect(
      Object.entries(dictionary).filter(
        ([key, value]) =>
          JSON.stringify(slots(chinese[key as keyof typeof chinese])) !==
          JSON.stringify(slots(value)),
      ),
    ).toEqual([]);
    expect(
      Object.entries(dictionary).filter(([, value]) => /[一-鿿]/u.test(value)),
    ).toEqual([['common.chineseLanguage', '简体中文']]);
  });
});
