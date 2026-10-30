import { expect, test } from 'vitest';
import {
  choiceLocales,
  defaultDelivery,
  deliveryPlan,
  MAX_TASK_PAGES,
  REPO,
  lookupMatters,
  pageUrlsOf,
  pagesToStart,
  startAgent,
  startBlockers,
  startPages,
  type StartContext,
} from '../../shared/task-start.js';
import {
  defaultLocales,
  projectLocale,
  translationDefault,
} from '../../shared/article-publishing.js';

// The defaults a task starts with when nobody chooses (shared/task-start.ts): the start card preselects them and a
// handed-over task is started with them (Accept and start, 2026-10-24); anything else waits for a person.
const view = (over: Partial<StartContext> = {}): StartContext => ({
  task: { evidence: {} },
  work: {},
  articleTargets: [],
  articlePlaybookTargets: {},
  agent: { repo: { repo: 'org/site' }, agentId: 'a', options: [{ id: 'a' }] },
  ...over,
});
const blog = { playbookId: 'blog-post', changes: true, needsRepository: true };
const optimize = { ...blog, playbookId: 'optimize-page' };
const article = {
  targetId: 'cms',
  articleId: '7',
  slug: 'hello',
  title: 'Hello',
  url: 'https://www.example.com/en/blog/hello',
};

test('the Agent: the task or project one while it can be used, else the only one; otherwise a person chooses', () => {
  expect(startAgent(view())).toEqual({ ready: true, save: undefined });
  expect(
    startAgent(view({ agent: { agentId: 'gone', options: [{ id: 'b' }] } })),
  ).toEqual({ ready: true, save: 'b' });
  const two = { repo: {}, agentId: null, options: [{ id: 'a' }, { id: 'b' }] };
  expect(startBlockers(view({ agent: two }), blog)).toEqual(['chooseAgent']);
  expect(
    startBlockers(
      view({ agent: { repo: {}, agentId: null, options: [] } }),
      blog,
    ),
  ).toEqual(['noAgent']);
});

test("where a blog post goes: the default target, the playbook's or the only one; several without a default wait", () => {
  const two = [{ id: 'cms' }, { id: 'news' }];
  expect(
    startBlockers(
      view({ articleTargets: [{ id: 'cms', default: true }, { id: 'news' }] }),
      blog,
    ),
  ).toEqual([]);
  expect(
    startBlockers(view({ articleTargets: [{ id: 'cms' }] }), blog),
  ).toEqual([]);
  expect(
    startBlockers(
      view({
        articleTargets: two,
        articlePlaybookTargets: { 'blog-post': 'news' },
      }),
      blog,
    ),
  ).toEqual([]);
  expect(startBlockers(view({ articleTargets: two }), blog)).toEqual([
    'chooseTarget',
  ]);
  // A playbook set to the repository needs no target.
  expect(
    startBlockers(
      view({
        articleTargets: two,
        articlePlaybookTargets: { 'blog-post': 'repo' },
      }),
      blog,
    ),
  ).toEqual([]);
});

test('a page change goes to the article found from its page, or to the repository for a page of the site itself', () => {
  const targets = [{ id: 'cms', default: true }],
    withPage = (over: Partial<StartContext> = {}) =>
      view({
        task: { evidence: { page: article.url } },
        articleTargets: targets,
        ...over,
      });
  // No page known: a person picks one (2026-10-29), not an article.
  expect(startBlockers(view({ articleTargets: targets }), optimize)).toEqual([
    'choosePage',
  ]);
  expect(
    startBlockers(withPage(), {
      ...optimize,
      found: { article, unchecked: false },
    }),
  ).toEqual([]);
  expect(
    startBlockers(withPage(), {
      ...optimize,
      found: { article: null, unchecked: false },
    }),
  ).toEqual([]);
  // A target that could not be asked does not mean the page is the site's own.
  expect(
    startBlockers(withPage(), {
      ...optimize,
      found: { article: null, unchecked: true },
    }),
  ).toEqual(['chooseArticle']);
  expect(
    startBlockers(
      withPage({ work: { article: { targetId: 'old', articleId: '1' } } }),
      optimize,
    ),
  ).toContain('targetGone');
});

