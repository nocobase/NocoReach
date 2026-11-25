// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  CARD,
  CARD_SPECS,
  FORM_PLAYBOOK,
  FORM_RESULT_KIND,
  INSTAGRAM,
  LINKEDIN_DOC,
  carouselOrder,
  cardLength,
  cardUnit,
  coverLength,
  hasLink,
  hashtagsOf,
  isCardSize,
  parseRepurpose,
  pieceLimit,
  ratioOf,
  repurposeBrief,
  repurposeChecks,
  wordCount,
  writeCards,
} from '../../shared/repurpose.js';
import { SYSTEM_PLAYBOOKS } from '../../shared/playbook-catalog.js';
import { cardStyle, cardTemplate } from '../../shared/xhs-card.js';
import { resultOf } from '../../server/nocoreach/execution/agent-result.js';
import { BUILT_IN_SKILLS } from '../../server/nocoreach/skills-builtin.js';

// Carousel (2026-11-24 user decision, ui-references/carousel-destinations-2026-11-23): the Xiaohongshu note became one of
// three places of a carousel, with Instagram's 4:5 cards and caption and LinkedIn's 4:5 pages in one PDF; a card's text
// is counted in characters when written in Chinese, Japanese or Korean, else in words.

const card = (n: number, heading: string, text: string) =>
  `## Card ${n}\nSections: ${n}\n# ${heading}\n${text}`;
const cards = (n: number, heading = (i: number) => `Step ${i}`) =>
  Array.from({ length: n }, (_, i) =>
    card(i + 1, heading(i + 1), 'One owner for every request.'),
  );
const checks = (
  form: 'xhs' | 'instagram' | 'linkedin-carousel',
  text: string,
  set: object = {},
) =>
  repurposeChecks(form, parseRepurpose(form, text)!, {
    cards: { images: [], ...set },
  });
const failed = (...args: Parameters<typeof checks>) =>
  checks(...args)
    .filter((c) => !c.ok)
    .map((c) => [c.key, c.params]);

describe('Carousel places', () => {
  it('lists Xiaohongshu first in Chinese interfaces and last elsewhere, each place with its own playbook', () => {
    expect(carouselOrder('zh-CN')).toEqual([
      'xhs',
      'instagram',
      'linkedin-carousel',
    ]);
    expect(carouselOrder('zh-TW')[0]).toBe('xhs');
    expect(carouselOrder('en-US')).toEqual([
      'instagram',
      'linkedin-carousel',
      'xhs',
    ]);
    expect(carouselOrder('ja-JP').at(-1)).toBe('xhs');
    expect(FORM_PLAYBOOK.instagram).toBe('instagram-carousel');
    expect(FORM_RESULT_KIND['linkedin-carousel']).toBe('linkedinCards');
    for (const id of ['xhs-cards', 'instagram-carousel', 'linkedin-carousel'])
      expect(SYSTEM_PLAYBOOKS.some((p) => p.id === id)).toBe(true);
  });

  it('draws Xiaohongshu at 3:4 and Instagram and LinkedIn at 4:5, and takes no other size', () => {
    expect(CARD_SPECS.xhs).toMatchObject({ width: 1080, height: 1440 });
    expect(CARD_SPECS.instagram).toMatchObject({
      width: 1080,
      height: 1350,
      minCards: 6,
      maxCards: 20,
    });
    expect(CARD_SPECS['linkedin-carousel'].maxCards).toBe(18);
    expect(isCardSize({ width: 1080, height: 1350 })).toBe(true);
    expect(isCardSize({ width: 1080, height: 1080 })).toBe(false);
    expect([ratioOf(1440), ratioOf(1350)]).toEqual(['3:4', '4:5']);
    const page = cardTemplate(
      cardStyle(null, {}),
      'cards.js',
      CARD_SPECS.instagram,
    );
    expect(page).toContain('<meta name="card-size" content="1080x1350">');
    expect(page).toContain('const SIZE = {"width":1080,"height":1350}');
    expect(cardTemplate(cardStyle(null, {}))).toContain(
      '<meta name="card-size" content="1080x1440">',
    );
  });

  it('names a carousel by its place in the brief', () => {
    const brief = (form: 'instagram' | 'linkedin-carousel') =>
      repurposeBrief(
        {
          form,
          source: { kind: 'article', url: 'https://a.co/b', title: 'Boards' },
        },
        'en-US',
      );
    expect(brief('instagram')).toContain('into an Instagram carousel');
    expect(brief('linkedin-carousel')).toContain('a LinkedIn carousel');
  });
});

describe('Counting a card', () => {
  it('counts Chinese, Japanese and Korean in characters and other text in words', () => {
    expect(wordCount('Five people or fewer, 41% follow-up — done')).toBe(7);
    expect(
      cardUnit([{ heading: '先别比功能', text: '人数比功能清单更重要。' }]),
    ).toBe('chars');
    expect(cardUnit([{ heading: 'Skip it', text: 'Headcount decides.' }])).toBe(
      'words',
    );
    // A Chinese card naming a product or two is still Chinese.
    expect(cardUnit([{ text: 'Acme 和 Nimbus 都有看板和时间线' }])).toBe(
      'chars',
    );
    const c = { heading: 'Before you move', text: 'Keep source row numbers.' };
    expect(cardLength(c, 'words')).toBe(7);
    expect(coverLength(c, 'words')).toBe(3);
  });

  it('checks an English set in words: 8 on the cover and 40 on a card', () => {
    const long = Array.from({ length: 39 }, () => 'word').join(' ');
    const text = [
      '## Body',
      'Caption.',
      '## Hashtags',
      '#a #b',
      card(1, 'One two three four five six seven eight nine', 'x'),
      ...cards(7).slice(1, 6),
      card(7, 'Two words', long),
    ].join('\n');
    expect(failed('instagram', text, { ratio: '4:5' })).toEqual([
      ['workshop.check.coverOverWords', { 0: 9, 1: CARD.coverWords }],
      ['workshop.check.cardWordsOver', { 0: 7, 1: 41, 2: CARD.cardWords }],
    ]);
  });
});

