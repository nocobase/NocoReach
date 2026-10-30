import { MAIN_REPOSITORY } from './script/github.js';
import { FORUM } from './script/community.js';
import { SLACK, DISCORD } from './script/chat.js';
import { X_POSTS, HN_STORIES, REDDIT } from './script/social.js';
import {
  AI_QUESTIONS,
  BACKLINKS,
  PACKAGES,
  COMPETITORS,
} from './script/market.js';
import { BILIBILI, XIAOHONGSHU, YOUTUBE } from './script/media.js';
import {
  CRM_REPOSITORY,
  CRM_FORUM,
  CRM_SLACK,
  CRM_DISCORD,
  CRM_X,
  CRM_HN,
  CRM_REDDIT,
  CRM_MEDIA,
  CRM_AI,
  CRM_BACKLINKS,
  CRM_PACKAGES,
  CRM_QUERIES,
  CRM_RESEARCH,
} from './script/crm.js';
import { demoContent } from '../content.js';
import { Seeded, shares, type Language } from './kit.js';
import { MAIN_ANALYTICS, SECOND_ANALYTICS } from './script/analytics.js';
import { MAIN_QUERIES, RESEARCH, SECOND_QUERIES } from './script/search.js';
import { MAIN_SITE } from './script/site-main.js';
import { SECOND_SITE } from './script/site-second.js';
import type {
  Analytics,
  L,
  Page,
  Query,
  Research,
  Site,
} from './script/types.js';
import {
  daysAgo,
  annualDemand,
  growth,
  level,
  localTime,
  shareBefore,
  weekday,
} from './series.js';

export interface WorldProject {
  readonly id: string;
  readonly name: string;
  readonly domain: string;
  readonly language?: string;
}

/** One visit bucket of a day: indices into the site's sources, pages, regions and devices, and its sessions. */
export interface Visit {
  source: number;
  page: number;
  region: number;
  city: number;
  device: number;
  system: number;
  browser: number;
  returning: boolean;
  sessions: number;
}

/**
 * Splits `count` among `weights` by systematic sampling: every share gets the floor or ceiling of what it expects,
 * the counts add up exactly, and which small shares get the odd unit changes with the key.
 */
export function split(
  seeded: Seeded,
  key: string,
  count: number,
  weights: readonly number[],
): number[] {
  const out = weights.map(() => 0);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (count <= 0 || total <= 0) return out;
  const offset = seeded.unit(key);
  let cumulative = 0;
  let next = offset;
  for (let i = 0; i < weights.length; i++) {
    cumulative += (weights[i] / total) * count;
    while (next < cumulative && next < count) {
      out[i]++;
      next++;
    }
  }
  return out;
}

// A day holds a few thousand nine-field visit buckets (about 0.1-0.3 MiB). Keep the most recent 31 days, which
// covers the default 28-day window and today, so older history is recomputed rather than retained.
const VISIT_CACHE_DAYS = 31;
// Answers repeated within the hour, such as pages that read GA4 live; an oversized answer is kept only while paged.
const ANSWER_CACHE_LIMIT = 32;
const WORLD_CACHE_LIMIT = 8;

/** Reads a bounded map as least recently used: a hit moves to the end, a miss evicts the oldest entries. */
function recent<K, V>(
  cache: Map<K, V>,
  key: K,
  limit: number,
  compute: () => V,
  retain: (value: V) => boolean = () => true,
): V {
  if (cache.has(key)) {
    const value = cache.get(key) as V;
    cache.delete(key);
    cache.set(key, value);
    return value;
  }
  const value = compute();
  if (!retain(value)) return value;
  while (cache.size >= limit) cache.delete(cache.keys().next().value as K);
  cache.set(key, value);
  return value;
}

/**
 * The demo world as one project sees it at one moment: its site, searches, visitors and communities, in the language
 * the demo was imported in. Everything is derived from the script and the date, so a day reads the same all day and
 * the next day moves on.
 */
export class World {
  readonly language: Language;
  readonly lang: 'zh' | 'en';
  readonly main: boolean;
  readonly site: Site;
  readonly queries: readonly Query[];
  readonly analytics: Analytics;
  readonly research: readonly (Research & { topic: string })[];
  readonly seeded: Seeded;
  readonly origin: string;
  /** The Google Analytics property's time zone. */
  readonly timeZone: string;
  private readonly visits = new Map<string, Visit[]>();

