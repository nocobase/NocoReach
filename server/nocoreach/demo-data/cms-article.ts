import type { ArticleTarget } from '../../../shared/article-publishing.js';
import type { DemoPerson } from './content.js';
import { t, type L } from './world/script/types.js';

/**
 * The main demo project's blog CMS (2026-11-12): a NocoBase CMS target whose new articles wait there as drafts, and
 * the articles three blog-post tasks pushed to it: one still waiting for someone to publish it there, one published,
 * one whose draft was deleted before it went out. The tasks (activity.ts), the target (steps.ts) and the CMS's answers
 * (world/cms.ts) all read them from here.
 */
export const DEMO_CMS = {
  id: 'acme-cms',
  name: 'Acme CMS',
  host: (domain: string) => `cms.${domain}`,
  collection: 'posts',
};

/** The target in the demo's language: its articles have one locale, named as the language. */
export function demoCmsTarget(
  domain: string,
  locale: 'zh' | 'en',
): ArticleTarget {
  return {
    id: DEMO_CMS.id,
    name: DEMO_CMS.name,
    kind: 'nocobase-api',
    baseUrl: `https://${DEMO_CMS.host(domain)}`,
    collection: DEMO_CMS.collection,
    locales: [locale],
    fields: {
      id: 'id',
      slug: 'slug',
      version: 'updatedAt',
      status: { field: 'status', published: 'published', draft: 'draft' },
      locales: {
        [locale]: {
          title: 'title',
          description: 'description',
          body: 'content',
        },
      },
    },
    pages: { [locale]: `https://${domain}/blog/{slug}` },
  };
}

/** What became of a task's draft in the CMS: still waiting there, published, or deleted before it went out. */
export type CmsArticleState = 'draft' | 'published' | 'deleted';

export interface CmsArticle {
  id: number;
  slug: string;
  state: CmsArticleState;
  title: L;
  description: L;
  body: L;
  /** A sentence of the body, to find on the published page. */
  verifyText: L;
  summary: L;
  /** The blog-post task that wrote it. */
  task: {
    key: string;
    title: L;
    brief: L;
    /** What the Agent looked at before writing, and the site's pages it read. */
    thinking: L;
    reads: string[];
    notes: L;
    /** Someone's word on it: at the review, or once the draft was gone. */
    comment: { person: DemoPerson; text: L };
  };
}