test('a change through the repository needs one connected unless runs are simulated; an analysis or an article does not', () => {
  const noRepo = view({
    agent: { repo: null, agentId: 'a', options: [{ id: 'a' }] },
  });
  expect(startBlockers(noRepo, blog)).toEqual(['noRepository']);
  expect(startBlockers(noRepo, { ...blog, simulated: true })).toEqual([]);
  expect(
    startBlockers(noRepo, {
      playbookId: 'change-research',
      changes: false,
      needsRepository: false,
    }),
  ).toEqual([]);
  expect(
    startBlockers(
      { ...noRepo, articleTargets: [{ id: 'cms', default: true }] },
      blog,
    ),
  ).toEqual([]);
});

test('the page lookup is asked only when it can change the default', () => {
  const withPage = view({
    task: { evidence: { page: article.url } },
    articleTargets: [{ id: 'cms', default: true }],
  });
  expect(lookupMatters(withPage, 'optimize-page')).toBe(true);
  expect(lookupMatters(withPage, 'blog-post')).toBe(false);
  expect(
    lookupMatters(
      { ...withPage, articlePlaybookTargets: { 'optimize-page': 'repo' } },
      'optimize-page',
    ),
  ).toBe(false);
  expect(
    lookupMatters({ ...withPage, articleTargets: [] }, 'optimize-page'),
  ).toBe(false);
  expect(
    lookupMatters(view({ articleTargets: [{ id: 'cms' }] }), 'new-doc'),
  ).toBe(false);
});

test('a translation needs an existing article and a target with another language to write', () => {
  const translate = {
    ...optimize,
    playbookId: 'translate-article',
    translate: true,
  };
  const targets = [{ id: 'cms', default: true, locales: ['en', 'zh'] }];
  expect(
    startBlockers(view({ articleTargets: targets }), {
      ...translate,
      found: { article: { ...article, locales: ['en'] }, unchecked: false },
    }),
  ).toEqual([]);
  expect(
    startBlockers(
      view({ articleTargets: [{ id: 'cms', default: true, locales: ['en'] }] }),
      { ...translate, found: { article, unchecked: false } },
    ),
  ).toEqual(['chooseArticle']);
});

// The primary language when nobody chose one (2026-10-30, T-58): the project's AI content language when the target
// has it, then the target's other languages in order; otherwise the target's order.
test('the primary language follows the project AI content language when the target has it', () => {
  const cms = { id: 'cms', default: true, locales: ['en', 'zh', 'ja'] };
  const at = (language: string | null, evidence = {}) =>
    view({ task: { evidence }, articleTargets: [cms], language });
  const blog = defaultDelivery(at('zh-CN'), 'blog-post');
  expect(choiceLocales(at('zh-CN'), blog)).toEqual(['zh', 'en', 'ja']);
  expect(deliveryPlan(at('zh-CN'), blog).delivery).toEqual({
    targetId: 'cms',
    locales: ['zh', 'en', 'ja'],
  });
  expect(choiceLocales(at('ja-JP'), blog)).toEqual(['ja', 'en', 'zh']);
  // A target without it, or no project language: the target's order.
  expect(choiceLocales(at('fr-FR'), blog)).toEqual(['en', 'zh', 'ja']);
  expect(choiceLocales(at(null), blog)).toEqual(['en', 'zh', 'ja']);
  // Chosen at the hand-over: kept, as far as the target has them.
  const handed = at('zh-CN', { handoff: { locales: ['ja', 'en', 'xx'] } });
  expect(choiceLocales(handed, defaultDelivery(handed, 'blog-post'))).toEqual([
    'ja',
    'en',
  ]);
  expect(projectLocale(['en', 'zh-TW'], 'zh-TW')).toBe('zh-TW');
  expect(projectLocale(['en', 'zh'], 'zh-CN')).toBe('zh');
  expect(defaultLocales(['en', 'zh'], 'de-DE')).toEqual(['en', 'zh']);
  // A translation's source: the project's language when the article has it, else the target's first it has.
  expect(
    translationDefault(['en', 'zh', 'ja'], ['en', 'zh'], undefined, 'zh-CN'),
  ).toEqual({ from: 'zh', to: ['ja'] });
  expect(
    translationDefault(['en', 'zh', 'ja'], ['en'], undefined, 'zh-CN'),
  ).toEqual({ from: 'en', to: ['zh', 'ja'] });
});

