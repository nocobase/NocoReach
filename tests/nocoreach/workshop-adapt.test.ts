import { describe, expect, it } from 'vitest';
import { adaptPage } from '../../server/nocoreach/execution/service';
import { projectWork } from '../../server/nocoreach/execution/model';
import { isBlogListing } from '../../shared/repurpose';

// Content workshop's Adapt this on a live task: only a blog article, known by the site's content or by having been
// written with Write blog post.
const ORIGIN = 'https://acme.example';
const site = {
  pages: [
    { url: `${ORIGIN}/blog/new-board/`, title: 'New board | Acme', type: 'blog' },
    { url: `${ORIGIN}/blog/hidden`, title: 'Hidden', type: 'blog', noindex: true },
    { url: `${ORIGIN}/docs/guests`, title: 'Guest access', type: 'docs' },
    { url: `${ORIGIN}/blog/`, title: 'Blog | Acme', type: 'blog' },
    { url: `${ORIGIN}/zh-cn/changelog`, title: 'Changelog', type: 'blog' },
  ],
};
const live = (page: string, extra: Record<string, unknown> = {}) => ({
  ...projectWork({ evidence: {} }),
  playbookId: 'optimize-page',
  release: { state: 'live', pages: [page], note: '' },
  ...extra,
});

describe('adaptPage', () => {
  it('offers a live blog article from the site, titled as the workshop titles it', () => {
    expect(adaptPage({ title: 'T' }, live(`${ORIGIN}/blog/new-board`) as any, site, {})).toEqual({
      url: `${ORIGIN}/blog/new-board`,
      title: 'New board',
    });
  });

  it('offers what Write blog post published before the site lists it', () => {
    const w = live(`${ORIGIN}/blog/fresh`, { playbookId: 'blog-post', article: { title: 'Fresh post' } });
    expect(adaptPage({ title: 'Write blog post: Fresh' }, w as any, site, {})).toEqual({
      url: `${ORIGIN}/blog/fresh`,
      title: 'Fresh post',
    });
  });

  it('offers nothing for docs and other pages, hidden posts, a section index or a change not yet live', () => {
    expect(adaptPage({}, live(`${ORIGIN}/docs/guests`) as any, site, {})).toBeNull();
    expect(adaptPage({}, live(`${ORIGIN}/blog/hidden`) as any, site, {})).toBeNull();
    expect(adaptPage({}, live(`${ORIGIN}/blog/unknown`) as any, site, {})).toBeNull();
    // A blog section's own index, even when Write blog post went live there.
    expect(adaptPage({}, live(`${ORIGIN}/blog`) as any, site, {})).toBeNull();
    expect(adaptPage({}, live(`${ORIGIN}/zh-cn/changelog/`, { playbookId: 'blog-post' }) as any, site, {})).toBeNull();
    const merging = { ...live(`${ORIGIN}/blog/new-board`), release: { state: 'verifying', pages: [`${ORIGIN}/blog/new-board`], note: '' } };
    expect(adaptPage({}, merging as any, site, {})).toBeNull();
  });

  it('tells a page listing articles from an article', () => {
    expect(isBlogListing(`${ORIGIN}/blog`)).toBe(true);
    expect(isBlogListing(`${ORIGIN}/en/news/`)).toBe(true);
    expect(isBlogListing('https://blog.acme.example/')).toBe(true);
    expect(isBlogListing('https://blog.acme.example/zh/')).toBe(true);
    expect(isBlogListing(`${ORIGIN}/blog/new-board`)).toBe(false);
    expect(isBlogListing(`${ORIGIN}/en/changelog/2-4-1`)).toBe(false);
    // On a blog host every path is a post.
    expect(isBlogListing('https://blog.acme.example/new-board')).toBe(false);
    // A section's later pages, and its tag, category, author and archive pages, list articles too.
    expect(isBlogListing(`${ORIGIN}/changelog/page/3/`)).toBe(true);
    expect(isBlogListing(`${ORIGIN}/ja-JP/changelog/page/2/`)).toBe(true);
    expect(isBlogListing(`${ORIGIN}/cn/blog/tags/customer-stories/page/4`)).toBe(true);
    expect(isBlogListing(`${ORIGIN}/blog/category/guides`)).toBe(true);
    expect(isBlogListing(`${ORIGIN}/blog/author/ethan/`)).toBe(true);
    expect(isBlogListing(`${ORIGIN}/blog?page=2`)).toBe(true);
    expect(isBlogListing('https://blog.acme.example/page/2/')).toBe(true);
    expect(isBlogListing('https://blog.acme.example/tag/kanban')).toBe(true);
    expect(isBlogListing(`${ORIGIN}/blog/page-speed-tips`)).toBe(false);
    expect(isBlogListing(`${ORIGIN}/blog/tagging-tasks`)).toBe(false);
  });
});
