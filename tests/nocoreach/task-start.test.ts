import { expect, test } from 'vitest';
import {
  lookupMatters,
  startAgent,
  startBlockers,
  type StartContext,
} from '../../shared/task-start.js';

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
  const targets = [{ id: 'cms', default: true }];
  expect(startBlockers(view({ articleTargets: targets }), optimize)).toEqual([
    'chooseArticle',
  ]);
  expect(
    startBlockers(view({ articleTargets: targets }), {
      ...optimize,
      found: { article, unchecked: false },
    }),
  ).toEqual([]);
  expect(
    startBlockers(view({ articleTargets: targets }), {
      ...optimize,
      found: { article: null, unchecked: false },
    }),
  ).toEqual([]);
  // A target that could not be asked does not mean the page is the site's own.
  expect(
    startBlockers(view({ articleTargets: targets }), {
      ...optimize,
      found: { article: null, unchecked: true },
    }),
  ).toEqual(['chooseArticle']);
  expect(
    startBlockers(
      view({
        articleTargets: targets,
        work: { article: { targetId: 'old', articleId: '1' } },
      }),
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
