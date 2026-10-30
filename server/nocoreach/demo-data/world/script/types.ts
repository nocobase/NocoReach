/**
 * The demo world's script: what the sites, searches, repositories and communities of the demo projects contain. All
 * times are days (or hours) before the moment a request is answered, so the world always reads as current.
 */

/** Text in both demo languages. */
export interface L {
  zh: string;
  en: string;
}
export const t = (zh: string, en: string): L => ({ zh, en });
export type PerLanguage<T> = { zh: T; en: T };

/** A change in a series, counted in days before today. Several changes multiply. */
export type Change =
  /** The level moves to `to` times its earlier value, over `over` days (default 3) starting `at` days ago. */
  | { kind: 'step'; at: number; to: number; over?: number }
  /** Nothing before `at` days ago, then a rise to full level over `ramp` days (default 7). */
  | { kind: 'launch'; at: number; ramp?: number }
  /** A one-off burst `size` times the level on day `at`, halving every `halfLife` days (default 1.5). */
  | { kind: 'spike'; at: number; size: number; halfLife?: number };

export type IndexState =
  | 'indexed'
  | 'crawled'
  | 'discovered'
  | 'unknown'
  | 'not-found'
  | 'duplicate'
  | 'noindex'
  | 'redirect';

export type PageFlag =
  /** `<meta name="robots" content="noindex">`. */
  | 'noindex'
  /** No `<h1>`. */
  | 'no-h1'
  /** Two `<h1>`s. */
  | 'two-h1'
  /** An image without alternative text. */
  | 'missing-alt'
  /** Canonical pointing at another page. */
  | 'canonical-other'
  /** A link to a page that answers 404. */
  | 'broken-link'
  /** Only a few sentences. */
  | 'thin'
  /** Listed in no sitemap, reachable only through links. */
  | 'orphan';

export interface Page {
  path: string;
  title: L;
  /** Empty for a page without a meta description. */
  description: L;
  /** Section headings and their paragraphs. */
  sections: readonly (readonly [heading: L, paragraph: L])[];
  /** Share of the site's visits. */
  weight: number;
  published: number;
  updated?: number;
  changes?: readonly Change[];
  /** A story's effect observation measures this page: it skips the annual demand cycle so only `changes` move it. */
  measured?: boolean;
  index?: IndexState;
  flags?: readonly PageFlag[];
  /** Pages this one links to, besides the navigation. */
  links?: readonly string[];
  /** The canonical target for `canonical-other`, or the page Google chose for `duplicate`. */
  canonical?: string;
}

export interface Site {
  name: string;
  domain: string;
  tagline: L;
  /** Visits per day today, before weekday and noise. */
  sessions: PerLanguage<number>;
  pages: readonly Page[];
  /** Paths linked but missing: they answer 404. */
  missing?: readonly string[];
}

export interface Query {
  q: string;
  path: string;
  /** Impressions per day today, before weekday and noise. */
  impressions: number;
  position: number;
  /** Click-through relative to what the position usually earns. */
  ctr?: number;
  changes?: readonly Change[];
  /** Lands on a measured page, which it follows; see `Page.measured`. */
  measured?: boolean;
  /** Position moves by this much from `at` days ago, over three days. */
  rank?: { at: number; by: number };
  /** Branded searches. */
  brand?: boolean;
  /** A second page Google also shows for this query, with its share of impressions. */
  also?: readonly [path: string, share: number];
}

export interface Research {
  keyword: string;
  /** Monthly searches. */
  volume: number;
  difficulty: number;
  cpc: number;
  intent: 'informational' | 'commercial' | 'navigational' | 'transactional';
  /** Relative monthly searches, January first; flat when absent. */
  season?: readonly number[];
  /** Tracked position of the demo site, when it ranks. */
  position?: number;
  path?: string;
}

export interface Source {
  channel: string;
  source: string;
  medium: string;
  campaign?: string;
  referrer?: string;
  weight: number;
  changes?: readonly Change[];
  /** Landing pages this source favours, with their extra weight. */
  lands?: readonly (readonly [path: string, weight: number])[];
  /** Engagement relative to the site average. */
  engagement?: number;
  /** Key events (sign-ups) relative to the site average. */
  converts?: number;
}

export interface Region {
  country: string;
  countryId: string;
  /** Search Console's ISO 3166-1 alpha-3 code, lower case. */
  gsc: string;
  language: string;
  languageCode: string;
  weight: number;
  cities: readonly (readonly [city: string, weight: number])[];
}