// Tasks carry their pages (2026-10-29, after T-54's seven pages were only written into its brief): the start card
// decides where the change goes from them and Performance shows them.
const site = (path: string) => `https://www.example.com${path}`;
const sitePages = ['/pricing', '/features', '/solutions/crm', '/about'].map(
  site,
);
const blogPage = (slug: string, id: string) => ({
  url: site(`/en/blog/${slug}`),
  article: { ...article, articleId: id, slug, url: site(`/en/blog/${slug}`) },
});

test('a task carries the pages it was handed off with, each once, ahead of the pages it would read otherwise', () => {
  const evidence = {
    page: sitePages[0],
    pages: [...sitePages, `${sitePages[1]}/`, 'not a page'],
    insight: { target: site('/opportunity-target'), signalIds: ['s1'] },
    context: { signals: { items: [{ key: 's1', url: site('/cited') }] } },
  };
  expect(pageUrlsOf(view({ task: { evidence } }))).toEqual(sitePages);
  // The linked page comes first.
  expect(
    pageUrlsOf(
      view({ task: { evidence }, work: { page: { url: site('/linked') } } }),
    ),
  ).toEqual([site('/linked'), ...sitePages]);
  // At most MAX_TASK_PAGES.
  const many = Array.from({ length: 40 }, (_, i) => site(`/p${i}`));
  expect(
    pageUrlsOf(view({ task: { evidence: { pages: many } } })),
  ).toHaveLength(MAX_TASK_PAGES);
});

test("without a list, a task reads its opportunity's target and the cited changes' pages, a site audit change's affected pages included", () => {
  const items = [
    { key: 'gsc-drop', url: site('/pricing') },
    {
      key: 'audit-dupDescription',
      url: site('/features'),
      evidence: [site('/features'), site('/about'), site('/careers')],
    },
    {
      key: 'reddit-new',
      url: 'https://www.reddit.com/r/x',
      evidence: ['https://www.reddit.com/r/y'],
    },
  ];
  const evidence = {
    insight: {
      target: site('/target'),
      signalIds: ['gsc-drop', 'audit-dupDescription', 'reddit-new'],
    },
    context: { signals: { items } },
  };
  expect(pageUrlsOf(view({ task: { evidence } }))).toEqual([
    site('/target'),
    site('/pricing'),
    site('/features'),
    site('/about'),
    site('/careers'),
    'https://www.reddit.com/r/x',
  ]);
  // One of an opportunity's several tasks reads its own place only.
  expect(
    pageUrlsOf(
      view({
        task: {
          evidence: {
            ...evidence,
            page: site('/pricing'),
            part: { signalIds: ['gsc-drop'] },
          },
        },
      }),
    ),
  ).toEqual([site('/pricing')]);
});

test('the change goes where most of the pages are: the repository for pages of the site, connected or not, an article when articles hold as many', () => {
  const targets = [{ id: 'cms', default: true, locales: ['en'] }],
    data = view({
      task: { evidence: { pages: sitePages } },
      articleTargets: targets,
    }),
    pages = (...list: object[]) => ({
      article:
        (list.find((p) => 'article' in p) as { article?: typeof article })
          ?.article ?? null,
      unchecked: false,
      pages: list as { url: string }[],
    });
  // T-54: every page is the site's own.
  const t54 = pages(...sitePages.map((url) => ({ url })));
  expect(defaultDelivery(data, 'optimize-page', t54)).toEqual({
    target: REPO,
    mode: 'new',
    also: [],
  });
  expect(startBlockers(data, { ...optimize, found: t54 })).toEqual([]);
  // Without a repository connected it still goes there, and says one is missing instead of asking for an article.
  const noRepo = { ...data, agent: { ...data.agent, repo: null } };
  expect(startBlockers(noRepo, { ...optimize, found: t54 })).toEqual([
    'noRepository',
  ]);
  // A playbook that names a target still asks for an article there.
  expect(
    defaultDelivery(
      { ...data, articlePlaybookTargets: { 'optimize-page': 'cms' } },
      'optimize-page',
      t54,
    ),
  ).toEqual({ target: 'cms', mode: 'existing', also: [] });
  // One article, or articles holding as many pages as the site: the first article.
  const one = blogPage('hello', '7');
  expect(defaultDelivery(data, 'optimize-page', pages(one))).toMatchObject({
    target: 'cms',
    mode: 'existing',
    article: { articleId: '7' },
  });
  expect(
    defaultDelivery(
      data,
      'optimize-page',
      pages({ url: sitePages[0] }, one, blogPage('two', '8')),
    ),
  ).toMatchObject({ target: 'cms', article: { articleId: '7' } });
  expect(
    defaultDelivery(data, 'optimize-page', pages({ url: sitePages[0] }, one)),
  ).toMatchObject({ target: 'cms', article: { articleId: '7' } });
  // More pages of the site than articles: the repository.
  expect(
    defaultDelivery(
      data,
      'optimize-page',
      pages({ url: sitePages[0] }, { url: sitePages[1] }, one),
    ).target,
  ).toBe(REPO);
  // A page that could not be checked counts against the side it might not be on.
  const unchecked = { url: site('/en/blog/maybe'), unchecked: true };
  expect(
    defaultDelivery(
      data,
      'optimize-page',
      pages({ url: sitePages[0] }, unchecked),
    ),
  ).toEqual({ target: 'cms', mode: 'existing', also: [] });
  expect(
    startBlockers(data, {
      ...optimize,
      found: pages({ url: sitePages[0] }, unchecked),
    }),
  ).toEqual(['chooseArticle']);
  expect(
    defaultDelivery(
      data,
      'optimize-page',
      pages({ url: sitePages[0] }, { url: sitePages[1] }, unchecked),
    ).target,
  ).toBe(REPO);
});

