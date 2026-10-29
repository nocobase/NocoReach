import { z } from 'zod';

// Article publishing (2026-10-18): blog tasks deliver a structured article to a configured target instead of a pull
// request. The writing steps only see this model; each target kind adapts it to its system. See
// docs/ARTICLE-PUBLISHING.md for the contract and docs/ARTICLE-API.md for the HTTP protocol.

export const ARTICLE_TARGET_KINDS = [
  'nocobase-api',
  'http',
  'git-files',
] as const;
export type ArticleTargetKind = (typeof ARTICLE_TARGET_KINDS)[number];
export const ARTICLE_FIELDS = ['title', 'description', 'body'] as const;
export type ArticleField = (typeof ARTICLE_FIELDS)[number];
export type ArticleFields = Partial<Record<ArticleField, string>>;
export type ArticleStatus = 'draft' | 'published';

/** How a target protects a write against someone else's change made after the draft's base was read. */
export type ArticleConcurrency = 'conditional' | 'check-before-write';
export type ArticleCapabilities = {
  search: boolean;
  update: boolean;
  concurrency: ArticleConcurrency;
  idempotency: 'native' | 'lookup';
};
export const ARTICLE_CAPABILITIES: Record<
  ArticleTargetKind,
  ArticleCapabilities
> = {
  'nocobase-api': {
    search: true,
    update: true,
    concurrency: 'check-before-write',
    idempotency: 'lookup',
  },
  http: {
    search: true,
    update: true,
    concurrency: 'conditional',
    idempotency: 'native',
  },
  'git-files': {
    search: true,
    update: true,
    concurrency: 'conditional',
    idempotency: 'lookup',
  },
};

export const ARTICLE_LIMITS = {
  title: 300,
  description: 2000,
  body: 200000,
  slug: 200,
  locales: 12,
} as const;
export const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})?$/;
export const SLUG = /^[a-z0-9][a-z0-9-]{0,199}$/;
export const TARGET_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type ArticleContent = {
  slug: string;
  status?: ArticleStatus;
  locales: Record<string, ArticleFields>;
};
export type ArticleSnapshot = ArticleContent & {
  id: string;
  version: string;
  readAt: string;
};
export type ArticleSummary = {
  id: string;
  slug: string;
  title: string;
  status?: ArticleStatus;
  updatedAt?: string;
};

const fieldsSchema = z
  .object({
    title: z.string().max(ARTICLE_LIMITS.title).optional(),
    description: z.string().max(ARTICLE_LIMITS.description).optional(),
    body: z.string().max(ARTICLE_LIMITS.body).optional(),
  })
  .strict();
/** What an Agent returns (and a person saves) for an article step. Absent fields stay as they are. */
export const articleDraftSchema = z
  .object({
    slug: z.string().regex(SLUG).optional(),
    status: z.enum(['draft', 'published']).optional(),
    locales: z.record(z.string().regex(LOCALE), fieldsSchema),
    verifyText: z.string().max(200).optional(),
    summary: z.string().max(2000).optional(),
  })
  .strict();
export type ArticleDraft = z.infer<typeof articleDraftSchema>;

const httpsUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash
      );
    } catch {
      return false;
    }
  }, 'https');
const template = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((v) => v.includes('{slug}'), 'slug');
const pathTemplate = template.refine(
  (v) =>
    !v.startsWith('/') &&
    !v.split('/').some((x) => !x || x === '.' || x === '..'),
  'path',
);
const pageTemplate = template.refine(
  (v) => httpsUrl.safeParse(v.split('{slug}').join('x')).success,
  'https',
);
const repo = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
const branch = z.string().regex(/^[A-Za-z0-9._/-]{1,100}$/);
const columnName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,62}$/);
const localeMap = <T extends z.ZodTypeAny>(value: T) =>
  z.record(z.string().regex(LOCALE), value);
const metadata = z
  .object({
    path: pathTemplate,
    keys: localeMap(
      z
        .object({
          title: z.string().max(100).optional(),
          description: z.string().max(100).optional(),
        })
        .strict(),
    ),
  })
  .strict();
