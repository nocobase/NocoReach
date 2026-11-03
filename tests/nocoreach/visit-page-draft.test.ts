import { afterEach, expect, it } from 'vitest';
import english from '../../shared/i18n/en.json';
import { setDictionary } from '../../client/i18n';
import { formatDate } from '../../client/lib/format';
import { visitPageDraft } from '../../client/pages/seo-hand-off';

afterEach(() => setDictionary(null));

const draft = (window?: { start: string; end: string } | null) =>
  visitPageDraft(
    'https://x.com/docs',
    'Oct 24 – Oct 30',
    300,
    4,
    '5%',
    [{ keyword: 'install docs', clicks: 9, impressions: 120 }],
    window,
  ).brief.split('\n');

// Traffic's GA4 period ends yesterday while a page's queries are finalized Search Console days that end earlier, so the
// brief dates the queries instead of leaving them under the GA4 period.
it('a page hand-off dates its Search Console queries apart from the traffic period', () => {
  setDictionary(english);
  const lines = draft({ start: '2026-10-22', end: '2026-10-28' });
  const heading = lines.indexOf(english['seoHandOff.searchQueries']);
  expect(lines[heading - 1]).toBe(
    english['dataWebsite.pageQueriesFinalized']
      .replace('{0}', formatDate('2026-10-22'))
      .replace('{1}', formatDate('2026-10-28')),
  );
  expect(draft().slice(0, 3)).toEqual([
    expect.any(String),
    expect.any(String),
    english['seoHandOff.searchQueries'],
  ]);
});
