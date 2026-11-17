import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WechatArticle } from '../../client/pages/workshop/wechat-article.js';
import {
  DEFAULT_WECHAT_LAYOUT,
  WECHAT_TITLE_BYTES,
  absoluteUrl,
  cleanWechatLayout,
  isWechatLink,
  paleColor,
  readableColor,
  styleObject,
  titleBytes,
} from '../../shared/wechat-layout.js';

// Content workshop PR 3: What to make › WeChat layout lays an article's Markdown body out with inline styles for the
// WeChat editor, which keeps inline styles only and cannot open links to other sites.

const draw = (body: string, pageUrl = 'https://acme.example/blog/notes') =>
  renderToStaticMarkup(
    <WechatArticle
      body={body}
      layout={DEFAULT_WECHAT_LAYOUT}
      color='#1e3a8a'
      pageUrl={pageUrl}
      referencesTitle='References'
    />,
  );

const contrast = (hex: string) => {
  const l = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 1.05 / (0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] + 0.05);
};

describe('WeChat layout settings', () => {
  it('keeps a font size and line height only from the choices, else the defaults', () => {
    expect(cleanWechatLayout(undefined)).toEqual({
      fontSize: 15,
      lineHeight: 1.85,
    });
    expect(cleanWechatLayout({ fontSize: 17, lineHeight: 2 })).toEqual({
      fontSize: 17,
      lineHeight: 2,
    });
    expect(cleanWechatLayout({ fontSize: 40, lineHeight: '2' })).toEqual(
      DEFAULT_WECHAT_LAYOUT,
    );
  });

  it('counts a title in UTF-8 bytes against the 64-byte limit', () => {
    expect(WECHAT_TITLE_BYTES).toBe(64);
    expect(titleBytes('Acme')).toBe(4);
    expect(titleBytes('用 AI 把会议纪要整理成任务')).toBe(37);
    expect(titleBytes('项'.repeat(22))).toBeGreaterThan(WECHAT_TITLE_BYTES);
  });

  it('darkens a light brand color until it reads as text on white, and keeps a dark one', () => {
    expect(readableColor('#1e3a8a')).toBe('#1e3a8a');
    const yellow = readableColor('#facc15');
    expect(yellow).not.toBe('#facc15');
    expect(contrast(yellow)).toBeGreaterThanOrEqual(4.5);
    expect(paleColor('#000000', 0.9)).toBe('#e6e6e6');
  });

  it('resolves addresses against the page and keeps only http(s)', () => {
    expect(
      absoluteUrl('/blog/kickoff', 'https://acme.example/blog/notes'),
    ).toBe('https://acme.example/blog/kickoff');
    expect(absoluteUrl('javascript:alert(1)')).toBeNull();
    expect(absoluteUrl('mailto:a@acme.example')).toBeNull();
    expect(isWechatLink('https://mp.weixin.qq.com/s/abc')).toBe(true);
    expect(isWechatLink('https://acme.example/')).toBe(false);
    expect(styleObject('font-size:15px;line-height:1.85')).toEqual({
      fontSize: '15px',
      lineHeight: '1.85',
    });
  });
});

describe('WeChat layout of an article', () => {
  it('drops the leading title, and writes every element with an inline style and no class', () => {
    const html = draw(
      [
        '# Title',
        '',
        'Intro with **bold**, *italic* and `code`.',
        '',
        '## Section',
        '',
        '### Sub',
        '',
        '- one',
        '- two',
        '',
        '1. first',
        '',
        '> quoted',
        '',
        '| a | b |',
        '| --- | --- |',
        '| 1 | 2 |',
        '',
        '---',
      ].join('\n'),
    );
    expect(html).not.toContain('>Title<');
    expect(html).not.toContain('class=');
    for (const tag of [
      'section',
      'p',
      'h2',
      'h3',
      'strong',
      'em',
      'code',
      'ul',
      'ol',
      'li',
      'blockquote',
      'table',
      'th',
      'td',
      'hr',
    ])
      expect(html).toMatch(new RegExp(`<${tag} style="[^"]+"`));
    expect(html).toContain('font-size:15px');
    expect(html).toContain('line-height:1.85');
    // Headings and bold text in the brand color.
    expect(html).toMatch(/<h2 style="[^"]*color:#1e3a8a/);
  });

  it('turns links to other sites into numbered references listed at the end, and keeps links to WeChat articles', () => {
    const html = draw(
      [
        'See [the template](https://acme.example/templates/notes), [a kickoff](/blog/kickoff) and [the template again](https://acme.example/templates/notes).',
        '',
        'Also [a WeChat article](https://mp.weixin.qq.com/s/abc) and [a script](javascript:alert(1)).',
      ].join('\n'),
    );
    expect(html).toContain('the template<sup');
    expect(html).toMatch(/the template<sup style="[^"]+">\[1\]<\/sup>/);
    expect(html).toMatch(/a kickoff<sup style="[^"]+">\[2\]<\/sup>/);
    expect(html).toMatch(/the template again<sup style="[^"]+">\[1\]<\/sup>/);
    expect(html).toContain(
      '[1] the template: https://acme.example/templates/notes',
    );
    expect(html).toContain('[2] a kickoff: https://acme.example/blog/kickoff');
    expect(html).not.toContain('[3]');
    expect(html).toMatch(/>References</);
    expect(html).toMatch(
      /<a href="https:\/\/mp\.weixin\.qq\.com\/s\/abc" style="[^"]+">a WeChat article<\/a>/,
    );
    expect(html).toContain('a script');
    expect(html).not.toContain('javascript:');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it('writes a code block as lines with breaks and fixed spaces, and keeps images with an absolute address', () => {
    const html = draw(
      [
        '```js',
        'if (a) {',
        '  run();',
        '}',
        '```',
        '',
        '![Board](/images/board.png)',
      ].join('\n'),
    );
    expect(html).toMatch(
      /<pre style="[^"]+">if \(a\) \{<br\/>\u00a0\u00a0run\(\);<br\/>\}<\/pre>/,
    );
    expect(html).toMatch(
      /<img src="https:\/\/acme\.example\/images\/board\.png" alt="Board" style="[^"]+"\/>/,
    );
  });

  it("draws a task list's boxes as characters, as the editor drops form controls", () => {
    const html = draw('- [x] Done\n- [ ] Open');
    expect(html).not.toContain('<input');
    expect(html).toContain('☑ Done');
    expect(html).toContain('☐ Open');
  });

  it('leaves raw HTML in the Markdown out', () => {
    const html = draw(
      'Before\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\nAfter',
    );
    expect(html).not.toContain('script');
    expect(html).not.toContain('onerror');
    expect(html).toContain('Before');
    expect(html).toContain('After');
  });
});