const downstream = z
  .object({
    repo,
    branch,
    files: localeMap(pathTemplate),
    metadata: metadata.optional(),
    // The exporter's commit author: a file whose latest commit is the exporter's is only waiting to be exported again.
    exporter: z
      .object({
        name: z.string().max(100).optional(),
        email: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
const common = {
  id: z.string().regex(TARGET_ID),
  name: z.string().trim().min(1).max(60),
  locales: z.array(z.string().regex(LOCALE)).min(1).max(ARTICLE_LIMITS.locales),
  // A language's page address, or several (2026-10-29: nocobase.com serves English posts at /blog/{slug}/ as well as
  // /en/blog/{slug}); the first is the one links and checks use, the others are only read back.
  pages: localeMap(
    z.union([pageTemplate, z.array(pageTemplate).min(1).max(5)]),
  ).optional(),
};
export const nocobaseTargetSchema = z
  .object({
    ...common,
    kind: z.literal('nocobase-api'),
    baseUrl: httpsUrl,
    collection: columnName,
    fields: z
      .object({
        id: columnName,
        slug: columnName,
        version: columnName,
        status: z
          .object({
            field: columnName,
            published: z.string().max(60),
            draft: z.string().max(60),
          })
          .strict()
          .optional(),
        locales: localeMap(
          z
            .object({
              title: columnName.optional(),
              description: columnName.optional(),
              body: columnName.optional(),
            })
            .strict(),
        ),
      })
      .strict(),
    triggerWorkflows: z
      .array(z.string().regex(/^[A-Za-z0-9_-]{1,64}$/))
      .max(5)
      .optional(),
    downstream: downstream.optional(),
  })
  .strict();
export const httpTargetSchema = z
  .object({
    ...common,
    kind: z.literal('http'),
    baseUrl: httpsUrl,
    downstream: downstream.optional(),
  })
  .strict();
export const gitTargetSchema = z
  .object({
    ...common,
    kind: z.literal('git-files'),
    repo,
    branch,
    // The directory whose entries are the articles' slugs, for search.
    root: z
      .string()
      .trim()
      .min(1)
      .max(300)
      .refine(
        (v) => !v.split('/').some((x) => !x || x === '.' || x === '..'),
        'path',
      ),
    files: localeMap(pathTemplate),
    // Title and description live in the body file's front matter, or in a JSON metadata file.
    format: z.enum(['frontmatter', 'metadata-json']),
    frontmatter: z
      .object({ title: z.string().max(100), description: z.string().max(100) })
      .strict()
      .optional(),
    metadata: metadata.optional(),
    author: z
      .object({
        name: z.string().min(1).max(100),
        email: z.string().min(3).max(200),
      })
      .strict()
      .optional(),
  })
  .strict();
export const articleTargetSchema = z.discriminatedUnion('kind', [
  nocobaseTargetSchema,
  httpTargetSchema,
  gitTargetSchema,
]);
export type ArticleTarget = z.infer<typeof articleTargetSchema>;
export type NocoBaseTarget = z.infer<typeof nocobaseTargetSchema>;
export type HttpTarget = z.infer<typeof httpTargetSchema>;
export type GitTarget = z.infer<typeof gitTargetSchema>;
export type Downstream = z.infer<typeof downstream>;

/** A target as the browser sees it: configuration without credentials. */
export type ArticleTargetView = ArticleTarget & {
  hasSecret: boolean;
  capabilities: ArticleCapabilities;
};

/** Whether a target stores a draft/published status (Git files have none: committing publishes). */
export const supportsStatus = (t: ArticleTarget) =>
  t.kind === 'http' || (t.kind === 'nocobase-api' && Boolean(t.fields.status));

export const fill = (value: string, slug: string) =>
  value.split('{slug}').join(slug);

/** Starting points for the settings form; administrators adjust them to their own system. */
// A page address read back through a target's `pages` patterns (2026-10-21): the slug a task's page is published
// under, so the article it changes is found instead of picked from hundreds. Hosts compare without `www.`, paths
// without a trailing slash; the query and fragment are ignored.
const pageKey = (url: string) => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return `${u.host.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
};
/** A target's page addresses for each language: one, or several read back as the same language. */
export type PagePatterns = Record<string, string | string[]>;
/** A language's page addresses, the main one first. */
export const pagePatterns = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v : v ? [v] : [];
/** The address links to a language's page and checks of it use: its first. */
export const pagePattern = (pages: PagePatterns | undefined, locale: string) =>
  pagePatterns(pages?.[locale])[0];
const LOCALE_PART = /^[a-z]{2}(-[a-z0-9]{2,4})?$/i;
const slugOf = (middle: string) => {
  if (!middle || middle.includes('/')) return null;
  try {
    const slug = decodeURIComponent(middle);
    // Existing CMS slugs may hold dots (v2.2.29), which new drafts' SLUG does not allow.
    return /^[^\s/?#]{1,200}$/.test(slug) ? slug : null;
  } catch {
    return null;
  }
};
export function slugFromPage(
  pages: PagePatterns | undefined,
  url: string,
): { locale: string; slug: string } | null {
  const page = pageKey(url);
  if (!page) return null;
  for (const [locale, list] of Object.entries(pages || {}))
    for (const pattern of pagePatterns(list)) {
      const key = pattern.includes('{slug}')
        ? pageKey(pattern.replace('{slug}', 'nr-slug-marker'))
        : null;
      if (!key || !key.includes('nr-slug-marker')) continue;
      const [before, after] = key.split('nr-slug-marker');
      if (!page.startsWith(before) || !page.endsWith(after)) continue;
      const slug = slugOf(
        page.slice(before.length, page.length - after.length),
      );
      if (slug) return { locale, slug };
    }
  return null;
}

/**
 * A page that looks like one of a target's articles although no pattern reads it (2026-10-29, T-55: the CMS maps
 * English posts to /en/blog/{slug}, the site also serves and Search Console reports /blog/{slug}/): on a host the
 * target's pages are on, its path's last part as the slug and every other part one of the fixed parts of a pattern of
 * that host, all of them but a language (here `blog`, of `en` and `blog`). The language is the first in `locales`
 * whose pattern fits. Only a guess: the article still has to be found by that slug.
 */
export function looseSlugFromPage(
  pages: PagePatterns | undefined,
  url: string,
  locales: string[] = [],
): { locale: string; slug: string } | null {
  const page = pageKey(url);
  if (!page) return null;
  const [host, ...parts] = page.split('/'),
    slug = slugOf(parts.pop() || ''),
    path = parts.filter(Boolean);
  if (!slug || !path.length) return null;
  const order = Object.keys(pages || {}).sort(
    (a, b) => (locales.indexOf(a) + 1 || 99) - (locales.indexOf(b) + 1 || 99),
  );
  for (const locale of order)
    for (const pattern of pagePatterns(pages?.[locale])) {
      const key = pageKey(pattern.replace('{slug}', 'nr-slug-marker')) || '';
      const [patternHost, ...fixed] = key.split('/');
      if (patternHost !== host || fixed.pop() !== 'nr-slug-marker') continue;
      // Every fixed part but a language (`en`, `cn`) has to be there: /cn/pricing is no /cn/blog/{slug} post.
      if (
        path.every((p) => fixed.includes(p)) &&
        fixed.every((f) => path.includes(f) || LOCALE_PART.test(f))
      )
        return { locale, slug };
    }
  return null;
}
/** The article found for a task's page: where it lives and what to show. */
export type ArticleMatch = {
  targetId: string;
  articleId: string;
  slug: string;
  title: string;
  url: string;
  /** The languages the article has text in (articleLocales). */
  locales?: string[];
};

/** The languages an article has text in: a title or a body. */
export const articleLocales = (a: Pick<ArticleContent, 'locales'>) =>
  Object.entries(a.locales || {})
    .filter(([, f]) => Boolean(f?.title?.trim() || f?.body?.trim()))
    .map(([l]) => l);

/**
 * What a translation translates by default (2026-10-25): from the target's first language the article has, into the
 * languages it lacks; with none lacking, into all the others, to bring them up to date. `present` unknown (an article
 * linked before languages were recorded) counts every language as present. `source` keeps a source already chosen.
 */
export function translationDefault(
  targetLocales: string[],
  present?: string[],
  source?: string,
) {
  const has = (l: string) => !present || present.includes(l);
  const from =
    (source && targetLocales.includes(source) ? source : '') ||
    targetLocales.find(has) ||
    targetLocales[0] ||
    '';
  const others = targetLocales.filter((l) => l !== from),
    missing = others.filter((l) => !has(l));
  return { from, to: missing.length ? missing : others };
}

/**
 * The languages an update of an existing article edits in place once its primary language is approved (2026-10-28,
 * T-53): the other languages it writes that the article already has. They keep their own wording and get the changes
 * the primary got; the ones it lacks are translated in full. A new article and a translation of an article as published
 * (`translateFrom.published`) have none. `present` is the article's languages (articleLocales of its source).
 */
export function inPlaceLocales(
  d:
    | {
        articleId?: string | null;
        locales?: string[];
        translateFrom?: { published?: boolean } | null;
      }
    | null
    | undefined,
  present: string[] | null | undefined,
) {
  if (!d?.articleId || !present || d.translateFrom?.published) return [];
  return (d.locales || []).slice(1).filter((l) => present.includes(l));
}

export const ARTICLE_TARGET_PRESETS: {
  [K in ArticleTargetKind]: Omit<
    Extract<ArticleTarget, { kind: K }>,
    'id' | 'name'
  >;
} = {
  'nocobase-api': {
    kind: 'nocobase-api',
    baseUrl: 'https://cms.example.com',
    collection: 'articles',
    locales: ['en', 'zh', 'ja'],
    fields: {
      id: 'id',
      slug: 'slug',
      version: 'updatedAt',
      status: { field: 'status', published: 'published', draft: 'drafted' },
      locales: {
        en: { title: 'title', description: 'description', body: 'content' },
        zh: {
          title: 'title_cn',
          description: 'description_cn',
          body: 'content_cn',
        },
        ja: {
          title: 'title_ja',
          description: 'description_ja',
          body: 'content_ja',
        },
      },
    },
    pages: {
      en: 'https://www.example.com/en/blog/{slug}',
      zh: 'https://www.example.com/cn/blog/{slug}',
      ja: 'https://www.example.com/ja/blog/{slug}',
    },
  },
  http: {
    kind: 'http',
    baseUrl: 'https://cms.example.com/nocoreach',
    locales: ['en'],
    pages: { en: 'https://www.example.com/blog/{slug}' },
  },
  'git-files': {
    kind: 'git-files',
    repo: 'owner/website',
    branch: 'main',
    root: 'content/blog',
    locales: ['en'],
    files: { en: 'content/blog/{slug}/index.md' },
    format: 'frontmatter',
    frontmatter: { title: 'title', description: 'description' },
    pages: { en: 'https://www.example.com/blog/{slug}' },
  },
};
