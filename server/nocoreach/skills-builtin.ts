// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import bundled from './skills-bundled.json' with { type: 'json' };
// Ported from the classic NocoReach plugin (plugins/connections/server) with its logic unchanged; see docs/PORT-PLAN.md.

// The Skills a new library starts with (SPEC §6.0). Once added they are ordinary Skills: edited or deleted like any
// other, turned off in every project until someone turns them on (or a playbook step names them), and never restored.
// `since` is the built-in version that introduced a Skill: an existing library gets the newer ones once (skills.ts).
const BUILT_IN_VERSION=5;
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
// The helper every card Skill carries: it renders the cards from the template the run is given, at the size the page
// names (shared/xhs-card.ts cardTemplate).
const CARD_RENDER=`// Renders the cards in cards.js with xhs-card.html (both in the folder given) into card-01.png, card-02.png, ... at
// the card size the page names (1080x1440 or 1080x1350), and writes overflow.json: the numbers of the cards whose text
// does not fit ([] when none).
// Usage: node render.mjs <folder>
// Uses Playwright when it can be imported, else Chrome, Edge or Chromium on this computer (CHROME_PATH to choose one).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = resolve(process.argv[2] || '.');
const page = pathToFileURL(join(dir, 'xhs-card.html')).href;
const [width, height] = (/name="card-size" content="(\\d+)x(\\d+)"/.exec(readFileSync(join(dir, 'xhs-card.html'), 'utf8')) || [0, 1080, 1440]).slice(1).map(Number);
const source = readFileSync(join(dir, 'cards.js'), 'utf8');
const count = (() => {
  const window = {};
  new Function('window', source)(window);
  return Array.isArray(window.CARDS) ? window.CARDS.length : 0;
})();
if (!count) throw new Error('cards.js has no cards (window.CARDS = [...]).');
const name = (n) => join(dir, \`card-\${String(n).padStart(2, '0')}.png\`);

async function withPlaywright() {
  let chromium;
  for (const id of ['playwright', 'playwright-core', '@playwright/test'])
    try {
      ({ chromium } = await import(id));
      break;
    } catch {}
  if (!chromium) return null;
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    for (let n = 1; n <= count; n++) {
      await tab.goto(\`\${page}?n=\${n}\`);
      await tab.waitForFunction(() => !document.title.endsWith('pending'));
      await tab.screenshot({ path: name(n) });
    }
    await tab.goto(page);
    await tab.waitForFunction(() => !document.title.endsWith('pending'));
    return await tab.evaluate(() => document.body.dataset.overflow || '');
  } finally {
    await browser.close();
  }
}

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'C:\\\\Program Files\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe',
    'C:\\\\Program Files (x86)\\\\Microsoft\\\\Edge\\\\Application\\\\msedge.exe',
  ];
  for (const c of candidates) if (c && existsSync(c)) return c;
  for (const c of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge'])
    try {
      return execFileSync('which', [c], { encoding: 'utf8' }).trim() || null;
    } catch {}
  return null;
}

function withChrome() {
  const chrome = chromePath();
  if (!chrome) throw new Error('No Playwright and no Chrome, Edge or Chromium found; set CHROME_PATH.');
  const base = ['--headless', '--hide-scrollbars', '--disable-gpu', '--force-device-scale-factor=1', '--virtual-time-budget=5000'];
  for (let n = 1; n <= count; n++)
    execFileSync(chrome, [...base, \`--window-size=\${width},\${height}\`, \`--screenshot=\${name(n)}\`, \`\${page}?n=\${n}\`], { stdio: 'ignore' });
  const dom = execFileSync(chrome, [...base, '--dump-dom', page], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return /data-overflow="([^"]*)"/.exec(dom)?.[1] ?? null;
}

const over = (await withPlaywright()) ?? withChrome();
const overflow = over == null ? null : over.split(',').filter(Boolean).map(Number);
if (overflow) writeFileSync(join(dir, 'overflow.json'), JSON.stringify(overflow));
process.stdout.write(\`\${count} cards rendered; overflow: \${overflow == null ? 'not checked' : JSON.stringify(overflow)}\\n\`);
`;
// The shared part of the card Skills: the cards, their layout, rendering and uploading. `size` is the place's card size.
const cardsPart=(size:string,cards:string)=>`## 一组卡片
- 第一张是封面：标题说清读者能得到什么（一个结果、一个数字、一个做法），不用“震惊”“必看”这类说法；下面一行副标题补充对象或场景。
- 中间每张讲一件事，按原文的顺序；宁可多分一张也不要挤。
- 字数按原文的语言算：中文、日文、韩文每张不超过 110 个字（标题加正文，不算空格），封面标题不超过 20 个字；其他语言每张不超过 40 个词（标题加正文），封面标题不超过 8 个词。
- 每张卡片标出出自原文的第几节（输入里的 repurpose.sections 是编号）；尽量每一节都用上。
- 品牌与模板设了结尾页时（repurpose.style.ending），最后一张用它，文字照抄，写 Layout: end。
- 数字、功能名和结论都要能在原文或参考资料里找到；演示数据要说明是虚构的。

## 版面
- 只用模板（materials.cardTemplate），它已经按这个去处的尺寸（${size}）出图，带着“品牌与模板”里选的卡片样式、品牌色和 Logo，最多 3 种颜色；不要改模板，不要另加颜色、字体、渐变、emoji 图片或花字。
- 字号由模板按每张卡片的字数自动排，正文不小于 36px；不要改小字号去塞内容，放不下就改短或拆成两张。
- 不要在渲染出的图片上再加工（贴图、水印、调色）：审核人改卡片文字时，NocoReach 会在浏览器里用同一个模板重新出整组图。

## 渲染和上传
1. 把 xhs-card.html 复制到一个空目录，在旁边写 cards.js：\`window.CARDS = [{layout:"cover",heading:"…",text:"…"}, …];\`，layout 是 cover、text 或 end，顺序和结果里的 ## Card 一致。
2. 运行本 Skill 的 render.mjs：\`node render.mjs 目录\`。有 Playwright 时用它，否则用电脑上的 Chrome、Edge 或 Chromium（CHROME_PATH 可指定）。会生成 card-01.png… 和 overflow.json。
3. 也可以自己用无头浏览器：窗口 ${size}、缩放 1，打开 \`xhs-card.html?n=序号\` 截图；页面标题是 overflow:none 表示没有溢出，overflow:3,7 是溢出的卡片。
4. 有溢出就改短那张卡片的文字或拆成两张，重新渲染，直到没有溢出。实在检查不了溢出时，结果里不写 cards.overflow。
5. 用 \`task file --file card-01.png\` 逐张上传，按卡片顺序把返回的 id 写进结果的 cards.images；overflow.json 的内容写进 cards.overflow。

## 自查
- ${cards}，封面标题和每张卡片都在上面的字数以内。
- 每张图都是 ${size} 的 PNG，文字没有被截掉。
`;
// Version 3: the Content workshop's forms (2026-11-13), one Skill each, which its playbooks' adapt step names. Version 4
// (2026-11-16): Xiaohongshu cards, with the helper that renders them from the template the run is given. Version 5
// (2026-11-24): Carousel's Instagram and LinkedIn places, drawn with the same helper at 4:5.
const WORKSHOP=[
 {id:'xhs-cards',name:'xhs-cards',description:systemMessageText('skillsBuiltin.useWhenMakingXhsCards'),summary:'skillsBuiltin.useWhenMakingXhsCards',
  body:`# 小红书图文

把一篇文章或一个话题做成一组小红书图文：6–18 张 1080×1440 的卡片图，加上笔记的标题和正文。图片在你的电脑上用任务给的 HTML 模板渲染。

## 一组卡片
- 第一张是封面：标题不超过 20 个字，说清读者能得到什么（一个结果、一个数字、一个做法），不用“震惊”“必看”这类说法；下面一行副标题补充对象或场景。
- 中间每张讲一件事，按原文的顺序；每张不超过 110 个字（标题加正文，不算空格），宁可多分一张也不要挤。
- 每张卡片标出出自原文的第几节（输入里的 repurpose.sections 是编号）；尽量每一节都用上，没有用上的在笔记正文里交代。
- 品牌与模板设了结尾页时（repurpose.style.ending），最后一张用它，文字照抄，写 Layout: end。
- 数字、功能名和结论都要能在原文或参考资料里找到；演示数据要说明是虚构的。

## 版面
- 只用模板（materials.cardTemplate）。它已经带着“品牌与模板”里选的卡片样式（编辑杂志、备忘录、深色科技或清单速查）、品牌色和 Logo，最多 3 种颜色；不要改模板，不要另加颜色、字体、渐变、emoji 图片或花字。
- 字号由模板按每张卡片的字数自动排，正文不小于 36px；不要改小字号去塞内容，放不下就改短或拆成两张。
- 不要在渲染出的图片上再加工（贴图、水印、调色）：审核人改卡片文字时，NocoReach 会在浏览器里用同一个模板重新出整组图。

## 笔记标题和正文
- 标题不超过 20 个字，和封面说法可以不同，但讲同一件事。
- 正文不超过 1,000 字：先说为什么值得看，再按卡片顺序概括要点，结尾一句提问邀请评论；话题标签 3–5 个放最后一行。
- 用原文的语言写；口吻按项目记忆里的“口吻与风格”。

## 渲染和上传
1. 把 xhs-card.html 复制到一个空目录，在旁边写 cards.js：\`window.CARDS = [{layout:"cover",heading:"…",text:"…"}, …];\`，layout 是 cover、text 或 end，顺序和结果里的 ## Card 一致。
2. 运行本 Skill 的 render.mjs：\`node render.mjs 目录\`。有 Playwright 时用它，否则用电脑上的 Chrome、Edge 或 Chromium（CHROME_PATH 可指定）。会生成 card-01.png… 和 overflow.json。
3. 也可以自己用无头浏览器：窗口 1080×1440、缩放 1，打开 \`xhs-card.html?n=序号\` 截图；页面标题是 overflow:none 表示没有溢出，overflow:3,7 是溢出的卡片。
4. 有溢出就改短那张卡片的文字或拆成两张，重新渲染，直到没有溢出。实在检查不了溢出时，结果里不写 cards.overflow。
5. 用 \`task file --file card-01.png\` 逐张上传，按卡片顺序把返回的 id 写进结果的 cards.images；overflow.json 的内容写进 cards.overflow。

## 自查
- 张数 6–18，封面标题不超过 20 个字，每张不超过 110 个字。
- 每张图都是 1080×1440 的 PNG，文字没有被截掉。
`,files:[{path:'render.mjs',text:CARD_RENDER}],since:4},

 {id:'instagram-carousel',name:'instagram-carousel',description:systemMessageText('skillsBuiltin.useWhenMakingInstagramCarousel'),summary:'skillsBuiltin.useWhenMakingInstagramCarousel',
  body:`# Instagram 轮播图

把一篇文章或一个话题做成一组 Instagram 轮播图：6–20 张 1080×1350（4:5）的卡片图，加上配文和话题标签。图片在你的电脑上用任务给的 HTML 模板渲染。

${cardsPart('1080×1350','张数 6–20')}
## 配文和话题标签
- 配文写在 ## Body 下，不超过 2,200 个字符。开头 125 个字符内讲清看点：Instagram 在“更多”之前只露出这一段，所以第一行单独成段，写读者能得到什么。
- 配文里不放链接，Instagram 配文里的链接点不了；需要引到原文时写“link in bio”（用原文的语言说）。
- 接着按卡片顺序概括要点，用短段落；结尾一句提问邀请评论。
- 话题标签写在 ## Hashtags 下，最多 5 个，空格分开，选读者真的会搜的词；配文里不再放话题标签。
- 用原文的语言写；口吻按项目记忆里的“口吻与风格”。
`,files:[{path:'render.mjs',text:CARD_RENDER}],since:5},
 {id:'linkedin-carousel',name:'linkedin-carousel',description:systemMessageText('skillsBuiltin.useWhenMakingLinkedinCarousel'),summary:'skillsBuiltin.useWhenMakingLinkedinCarousel',
  body:`# LinkedIn 轮播图

把一篇文章或一个话题做成 LinkedIn 的文档轮播：6–18 页 1080×1350（4:5）的卡片，审核通过后 NocoReach 把它们合成一个 PDF，负责人发帖时选“添加文档”上传；另写文档标题和帖子正文。图片在你的电脑上用任务给的 HTML 模板渲染。

${cardsPart('1080×1350','页数 6–18')}
## 每一页
- 每张卡片是 PDF 的一页，读者一页页往后翻：封面让人想翻下去，中间每页一个要点，最后一页给出总结或下一步。

## 文档标题和帖子正文
- 文档标题写在 ## Title 下，不超过 58 个字符（LinkedIn 的上限），显示在文档上方，说清这份文档讲什么。
- 帖子正文写在 ## Body 下，不超过 1,300 个字符。前两行（约 200 个字符）显示在“…更多”之前，要单独成立。
- 开头写一个具体的问题、数字或和直觉相反的结论；用短段落，讲清遇到了什么问题、怎么做的、结果如何；结尾一句提问邀请评论。
- 链接最多一处，放在结尾；话题标签 0–3 个，放在最后一行。
- 用原文的语言写；口吻按项目记忆里的“口吻与风格”，像一个做这件事的人在分享，不像广告。
`,files:[{path:'render.mjs',text:CARD_RENDER}],since:5},
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
].map(s=>({since:3,...s,originals:[systemMessageText(s.summary,{},'zh-CN'),systemMessageText(s.summary,{},'en-US')]}));
const BUILT_IN_SKILLS=[...OWN,...MARKETING,...WORKSHOP];
export { BUILT_IN_SKILLS, BUILT_IN_VERSION };