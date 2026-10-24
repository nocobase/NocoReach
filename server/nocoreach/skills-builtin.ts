// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import bundled from './skills-bundled.json' with { type: 'json' };
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

// The Skills a new library starts with (SPEC §6.0). Once added they are ordinary Skills: edited or deleted like any
// other, turned off in every project until someone turns them on (or a playbook step names them), and never restored.
// `since` is the built-in version that introduced a Skill: an existing library gets the newer ones once (skills.ts).
const BUILT_IN_VERSION=2;
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
const BUILT_IN_SKILLS=[...OWN,...MARKETING];
export { BUILT_IN_SKILLS, BUILT_IN_VERSION };