  constructor(
    readonly project: WorldProject,
    /** The moment answered; worlds are shared within an hour, so it moves with each request. */
    public now: number,
  ) {
    this.language = project.language === 'en-US' ? 'en-US' : 'zh-CN';
    this.lang = this.language === 'en-US' ? 'en' : 'zh';
    this.main = project.domain !== SECOND_SITE.domain;
    this.site = this.main ? MAIN_SITE : SECOND_SITE;
    this.queries = this.main
      ? MAIN_QUERIES[this.lang]
      : [...SECOND_QUERIES[this.lang], ...CRM_QUERIES[this.lang]];
    this.analytics = (this.main ? MAIN_ANALYTICS : SECOND_ANALYTICS)[this.lang];
    this.research = this.main
      ? RESEARCH[this.lang]
      : [
          ...CRM_RESEARCH[this.lang],
          ...SECOND_QUERIES[this.lang].map((q) => ({
            keyword: q.q,
            topic: 'crm',
            volume: q.impressions * 20,
            difficulty: Math.round(q.position * 2),
            cpc: 2.4,
            intent: 'commercial' as const,
            position: q.position,
            path: q.path,
          })),
        ];
    this.seeded = new Seeded(
      `nocoreach-demo:${project.domain}:${this.language}`,
    );
    this.origin = `https://${project.domain}`;
    this.timeZone =
      this.lang === 'en' ? 'America/Los_Angeles' : 'Asia/Shanghai';
  }

  get competitors() {
    return COMPETITORS.filter((c) =>
      this.main ? c.domain !== 'sales.example' : c.domain === 'sales.example',
    );
  }
  get repository() {
    return this.main ? MAIN_REPOSITORY : CRM_REPOSITORY;
  }
  get forum() {
    return this.main ? FORUM : CRM_FORUM;
  }
  get slack() {
    return this.main ? SLACK : CRM_SLACK;
  }
  get discord() {
    return this.main ? DISCORD : CRM_DISCORD;
  }
  get xPosts() {
    return this.main ? X_POSTS : CRM_X;
  }
  get hnStories() {
    return this.main ? HN_STORIES : CRM_HN;
  }
  get reddit() {
    return this.main ? REDDIT : CRM_REDDIT;
  }
  get aiQuestions() {
    return this.main ? AI_QUESTIONS : CRM_AI;
  }
  get backlinks() {
    return this.main ? BACKLINKS : CRM_BACKLINKS;
  }
  get packages() {
    return this.main ? PACKAGES : CRM_PACKAGES;
  }
  get bilibili() {
    return this.main ? BILIBILI : CRM_MEDIA;
  }
  get xiaohongshu() {
    return this.main ? XIAOHONGSHU : CRM_MEDIA;
  }
  get youtube() {
    return this.main ? YOUTUBE : CRM_MEDIA;
  }

  text(value: L): string {
    return value[this.lang];
  }

  /** A script author: `@devrel` and `@editor` are the demo's own people. */
  person(login: string): string {
    if (!login.startsWith('@')) return login;
    const people = demoContent(this.language).people;
    return login === '@editor'
      ? people.editor.username
      : people.devrel.username;
  }

  page(path: string): Page | undefined {
    const clean = path.replace(/\/+$/, '') || '/';
    return this.site.pages.find((p) => p.path === clean);
  }

  /** Today's date and hour in the analytics property's time zone. */
  local(): { date: string; hour: number } {
    return localTime(this.now, this.timeZone);
  }

  /** Today's date in Search Console's time zone (Pacific). */
  searchToday(): string {
    return localTime(this.now, 'America/Los_Angeles').date;
  }

  /** Sessions on a date, before the hours of today that have not happened yet. */
  sessionsOn(date: string): number {
    const today = this.local().date;
    const ago = daysAgo(date, today);
    if (ago < 0) return 0;
    const pages = this.site.pages;
    const pageLevel =
      pages.reduce((sum, p) => sum + p.weight * level(p.changes, ago), 0) /
      pages.reduce((sum, p) => sum + p.weight * level(p.changes, 0), 0);
    const sources = this.analytics.sources;
    const sourceLevel =
      sources.reduce((sum, s) => sum + s.weight * level(s.changes, ago), 0) /
      sources.reduce((sum, s) => sum + s.weight * level(s.changes, 0), 0);
    return (
      this.site.sessions[this.lang] *
      weekday(date) *
      growth(ago) *
      annualDemand(date, !this.main) *
      pageLevel *
      sourceLevel *
      this.seeded.jitter(`sessions:${date}`, 0.09)
    );
  }

  /** A day's visits, allocated from source down to browser so every report of that day adds up the same. */
  visitsOn(date: string): Visit[] {
    return recent(this.visits, date, VISIT_CACHE_DAYS, () =>
      this.allocate(date),
    );
  }

