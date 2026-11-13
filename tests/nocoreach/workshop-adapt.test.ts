import { describe, expect, it } from 'vitest';
import { adaptPage } from '../../server/nocoreach/execution/service';
import { projectWork } from '../../server/nocoreach/execution/model';

// Content workshop's Adapt this on a live task: only a blog article, known by the site's content or by having been
// written with Write blog post.
const ORIGIN = 'https://acme.example';
const site = {
  pages: [
    { url: `${ORIGIN}/blog/new-board/`, title: 'New board | Acme', type: 'blog' },
    { url: `${ORIGIN}/blog/hidden`, title: 'Hidden', type: 'blog', noindex: true },
    { url: `${ORIGIN}/docs/guests`, title: 'Guest access', type: 'docs' },
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

  it('offers nothing for docs and other pages, hidden posts or a change not yet live', () => {
    expect(adaptPage({}, live(`${ORIGIN}/docs/guests`) as any, site, {})).toBeNull();
    expect(adaptPage({}, live(`${ORIGIN}/blog/hidden`) as any, site, {})).toBeNull();
    expect(adaptPage({}, live(`${ORIGIN}/blog/unknown`) as any, site, {})).toBeNull();
    const merging = { ...live(`${ORIGIN}/blog/new-board`), release: { state: 'verifying', pages: [`${ORIGIN}/blog/new-board`], note: '' } };
    expect(adaptPage({}, merging as any, site, {})).toBeNull();
  });
});