describe('Instagram carousel', () => {
  const caption =
    'Start with how your team works.\n\nThe full comparison is at the link in bio.';
  const result = (
    body = caption,
    tags = '#projectmanagement #smallteams',
    n = 8,
  ) => ['## Body', body, '## Hashtags', tags, ...cards(n)].join('\n');

  it('reads the caption and its hashtags, and checks them as Instagram shows them', () => {
    const parsed = parseRepurpose('instagram', result())!;
    expect(parsed.pieces.filter((p) => p.kind !== 'card')).toEqual([
      { kind: 'body', text: caption },
      { kind: 'tags', text: '#projectmanagement #smallteams' },
    ]);
    expect(hashtagsOf('#a #b, #a #c_d')).toEqual(['#a', '#b', '#c_d']);
    const tags = parsed.pieces.find((p) => p.kind === 'tags')!;
    expect(pieceLimit('instagram', tags)).toEqual({ length: 2, max: 5 });
    expect(
      checks('instagram', result(), { ratio: '4:5' }).map((c) => c.key),
    ).toEqual([
      'workshop.check.coverWithinWords',
      'workshop.check.cardsWithin',
      'workshop.check.cardWordsWithin',
      'workshop.check.hashtagsWithin',
      'workshop.check.captionNoLink',
    ]);
  });

  it('flags more than 5 hashtags, a link in the caption, too many cards and cards drawn at 3:4', () => {
    expect(hasLink('See acme.com/blog')).toBe(true);
    expect(hasLink('https://acme.example')).toBe(true);
    expect(hasLink('link in bio')).toBe(false);
    expect(
      failed(
        'instagram',
        result('Read it: https://acme.example/blog', '#a #b #c #d #e #f', 21),
        { ratio: '3:4' },
      ),
    ).toEqual([
      ['workshop.check.cardsOut', { 0: 21, 1: 6, 2: 20 }],
      ['workshop.check.ratioOther', { 0: '3:4', 1: '4:5' }],
      ['workshop.check.hashtagsOver', { 0: 6, 1: INSTAGRAM.hashtags }],
      ['workshop.check.captionLink', undefined],
    ]);
  });

  it('writes an edit back with its caption and hashtags', () => {
    const parsed = parseRepurpose('instagram', result())!;
    const again = parseRepurpose('instagram', writeCards(parsed.pieces))!;
    expect(again.pieces).toEqual(parsed.pieces);
  });
});

describe('LinkedIn carousel', () => {
  const result = (title: string, post: string, n = 8) =>
    ['## Title', title, '## Body', post, ...cards(n)].join('\n');

  it('counts pages, the document title against 58 characters and the post against 1,300', () => {
    expect(
      checks('linkedin-carousel', result('Picking a PM tool', 'Post.'), {
        ratio: '4:5',
      }).map((c) => [c.key, c.params]),
    ).toEqual([
      ['workshop.check.coverWithinWords', { 0: 2, 1: 8 }],
      ['workshop.check.pagesWithin', { 0: 8, 1: 6, 2: 18 }],
      ['workshop.check.cardWordsWithin', { 0: 40 }],
      ['workshop.check.docTitleWithin', { 0: 17, 1: LINKEDIN_DOC.title }],
      ['workshop.check.postTextWithin', { 0: 5, 1: LINKEDIN_DOC.post }],
    ]);
    expect(
      failed('linkedin-carousel', result('x'.repeat(59), 'p'.repeat(1301), 5), {
        ratio: '4:5',
      }),
    ).toEqual([
      ['workshop.check.pagesOut', { 0: 5, 1: 6, 2: 18 }],
      ['workshop.check.docTitleOver', { 0: 59, 1: 58 }],
      ['workshop.check.postTextOver', { 0: 1301, 1: 1300 }],
    ]);
  });

  it('takes a result only with its pages, document title and post', () => {
    const report = {
      kind: 'linkedinCards',
      sources: [],
      asOf: '2026-11-24',
      uncertainties: [],
    };
    const ids = Array.from(
      { length: 6 },
      (_, i) => `00000000-0000-4000-8000-00000000000${i}`,
    );
    const of = (content: string) => () =>
      resultOf(
        JSON.stringify({ ok: true, report, content, cards: { images: ids } }),
        'plan',
        'linkedinCards',
        '1',
      );
    expect(of(result('Doc', 'Post.', 6))()).toMatchObject({
      cards: { images: ids },
    });
    expect(of(['## Title', 'Doc', ...cards(6)].join('\n'))).toThrow();
  });
});

describe('Carousel Skills', () => {
  it('adds an Instagram and a LinkedIn Skill whose render script draws at the page’s card size', () => {
    const skill = (name: string) =>
      BUILT_IN_SKILLS.find((s) => s.name === name);
    expect(skill('instagram-carousel')?.body).toContain('1080×1350');
    expect(skill('linkedin-carousel')?.body).toContain('PDF');
    const render = skill('xhs-cards')?.files?.find(
      (f) => f.path === 'render.mjs',
    );
    expect(render?.text).toContain('name="card-size"');
  });
});
