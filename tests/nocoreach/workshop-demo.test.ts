import { describe, expect, it } from 'vitest';

import {
  CARD_SPECS,
  XHS,
  isCarouselForm,
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
import { crmGrowthBriefs } from '../../server/nocoreach/demo-data/growth-briefs.js';
import { CRM_SKIPPED } from '../../server/nocoreach/demo-data/workshop-history.js';
import CARD_IMAGES from '../../server/nocoreach/demo-data/xhs-card-images.json';
import { categoryOf } from '../../shared/growth.js';

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
          ...(d.cards
            ? {
                cards: {
                  images: [],
                  sections: 4,
                  colors: (
                    CARD_IMAGES as Record<
                      string,
                      Record<string, { colors: string[] }>
                    >
                  )[d.key][lang].colors,
                  overflow: d.cards.overflow,
                  ...(isCarouselForm(d.form)
                    ? { ratio: CARD_SPECS[d.form].ratio }
                    : {}),
                },
              }
            : {}),
        }).filter((c) => !c.ok);
        // Every demo draft follows its own rules, the cards waiting for review included (2026-11-17).
        expect(
          failed.map((c) => [c.key, c.params?.[0]]),
          `${lang} ${d.key}`,
        ).toEqual([]);
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
    ).toEqual([
      'choose-tool-instagram',
      'release-linkedin',
      'requests-reddit',
      'requests-xhs',
    ]);
    for (const d of WORKSHOP_DRAFTS)
      if (d.state === 'done') expect(d.approved).toBeLessThan(d.created);
  });

  // Content workshop PR 2: the carousel tasks' images are rendered from their drafts (scripts/render-demo-cards.ts),
  // one per card in each language at the place's size, so a changed draft needs its images rendered again. Since
  // 2026-11-24 Library's Choose a PM tool article was made into all three places: Instagram waits for review, LinkedIn's
  // PDF is done.
  it('has one rendered image per carousel card', () => {
    const drafts = WORKSHOP_DRAFTS.filter((d) => isCarouselForm(d.form));
    expect(drafts.map((d) => [d.key, d.state])).toEqual([
      ['choose-tool-xhs', 'done'],
      ['choose-tool-linkedin-carousel', 'done'],
      ['choose-tool-instagram', 'review'],
      ['requests-xhs', 'review'],
    ]);
    for (const d of drafts)
      for (const lang of ['zh', 'en'] as const) {
        const cards = parseRepurpose(d.form, d.draft[lang])!.pieces.filter(
          (p) => p.kind === 'card',
        );
        const { images, colors } = (
          CARD_IMAGES as Record<
            string,
            Record<string, { images: string[]; colors: string[] }>
          >
        )[d.key][lang];
        expect(images, `${lang} ${d.key}`).toHaveLength(cards.length);
        // The colors are measured from the images as the server measures an upload, within the limit.
        expect(colors.length, `${lang} ${d.key}`).toBeGreaterThan(0);
        expect(colors.length, `${lang} ${d.key}`).toBeLessThanOrEqual(
          XHS.colors,
        );
        for (const image of images) {
          const bytes = Buffer.from(image, 'base64');
          expect(bytes.subarray(8, 12).toString('latin1')).toBe('WEBP');
          // VP8 lossy: the frame's width and height (14 bits each) follow its start code.
          const at = bytes.indexOf(Buffer.from([0x9d, 0x01, 0x2a])) + 3;
          expect(
            [
              bytes.readUInt16LE(at) & 0x3fff,
              bytes.readUInt16LE(at + 2) & 0x3fff,
            ],
            `${lang} ${d.key}`,
          ).toEqual([
            CARD_SPECS[d.form as 'xhs'].width,
            CARD_SPECS[d.form as 'xhs'].height,
          ]);
        }
        // The closing page is the brand kit's, word for word.
        expect(cards.at(-1)).toMatchObject({
          layout: 'end',
          heading: WORKSHOP_BRAND.cards.ending.heading[lang],
          text: WORKSHOP_BRAND.cards.ending.text,
        });
      }
  });

  // Homepage v5: the CRM project's Content workshop opens with no Trending now, every trending opportunity of it having
  // been skipped there (workshop-history.ts writes `workshop-skips:<project>` for CRM_SKIPPED).
  it('skips every trending opportunity of the CRM project in the workshop', () => {
    for (const lang of ['zh', 'en'] as const)
      expect(
        crmGrowthBriefs(new Date('2026-11-13T00:00:00Z'))
          .filter((b) => categoryOf({ growth: b.growth(lang) }) === 'trending')
          .map((b) => b.key),
      ).toEqual(CRM_SKIPPED);
  });
});