const LAUNCH_PLAN: CmsArticle = {
  id: 128,
  slug: 'product-launch-plan',
  state: 'draft',
  title: t(
    '跨团队产品发布怎么排期：一份发布计划模板',
    'Planning a product launch across teams: a launch plan template',
  ),
  description: t(
    '从发布日倒推每个团队的截止时间，用依赖关系和每周检查点把产品、市场、客服的工作排进一张时间线。附可复制的发布计划模板。',
    'Work back from launch day to each team’s deadline, and put product, marketing and support work on one timeline with dependencies and weekly checkpoints. Includes a launch plan template you can copy.',
  ),
  body: t(
    `# 跨团队产品发布怎么排期：一份发布计划模板

一次产品发布通常牵涉产品、研发、市场和客服四个团队。每个团队都有自己的清单，但真正拖慢发布的，往往是团队之间的交接：文案等截图，截图等功能冻结，客服培训等最终版本。

这篇文章用一次虚构的版本发布做例子，说明怎样从发布日倒推排期，并把各团队的工作放进同一张时间线。

## 从发布日倒推

先定发布日，再按依赖关系倒推每个团队的截止时间：

1. **功能冻结**：发布前 3 周。之后只修缺陷，不加功能。
2. **截图和演示视频**：发布前 2 周，依赖功能冻结。
3. **发布文案和帮助文档**：发布前 10 天，依赖截图。
4. **客服培训**：发布前 1 周，依赖帮助文档定稿。
5. **发布检查会**：发布前 2 天，确认所有事项已完成。

在 Acme 的时间线视图里，给这些任务加上依赖关系。前一项延期时，后面的任务会一起顺延，负责人能马上看到受影响的截止日期。

## 每周一个检查点

发布前一个月，每周固定一次 30 分钟的检查会，只看三件事：

- 本周到期的任务是否完成；
- 有没有任务被依赖关系推迟；
- 发布日是否需要调整。

检查会前，各负责人在任务里更新状态，会上直接看时间线，不再逐个团队汇报。

## 发布计划模板

模板包含上面五个阶段、示例任务和依赖关系。复制到自己的项目后，改掉发布日，所有截止日期会按依赖关系重新计算。

| 阶段 | 负责团队 | 相对发布日 |
| --- | --- | --- |
| 功能冻结 | 研发 | -21 天 |
| 截图和演示视频 | 产品 | -14 天 |
| 发布文案和帮助文档 | 市场 | -10 天 |
| 客服培训 | 客服 | -7 天 |
| 发布检查会 | 全体 | -2 天 |

## 发布之后

发布后一周内保留检查会，记录用户反馈和遗留问题，再把需要跟进的事项转成下一个迭代的任务。`,
    `# Planning a product launch across teams: a launch plan template

A product launch usually involves four teams: product, engineering, marketing and support. Each team has its own checklist, but what delays a launch is usually the handover between teams: the copy waits for screenshots, the screenshots wait for the feature freeze, and support training waits for the final build.

This article uses a fictional release as its example to show how to plan back from launch day and put every team's work on one timeline.

## Work back from launch day

Set the launch day first, then work back to each team's deadline through the dependencies:

1. **Feature freeze**: three weeks before launch. Only bug fixes after this point.
2. **Screenshots and demo video**: two weeks before launch, after the feature freeze.
3. **Launch copy and help docs**: ten days before launch, after the screenshots.
4. **Support training**: one week before launch, after the help docs are final.
5. **Launch review**: two days before launch, to confirm everything is done.

In Acme's timeline view, link these tasks with dependencies. When one slips, the tasks after it move with it, and their owners see the affected deadlines straight away.

## One checkpoint a week

For the month before launch, hold one 30-minute checkpoint a week that looks at three things only:

- whether this week's tasks are done;
- whether any task was pushed back by a dependency;
- whether the launch day needs to move.

Before the checkpoint, owners update their tasks; the meeting looks at the timeline instead of going team by team.

## The launch plan template

The template has the five stages above, with sample tasks and dependencies. Copy it into your project and change the launch day; every deadline is recalculated through the dependencies.

| Stage | Team | Relative to launch |
| --- | --- | --- |
| Feature freeze | Engineering | -21 days |
| Screenshots and demo video | Product | -14 days |
| Launch copy and help docs | Marketing | -10 days |
| Support training | Support | -7 days |
| Launch review | Everyone | -2 days |

## After the launch

Keep the checkpoint for a week after launch to collect feedback and open issues, then turn the follow-ups into tasks for the next iteration.`,
  ),
  verifyText: t(
    '在 Acme 的时间线视图里，给这些任务加上依赖关系',
    "In Acme's timeline view, link these tasks with dependencies",
  ),
  summary: t(
    '新文章：跨团队产品发布的排期方法和发布计划模板',
    'New article: how to plan a product launch across teams, with a launch plan template',
  ),
  task: {
    key: 'acme-launch-plan-article',
    title: t(
      '写一篇跨团队产品发布排期指南',
      'Write a guide to planning a product launch across teams',
    ),
    brief: t(
      '为产品发布季写一篇博客：讲清楚跨团队发布怎么从发布日倒推排期，用时间线视图的依赖关系举例，附一份可复制的发布计划模板。',
      'Write a blog post for the launch season: how to plan a cross-team launch back from launch day, using dependencies in the timeline view as the example, with a launch plan template readers can copy.',
    ),
    thinking: t(
      '先看博客里已有文章的写法和长度，再确认时间线视图的依赖关系怎么描述。',
      'Check how the existing blog posts are written and how long they are, then how the docs describe dependencies in the timeline view.',
    ),
    reads: ['/blog/estimation', '/features/timeline'],
    notes: t(
      '写了一篇新文章，结构是倒推排期、每周检查点、模板和发布之后四部分。例子里的团队和日期都是虚构的；模板表格可以直接复制。没有配图，封面请在 CMS 里设置。',
      'Wrote a new article in four parts: planning back from launch day, weekly checkpoints, the template and after the launch. The teams and dates in the example are fictional; the template table can be copied as is. There are no images; set the cover in the CMS.',
    ),
    comment: {
      person: 'editor',
      text: t(
        '正文没问题。封面和配图我在 CMS 里加，发布前再看一遍排版。',
        "The text is fine. I'll add the cover and images in the CMS and check the layout before publishing.",
      ),
    },
  },
};

