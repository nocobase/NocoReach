import { describe, expect, it } from 'vitest';
import {
  destinationKey,
  destinationName,
  parseRepurpose,
  pieceLimit,
  repurposeChecks,
  subredditName,
  xLength,
} from '../../shared/repurpose.js';

// Content workshop results (2026-11-13): the Agent writes fixed English markers in every language; NocoReach reads
// the pieces from them and checks the text itself.

const BODY =
  'I work on Acme, so read this with that in mind. Our team of four answered every client request from one shared inbox and nothing had an owner. We moved it to a board with one column per stage in an afternoon; here is the setup, what broke in the first week and what we kept.';

describe('parseRepurpose', () => {
  it('reads X posts with their sections, numbering posts the Agent left unnumbered', () => {
    const r = parseRepurpose(
      'x',
      [
        'Intro the Agent should not write',
        '## Post',
        'Sections: 1 - 2',
        'First post.',
        '',
        '## Post',
        'Second post.',
        '## Post 3',
        'Sections: 4，5',
        'Third post.',
        '## Reply',
        'Full write-up: https://acme.example/blog/boards',
      ].join('\n'),
    );
    expect(r?.pieces).toEqual([
      { kind: 'post', index: 1, text: 'First post.', sections: '1–2' },
      { kind: 'post', index: 2, text: 'Second post.' },
      { kind: 'post', index: 3, text: 'Third post.', sections: '4, 5' },
      { kind: 'reply', text: 'Full write-up: https://acme.example/blog/boards' },
    ]);
  });

  it('reads Chinese headings too, and the rules a community post lists', () => {
    const r = parseRepurpose(
      'community',
      ['## 标题', '一个下午搭好工单看板', '## 正文', '出自：第 1–3 节', BODY, '## 版规', '- 写明身份', '1. 不发纯链接', '- 无'].join('\n'),
    );
    expect(r?.pieces.map((p) => [p.kind, p.sections])).toEqual([
      ['title', undefined],
      ['body', '1–3'],
    ]);
    expect(r?.rules).toEqual(['写明身份', '不发纯链接']);
  });

  it('gives up on text without the required pieces, and on forms it cannot show yet', () => {
    expect(parseRepurpose('x', 'Just a paragraph.')).toBeNull();
    expect(parseRepurpose('linkedin', '## Reply\nhello')).toBeNull();
    expect(parseRepurpose('community', '## Title\nOnly a title')).toBeNull();
    expect(parseRepurpose('xhs', '## Post\nhello')).toBeNull();
  });
});

describe('lengths and checks', () => {
  it('counts X characters as X does: a link is 23, a Chinese character 2', () => {
    expect(xLength('abc')).toBe(3);
    expect(xLength('看板')).toBe(4);
    expect(xLength('see https://acme.example/a/very/long/path/that/goes/on')).toBe(4 + 23);
  });

  it('checks X posts and the first reply against 280 characters', () => {
    const long = 'x'.repeat(281);
    const r = parseRepurpose('x', `## Post 1\nshort\n## Post 2\n${long}\n## Reply\n${long}`)!;
    expect(repurposeChecks('x', r)).toEqual([
      { key: 'workshop.check.xOver', ok: false, params: { 0: '2, reply', 1: 280 } },
    ]);
    expect(pieceLimit('x', r.pieces[1])).toEqual({ length: 281, max: 280 });
    expect(repurposeChecks('x', parseRepurpose('x', '## Post 1\nshort')!)).toEqual([
      { key: 'workshop.check.xWithin', ok: true, params: { 0: 280 } },
    ]);
  });

  it('counts a LinkedIn post against 1,300 characters in its heading, with no separate check', () => {
    const r = parseRepurpose('linkedin', `## Post\nSections: 1\n${'a'.repeat(1301)}`)!;
    expect(repurposeChecks('linkedin', r)).toEqual([]);
    expect(pieceLimit('linkedin', r.pieces[0])).toEqual({ length: 1301, max: 1300 });
  });

  it('checks a community post is written out, says who posts it and fits the place', () => {
    const reddit = { kind: 'reddit' as const, subreddit: 'projectmanagement' };
    const ok = parseRepurpose('community', `## Title\nA board for client requests\n## Body\n${BODY}\n## Rules\n- Disclose\n- No link-only posts`)!;
    expect(repurposeChecks('community', ok, { destination: reddit, brand: 'Acme' }).map((c) => [c.key, c.ok, c.params])).toEqual([
      ['workshop.check.bodyComplete', true, undefined],
      ['workshop.check.identityBrand', true, { 0: 'Acme' }],
      ['workshop.check.titleWithin', true, { 0: 300 }],
      ['workshop.check.rulesRead', true, { 0: 'Reddit r/projectmanagement', 1: 2 }],
    ]);
    const thin = parseRepurpose('community', `## Title\n${'t'.repeat(81)}\n## Body\nSee https://acme.example/blog/boards`)!;
    expect(repurposeChecks('community', thin, { destination: { kind: 'hn' }, brand: 'Acme' }).map((c) => [c.key, c.ok])).toEqual([
      ['workshop.check.bodyComplete', false],
      ['workshop.check.identityBrand', false],
      ['workshop.check.titleOver', false],
    ]);
    // Without a project name, a first-person opening is enough.
    expect(repurposeChecks('community', ok, {})[1]).toEqual({ key: 'workshop.check.identity', ok: true });
  });
});

describe('destinations', () => {
  it('reads a subreddit however it is written, and names places for lists', () => {
    expect(subredditName('r/ProjectManagement')).toBe('ProjectManagement');
    expect(subredditName('https://www.reddit.com/r/selfhosted/about/rules')).toBe('selfhosted');
    expect(subredditName('a b')).toBeNull();
    expect(subredditName('r/x')).toBeNull();
    expect(destinationKey({ kind: 'reddit', subreddit: 'SelfHosted' })).toBe(destinationKey({ kind: 'reddit', subreddit: 'selfhosted' }));
    expect(destinationName({ kind: 'own', name: 'Acme Community', url: 'https://c.example/', section: 'Q&A' })).toBe('Acme Community');
    expect(destinationName({ kind: 'hn' })).toBe('Hacker News');
  });
});