  private allocate(date: string): Visit[] {
    const { date: today, hour } = this.local();
    const ago = daysAgo(date, today);
    const s = this.seeded;
    // Today has only the hours before the current one.
    const total = s.round(
      `total:${date}`,
      this.sessionsOn(date) * (ago === 0 ? shareBefore(hour) : 1),
    );
    const { sources, regions, devices, newShare } = this.analytics;
    const pages = this.site.pages;
    const pageWeights = pages.map((p) => p.weight * level(p.changes, ago));
    const meanPage = pageWeights.reduce((a, b) => a + b, 0) / pages.length;
    const out: Visit[] = [];
    const bySource = split(
      s,
      `src:${date}`,
      total,
      sources.map((x) => x.weight * level(x.changes, ago)),
    );
    bySource.forEach((sourceCount, source) => {
      if (!sourceCount) return;
      const lands = sources[source].lands ?? [];
      const weights = pages.map((p, i) => {
        const extra = lands.find(([path]) => path === p.path)?.[1] ?? 0;
        return pageWeights[i] + extra * meanPage;
      });
      split(s, `page:${date}:${source}`, sourceCount, weights).forEach(
        (pageCount, page) => {
          if (!pageCount) return;
          const key = `${date}:${source}:${page}`;
          split(
            s,
            `geo:${key}`,
            pageCount,
            regions.map((r) => r.weight),
          ).forEach((regionCount, region) => {
            if (!regionCount) return;
            const cities = regions[region].cities;
            split(
              s,
              `city:${key}:${region}`,
              regionCount,
              cities.map((c) => c[1]),
            ).forEach((cityCount, city) => {
              if (!cityCount) return;
              const at = `${key}:${region}:${city}`;
              split(
                s,
                `dev:${at}`,
                cityCount,
                devices.map((d) => d.weight),
              ).forEach((deviceCount, device) => {
                if (!deviceCount) return;
                const systems = devices[device].systems;
                split(
                  s,
                  `os:${at}:${device}`,
                  deviceCount,
                  systems.map((x) => x[1]),
                ).forEach((systemCount, system) => {
                  if (!systemCount) return;
                  const browsers = systems[system][2];
                  split(
                    s,
                    `br:${at}:${device}:${system}`,
                    systemCount,
                    browsers.map((b) => b[1]),
                  ).forEach((browserCount, browser) => {
                    if (!browserCount) return;
                    const [fresh, back] = split(
                      s,
                      `new:${at}:${device}:${system}:${browser}`,
                      browserCount,
                      [newShare, 1 - newShare],
                    );
                    const base = {
                      source,
                      page,
                      region,
                      city,
                      device,
                      system,
                      browser,
                    };
                    if (fresh)
                      out.push({ ...base, returning: false, sessions: fresh });
                    if (back)
                      out.push({ ...base, returning: true, sessions: back });
                  });
                });
              });
            });
          });
        },
      );
    });
    return out;
  }

  private readonly answers = new Map<string, unknown>();
  private large?: { key: string; value: unknown };
  /**
   * Remembers a recent answer for this world; the key must name everything the answer depends on. Answers `small`
   * rejects share a single slot instead, enough for a reader paging through one; `forget` releases it early.
   */
  answer<T>(
    key: string,
    compute: () => T,
    small: (value: T) => boolean = () => true,
  ): T {
    if (this.large?.key === key) return this.large.value as T;
    return recent(
      this.answers as Map<string, T>,
      key,
      ANSWER_CACHE_LIMIT,
      () => {
        const value = compute();
        if (!small(value)) this.large = { key, value };
        return value;
      },
      small,
    );
  }

  /** Releases an answer before the world expires, such as a large report whose last page has been read. */
  forget(key: string): void {
    this.answers.delete(key);
    if (this.large?.key === key) this.large = undefined;
  }

  private readonly memos = new Map<string, unknown>();
  /** Computes a value once for this world. */
  memo<T>(key: string, compute: () => T): T {
    if (!this.memos.has(key)) this.memos.set(key, compute());
    return this.memos.get(key) as T;
  }

  /** Weighted page shares, for things scaled by how much a page is read. */
  pageShares(): (Page & { share: number })[] {
    return shares(this.site.pages);
  }
}

const worlds = new Map<string, World>();

/** Release every cached edition of a retired or replaced project. */
export function invalidateWorlds(projectId: string): void {
  for (const [key, world] of worlds)
    if (String(world.project.id) === String(projectId)) worlds.delete(key);
}

/** One current world per project; an LRU bound also covers abandoned projects. */
export function worldFor(project: WorldProject, now: number): World {
  const key = `${project.id}:${project.domain}:${project.language}:${Math.floor(now / 3_600_000)}`;
  if (!worlds.has(key)) invalidateWorlds(project.id);
  const world = recent(
    worlds,
    key,
    WORLD_CACHE_LIMIT,
    () => new World(project, now),
  );
  world.now = now;
  return world;
}
