import type { ArticleTarget } from '../../../shared/article-publishing.js';
import { t, type L } from './world/script/types.js';

/**
 * The main demo project's blog CMS (2026-11-12): a NocoBase CMS target whose new articles wait there as drafts, and
 * the one article in it, pushed by an article task that now waits for someone to publish it in the CMS. The task
 * (activity.ts), the target (steps.ts) and the CMS's answers (world/cms.ts) all read it from here.
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

export const CMS_DRAFT: {
  id: number;
  slug: string;
  title: L;
  description: L;
  body: L;
  /** A sentence of the body, to find on the published page. */
  verifyText: L;
  summary: L;
} = {
  id: 128,
  slug: 'product-launch-plan',
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
};
