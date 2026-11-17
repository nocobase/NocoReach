import { $legacyText, $t, getCurrentLocale } from '#i18n';
import { resolveLocale } from '../../../shared/i18n/locales.js';
import { contentLanguageName } from '../content-language';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import type { Tone } from '#components/reach/tag';
import { getWorkColumns } from '../task-execution-types';
import type { TaskStanding } from '../../../shared/task-pending.js';
import type {
  GrowthFigure,
  GrowthKind,
  GrowthText,
} from '../../../shared/growth.js';
import type {
  HotAway,
  HotDiscussion,
} from '../../../shared/workshop-recommend.js';
import {
  destinationLabel,
  destinationName,
  type Destination,
  type Repurpose,
  type RepurposeForm,
  type RepurposeSource,
} from '../../../shared/repurpose.js';
import { savedStyleId, type SavedStyle } from '../../../shared/card-design.js';
import {
  CARD_COLOR,
  DEFAULT_TEMPLATE,
  isCardTemplate,
  isHexColor,
  isSkillName,
  type BrandCards,
  type CardTemplateId,
  type TemplateCard,
} from '../../../shared/xhs-card.js';

// Content workshop (2026-11-13 user decision; homepage v5): what `nrWorkshop.view` returns and the words the page, its
// dialogs and the task page share. Only Trending now is recommended, from Opportunities, never an AI's judgement;
// nothing is pre-ticked.

export type Standing = TaskStanding;
export type Made = {
  form: RepurposeForm;
  destination?: Destination;
  taskId: string;
  no: number | null;
  standing: Standing;
  at?: string;
  /** It has a draft (approved, or waiting for review) the Agent reads when the same source is adapted again. */
  drafted?: boolean;
};
/** One language of a Library article: its own page. */
export type ArticleVersion = {
  url: string;
  title: string;
  /** Its language tag ("zh-CN"), when the site says it or its path does. */
  lang?: string;
  published?: string;
  clicks30: number | null;
};
/**
 * A blog article in Library, one row for all its translations (2026-11-17 user decision), with the tasks made from any
 * of them that are not closed. `url` and `title` are the original's, the first of `versions`; `published` is the first
 * known date, and `clicks30` the versions' clicks together.
 */
export type Article = {
  url: string;
  title: string;
  published?: string;
  /** Search Console clicks of the last 30 days; null without Search Console. */
  clicks30: number | null;
  made: Made[];
  versions: ArticleVersion[];
};
/** A task handed off from the opportunity on Opportunities. */
export type Handed = {
  taskId: string;
  no: number | null;
  standing: Standing;
  /** The playbook's stored name, and its id (the suggested one before the task starts). */
  playbook: string | null;
  playbookId: string | null;
};
/**
 * One of Opportunities' live Trending now opportunities (server/nocoreach/workshop.ts hotItems). One the workshop's
 * Trending now has left says why: it is not listed, but Adapt into short posts on Opportunities still opens it.
 */
export type HotItem = {
  id: string;
  no: number | null;
  kind: GrowthKind;
  away?: HotAway;
  title: string;
  firstSeenAt?: string;
  foundAt?: string;
  headline: GrowthText | null;
  figures: GrowthFigure[];
  logos: string[];
  chart: {
    unit: 'week' | 'month' | 'day';
    label: GrowthText;
    points: number[];
  } | null;
  discussions: HotDiscussion[];
  discussionCount: number;
  communities: {
    subreddits: { subreddit: string; discussions: number }[];
    hn: number;
  };
  material: { title: string; url: string }[];
  handed: Handed[];
  made: Made[];
};
export type WorkshopRecord = {
  taskId: string;
  no: number | null;
  title: string;
  updatedAt: string;
  form: RepurposeForm;
  destination?: Destination;
  source: RepurposeSource;
  standing: Standing;
  failed?: boolean;
  restart?: boolean;
  /** A Xiaohongshu set's number of cards. */
  cards?: number;
};
export type Community = { name: string; url: string; sections: string[] };
export type Brand = {
  revision: number;
  community: Community | null;
  cards: BrandCards | null;
};
export type WorkshopView = {
  hot: HotItem[];
  /** Every blog article, newest first (shared/workshop-recommend.ts libraryOrder). */
  articles: Article[];
  records: WorkshopRecord[];
  recordCount: number;
  brand: Brand;
  /** The website's icon, which signs the cards when the brand kit has no logo. */
  siteIcon: string | null;
  /** The latest Xiaohongshu set's cards, which the card styles are previewed with, and what it was made from. */
  cardSample: { subject: string; cards: TemplateCard[] } | null;
  /** My styles: card styles made with AI and saved to the project. */
  styles: SavedStyle[];
  /** The Skills Draw with a Skill offers, and whether the project has each on its Skills page. */
  cardSkills: CardSkill[];
  voice: string;
  destinations: {
    reddit: {
      subreddits: { subreddit: string; discussions: number }[];
      weeks: number;
      recent: string[];
    };
  };
};

