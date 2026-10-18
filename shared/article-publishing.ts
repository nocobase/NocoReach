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
  pages: localeMap(
    template.refine(
      (v) => httpsUrl.safeParse(v.split('{slug}').join('x')).success,
      'https',
    ),
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

export const fill = (value: string, slug: string) =>
  value.split('{slug}').join(slug);

/** Starting points for the settings form; administrators adjust them to their own system. */
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
