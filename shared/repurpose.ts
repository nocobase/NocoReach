import { systemMessageText } from './i18n/messages.js';

/**
 * Content workshop (2026-11-13 user decision): an article or a new topic adapted into posts for other platforms. The
 * Agent writes them and a person reviews; approving completes the task. NocoReach posts nowhere and does not track what
 * is posted. Shared by the server (creating the tasks, the run input and the checks on a result) and the pages (the
 * workshop and the task's review and done cards).
 */

/** Every form, in the order the workshop shows them. Xiaohongshu cards come with the next step of the work. */
export const REPURPOSE_FORMS = ['xhs', 'x', 'linkedin', 'community'] as const;
export type RepurposeForm = (typeof REPURPOSE_FORMS)[number];
/** The forms that can be chosen now. */
export const READY_FORMS: readonly RepurposeForm[] = ['x', 'linkedin', 'community'];
export const isRepurposeForm = (value: unknown): value is RepurposeForm =>
  typeof value === 'string' &&
  (REPURPOSE_FORMS as readonly string[]).includes(value);

/** The built-in playbook of each form; a copy keeps its form, which is what decides how its result is read. */
export const FORM_PLAYBOOK: Readonly<Record<RepurposeForm, string>> = {
  xhs: 'xhs-cards',
  x: 'x-posts',
  linkedin: 'linkedin-post',
  community: 'community-post',
};
/** The playbook category the workshop's playbooks are listed under; New task does not offer it, as they need a source. */
export const REPURPOSE_CATEGORY = 'repurpose';
/** The result kind the Agent reports for each form (agent-result.ts). */
export const FORM_RESULT_KIND: Readonly<Record<RepurposeForm, string>> = {
  xhs: 'xhsCards',
  x: 'xPosts',
  linkedin: 'linkedinPost',
  community: 'communityPost',
};
export const RESULT_KINDS = Object.values(FORM_RESULT_KIND);

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
export type RepurposeSource = ArticleSource | TopicSource;

/** Where a community post goes: the project's own community (a section of it), a subreddit or Hacker News. */
export type Destination =
  | { kind: 'own'; name: string; url: string; section: string }
  | { kind: 'reddit'; subreddit: string; discussions?: number; weeks?: number }
  | { kind: 'hn' };

/** What a workshop task is about, kept on its work (`evidence.work.repurpose`). */
export type Repurpose = {
  form: RepurposeForm;
  source: RepurposeSource;
  destination?: Destination;
};

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

export type Piece = {
  /** `post` (X has three, numbered from 1), `reply`, `title` or `body`. */
  kind: 'post' | 'reply' | 'title' | 'body';
  index?: number;
  text: string;
  /** The source's sections the piece comes from, as the Agent wrote them ("1-4"). */
  sections?: string;
};
export type RepurposeResult = { pieces: Piece[]; rules: string[] };

// The markers the result is written with. The playbook instruction names them in English in every language, so they stay
// the same when the instruction is translated; the Chinese ones are read too.
const HEADINGS: [RegExp, Piece['kind'] | 'rules'][] = [
  [/^(?:post|帖子|正文帖)\s*(\d+)?$/i, 'post'],
  [/^(?:reply|first reply|回复|第一条回复)$/i, 'reply'],
  [/^(?:title|标题)$/i, 'title'],
  [/^(?:body|正文)$/i, 'body'],
  [/^(?:rules|版规|规矩)$/i, 'rules'],
];
const SECTIONS = /^\s*(?:sections?|出自)\s*[:：]\s*(?:第\s*)?([0-9][0-9\s,，、–—-]*)\s*(?:节)?\s*$/i;

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
    let sections: string | undefined;
    const first = lines.findIndex((l) => l.trim());
    const s = first >= 0 ? SECTIONS.exec(lines[first]) : null;
    if (s) {
      sections = s[1]
        .trim()
        .replace(/\s*[-–—]\s*/g, '–')
        .replace(/\s*[,，、]\s*/g, ', ');
      lines = lines.filter((_, i) => i !== first);
    }
    const text = lines.join('\n').trim();
    if (!text) continue;
    const index = kind === 'post' && m![1] ? Number(m![1]) : undefined;
    pieces.push({
      kind,
      text,
      ...(index ? { index } : {}),
      ...(sections ? { sections } : {}),
    });
  }
  const has = (kind: Piece['kind']) => pieces.some((p) => p.kind === kind);
  if (form === 'x' && !has('post')) return null;
  if (form === 'linkedin' && !has('post')) return null;
  if (form === 'community' && !(has('title') && has('body'))) return null;
  if (form === 'xhs') return null;
  // X posts are numbered in their order when the Agent left the numbers out.
  let n = 0;
  for (const p of pieces) if (p.kind === 'post') p.index = p.index || ++n;
  return { pieces, rules };
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
  { destination, brand }: { destination?: Destination; brand?: string } = {},
): RepurposeCheck[] {
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

/** The task title's subject: the article's title or the topic. */
export const sourceSubject = (s: RepurposeSource) =>
  s.kind === 'article' ? s.title : s.topic;

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
 * A workshop task's brief, in the language it is created in: the article or topic and what this task makes of it ("Adapt
 * the article “X” into a community post for Reddit r/selfhosted. Source: URL"), then a topic's points and links.
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
          : text(`workshop.form${r.form === 'xhs' ? 'Xhs' : 'Community'}`);
  const s = r.source;
  if (s.kind === 'article')
    return text('workshop.articleBrief', { 0: s.title, 1: into, 2: s.url });
  return [text('workshop.topicBrief', { 0: s.topic, 1: into }), s.points, ...(s.links || [])]
    .filter(Boolean)
    .join('\n\n');
}
