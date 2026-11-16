// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import bundled from './skills-bundled.json' with { type: 'json' };
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

// The Skills a new library starts with (SPEC §6.0). Once added they are ordinary Skills: edited or deleted like any
// other, turned off in every project until someone turns them on (or a playbook step names them), and never restored.
// `since` is the built-in version that introduced a Skill: an existing library gets the newer ones once (skills.ts).
const BUILT_IN_VERSION=3;
const OWN=[
 {id:'seo-title-description',name:'seo-title-description',description:systemMessageText('skillsBuiltin.useWhenWritingChangingWeb'),summary:'skillsBuiltin.useWhenWritingChangingWeb',
  body:`# 页面标题与描述

## 先看现状
- 读这个页面现有的 frontmatter 或 head：标题、描述、og 字段分别写在哪里，沿用仓库原有的字段和写法。
- 看同一目录下两三个页面，确认品牌后缀的格式（例如“ | 品牌名”），不要自创新格式。

## 标题
- 英文 30–60 个字符，中文 15–30 个字；搜索结果里会被截断的部分不放关键信息。
- 主关键词放在前面，写读者要找的东西，不写口号。
- 每个页面的标题都不一样；同一站点不要出现两个相同标题。

## 描述
- 英文 120–160 个字符，中文 60–80 个字。
- 一句话说清这页能解决什么问题，再加一个具体的好处或下一步；自然地包含主关键词，不堆砌。
- 不写“欢迎来到”“本页介绍了”这类空话。

## 多语言
- 每个语言版本按当地读者的说法重写，不逐字翻译；关键词用该语言里人们实际搜索的词。
- 只改任务涉及的语言版本，其他版本按项目记忆里的规则处理。

## 交付时
- 在修改说明里列出每个页面改前、改后的标题和描述。
`,files:[]},
 {id:'docs-page-writing',name:'docs-page-writing',description:systemMessageText('skillsBuiltin.useWhenCreatingRewritingProduct'),summary:'skillsBuiltin.useWhenCreatingRewritingProduct',
  body:`# 文档页写法

## 开头
- 第一段一两句话：这页讲什么、什么时候需要它。不写背景铺垫。
- 有前提条件（版本、权限、需要先完成的步骤）时紧跟着列出来。

## 正文
- 操作类内容用编号步骤，每步只做一件事，写清点哪里、填什么、看到什么结果。
- 代码和配置示例要完整、能直接运行；写出预期的输出或界面结果。
- 概念类内容先给一句定义，再给一个具体例子。
- 常见问题或出错情况放在最后，写“现象 → 原因 → 怎么办”。

## 格式与用词
- 沿用仓库现有文档的 frontmatter、标题层级、提示框和图片写法；新页面放进导航。
- 术语按项目记忆里的“用词”；产品名、按钮名与界面一致。
- 不用营销语气，不写“强大”“轻松”这类形容词。

## 链接
- 第一次提到其他功能时链接到它的文档页；结尾列出相关页面。
- 只链接仓库里确实存在的页面；不确定的写进修改说明。
`,files:[]},
 {id:'research-report',name:'research-report',description:systemMessageText('skillsBuiltin.useWhenWritingResearchReports'),summary:'skillsBuiltin.useWhenWritingResearchReports',
  body:`# 调研报告

按附带的 templates/report.md 的结构写。

## 规矩
- 先写结论：最多三条，每条一句话，读者只看这一段也能做决定。
- 每个数字都写来源和时间窗口（例如“GSC，9/1–9/28”）；引用网页附链接。
- 不编造数据。没有数据支撑的判断标“未核实”，资料不够时在“还缺什么”里写明。
- 原因分析标出确定程度：确定、很可能、可能。
- 对比用表格；建议按优先级排，每条写预期效果和大概的工作量。
`,files:[{path:'templates/report.md',text:`# 标题：一句话说清调研的问题

## 结论
1.
2.
3.

## 问题与背景
为什么要做这次调研，范围是什么。

## 证据
| 事实 | 数据 | 来源与时间 |
| --- | --- | --- |
|  |  |  |

## 分析
- 原因或判断（确定 / 很可能 / 可能）：依据……

## 建议
1. 做什么 — 预期效果 — 工作量

## 还缺什么
-
`}]},
].map(s=>({...s,since:1,originals:[systemMessageText(s.summary,{},'zh-CN'),systemMessageText(s.summary,{},'en-US')]}));
// Version 2: marketing Skills from coreyhaines31/marketingskills (MIT), pinned by scripts/sync-marketing-skills.mjs. Each
// keeps its upstream text, with the license and the source it came from.
// `summary` is the i18n key of a built-in's short "when to use" in the UI language; `originals` are the stored descriptions
// that count as unchanged (skills.ts shows the summary only for those). The Agent always gets the stored description.
const camel=(name:string)=>name.replace(/-([a-z])/g,(_:string,c:string)=>c.toUpperCase());
const MARKETING=bundled.skills.map(s=>({id:s.name,name:s.name,description:s.description,summary:`skillSummaries.${camel(s.name)}`,originals:[s.description],body:s.body,
 files:[...s.files,{path:'LICENSE.md',text:`${bundled.license}\n\nSource: ${bundled.source} (commit ${bundled.commit})\n`}],
 source:`${bundled.source}/tree/${bundled.commit}/skills/${s.name}`,since:2}));