export type LibraryFilter = 'all' | 'todo' | 'made';
/** Library's filters: everything, articles nothing was made from yet, and those adapted. */
export const libraryFilter = (f: LibraryFilter) => (a: Article) =>
  f === 'all' || (f === 'made') === a.made.length > 0;
/** Whether a Library article matches a search: the title or the address of any of its languages. */
export const librarySearch = (a: Article, query: string) => {
  const q = query.trim().toLowerCase();
  return (
    !q ||
    a.versions.some(
      (v) =>
        v.title.toLowerCase().includes(q) || v.url.toLowerCase().includes(q),
    )
  );
};
/**
 * The version a Library row shows and Adapt starts from: the one in the interface language, else one in the same
 * language written another way (zh-CN for a zh-TW reader), else the original.
 */
export function shownVersion(
  a: Article,
  locale: string = getCurrentLocale(),
): ArticleVersion {
  const base = locale.split('-')[0];
  return (
    a.versions.find((v) => v.lang && resolveLocale(v.lang) === locale) ??
    a.versions.find((v) => v.lang && v.lang.split('-')[0] === base) ??
    a.versions[0]
  );
}
/** An article's address without the site: "/blog/client-portal". */
export const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return decodeURI(u.pathname) + u.search;
  } catch {
    return url;
  }
};
/** A version's language, or its address when neither the site nor the address says it. */
export const versionName = (v: ArticleVersion) =>
  v.lang ? languageName(v.lang) : pathOf(v.url);
/** A version's language named in itself, as the language menu names it ("English", Japanese in Japanese). */
export function languageName(lang: string): string {
  const locale = resolveLocale(lang),
    base = lang.split('-')[0].toLowerCase();
  if (locale.split('-')[0] === base) return contentLanguageName(locale);
  try {
    const name = new Intl.DisplayNames([lang], { type: 'language' }).of(lang);
    return name ? name.charAt(0).toLocaleUpperCase(lang) + name.slice(1) : lang;
  } catch {
    return lang;
  }
}

export const workshopRequest = <T>(
  action: string,
  projectId: number | string,
  body: object = {},
  signal?: AbortSignal,
) =>
  api.action<T>('nrWorkshop', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
    signal,
  });

/** Each form's name, in the interface language. */
export const getFormNames = (): Record<RepurposeForm, string> => ({
  xhs: $t('workshop.formXhs'),
  x: $t('workshop.formX'),
  linkedin: $t('workshop.formLinkedin'),
  community: $t('workshop.formCommunity'),
});

/** What a task makes: "LinkedIn post", "Community post · Hacker News", "Xiaohongshu note · 8 cards". */
export const outputLabel = (
  form: RepurposeForm,
  destination?: Destination,
  cards?: number,
) =>
  [
    getFormNames()[form],
    destination ? destinationLabel(destination) : '',
    cards ? $t('workshop.cardCount', { 0: cards }) : '',
  ]
    .filter(Boolean)
    .join(' · ');

/** The mark beside a form or destination (SourceLogo's names). */
export const logoOf = (form: RepurposeForm, destination?: Destination) =>
  form === 'x'
    ? 'x'
    : form === 'linkedin'
      ? 'linkedin'
      : form === 'xhs'
        ? 'xiaohongshu'
        : destination?.kind === 'reddit'
          ? 'reddit'
          : destination?.kind === 'hn'
            ? 'hackernews'
            : 'community';

