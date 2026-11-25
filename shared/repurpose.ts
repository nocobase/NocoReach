import { systemMessageText } from './i18n/messages.js';

/**
 * Content workshop (2026-11-13 user decision): an article or a new topic adapted into posts for other platforms. The
 * Agent writes them and a person reviews; approving completes the task. NocoReach posts nowhere and does not track what
 * is posted. Shared by the server (creating the tasks, the run input and the checks on a result) and the pages (the
 * workshop and the task's review and done cards).
 */

import type { CardStyleBrief } from './xhs-card.js';

/**
 * The places a Carousel goes (2026-11-24 user decision, formerly the Xiaohongshu note): each is a form of its own, so
 * each has its own playbook, card size, text and checks, and the workshop lists them together as Carousel, one task
 * per place, as it lists a community post's places. Xiaohongshu keeps the form id it had (`xhs`), so its earlier tasks,
 * records and demo data are Carousel › Xiaohongshu as they are.
 */
export const CAROUSEL_FORMS = [
  'xhs',
  'instagram',
  'linkedin-carousel',
] as const;
export type CarouselForm = (typeof CAROUSEL_FORMS)[number];
export const isCarouselForm = (value: unknown): value is CarouselForm =>
  (CAROUSEL_FORMS as readonly unknown[]).includes(value);
/** The places in the order the interface language lists them: Xiaohongshu first in Chinese, last in other languages. */
export const carouselOrder = (locale: string): CarouselForm[] =>
  /^zh/i.test(locale)
    ? ['xhs', 'instagram', 'linkedin-carousel']
    : ['instagram', 'linkedin-carousel', 'xhs'];

/** Every form, in the order the workshop shows them. */
export const REPURPOSE_FORMS = [
  'x',
  'linkedin',
  ...CAROUSEL_FORMS,
  'community',
] as const;
export type RepurposeForm = (typeof REPURPOSE_FORMS)[number];
/** The forms that can be chosen now: all of them since Xiaohongshu cards (2026-11-16, PR 2). */
export const READY_FORMS: readonly RepurposeForm[] = REPURPOSE_FORMS;
export const isRepurposeForm = (value: unknown): value is RepurposeForm =>
  typeof value === 'string' &&
  (REPURPOSE_FORMS as readonly string[]).includes(value);

/** The built-in playbook of each form; a copy keeps its form, which is what decides how its result is read. */
export const FORM_PLAYBOOK: Readonly<Record<RepurposeForm, string>> = {
  xhs: 'xhs-cards',
  instagram: 'instagram-carousel',
  'linkedin-carousel': 'linkedin-carousel',
  x: 'x-posts',
  linkedin: 'linkedin-post',
  community: 'community-post',
};
/** The playbook category the workshop's playbooks are listed under; New task does not offer it, as they need a source. */
export const REPURPOSE_CATEGORY = 'repurpose';
/** The result kind the Agent reports for each form (agent-result.ts). */
export const FORM_RESULT_KIND: Readonly<Record<RepurposeForm, string>> = {
  xhs: 'xhsCards',
  instagram: 'instagramCards',
  'linkedin-carousel': 'linkedinCards',
  x: 'xPosts',
  linkedin: 'linkedinPost',
  community: 'communityPost',
};
export const RESULT_KINDS = Object.values(FORM_RESULT_KIND);
/** The result kinds of a set of cards, which come with one uploaded image per card. */
export const CARD_RESULT_KINDS: readonly string[] = CAROUSEL_FORMS.map(
  (f) => FORM_RESULT_KIND[f],
);
/** The form a set of cards' result kind makes. */
export const cardFormOf = (resultKind: unknown): CarouselForm | undefined =>
  CAROUSEL_FORMS.find((f) => FORM_RESULT_KIND[f] === resultKind);

export type ArticleSource = {
  kind: 'article';
  url: string;
  title: string;
  /** The publishing target and article the body was read from, when a target has it. */
  targetId?: string;
  articleId?: string;
};
export type TopicSource = {
  kind: 'topic';
  topic: string;
  points?: string;
  links?: string[];
};
/**
 * A Trending now opportunity (2026-11-13): what is hot as the workshop's card says it, and what the Agent reads of it:
 * the opportunity's analysis, its discussions and the site's material with their links (`points`), the links again as
 * a list (`links`).
 */
export type OpportunitySource = {
  kind: 'opportunity';
  id: string;
  no?: number;
  headline: string;
  points?: string;
  links?: string[];
};
export type RepurposeSource = ArticleSource | TopicSource | OpportunitySource;

/** Where a community post goes: the project's own community (a section of it), a subreddit or Hacker News. */
export type Destination =
  | { kind: 'own'; name: string; url: string; section: string }
  | { kind: 'reddit'; subreddit: string; discussions?: number; weeks?: number }
  | { kind: 'hn' };