const WIP_LIMITS: CmsArticle = {
  id: 121,
  slug: 'kanban-wip-limits',
  state: 'published',
  title: t(
    '看板的在制品上限怎么定：从团队现在的工作量算起',
    "Setting WIP limits on a Kanban board: start from your team's current workload",
  ),
  description: t(
    '在制品上限让团队先做完手上的事，再开始新的。本文说明第一次怎么定上限、列满了怎么处理，以及什么时候调整。',
    'A WIP limit makes a team finish what it has started before taking on more. How to set a first limit, what to do when a column is full and when to adjust it.',
  ),
  body: t(
    `# 看板的在制品上限怎么定：从团队现在的工作量算起

看板上“进行中”的卡片越多，每张卡片完成得越慢。在制品上限（WIP limit）规定每一列最多放几张卡片，列满了就先把手上的做完，再从待办里拿新的。

很多团队认同这个做法，却卡在第一步：上限定多少合适。这篇文章用一个虚构的五人团队做例子，说明怎样从现状算出第一个上限，以及之后怎么调整。

## 第一个上限：先数一数现在有多少

不要凭感觉定数字。连续两周，每天站会前记下“进行中”和“待审核”两列各有几张卡片，取平均值。

例子里的团队平均有 9 张卡片在进行中、4 张在待审核。第一个上限定得比平均值略低：进行中 7 张，待审核 3 张。定得太低，大家会无事可做；定得太高，等于没有限制。

## 列满了怎么办

列满的时候，不要马上调高上限。先看卡片为什么停在这里：

- **待审核满了**：审核的人手不够，其他成员先去帮忙审核，而不是开始新任务；
- **进行中满了**：有卡片在等别人，把等待的原因写在卡片上，在站会上解决；
- **某张卡片停留太久**：拆成更小的任务，或者明确负责人。

在 Acme 的看板视图里，打开列设置就能给每一列设置在制品上限。卡片数超过上限时，列头会变成红色，提醒团队先处理这一列。

## 什么时候调整

上限不是定好就不再改。每个迭代结束时看一看：

| 现象 | 说明 | 调整 |
| --- | --- | --- |
| 列经常是空的 | 上限偏高，或上游的工作不够 | 降低上限，或检查待办 |
| 列经常满，卡片等待变长 | 上限偏低，或下游处理不过来 | 先解决下游瓶颈，再考虑提高上限 |
| 完成时间稳定下降 | 上限合适 | 保持不变 |

每次只调整一列，观察一个迭代再决定下一步。

## 常见误区

- **给每个人单独设上限**：上限管的是工作在团队里的流动，不是个人的工作量；
- **用加急卡片绕过上限**：确实需要加急时，单独留一条加急通道，并且只允许放一张卡片；
- **设了上限，站会却不讨论**：上限的作用是让阻塞显露出来，阻塞要在站会上处理。`,
    `# Setting WIP limits on a Kanban board: start from your team's current workload

The more cards sit in progress on a Kanban board, the longer each one takes to finish. A work-in-progress (WIP) limit caps how many cards a column can hold: when a column is full, the team finishes what is already there before pulling new work from the backlog.

Most teams agree with the idea and get stuck on the first step: what the limit should be. This article uses a fictional five-person team to show how to work out a first limit from where you are today, and how to adjust it afterwards.

## The first limit: count what you have now

Don't pick a number by feel. For two weeks, write down before each stand-up how many cards are in In progress and In review, and take the average.

The team in the example averages nine cards in progress and four in review. Their first limits are slightly below that: seven in progress and three in review. Set too low, people run out of work; set too high, the limit changes nothing.

## When a column is full

When a column fills up, don't raise its limit straight away. First look at why the cards are stuck:

- **In review is full**: there are not enough reviewers, so others help review before starting anything new;
- **In progress is full**: some cards are waiting on someone; write the reason on the card and sort it out at the stand-up;
- **One card has stayed for a long time**: split it into smaller tasks or give it a clear owner.

In Acme's board view, open a column's settings to set its WIP limit. When a column holds more cards than its limit, its header turns red so the team deals with that column first.

## When to adjust

A limit is not set once and left alone. At the end of each iteration, take a look:

| What you see | What it means | What to change |
| --- | --- | --- |
| The column is often empty | The limit is too high, or too little work arrives | Lower the limit, or check the backlog |
| The column is often full and cards wait longer | The limit is too low, or the next step cannot keep up | Fix the bottleneck downstream before raising the limit |
| Cycle time keeps going down | The limit is right | Leave it as it is |

Change one column at a time and watch it for an iteration before deciding the next step.

## Common mistakes

- **A limit per person**: the limit is about how work flows through the team, not how much each person holds;
- **Urgent cards that skip the limit**: if you really need an expedite lane, keep it separate and allow only one card in it;
- **Limits nobody talks about**: a limit's job is to expose blockers, and blockers are handled at the stand-up.`,
  ),
  verifyText: t(
    '在 Acme 的看板视图里，打开列设置就能给每一列设置在制品上限',
    "In Acme's board view, open a column's settings to set its WIP limit",
  ),
  summary: t(
    '新文章：看板在制品上限的定法、列满时的处理和调整时机',
    'New article: how to set WIP limits on a Kanban board, what to do when a column is full and when to adjust',
  ),
  task: {
    key: 'acme-wip-limits-article',
    title: t(
      '写一篇看板在制品上限的入门文章',
      'Write an introduction to WIP limits on Kanban boards',
    ),
    brief: t(
      '“看板 在制品上限”的搜索在增长，博客还没有讲这个主题的文章。写一篇入门文章：第一次怎么定上限、列满了怎么处理、什么时候调整，用 Acme 看板视图的列上限举例。',
      'Searches for “kanban WIP limits” are growing and the blog has no article on the topic. Write an introduction: how to set a first limit, what to do when a column is full and when to adjust, using column limits in Acme’s board view as the example.',
    ),
    thinking: t(
      '先看博客里已有的看板文章讲到什么程度，避免重复；再确认看板视图里列上限在哪里设置。',
      'Check how far the existing Kanban posts on the blog go, so this one does not repeat them; then where column limits are set in the board view.',
    ),
    reads: ['/blog/kanban-board-basics', '/features/board'],
    notes: t(
      '写了一篇入门文章，分为第一个上限、列满了怎么办、什么时候调整和常见误区四部分。例子里的团队和数字是虚构的。没有配图，封面请在 CMS 里设置。',
      'Wrote an introduction in four parts: the first limit, what to do when a column is full, when to adjust and common mistakes. The team and numbers in the example are fictional. There are no images; set the cover in the CMS.',
    ),
    comment: {
      person: 'content',
      text: t(
        '“列满了怎么办”这一节很实用。封面我用看板视图的截图，排版调好后就在 CMS 里发布。',
        "The section on full columns is useful. I'll use a screenshot of the board view as the cover and publish it in the CMS once the layout is done.",
      ),
    },
  },
};