// Version 3: the Content workshop's forms (2026-11-13), one Skill each, which its playbooks' adapt step names.
const WORKSHOP=[
 {id:'x-posts',name:'x-posts',description:systemMessageText('skillsBuiltin.useWhenWritingXPosts'),summary:'skillsBuiltin.useWhenWritingXPosts',
  body:`# X 帖子

把一篇文章或一个话题改编成 3 条可以单独发出的 X 帖子。

## 每条帖子
- 3 条各自成立：每条讲原文里的一个具体点（一个数字、一个做法、一个结论），不是把一段长文拆成三段。
- 第一句就是要点，不写“你知道吗”“今天聊聊”这类开头，不用标题党。
- 不超过 280 个字符。X 的算法：网址按 23 个字符，中文、日文、韩文和 emoji 按 2 个，其余按 1 个；中文帖子大约 140 字以内。
- 帖子里不放链接，X 对带链接的帖子推荐得少；链接放在第一条回复。
- 话题标签最多 1 个，只在确实有人搜这个词时用；不 @ 无关的账号。
- 用原文的语言写；口吻按项目记忆里的“口吻与风格”。

## 第一条回复
- 一句话说明完整内容在哪里，附上文章链接。
- 新话题没有文章时，用参考链接里最合适的一个；没有链接就写一句延伸说明，不编造网址。

## 自查
- 每条的数字、功能名、版本号都能在原文或参考资料里找到。
- 三条之间没有重复的说法。
`,files:[]},
 {id:'linkedin-post',name:'linkedin-post',description:systemMessageText('skillsBuiltin.useWhenWritingLinkedinPost'),summary:'skillsBuiltin.useWhenWritingLinkedinPost',
  body:`# LinkedIn 帖子

把一篇文章或一个话题改编成一条 LinkedIn 长帖。

## 写法
- 不超过 1,300 个字符。前两行（约 200 个字符）显示在“…更多”之前，要单独成立、让人想展开。
- 开头写一个具体的问题、数字或和直觉相反的结论，不写“很高兴宣布”“分享一下”。
- 正文用短段落，每段 1–3 句，段落之间空一行；需要时用 3–5 条短列表。
- 讲清楚遇到了什么问题、怎么做的、结果如何；产品只在它确实是答案的一部分时提到。
- 链接只放一处，放在结尾；话题标签 0–3 个，放在最后一行。
- 用原文的语言写；口吻按项目记忆里的“口吻与风格”，像一个做这件事的人在分享，不像广告。

## 自查
- 数字、功能名和结论都能在原文或参考资料里找到。
- 去掉产品名后，这条帖子对读者仍然有用。
`,files:[]},
 {id:'community-post',name:'community-post',description:systemMessageText('skillsBuiltin.useWhenWritingCommunityPost'),summary:'skillsBuiltin.useWhenWritingCommunityPost',
  body:`# 社区帖

把一篇文章或一个话题写成发在某个社区的一篇完整帖子：Reddit 的一个版块、Hacker News，或项目自己的社区（论坛里的某个分区）。

## 先读规矩
- 动笔前打开这个去处的规则：Reddit 看版块的规则页（https://www.reddit.com/r/版块名/about/rules）和侧栏；Hacker News 看 https://news.ycombinator.com/newsguidelines.html 和 https://news.ycombinator.com/showhn.html；自有社区看分区的置顶帖和说明。
- 再看这个去处最近热门的几篇帖子：标题怎么写、正文多长、大家欢迎什么、反感什么。
- 把适用的规则逐条列出来交给审核的人。规则禁止自我推广、要求固定标题格式或只允许某天发帖时，照规则写；实在不能发的，在规则里写明，帖子照样写好，由人决定。

## 写法
- 正文写完整：读者不点链接也能看懂、得到有用的内容。只有一句话加链接的帖子会被删。
- 第一段先写明身份：用一句话说清你和产品的关系，例如 “I work on <产品名>”。Reddit 和 Hacker News 都要求公开这层关系。
- 写成社区成员分享经验：遇到了什么问题、怎么解决、踩过什么坑、有哪些数字和取舍；不用营销用语和形容词堆砌。
- 链接最多一两个，放在正文后部。
- 用这个社区的语言写（英文社区写英文），口吻按项目记忆里的“口吻与风格”。

## 各个去处
- Reddit：标题不超过 300 个字符，写具体内容；版块要求 flair 时，在规则里写明选哪个。
- Hacker News：新版本、开源项目和能直接试用的东西用 “Show HN: 产品名 – 一句话说明”；其他用文章原标题，不改写、不加形容词。标题不超过 80 个字符，正文用纯文本。
- 自有社区：按分区写。教程分区写成步骤，公告分区写变化和升级说明，讨论分区以一个问题结尾邀请回复。
`,files:[]},
].map(s=>({...s,since:3,originals:[systemMessageText(s.summary,{},'zh-CN'),systemMessageText(s.summary,{},'en-US')]}));
const BUILT_IN_SKILLS=[...OWN,...MARKETING,...WORKSHOP];
export { BUILT_IN_SKILLS, BUILT_IN_VERSION };