/** An earlier task of the same article or opportunity, whose draft (approved, or waiting for review) the Agent reads to take another angle. */
export type EarlierAdaptation = {
  taskId: string;
  no?: number;
  form: RepurposeForm;
  destination?: Destination;
  at: string;
};

/** What a workshop task is about, kept on its work (`evidence.work.repurpose`). */
export type Repurpose = {
  form: RepurposeForm;
  source: RepurposeSource;
  destination?: Destination;
  /** The angle asked for this time; the Agent picks one when there is none. */
  angle?: string;
  earlier?: EarlierAdaptation[];
};

export const ANGLE_MAX = 300;

export const TOPIC_MAX = 200;
export const POINTS_MAX = 3000;
export const LINKS_MAX = 5;
export const COMMUNITY_SECTIONS_MAX = 10;

/** The same subreddit however it was written (r/selfhosted, /r/SelfHosted, selfhosted). */
export function subredditName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value
    .trim()
    .replace(/^https?:\/\/(?:www\.|old\.)?reddit\.com/i, '')
    .replace(/^\/?r\//i, '')
    .replace(/\/.*$/, '');
  return /^[A-Za-z0-9][A-Za-z0-9_]{1,20}$/.test(name) ? name : null;
}

/** One destination's identity, so a form and destination are counted once. */
export function destinationKey(d?: Destination | null): string {
  if (!d) return '';
  if (d.kind === 'reddit') return `reddit:${d.subreddit.toLowerCase()}`;
  if (d.kind === 'own') return `own:${d.section.toLowerCase()}`;
  return 'hn';
}

/** A short name for a destination in lists ("Reddit r/selfhosted"); the own community by its name. */
export function destinationName(d: Destination): string {
  if (d.kind === 'reddit') return `Reddit r/${d.subreddit}`;
  if (d.kind === 'hn') return 'Hacker News';
  return d.name;
}

/** Where a community post goes, as lists name it: "Reddit r/selfhosted", "Forum · Tutorials". */
export const destinationLabel = (d: Destination) =>
  d.kind === 'own' ? `${d.name} · ${d.section}` : destinationName(d);

/** Where a community post's title stops: Reddit allows 300 characters, Hacker News 80, Discourse 255 by default. */
export const TITLE_LIMIT = { reddit: 300, hn: 80, own: 255 } as const;
export const X_LIMIT = 280;
export const LINKEDIN_LIMIT = 1300;
/** A community post's body is written out: this much text besides links. */
export const BODY_MIN = 200;

/**
 * A post's length as X counts it (twitter-text, version 3): a link is 23, letters and punctuation of Latin and other
 * scripts up to U+10FF are 1, and everything else, CJK and emoji included, 2.
 */
export function xLength(text: string): number {
  let n = 0;
  const withoutLinks = text.replace(/https?:\/\/\S+/g, () => {
    n += 23;
    return '';
  });
  for (const ch of withoutLinks) {
    const c = ch.codePointAt(0) || 0;
    n +=
      c <= 0x10ff ||
      (c >= 0x2000 && c <= 0x200d) ||
      (c >= 0x2010 && c <= 0x201f) ||
      (c >= 0x2032 && c <= 0x2037)
        ? 1
        : 2;
  }
  return n;
}
/** Characters as a person counts them (code points). */
export const charLength = (text: string) => [...text].length;

/**
 * Xiaohongshu image cards (2026-11-16, Content workshop PR 2): 6 to 18 cards of 1080×1440, at most 110 characters on
 * a card, a cover title of at most 20, at most 3 colors and body text of at least 36px; the note's own title and body
 * stop where Xiaohongshu stops them (20 and 1,000 characters). The limits on a card's text are every place's (CARD).
 */
export const XHS = {
  minCards: 6,
  maxCards: 18,
  cardChars: 110,
  coverTitle: 20,
  colors: 3,
  width: 1080,
  height: 1440,
  bodyPx: 36,
  noteTitle: 20,
  noteBody: 1000,
} as const;
/** A card image's size in pixels. */
export type CardSize = { width: number; height: number };

/**
 * What a card holds wherever it goes (2026-11-24): text in Chinese, Japanese or Korean is counted in characters, 110 on
 * a card and 20 in the cover's title, as Xiaohongshu's always were; other text in words, 40 and 8. The word limits come
 * from setting English in the four built-in styles at 3:4 and 4:5: at 40 words every style still sets the body at 40px
 * or more without overflowing, the least a full Chinese card gets; from about 44 words a list drops to 36px. Whether
 * a card's text fits is still decided by the overflow measured when the cards are drawn.
 */
export const CARD = {
  cardChars: XHS.cardChars,
  coverTitle: XHS.coverTitle,
  cardWords: 40,
  coverWords: 8,
  colors: XHS.colors,
} as const;

/**
 * What a card style's full cards are filled with when the cards it is previewed with are in the other script: a style
 * is checked with a full Chinese card and a full English one (2026-11-24), whatever the project writes in.
 */