test('pages in two places: the start changes its own and names the rest, which it sends only when there are some', () => {
  const data = view({
      task: {
        evidence: {
          pages: [...sitePages, site('/en/blog/a'), site('/en/blog/b')],
        },
      },
      articleTargets: [{ id: 'cms', default: true }],
    }),
    a = blogPage('a', '1'),
    b = blogPage('b', '2'),
    found = {
      article: a.article,
      unchecked: false,
      pages: [...sitePages.map((url) => ({ url })), a, b],
    },
    choice = defaultDelivery(data, 'optimize-page', found);
  expect(choice.target).toBe(REPO);
  const split = startPages(data, choice, found);
  expect(split.pages.map((p) => p.url)).toEqual(sitePages);
  expect(split.rest).toEqual([a, b]);
  expect(pagesToStart(data, choice, found)).toEqual(sitePages);
  // The article choice changes that article's page; the rest are the site's pages and the other article.
  const onA = {
    target: 'cms',
    mode: 'existing' as const,
    also: [],
    article: a.article,
  };
  expect(startPages(data, onA, found).pages).toEqual([a]);
  expect(startPages(data, onA, found).rest).toHaveLength(5);
  // Every page in one place: nothing to name.
  const onlySite = {
    ...found,
    article: null,
    pages: sitePages.map((url) => ({ url })),
  };
  expect(startPages(data, choice, onlySite).rest).toEqual([]);
  expect(pagesToStart(data, choice, onlySite)).toBeUndefined();
  // Without the lookup every page counts as this task's.
  expect(startPages(data, choice).pages).toHaveLength(6);
});

test('T-55: a page that looks like an exported article is never changed by pull request; alone, a person picks the article', () => {
  const t55 = site('/blog/hello/'),
    guess = { url: t55, guess: { targetId: 'cms', slug: 'hello' } },
    data = view({
      task: { evidence: { page: t55 } },
      articleTargets: [{ id: 'cms', default: true }],
    }),
    alone = { article: null, unchecked: false, pages: [guess] };
  expect(defaultDelivery(data, 'optimize-page', alone)).toEqual({
    target: 'cms',
    mode: 'existing',
    also: [],
  });
  expect(startBlockers(data, { ...optimize, found: alone })).toEqual([
    'chooseArticle',
  ]);
  // With pages of the site, they go to the repository and the guess is left to a task of its own.
  const mixed = {
    article: null,
    unchecked: false,
    pages: [...sitePages.map((url) => ({ url })), guess],
  };
  const choice = defaultDelivery(data, 'optimize-page', mixed);
  expect(choice.target).toBe(REPO);
  expect(startPages(data, choice, mixed).rest).toEqual([guess]);
  expect(pagesToStart(data, choice, mixed)).toEqual(sitePages);
});