const PROJECT_BRIEF: CmsArticle = {
  id: 126,
  slug: 'one-page-project-brief',
  state: 'deleted',
  title: t(
    '一页纸项目简报：开工前要写清楚的五件事',
    'The one-page project brief: five things to settle before work starts',
  ),
  description: t(
    '项目开始前，用一页纸写清目标、范围、负责人、里程碑和完成标准。附一份可复制的项目简报模板。',
    'Before a project starts, settle its goal, scope, owners, milestones and definition of done on one page. Includes a project brief template you can copy.',
  ),
  body: t(
    `# 一页纸项目简报：开工前要写清楚的五件事

很多项目延期，不是因为执行慢，而是开工时大家对“要做什么”的理解不一样。一页纸项目简报把最重要的五件事写在一起，项目成员和相关方在开工前读同一份材料。

限制在一页，是为了让人真的读完。细节可以链接到其他文档，简报只回答最关键的问题。

## 五件事

1. **目标**：项目要解决什么问题，用一两句话说清楚，最好带一个可衡量的结果。
2. **范围**：包括什么，也写明不包括什么。写清“不做什么”，往往比写清“做什么”更能避免返工。
3. **负责人和相关方**：谁拍板，谁执行，谁需要知道进展。
4. **里程碑**：三到五个关键日期，以及每个日期交付什么。
5. **完成标准**：怎样算做完，由谁验收。

## 写简报时的几个提醒

- 先写目标和完成标准，再写范围。目标不清楚时，范围很难收住。
- 按读者来写。相关方不一定了解技术细节，简报里只写他们需要决定和需要知道的事。
- 写完后请一位不在项目里的同事读一遍，看他能不能说清项目要做什么。

## 项目简报模板

| 项目 | 写什么 |
| --- | --- |
| 目标 | 一句话说明要解决的问题和期望的结果 |
| 范围 | 包括：…… 不包括：…… |
| 负责人 | 决策人、执行负责人、需要知会的人 |
| 里程碑 | 日期和对应的交付物 |
| 完成标准 | 验收条件和验收人 |

## 让简报保持最新

简报不是写完就归档的文件。范围或里程碑有变化时，先更新简报，再通知相关方。

在 Acme 里把简报固定在项目概览页，成员打开项目第一眼就能看到，每次修改也都有记录可查。`,
    `# The one-page project brief: five things to settle before work starts

Many projects slip not because the work is slow, but because people started with different ideas of what they were building. A one-page project brief puts the five things that matter most in one place, so the team and the stakeholders read the same material before work starts.

Keeping it to one page is what gets it read. Details can link to other documents; the brief answers only the key questions.

## The five things

1. **Goal**: the problem the project solves, in a sentence or two, ideally with a measurable result.
2. **Scope**: what is in, and what is explicitly out. Saying what you won't do often prevents more rework than saying what you will.
3. **Owner and stakeholders**: who decides, who does the work and who needs to hear about progress.
4. **Milestones**: three to five key dates, and what is delivered on each.
5. **Definition of done**: what counts as finished, and who signs it off.

## Tips for writing it

- Write the goal and the definition of done before the scope. Without a clear goal, the scope keeps growing.
- Write for your readers. Stakeholders may not know the technical details; include only what they need to decide or know.
- When it is done, ask a colleague outside the project to read it and tell you what the project is about.

## Project brief template

| Section | What to write |
| --- | --- |
| Goal | One sentence on the problem and the expected result |
| Scope | In: … Out: … |
| Owner | Decision-maker, delivery owner, people to keep informed |
| Milestones | Dates and what is delivered on each |
| Definition of done | Acceptance criteria and who accepts |

## Keep the brief current

A brief is not a document you file away once it is written. When the scope or a milestone changes, update the brief first, then tell the stakeholders.

In Acme, pin the brief to the project overview so members see it as soon as they open the project, with every edit kept in its history.`,
  ),
  verifyText: t(
    '在 Acme 里把简报固定在项目概览页，成员打开项目第一眼就能看到',
    'In Acme, pin the brief to the project overview so members see it as soon as they open the project',
  ),
  summary: t(
    '新文章：一页纸项目简报的五个要素和可复制的模板',
    'New article: the five parts of a one-page project brief, with a template to copy',
  ),
  task: {
    key: 'acme-project-brief-article',
    title: t(
      '写一篇一页纸项目简报的文章',
      'Write an article on the one-page project brief',
    ),
    brief: t(
      '客户经常问项目开工前该准备什么。写一篇博客介绍一页纸项目简报：要写清楚哪五件事、写的时候注意什么，附一份可复制的模板，用 Acme 的项目概览页举例。',
      'Customers often ask what to prepare before a project starts. Write a blog post on the one-page project brief: the five things it settles, tips for writing it and a template to copy, using the project overview in Acme as the example.',
    ),
    thinking: t(
      '先读帮助中心里项目概览页的说明，再看博客里有没有讲过项目启动的文章。',
      'Read the help article on the project overview first, then check whether the blog already covers starting a project.',
    ),
    reads: ['/help/project-overview', '/blog/kickoff-meeting'],
    notes: t(
      '写了一篇新文章，分为五件事、写作提醒、模板和保持更新四部分。模板表格可以直接复制。没有配图，封面请在 CMS 里设置。',
      'Wrote a new article in four parts: the five things, tips for writing it, the template and keeping the brief current. The template table can be copied as is. There are no images; set the cover in the CMS.',
    ),
    comment: {
      person: 'growth',
      text: t(
        '我整理 CMS 里的草稿时，把这篇当成旧草稿删掉了，麻烦重新推送一次。',
        'I deleted this one by mistake while clearing old drafts in the CMS. Could you push it again?',
      ),
    },
  },
};

/** The demo's blog-post tasks, one per article, in the order they are written. */
export const CMS_ARTICLES: CmsArticle[] = [
  LAUNCH_PLAN,
  WIP_LIMITS,
  PROJECT_BRIEF,
];