export const FULL_CARD_SAMPLE = {
  chars: {
    heading: '第一步：先写结果',
    text: '第一句写这周有什么变化。读的人几秒内就决定看不看下去，所以先放数字，再讲原因。',
  },
  words: {
    heading: 'Step 1: lead with the result',
    text: 'Say what changed this week in one sentence. Readers decide within seconds whether to read on, so put the number first and the reason after it.',
  },
} as const;

/** Each place's card size and number of cards (2026-11-24 user decision): Instagram allows 20, a LinkedIn PDF 18 pages here. */
export const CARD_SPECS: Readonly<
  Record<
    CarouselForm,
    CardSize & { ratio: '3:4' | '4:5'; minCards: number; maxCards: number }
  >
> = {
  xhs: { ratio: '3:4', width: 1080, height: 1440, minCards: 6, maxCards: 18 },
  instagram: {
    ratio: '4:5',
    width: 1080,
    height: 1350,
    minCards: 6,
    maxCards: 20,
  },
  'linkedin-carousel': {
    ratio: '4:5',
    width: 1080,
    height: 1350,
    minCards: 6,
    maxCards: 18,
  },
};
/** The card sizes NocoReach takes, 3:4 and 4:5. */
export const CARD_SIZES: readonly CardSize[] = [
  { width: 1080, height: 1440 },
  { width: 1080, height: 1350 },
];
export const isCardSize = (size: { width?: number; height?: number } | null) =>
  Boolean(
    size &&
    CARD_SIZES.some((c) => c.width === size.width && c.height === size.height),
  );
/** A card size's ratio: 4:5 when it is shorter than 3:4. */
export const ratioOf = (height: number): '3:4' | '4:5' =>
  height < 1440 ? '4:5' : '3:4';
/** The card size of a place, or Xiaohongshu's for a form without cards. */
export const cardSizeOf = (form?: unknown): CardSize => {
  const spec = isCarouselForm(form) ? CARD_SPECS[form] : CARD_SPECS.xhs;
  return { width: spec.width, height: spec.height };
};

/**
 * An Instagram carousel's caption and hashtags: the caption at most 2,200 characters, its first 125 shown before
 * "more", at most 5 hashtags (Instagram's limit since December 2025), and no link, as a caption's links cannot be opened.
 */
export const INSTAGRAM = {
  caption: 2200,
  captionFold: 125,
  hashtags: 5,
} as const;
/** A LinkedIn document's title (LinkedIn stops it at 58 characters) and the post it goes with, as a LinkedIn post's. */
export const LINKEDIN_DOC = { title: 58, post: 1300 } as const;
/** A card's layout: the cover, a card of text, or the brand kit's closing page. */
export type CardLayout = 'cover' | 'text' | 'end';
/** The characters on a card as its reader counts them: heading and text, without spaces and line breaks. */
export const cardChars = (card: { heading?: string; text: string }) =>
  charLength(`${card.heading || ''}${card.text}`.replace(/\s+/g, ''));
/** A cover's title: its heading, else the first line of its text. */
export const coverTitle = (card: { heading?: string; text: string }) =>
  (card.heading || card.text.split('\n')[0] || '').trim();

const CJK =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
/** Words as a reader counts them: the runs between spaces that hold a letter or a digit ("41%", "follow-up" are one). */
export const wordCount = (text: string) =>
  text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
/** How a set's text is counted: in characters when written mostly in Chinese, Japanese or Korean, else in words. */
export type CardUnit = 'chars' | 'words';
export function cardUnit(
  cards: readonly { heading?: string; text: string }[],
): CardUnit {
  const all = cards.map((c) => `${c.heading || ''} ${c.text}`).join(' ');
  const cjk = all.match(CJK)?.length || 0;
  return cjk >= wordCount(all.replace(CJK, ' ')) ? 'chars' : 'words';
}
/** A card's length in its set's unit: its heading and text together. */
export const cardLength = (
  card: { heading?: string; text: string },
  unit: CardUnit,
) =>
  unit === 'words'
    ? wordCount(`${card.heading || ''} ${card.text}`)
    : cardChars(card);
/** A cover title's length in the set's unit. */
export const coverLength = (
  card: { heading?: string; text: string },
  unit: CardUnit,
) =>
  unit === 'words' ? wordCount(coverTitle(card)) : charLength(coverTitle(card));
/** The most a card, and a cover title, may hold in a unit. */
export const cardMax = (unit: CardUnit) =>
  unit === 'words' ? CARD.cardWords : CARD.cardChars;
export const coverMax = (unit: CardUnit) =>
  unit === 'words' ? CARD.coverWords : CARD.coverTitle;

