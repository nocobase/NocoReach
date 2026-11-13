import { describe, expect, it } from 'vitest';

import {
  parseRepurpose,
  repurposeChecks,
  type Destination,
} from '../../shared/repurpose.js';
import { ACME_PAGES } from '../../server/nocoreach/demo-data/acme-content.js';
import {
  WORKSHOP_BRAND,
  WORKSHOP_DRAFTS,
  WORKSHOP_PAGES,
  WORKSHOP_SEARCH_TERMS,
} from '../../server/nocoreach/demo-data/workshop-content.js';
import {
  ACME_AI,
  ACME_QUERIES,
} from '../../server/nocoreach/demo-data/world/script/acme.js';

// The Content workshop demo (2026-11-13): every draft reads as the workshop reads an Agent's result, and passes the
// checks NocoReach shows on review, in both demo languages.

describe('Content workshop demo', () => {
  it('writes drafts the workshop reads, within each place’s limits', () => {
    for (const lang of ['zh', 'en'] as const)
      for (const d of WORKSHOP_DRAFTS) {
        const text = d.draft[lang]
          .replaceAll('{date}', '11 月 26 日')
          .replaceAll('{name}', 'Ethan');
        const parsed = parseRepurpose(d.form, text);
        expect(parsed, `${lang} ${d.key}`).not.toBeNull();
        const place = d.destination;
        const destination: Destination | undefined = !place
          ? undefined
          : place.kind === 'own'
            ? {
                kind: 'own',
                name: WORKSHOP_BRAND.community.name[lang],
                url: WORKSHOP_BRAND.community.url,
                section: WORKSHOP_BRAND.community.sections[lang][place.section],
              }
            : place.kind === 'reddit'
              ? { kind: 'reddit', subreddit: place.subreddit }
              : { kind: 'hn' };
        const failed = repurposeChecks(d.form, parsed!, {
          destination,
          brand: 'Acme',
        }).filter((c) => !c.ok);
        expect(failed, `${lang} ${d.key}`).toEqual([]);
        if (d.form === 'community')
          expect(parsed!.rules.length, `${lang} ${d.key}`).toBeGreaterThan(0);
      }
  });

  it('adapts articles the site has, and gives each new article its searches', () => {
    const paths = new Set(ACME_PAGES.map((p) => p.path));
    for (const d of WORKSHOP_DRAFTS)
      if (d.source.kind === 'article')
        expect(paths.has(d.source.path)).toBe(true);
    for (const p of WORKSHOP_PAGES) {
      expect(paths.has(p.path)).toBe(true);
      expect(WORKSHOP_SEARCH_TERMS[p.path]?.zh).toHaveLength(3);
      expect(ACME_QUERIES.en.some((q) => q.path === p.path)).toBe(true);
    }
    expect(ACME_AI.some((q) => q.cites.includes('/blog/choose-pm-tool'))).toBe(
      true,
    );
    // Two drafts wait for review; the rest are approved, after they were made.
    expect(
      WORKSHOP_DRAFTS.filter((d) => d.state === 'review').map((d) => d.key),
    ).toEqual(['release-linkedin', 'requests-reddit']);
    for (const d of WORKSHOP_DRAFTS)
      if (d.state === 'done') expect(d.approved).toBeLessThan(d.created);
  });
});