/** A task's status in the words of the task page header and the board: Needs you, In progress, Done. */
export const standingText = (s: Standing): string =>
  s === 'closed'
    ? $t('common.closed')
    : s === 'snoozed'
      ? $t('common.snoozed')
      : getWorkColumns()[s];

/** What the Agent's last run left, as the task list's current step says it: waiting for a restart, or stopped. */
export function runNote(
  r: Pick<WorkshopRecord, 'standing' | 'failed' | 'restart'>,
): {
  text: string;
  tone: Tone;
} | null {
  if (r.standing !== 'review') return null;
  if (r.restart) return { text: $t('taskList.waitingRestart'), tone: 'amber' };
  if (r.failed)
    return { text: $t('taskList.runFailed', { 0: 'Agent' }), tone: 'red' };
  return null;
}

/** An opportunity's short number, as Opportunities shows it. */
export const opportunityNo = (no: number | null | undefined) =>
  no ? `O-${no}` : '';

/** Where a record came from: "From “…”", "From the topic “…”", "From trending O-35 “…”". */
export const fromLine = (s: RepurposeSource) =>
  s.kind === 'article'
    ? $t('workshop.fromArticle', { 0: s.title })
    : s.kind === 'topic'
      ? $t('workshop.fromTopic', { 0: s.topic })
      : $t('workshop.fromHot', { 0: opportunityNo(s.no), 1: s.headline });

/** A Trending now headline in the reader's language, else the opportunity's own title. */
export const hotHeadlineText = (h: Pick<HotItem, 'headline' | 'title'>) =>
  h.headline ? $t(h.headline.key, h.headline.params) : $legacyText(h.title);

/** A failed request's message in the interface language (the server's own text is Chinese). */
export const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? $legacyText(e.message) : fallback;

/** The task's short number, as boards show it. */
export const taskNo = (no: number | null | undefined) => (no ? `T-${no}` : '');

/** What a result is called: "X posts", "LinkedIn post", "Reddit r/selfhosted post". */
export const resultName = (form: RepurposeForm, destination?: Destination) =>
  form === 'community' && destination
    ? $t('workshop.communityPostAt', { 0: destinationName(destination) })
    : getFormNames()[form];

/** The review card's title: "X posts are written; approving completes the task". */
export const repurposeReviewTitle = (r: Repurpose) =>
  $t('workshop.reviewTitle', { 0: resultName(r.form, r.destination) });

/** A Skill Draw with a Skill offers: the two NocoReach has tried, and the project's own that draw card images. */
export type CardSkill = { name: string; description?: string; added: boolean };

/** A card style the brand kit can name: a built-in one, or one of My styles (`mine:<id>`). */
export type StyleRef = CardTemplateId | `mine:${string}`;

// Brand and templates' card settings (brand-cards.tsx): the card style, and the brand basics every style draws with.
export type CardFields = {
  template: StyleRef;
  /** The Skill that draws the cards instead of the style (Draw with a Skill), or null. */
  skill: string | null;
  /** An uploaded logo; null uses the website's icon. */
  logo: string | null;
  color: string;
  endingHeading: string;
  endingText: string;
};

export const cardFieldsOf = (c: BrandCards | null | undefined): CardFields => ({
  template:
    isCardTemplate(c?.template) || savedStyleId(c?.template)
      ? (c!.template as StyleRef)
      : DEFAULT_TEMPLATE,
  skill: isSkillName(c?.skill) ? c.skill : null,
  logo: c?.logo || null,
  color: isHexColor(c?.color) ? c.color : CARD_COLOR,
  endingHeading: c?.ending?.heading || '',
  endingText: c?.ending?.text || '',
});

export const brandCardsOf = (f: CardFields): BrandCards => ({
  template: f.template,
  skill: f.skill,
  logo: f.logo,
  color: f.color,
  ending: f.endingHeading.trim()
    ? { heading: f.endingHeading.trim(), text: f.endingText.trim() }
    : null,
});

/** What keeps the card settings from being saved, or ''. */
export const cardFieldsProblem = (f: CardFields) =>
  !f.endingHeading.trim() && f.endingText.trim()
    ? $t('workshop.endingHeadingRequired')
    : '';