/** The hashtags of an Instagram result's Hashtags, each once, as written ("#projectmanagement"). */
export const hashtagsOf = (text: string) => [
  ...new Set(text.match(/#[\p{L}\p{N}_]+/gu) || []),
];
/** Whether a caption holds a link: an address, a www. host or a bare domain such as acme.com/blog. */
export const hasLink = (text: string) =>
  /https?:\/\/|\bwww\.|\b[\w-]+\.(?:com|net|org|io|ai|co|dev|app|cn|so|me)\b/i.test(
    text,
  );
/** An Instagram caption's first line: what shows before "more", when it is within the fold. */
export const captionOpening = (caption: string) =>
  caption.trim().split('\n')[0] || '';

/** The source section numbers a `Sections:` label names ("1–3, 5" is 1, 2, 3 and 5); ranges stop at 200. */
export function sectionNumbers(label?: string): number[] {
  const out = new Set<number>();
  for (const part of String(label || '').split(/[,，、]/)) {
    const m = /^\s*(\d+)\s*(?:[-–—]\s*(\d+))?\s*$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]),
      b = m[2] ? Number(m[2]) : a;
    for (let n = Math.min(a, b); n <= Math.min(Math.max(a, b), 200); n++)
      if (n > 0) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}

/**
 * The sections of a source the cards are checked against, numbered from 1 as the Agent is given them: an article's
 * second-level headings (third-level when it has fewer than two), or a topic's key points, one per line. Fewer than two
 * is no sections, and the check that all are used is left out.
 */
export function sourceSections(source: {
  body?: string;
  points?: string;
}): string[] {
  if (source.body) {
    const text = source.body
      .replace(/\r\n/g, '\n')
      .replace(/```[\s\S]*?```/g, '');
    for (const level of ['##', '###']) {
      const found = [
        ...text.matchAll(new RegExp(`^${level}\\s+(.+?)\\s*#*\\s*$`, 'gm')),
      ].map((m) => m[1].replace(/[*_`]/g, '').trim());
      if (found.length >= 2) return found.slice(0, 60);
    }
    return [];
  }
  const points = String(source.points || '')
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, '').trim())
    .filter(Boolean);
  return points.length >= 2 ? points.slice(0, 60) : [];
}

/**
 * What NocoReach keeps of a set of cards besides its text (`Artifact.cards`): the images in card order, how many
 * sections the source had (none when they were not known), the colors it counted on the images, and the cards whose
 * text the Agent found overflowing when it rendered them (none when it did not report).
 */
export type CardSet = {
  images: { id: string; ref: string; name: string }[];
  /** The images' ratio (kept since 2026-11-24; a set without it is Xiaohongshu's 3:4). */
  ratio?: '3:4' | '4:5';
  sections?: number;
  colors?: string[];
  overflow?: number[];
  /** The style the images were drawn in (the run's, without the logo's bytes), which Edit directly draws them in again. */
  style?: CardStyleBrief;
  /** A version a person saved with Edit directly: the cards whose text they changed. */
  edited?: number[];
};

export type Piece = {
  /**
   * `post` (X has three, numbered from 1), `reply`, `title`, `body`, a carousel's `card` (numbered from 1), or an
   * Instagram carousel's hashtags (`tags`). A carousel's title and body are Xiaohongshu's note title and body, an
   * Instagram caption (body only) or a LinkedIn document's title and the post's text.
   */
  kind: 'post' | 'reply' | 'title' | 'body' | 'card' | 'tags';
  index?: number;
  text: string;
  /** The source's sections the piece comes from, as the Agent wrote them ("1-4"). */
  sections?: string;
  /** A card's own heading, written as its first "# " line. */
  heading?: string;
  /** A card's layout: the first is the cover, a brand kit's closing page is `end`, the rest `text`. */
  layout?: CardLayout;
};
export type RepurposeResult = { pieces: Piece[]; rules: string[] };

// The markers the result is written with. The playbook instruction names them in English in every language, so they stay
// the same when the instruction is translated; the Chinese ones are read too.
const HEADINGS: [RegExp, Piece['kind'] | 'rules'][] = [
  [/^(?:card|page|卡片)\s*(\d+)?$/i, 'card'],
  [/^(?:post|帖子|正文帖)\s*(\d+)?$/i, 'post'],
  [/^(?:reply|first reply|回复|第一条回复)$/i, 'reply'],
  [/^(?:title|document title|note title|标题|文档标题|笔记标题)$/i, 'title'],
  [/^(?:body|caption|post text|正文|配文|帖子正文|笔记正文)$/i, 'body'],
  [/^(?:hashtags?|tags|话题标签)$/i, 'tags'],
  [/^(?:rules|版规|规矩)$/i, 'rules'],
];
const SECTIONS =
  /^\s*(?:sections?|出自)\s*[:：]\s*(?:第\s*)?([0-9][0-9\s,，、–—-]*)\s*(?:节)?\s*$/i;
const LAYOUT = /^\s*(?:layout|版式)\s*[:：]\s*(cover|text|end)\s*$/i;

/** The pieces of a result written in the workshop's format, or null when it does not follow it. */
export function parseRepurpose(
  form: RepurposeForm,
  content: string,
): RepurposeResult | null {
  const pieces: Piece[] = [],
    rules: string[] = [];
  for (const block of String(content || '')
    .replace(/\r\n/g, '\n')
    .split(/^##\s+(?!#)/m)
    .slice(1)) {
    const [head, ...rest] = block.split('\n');
    const heading = head.trim().replace(/[*_`]/g, '');
    const match = HEADINGS.map(
      ([re, kind]) => [re.exec(heading), kind] as const,
    ).find(([m]) => m);
    if (!match) continue;
    const [m, kind] = match;
    let lines = rest;
    if (kind === 'rules') {
      for (const line of lines) {
        const item = /^\s*(?:[-*]|\d+[.)])\s+(.+)$/.exec(line);
        if (item && !/^(none|无|没有)$/i.test(item[1].trim()))
          rules.push(item[1].trim());
      }
      continue;
    }
    let sections: string | undefined, layout: CardLayout | undefined;
    // The labels before the text, in any order: Sections, and on a card its Layout.
    for (;;) {
      const first = lines.findIndex((l) => l.trim());
      const s = first >= 0 ? SECTIONS.exec(lines[first]) : null;
      const l =
        first >= 0 && kind === 'card' ? LAYOUT.exec(lines[first]) : null;
      if (s && !sections)
        sections = s[1]
          .trim()
          .replace(/\s*[-–—]\s*/g, '–')
          .replace(/\s*[,，、]\s*/g, ', ');
      else if (l && !layout) layout = l[1].toLowerCase() as CardLayout;
      else break;
      lines = lines.filter((_, i) => i !== first);
    }
    let title: string | undefined;
    if (kind === 'card') {
      const first = lines.findIndex((l) => l.trim());
      const h = first >= 0 ? /^\s*#\s+(.+)$/.exec(lines[first]) : null;
      if (h) {
        title = h[1].trim();
        lines = lines.filter((_, i) => i !== first);
      }
    }
    const text = lines.join('\n').trim();
    if (!text && !title) continue;
    const index =
      (kind === 'post' || kind === 'card') && m![1] ? Number(m![1]) : undefined;
    pieces.push({
      kind,
      text,
      ...(index ? { index } : {}),
      ...(sections ? { sections } : {}),
      ...(title ? { heading: title } : {}),
      ...(layout ? { layout } : {}),
    });
  }
  const has = (kind: Piece['kind']) => pieces.some((p) => p.kind === kind);
  if (form === 'x' && !has('post')) return null;
  if (form === 'linkedin' && !has('post')) return null;
  if (form === 'community' && !(has('title') && has('body'))) return null;
  if (isCarouselForm(form)) {
    if (!has('card')) return null;
    // Cards in their order, numbered from 1 whatever the Agent wrote; the first is the cover.
    const cards = pieces.filter((p) => p.kind === 'card');
    cards.forEach((c, i) => {
      c.index = i + 1;
      c.layout = i === 0 ? 'cover' : c.layout === 'end' ? 'end' : 'text';
    });
    return {
      pieces: [...pieces.filter((p) => p.kind !== 'card'), ...cards],
      rules,
    };
  }
  // X posts are numbered in their order when the Agent left the numbers out.
  let n = 0;
  for (const p of pieces) if (p.kind === 'post') p.index = p.index || ++n;
  return { pieces, rules };
}

/**
 * A set of cards written back in the workshop's format from its pieces, as Edit directly saves it: the title, body and
 * hashtags that go with it, then every card with its labels, its heading and its text.
 */
export function writeCards(pieces: readonly Piece[]): string {
  const out: string[] = [];
  const labels = (p: Piece) => [
    ...(p.sections ? [`Sections: ${p.sections}`] : []),
    ...(p.kind === 'card' && p.layout === 'end' ? ['Layout: end'] : []),
  ];
  const MARKER = { title: '## Title', body: '## Body', tags: '## Hashtags' };
  for (const kind of ['title', 'body', 'tags'] as const)
    for (const p of pieces.filter((x) => x.kind === kind))
      out.push(MARKER[kind], ...labels(p), p.text.trim());
  pieces
    .filter((p) => p.kind === 'card')
    .forEach((p, i) =>
      out.push(
        `## Card ${i + 1}`,
        ...labels(p),
        ...(p.heading?.trim() ? [`# ${p.heading.trim()}`] : []),
        // A line of text starting with # would read as a heading, or end the card.
        p.text.trim().replace(/^[ \t]*#+[ \t]*/gm, ''),
      ),
    );
  return out.filter((line, i) => line || out[i - 1] !== '').join('\n');
}

/** The card a reviewer edits first, from 1: the first over the length limit or overflowing, else the cover. */
export function cardToEdit(
  content: string,
  overflow: readonly number[] = [],
): number {
  const cards = (parseRepurpose('xhs', content)?.pieces || []).filter(
    (p) => p.kind === 'card',
  );
  const unit = cardUnit(cards);
  const i = cards.findIndex(
    (c, k) => cardLength(c, unit) > cardMax(unit) || overflow.includes(k + 1),
  );
  return i < 0 ? 1 : i + 1;
}

/** What a piece may hold: the number counted and the most allowed, or nothing for a piece without a limit. */
export function pieceLimit(
  form: RepurposeForm,
  piece: Piece,
  destination?: Destination,
): { length: number; max: number } | null {
  if (form === 'x' && (piece.kind === 'post' || piece.kind === 'reply'))
    return { length: xLength(piece.text), max: X_LIMIT };
  if (form === 'linkedin' && piece.kind === 'post')
    return { length: charLength(piece.text), max: LINKEDIN_LIMIT };
  if (form === 'community' && piece.kind === 'title')
    return {
      length: charLength(piece.text),
      max: TITLE_LIMIT[destination?.kind || 'own'],
    };
  if (form === 'xhs' && piece.kind === 'title')
    return { length: charLength(piece.text), max: XHS.noteTitle };
  if (form === 'xhs' && piece.kind === 'body')
    return { length: charLength(piece.text), max: XHS.noteBody };
  if (form === 'instagram' && piece.kind === 'body')
    return { length: charLength(piece.text), max: INSTAGRAM.caption };
  if (form === 'instagram' && piece.kind === 'tags')
    return { length: hashtagsOf(piece.text).length, max: INSTAGRAM.hashtags };
  if (form === 'linkedin-carousel' && piece.kind === 'title')
    return { length: charLength(piece.text), max: LINKEDIN_DOC.title };
  if (form === 'linkedin-carousel' && piece.kind === 'body')
    return { length: charLength(piece.text), max: LINKEDIN_DOC.post };
  return null;
}

/**
 * One automatic check of a result, worked out by NocoReach from the result's text and never taken from the Agent's own
 * report. `key` names the check's sentence (`workshop.check.*`), `params` fill it.
 */
export type RepurposeCheck = {
  key: string;
  ok: boolean;
  params?: Record<string, string | number>;
};

const plainText = (markdown: string) =>
  markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[#>*_`~-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const FIRST_PERSON =
  /(?:\b(?:i|i'm|i've|i am|we|we're|we've|our|my|disclosure)\b|我|我们|作者|披露)/i;

/**
 * The checks shown on the review card: X's posts by length; a community post's body is written out rather than a link,
 * opens by saying who is posting (the brand named in its first paragraph by someone speaking for it), and its title fits
 * the platform. The rules the Agent read are counted from its list. A LinkedIn post has none: its one length is in the
 * post's own heading (pieceLimit).
 */
export function repurposeChecks(
  form: RepurposeForm,
  result: RepurposeResult,
  {
    destination,
    brand,
    cards,
  }: { destination?: Destination; brand?: string; cards?: CardSet } = {},
): RepurposeCheck[] {
  if (isCarouselForm(form)) return cardChecks(form, result, cards);
  const posts = result.pieces.filter(
    (p) => p.kind === 'post' || p.kind === 'reply',
  );
  if (form === 'x') {
    const over = posts.filter((p) => xLength(p.text) > X_LIMIT);
    return [
      over.length
        ? {
            key: 'workshop.check.xOver',
            ok: false,
            params: {
              0: over
                .map((p) => (p.kind === 'reply' ? 'reply' : String(p.index)))
                .join(', '),
              1: X_LIMIT,
            },
          }
        : { key: 'workshop.check.xWithin', ok: true, params: { 0: X_LIMIT } },
    ];
  }
  if (form !== 'community') return [];
  const body = result.pieces.find((p) => p.kind === 'body')?.text || '',
    title = result.pieces.find((p) => p.kind === 'title')?.text || '';
  const opening = plainText(body.split(/\n\s*\n/)[0] || '').slice(0, 400);
  const named = brand?.trim()
    ? opening.toLowerCase().includes(brand.trim().toLowerCase())
    : true;
  const limit = TITLE_LIMIT[destination?.kind || 'own'];
  const checks: RepurposeCheck[] = [
    {
      key: 'workshop.check.bodyComplete',
      ok: charLength(plainText(body)) >= BODY_MIN,
    },
    brand?.trim()
      ? {
          key: 'workshop.check.identityBrand',
          ok: named && FIRST_PERSON.test(opening),
          params: { 0: brand.trim() },
        }
      : {
          key: 'workshop.check.identity',
          ok: FIRST_PERSON.test(opening),
        },
    charLength(title) > limit
      ? { key: 'workshop.check.titleOver', ok: false, params: { 0: limit } }
      : { key: 'workshop.check.titleWithin', ok: true, params: { 0: limit } },
  ];
  if (result.rules.length && destination)
    checks.push({
      key: 'workshop.check.rulesRead',
      ok: true,
      params: { 0: destinationName(destination), 1: result.rules.length },
    });
  return checks;
}

/**
 * A set of cards' checks, in the order the review card lists them: every source section used, the cover title, the
 * number of cards (a LinkedIn document's pages), the colors counted on the images, images of another place's size,
 * overflowing text as the Agent reported it, and the cards over the length limit, each by its number; then the place's
 * own: an Instagram caption's hashtags and links, a LinkedIn document's title and post. Lengths on cards are counted in
 * characters or words by the set's text (cardUnit).
 */
function cardChecks(
  form: CarouselForm,
  result: RepurposeResult,
  set?: CardSet,
): RepurposeCheck[] {
  const spec = CARD_SPECS[form];
  const cards = result.pieces.filter((p) => p.kind === 'card');
  const unit = cardUnit(cards),
    words = unit === 'words' ? 'Words' : '';
  const checks: RepurposeCheck[] = [];
  if (set?.sections) {
    const used = new Set(cards.flatMap((c) => sectionNumbers(c.sections)));
    const missing: number[] = [];
    for (let n = 1; n <= set.sections; n++) if (!used.has(n)) missing.push(n);
    checks.push(
      missing.length
        ? {
            key: 'workshop.check.sectionsMissing',
            ok: false,
            params: { 0: missing.join(', '), 1: set.sections },
          }
        : {
            key: 'workshop.check.sectionsAll',
            ok: true,
            params: { 0: set.sections },
          },
    );
  }
  const cover = cards[0] ? coverLength(cards[0], unit) : 0,
    coverOk = cover <= coverMax(unit);
  checks.push({
    key: `workshop.check.cover${coverOk ? 'Within' : 'Over'}${words}`,
    ok: coverOk,
    params: { 0: cover, 1: coverMax(unit) },
  });
  const count = cards.length,
    countOk = count >= spec.minCards && count <= spec.maxCards,
    pages = form === 'linkedin-carousel' ? 'pages' : 'cards';
  checks.push({
    key: `workshop.check.${pages}${countOk ? 'Within' : 'Out'}`,
    ok: countOk,
    params: { 0: count, 1: spec.minCards, 2: spec.maxCards },
  });
  if (set?.colors?.length)
    checks.push({
      key:
        set.colors.length > CARD.colors
          ? 'workshop.check.colorsOver'
          : 'workshop.check.colorsWithin',
      ok: set.colors.length <= CARD.colors,
      params: { 0: set.colors.length, 1: CARD.colors },
    });
  // A Skill that cannot draw this place's size uploads its own (2026-11-24): the review says so.
  if ((set?.ratio || (set ? '3:4' : spec.ratio)) !== spec.ratio)
    checks.push({
      key: 'workshop.check.ratioOther',
      ok: false,
      params: { 0: set?.ratio || '3:4', 1: spec.ratio },
    });
  if (set?.overflow)
    checks.push(
      set.overflow.length
        ? {
            key: 'workshop.check.overflow',
            ok: false,
            params: { 0: set.overflow.join(', ') },
          }
        : { key: 'workshop.check.noOverflow', ok: true },
    );
  const max = cardMax(unit),
    over = cards.filter((c) => cardLength(c, unit) > max);
  if (!over.length)
    checks.push({
      key: `workshop.check.card${words || 'Chars'}Within`,
      ok: true,
      params: { 0: max },
    });
  for (const c of over)
    checks.push({
      key: `workshop.check.card${words || 'Chars'}Over`,
      ok: false,
      params: { 0: c.index || 0, 1: cardLength(c, unit), 2: max },
    });
  const piece = (kind: Piece['kind']) =>
    result.pieces.find((p) => p.kind === kind)?.text || '';
  if (form === 'instagram') {
    const tags = hashtagsOf(piece('tags')).length,
      tagsOk = tags <= INSTAGRAM.hashtags;
    checks.push(
      {
        key: tagsOk
          ? 'workshop.check.hashtagsWithin'
          : 'workshop.check.hashtagsOver',
        ok: tagsOk,
        params: { 0: tags, 1: INSTAGRAM.hashtags },
      },
      hasLink(piece('body'))
        ? { key: 'workshop.check.captionLink', ok: false }
        : { key: 'workshop.check.captionNoLink', ok: true },
    );
  }
  if (form === 'linkedin-carousel')
    for (const [kind, key, most] of [
      ['title', 'docTitle', LINKEDIN_DOC.title],
      ['body', 'postText', LINKEDIN_DOC.post],
    ] as const) {
      const length = charLength(piece(kind));
      checks.push({
        key: `workshop.check.${key}${length <= most ? 'Within' : 'Over'}`,
        ok: length <= most,
        params: { 0: length, 1: most },
      });
    }
  return checks;
}

/** The task title's subject: the article's title, the topic, or what is hot. */
export const sourceSubject = (s: RepurposeSource) =>
  s.kind === 'article'
    ? s.title
    : s.kind === 'opportunity'
      ? s.headline
      : s.topic;

/** An article's title as its page gives it, without the site's name after a separator ("Title | Acme"). */
export function articleTitle(page: { url: string; title?: string }): string {
  const t = String(page.title || '')
    .trim()
    .replace(/\s+[|·–—-]\s+[^|·–—-]{1,40}$/, '')
    .trim();
  if (t) return t.slice(0, 300);
  try {
    return decodeURIComponent(
      new URL(page.url).pathname.split('/').filter(Boolean).at(-1) || page.url,
    ).replace(/[-_]+/g, ' ');
  } catch {
    return page.url;
  }
}

/**
 * Whether a page Website content lists as `blog` lists articles rather than being one. A page is `blog` by the first
 * path segment after any locale prefix (server/nocoreach/site-content.ts classify), so these are: the section itself
 * ("/blog", "/en/changelog/", the home of a blog.* host); its later pages ("/changelog/page/3/", "/blog?page=2"); and
 * its tag, category, author and archive pages ("/cn/blog/tags/customer-stories/page/4"). Only meaningful for `blog`
 * pages: elsewhere a one-segment path can be an article.
 */
const LISTINGS = new Set([
  'tag',
  'tags',
  'category',
  'categories',
  'author',
  'authors',
  'archive',
  'archives',
]);
export function isBlogListing(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const parts = u.pathname
    .split('/')
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  const rest = /^[a-z]{2}(-[a-z0-9]{2,4})?$/.test(parts[0] || '')
    ? parts.slice(1)
    : parts;
  // On a blog.* host the articles start at the first segment; elsewhere after the section's (blog, news, changelog).
  const first = /^blog\./.test(u.hostname) ? 0 : 1;
  return (
    rest.length <= first ||
    LISTINGS.has(rest[first]) ||
    rest.some((p, i) => p === 'page' && /^\d+$/.test(rest[i + 1] || '')) ||
    /^\d+$/.test(u.searchParams.get('page') || '')
  );
}

/** A blog article Content workshop lists and adapts: a `blog` page that is not noindex and lists no articles. */
export const isBlogArticle = (p: {
  url?: unknown;
  type?: unknown;
  noindex?: unknown;
}) => p?.type === 'blog' && !p.noindex && !isBlogListing(String(p.url || ''));

/**
 * A workshop task's brief, in the language it is created in: the article, topic or trending opportunity and what this
 * task makes of it ("Adapt the article “X” into a community post for Reddit r/selfhosted. Source: URL"), then a topic's
 * or an opportunity's points and links, the angle asked for, and the earlier adaptations to differ from.
 */
export function repurposeBrief(r: Repurpose, locale?: string): string {
  const text = (key: string, params: Record<string, string> = {}) =>
    systemMessageText(key, params, locale);
  const into =
    r.form === 'x'
      ? text('workshop.briefX')
      : r.form === 'linkedin'
        ? text('workshop.briefLinkedin')
        : r.form === 'community' && r.destination
          ? text('workshop.briefCommunity', {
              0: destinationLabel(r.destination),
            })
          : isCarouselForm(r.form)
            ? text(`workshop.brief${FORM_KEY[r.form]}`)
            : text('workshop.formCommunity');
  const s = r.source;
  const lead =
    s.kind === 'article'
      ? [text('workshop.articleBrief', { 0: s.title, 1: into, 2: s.url })]
      : s.kind === 'opportunity'
        ? [
            text('workshop.hotBrief', {
              0: s.headline,
              1: into,
              2: s.no ? `O-${s.no}` : '',
            }),
            s.points,
          ]
        : [
            text('workshop.topicBrief', { 0: s.topic, 1: into }),
            s.points,
            ...(s.links || []),
          ];
  const earlier = (r.earlier || [])
    .map((e) =>
      [
        e.form === 'community' && e.destination
          ? text('workshop.communityPostAt', {
              0: destinationName(e.destination),
            })
          : text(`workshop.form${FORM_KEY[e.form]}`),
        [e.no ? `T-${e.no}` : '', e.at.slice(0, 10)].filter(Boolean).join(', '),
      ].join(' '),
    )
    .join('; ');
  return [
    ...lead,
    r.angle ? text('workshop.angleBrief', { 0: r.angle }) : '',
    earlier ? text('workshop.againBrief', { 0: earlier }) : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
/** A form's part of its i18n keys: `workshop.form<Key>`, `workshop.brief<Key>` for a carousel's place. */
export const FORM_KEY: Record<RepurposeForm, string> = {
  xhs: 'Xhs',
  instagram: 'Instagram',
  'linkedin-carousel': 'LinkedinCarousel',
  x: 'X',
  linkedin: 'Linkedin',
  community: 'Community',
};