export interface Device {
  category: 'desktop' | 'mobile' | 'tablet';
  weight: number;
  systems: readonly (readonly [
    os: string,
    weight: number,
    browsers: readonly (readonly [browser: string, weight: number])[],
  ])[];
}

export interface Analytics {
  sources: readonly Source[];
  regions: readonly Region[];
  devices: readonly Device[];
  /** Share of sessions from new visitors. */
  newShare: number;
}

export interface Person {
  login: string;
  team?: boolean;
  bot?: boolean;
}

export interface Issue {
  title: L;
  body: L;
  labels: readonly string[];
  author: string;
  opened: number;
  closed?: number;
  comments: number;
  reactions: number;
  /** A discussion instead of an issue. */
  discussion?: {
    category: 'Q&A' | 'Ideas' | 'Show and tell' | 'General';
    answered?: boolean;
  };
}

export interface Pull {
  title: L;
  author: string;
  opened: number;
  /** Merged this many days ago; closed without merging when `closed` is set instead. */
  merged?: number;
  closed?: number;
  comments: number;
}

export interface Release {
  tag: string;
  name: L;
  notes: L;
  age: number;
  prerelease?: boolean;
}

export interface Repository {
  owner: string;
  name: string;
  description: L;
  topics: readonly string[];
  people: readonly Person[];
  issues: readonly Issue[];
  pulls: readonly Pull[];
  /** Commit messages, newest first, besides the merged pull requests. */
  commits: readonly L[];
  releases: readonly Release[];
  /** Stars today and new stars per day, before changes. */
  stars: { total: number; perDay: number; changes?: readonly Change[] };
  forks: number;
  watchers: number;
  languages: Record<string, number>;
  readme: L;
}

export interface Post {
  author: string;
  /** Hours after the topic was opened. */
  after: number;
  text: L;
  likes?: number;
}

export interface Topic {
  title: L;
  category: number;
  tags: readonly string[];
  opened: number;
  views: number;
  likes: number;
  /** The post number of the accepted answer. */
  accepted?: number;
  pinned?: boolean;
  closed?: boolean;
  posts: readonly Post[];
}

export interface Forum {
  title: L;
  description: L;
  categories: readonly (readonly [id: number, name: L, slug: string])[];
  topics: readonly Topic[];
}

export interface ChatMessage {
  /** Hours ago. */
  at: number;
  author: string;
  text: L;
  replies?: readonly (readonly [author: string, text: L])[];
}

export interface ChatChannel {
  name: string;
  members: number;
  /** A forum channel of threads (Discord type 15). */
  forum?: boolean;
  messages: readonly ChatMessage[];
}

export interface SocialPost {
  /** Hours ago. */
  at: number;
  author: string;
  text: L;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  views: number;
}

export interface Story {
  title: L;
  path?: string;
  /** An outside link instead of the demo site. */
  url?: string;
  author: string;
  points: number;
  age: number;
  comments: readonly (readonly [author: string, hoursAfter: number, text: L])[];
}

export interface Thread {
  subreddit: string;
  title: L;
  description: L;
  age: number;
  traffic: number;
}

export interface PackageLine {
  /** Versions, newest first, with their age in days. */
  versions: readonly (readonly [version: string, age: number])[];
  /** Downloads per day today for npm and PyPI; total pulls for Docker. */
  npm: number;
  pypi: number;
  docker: number;
  changes?: readonly Change[];
}

export interface Backlink {
  domain: string;
  path: string;
  title: L;
  anchor: L;
  target: string;
  rank: number;
  dofollow: boolean;
  firstSeen: number;
  lost?: number;
}

export interface Competitor {
  name: string;
  domain: string;
  tagline: L;
  pages: readonly (readonly [path: string, title: L, description: L])[];
  /** Relative to the demo site's organic traffic. */
  size: number;
}

export interface AiQuestion {
  question: L;
  answer: L;
  /** Cited pages on the demo site. */
  cites: readonly string[];
  /** Cited competitor, by domain. */
  rival?: string;
  volume: number;
  /** The question topics (English, as the AI questions page asks for them) this question comes up under. */
  topics: readonly string[];
}

export interface TrendTerm {
  term: L;
  /** Weekly interest over the last year, oldest first, as a shape the world scales to 0–100. */
  base: number;
  slope: number;
  season?: readonly number[];
  bursts?: readonly (readonly [weeksAgo: number, size: number])[];
}
