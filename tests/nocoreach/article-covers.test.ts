import { describe, expect, test } from 'vitest';
import {
  ARTICLE_TARGET_PRESETS,
  coverKeys,
  coverMissing,
  type ArticleTarget,
} from '../../shared/article-publishing.js';
import {
  ArticleDelivery,
  cleanDraft,
  DraftRejected,
  projectDraft,
} from '../../server/nocoreach/articles/delivery.js';
import {
  commonRatio,
  coverSummary,
  imageSize,
  pickField,
} from '../../server/nocoreach/articles/cover-detect.js';
import { readFrontmatter } from '../../server/nocoreach/articles/git-files.js';
import { ArticleTargets } from '../../server/nocoreach/articles/targets.js';
import type { LegacyVariables } from '../../server/nocoreach/legacy/variables.js';
import { fakeArticleApi, fakeGitHub, fakeNocoBase } from './article-fakes.js';

// Article covers (2026-11-05): how a target's covers are detected, when a new article must have one, and how each kind
// of target takes a cover the reviewer set.

// The first bytes of an image in each format, enough for its size.
const png = (width: number, height: number) => {
  const b = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
};
const jpeg = (width: number, height: number) => {
  const app0 = Buffer.alloc(18);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
};
const gif = (width: number, height: number) => {
  const b = Buffer.alloc(13);
  b.write('GIF89a', 0, 'latin1');
  b.writeUInt16LE(width, 6);
  b.writeUInt16LE(height, 8);
  return b;
};
const webp = (width: number, height: number) => {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.writeUInt32LE(22, 4);
  b.write('WEBPVP8X', 8, 'latin1');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
};

function variables() {
  const values = new Map<string, string>();
  return {
    get: (k: string) => values.get(k),
    set: async (k: string, v: string | null) =>
      v === null ? values.delete(k) : values.set(k, v),
    cannotRead: () => false,
  } as unknown as LegacyVariables;
}
type Fetch = (url: string, init: RequestInit) => Promise<Response>;
async function setup(
  target: ArticleTarget,
  fetchers: { site?: Fetch; github?: Fetch },
  secret: string,
) {
  const targets = new ArticleTargets(
    variables(),
    (_id, connection) => (url, init) => {
      const f = fetchers[connection];
      if (!f) throw new Error(`unexpected ${connection} request ${url}`);
      return f(url, init);
    },
  );
  await targets.save('1', { revision: 0, target, secret });
  return { targets, delivery: new ArticleDelivery(targets) };
}
const image = (name: string, bytes: Buffer) => ({
  name,
  type: 'image/png',
  bytes,
});

describe('image sizes and what covers suggest', () => {
  test('the size of a PNG, JPEG, GIF and WebP image is read from its first bytes', () => {
    expect(imageSize(png(3302, 1068))).toEqual({ width: 3302, height: 1068 });
    expect(imageSize(jpeg(2232, 722))).toEqual({ width: 2232, height: 722 });
    expect(imageSize(gif(640, 360))).toEqual({ width: 640, height: 360 });
    expect(imageSize(webp(1920, 1080))).toEqual({ width: 1920, height: 1080 });
    expect(imageSize(Buffer.from('<svg xmlns="..."/>'))).toBeNull();
    expect(imageSize(png(0, 10))).toBeNull();
  });
  test('the ratio most covers have, within 4% of an offered one; otherwise the median as Custom', () => {
    // nocobase.com's covers.
    expect(
      commonRatio([
        { width: 3302, height: 1068 },
        { width: 2232, height: 722 },
        { width: 1116, height: 361 },
      ]),
    ).toBe('3:1');
    expect(
      commonRatio([
        { width: 1920, height: 1080 },
        { width: 1280, height: 720 },
        { width: 1000, height: 1000 },
      ]),
    ).toBe('16:9');
    expect(
      commonRatio([
        { width: 1250, height: 500 },
        { width: 1250, height: 500 },
      ]),
    ).toBe('2.5:1');
    expect(commonRatio([])).toBeUndefined();
  });
  test('required when every recent article has one, three at least; the narrowest width is the minimum', () => {
    const sizes = [
      { width: 3302, height: 1068 },
      { width: 1116, height: 361 },
      { width: 2232, height: 722 },
    ];
    expect(coverSummary({ articles: 3, covers: 3, sizes })).toEqual({
      ratio: '3:1',
      minWidth: 1116,
      required: true,
    });
    expect(coverSummary({ articles: 4, covers: 3, sizes }).required).toBe(
      false,
    );
    expect(
      coverSummary({ articles: 2, covers: 2, sizes: sizes.slice(0, 2) })
        .required,
    ).toBe(false);
  });
  test('the field recent articles fill wins; an empty one only counts with a cover-like name', () => {
    expect(
      pickField(
        new Map([
          ['banner', 2],
          ['cover', 18],
        ]),
      ),
    ).toBe('cover');
    expect(
      pickField(
        new Map([
          ['image', 0],
          ['cover', 0],
        ]),
      ),
    ).toBe('cover');
    expect(pickField(new Map([['files', 0]]))).toBeUndefined();
  });
});

describe('when a new article must have a cover', () => {
  const target = {
    ...ARTICLE_TARGET_PRESETS['nocobase-api'],
    id: 'cms',
    name: 'CMS',
    cover: { field: 'cover', ratio: '3:1', required: true },
  } as ArticleTarget;
  test('a new article published at once needs one; a draft, an existing article or an optional cover does not', () => {
    const published = { status: 'published' as const, locales: {} };
    expect(coverMissing(target, published, true, 'en')).toBe(true);
    expect(
      coverMissing(
        target,
        { ...published, cover: { '*': '/uploads/task-media/x.png' } },
        true,
        'en',
      ),
    ).toBe(false);
    expect(
      coverMissing(target, { status: 'draft', locales: {} }, true, 'en'),
    ).toBe(false);
    expect(coverMissing(target, published, false, 'en')).toBe(false);
    expect(
      coverMissing(
        { ...target, cover: { field: 'cover' } } as ArticleTarget,
        published,
        true,
        'en',
      ),
    ).toBe(false);
  });
  test('per language, the primary language needs its own; a target without statuses always publishes', () => {
    const perLocale = {
      ...target,
      cover: {
        locales: { en: 'cover', zh: 'cover_cn' },
        required: true,
      },
    } as ArticleTarget;
    expect(coverKeys(perLocale)).toEqual(['en', 'zh']);
    const draft = {
      status: 'published' as const,
      locales: {},
      cover: { en: '/uploads/task-media/x.png' },
    };
    expect(coverMissing(perLocale, draft, true, 'en')).toBe(false);
    expect(coverMissing(perLocale, draft, true, 'zh')).toBe(true);
    const git = {
      ...ARTICLE_TARGET_PRESETS['git-files'],
      id: 'git',
      name: 'Repo',
      cover: { field: 'image', required: true },
    } as ArticleTarget;
    expect(coverMissing(git, { locales: {} }, true, 'en')).toBe(true);
  });
  test('a cover for a target without one, or for a language it does not keep one for, is refused', () => {
    const none = {
      ...ARTICLE_TARGET_PRESETS['nocobase-api'],
      id: 'cms',
      name: 'CMS',
    } as ArticleTarget;
    expect(() =>
      cleanDraft(
        none,
        { locales: {}, cover: { '*': '/uploads/task-media/x.png' } },
        false,
      ),
    ).toThrow(DraftRejected);
    expect(() =>
      cleanDraft(
        target,
        { locales: {}, cover: { zh: '/uploads/task-media/x.png' } },
        false,
      ),
    ).toThrow(DraftRejected);
    expect(
      cleanDraft(
        target,
        { locales: {}, cover: { '*': '/uploads/task-media/x.png' } },
        false,
      ).cover,
    ).toEqual({ '*': '/uploads/task-media/x.png' });
  });
  test('another target gets the same image, per language or shared; one without covers lists it as skipped', () => {
    const cover = { '*': '/uploads/task-media/x.png' };
    const perLocale = {
      ...target,
      locales: ['en', 'zh'],
      cover: { locales: { en: 'cover', zh: 'cover_cn' } },
    } as ArticleTarget;
    expect(
      projectDraft(perLocale, { locales: {}, cover }, null, false).draft.cover,
    ).toEqual({ en: cover['*'], zh: cover['*'] });
    expect(
      projectDraft(
        target,
        { locales: {}, cover: { zh: 'z.png', en: 'e.png' } },
        null,
        false,
      ).draft.cover,
    ).toEqual({ '*': 'e.png' });
    const none = { ...target, cover: undefined } as ArticleTarget;
    expect(projectDraft(none, { locales: {}, cover }, null, false)).toEqual({
      draft: { locales: {} },
      skipped: ['cover'],
    });
  });
});

describe('NocoBase API covers', () => {
  const ATTACHMENT = {
    interface: 'attachment',
    type: 'belongsTo',
    target: 'attachments',
  };
  const cmsTarget = (extra: Partial<ArticleTarget> = {}): ArticleTarget =>
    ({
      ...ARTICLE_TARGET_PRESETS['nocobase-api'],
      id: 'cms',
      name: 'CMS',
      baseUrl: 'https://cms.example.com',
      locales: ['en', 'zh'],
      fields: {
        ...ARTICLE_TARGET_PRESETS['nocobase-api'].fields,
        locales: {
          en: { title: 'title', description: 'description', body: 'content' },
          zh: { title: 'title_cn', body: 'content_cn' },
        },
      },
      pages: {
        en: 'https://www.example.com/en/blog/{slug}',
        zh: 'https://www.example.com/cn/blog/{slug}',
      },
      ...extra,
    }) as ArticleTarget;
  const row = (id: number, slug: string, extra = {}) => ({
    id,
    slug,
    status: 'published',
    title: slug,
    content: 'Body',
    title_cn: slug,
    content_cn: '正文',
    updatedAt: '2026-10-17T00:00:00.000Z',
    ...extra,
  });
  function site(fields: Record<string, unknown>[]) {
    const cms = fakeNocoBase(
      [row(1, 'first'), row(2, 'second'), row(3, 'third')],
      { fields: [{ name: 'title', interface: 'input' }, ...fields] },
    );
    // Two covers carry their size; the third is read from its first bytes.
    cms.state.rows[0].cover = cms.attach('a.png', png(3302, 1068), {
      width: 3302,
      height: 1068,
    });
    cms.state.rows[1].cover = cms.attach('b.png', png(2232, 722), {
      width: 2232,
      height: 722,
    });
    cms.state.rows[2].cover = cms.attach('c.jpg', jpeg(1116, 361));
    return cms;
  }
  test('connecting reads the shared cover field, its ratio, narrowest width and whether new articles need one', async () => {
    const cms = site([
      { name: 'cover', ...ATTACHMENT },
      { name: 'files', ...ATTACHMENT },
    ]);
    const { targets, delivery } = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      'cms-key',
    );
    expect(targets.target('1', 'cms').cover).toEqual({
      field: 'cover',
      ratio: '3:1',
      minWidth: 1116,
      required: true,
      detected: {
        at: expect.any(String),
        articles: 3,
        covers: 3,
        fields: ['cover', 'files'],
      },
    });
    // The article's cover is read with it: the file's address and its record.
    const base = await delivery.read('1', 'cms', '1');
    expect(base.cover).toEqual({
      '*': 'https://cms.example.com/storage/uploads/500-a.png#attachment=500',
    });
    expect(
      cms.state.requests.find((r) => r.action === 'get')!.params.get('appends'),
    ).toBe('cover');
  });
  test('a field per language follows the title fields; a collection without attachments has no covers', async () => {
    const cms = site([
      { name: 'cover', ...ATTACHMENT },
      { name: 'cover_cn', ...ATTACHMENT },
    ]);
    const { targets } = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      'cms-key',
    );
    expect(targets.target('1', 'cms').cover).toMatchObject({
      locales: { en: 'cover', zh: 'cover_cn' },
    });
    expect(targets.target('1', 'cms').cover).not.toHaveProperty('field');
    const bare = site([]);
    const plain = await setup(cmsTarget(), { site: bare.fetcher }, 'cms-key');
    expect(plain.targets.target('1', 'cms').cover).toBeUndefined();
  });
  test('a check detects again, but settings an administrator saved stay; editing the target keeps them', async () => {
    const cms = site([{ name: 'cover', ...ATTACHMENT }]);
    const { targets } = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      'cms-key',
    );
    let list = targets.list('1');
    // Nothing changed on the site: a check leaves the settings' revision alone.
    expect(await targets.test('1', 'cms')).not.toHaveProperty('revision');
    cms.state.rows.push(row(4, 'fourth'));
    const checked = await targets.test('1', 'cms');
    expect(checked).toMatchObject({
      ok: true,
      revision: list.revision + 1,
      cover: { field: 'cover', required: false, detected: { articles: 4 } },
    });
    list = targets.list('1');
    await expect(
      targets.saveCover('1', {
        revision: list.revision,
        targetId: 'cms',
        cover: { field: 'cover', locales: { fr: 'cover_fr' } },
      }),
    ).rejects.toThrow('invalidLocale');
    await targets.saveCover('1', {
      revision: list.revision,
      targetId: 'cms',
      cover: { field: 'cover', ratio: '3:1', minWidth: 1200, required: true },
    });
    cms.state.rows.push(row(5, 'fifth'));
    expect(await targets.test('1', 'cms')).not.toHaveProperty('cover');
    const saved = {
      field: 'cover',
      ratio: '3:1',
      minWidth: 1200,
      required: true,
      edited: true,
    };
    expect(targets.target('1', 'cms').cover).toEqual(saved);
    // The target's own form does not carry covers: saving it keeps them.
    list = targets.list('1');
    await targets.save('1', {
      revision: list.revision,
      target: { ...cmsTarget({ name: 'Blog CMS' }), cover: undefined },
    });
    expect(targets.target('1', 'cms').cover).toEqual(saved);
    // Removing them is a saved choice too.
    await targets.saveCover('1', {
      revision: targets.list('1').revision,
      targetId: 'cms',
      cover: null,
    });
    expect(targets.target('1', 'cms').cover).toBeUndefined();
  });
  test('a new cover goes into the cover field storage and the article relates to its record; only a changed cover is written', async () => {
    const cms = site([{ name: 'cover', ...ATTACHMENT }]);
    const { delivery } = await setup(
      cmsTarget(),
      { site: cms.fetcher },
      'cms-key',
    );
    const value = await delivery.uploadCover(
      '1',
      'cms',
      image('cover.png', png(2880, 960)),
      { slug: 'first', key: 'k:img' },
    );
    expect(cms.state.uploads.at(-1)!.params.get('attachmentField')).toBe(
      'articles.cover',
    );
    expect(value).toBe(
      `https://cms.example.com/storage/uploads/1-cover.png#attachment=1`,
    );
    const base = await delivery.read('1', 'cms', '1');
    const p = delivery.proposal('1', {
      targetId: 'cms',
      articleId: '1',
      base,
      baseKey: 'k',
      draft: { locales: {}, cover: { '*': value } },
    });
    expect(p.changes).toEqual(['cover']);
    expect(await delivery.publish('1', p, base, 'key-1')).toMatchObject({
      kind: 'published',
    });
    const write = cms.state.requests.find((r) => r.action === 'update')!;
    expect(write.body).toEqual({ cover: 1 });
    // The site's cover read back is the one written, so it is not a change against the published version.
    const after = await delivery.read('1', 'cms', '1');
    expect(after.cover).toEqual({ '*': value });
    // A cover changed on the site since the base is a conflict.
    cms.edit(1, { cover: 501 });
    const stale = delivery.proposal('1', {
      targetId: 'cms',
      articleId: '1',
      base: after,
      baseKey: 'k',
      draft: { locales: {}, cover: { '*': '' } },
    });
    expect(await delivery.publish('1', stale, after, 'key-2')).toMatchObject({
      kind: 'conflict',
    });
    expect(cms.state.rows[0].cover).toBe(501);
  });
});

describe('Git front matter covers', () => {
  const gitTarget = (): ArticleTarget =>
    ({
      ...ARTICLE_TARGET_PRESETS['git-files'],
      id: 'git',
      name: 'Acme',
      repo: 'org/blog',
      locales: ['en', 'zh'],
      files: {
        en: 'content/blog/{slug}/index.md',
        zh: 'content/blog/{slug}/index.zh.md',
      },
      pages: { en: 'https://acme.example.com/blog/{slug}' },
    }) as ArticleTarget;
  const post = (title: string, image?: string) =>
    `---\ntitle: "${title}"\n${image ? `image: "${image}"\n` : ''}---\n\nBody`;
  function repo() {
    return fakeGitHub('org/blog', {
      'content/blog/alpha/index.md': post('Alpha', '/images/blog/alpha.png'),
      'content/blog/alpha/index.zh.md': post(
        '阿尔法',
        '/images/blog/alpha.png',
      ),
      'content/blog/beta/index.md': post('Beta', '/images/blog/beta.webp'),
      'content/blog/gamma/index.md': post('Gamma'),
      'public/images/blog/alpha.png': png(1600, 900),
      'public/images/blog/beta.webp': webp(1920, 1080),
    });
  }
  test('connecting finds the front matter key with an image path, the folder it is served from and its 16:9 ratio', async () => {
    const git = repo();
    const { targets, delivery } = await setup(
      gitTarget(),
      { github: git.fetcher },
      'gh-token',
    );
    expect(targets.target('1', 'git').cover).toEqual({
      field: 'image',
      ratio: '16:9',
      minWidth: 1600,
      required: false,
      folder: 'public/images/blog',
      prefix: '/images/blog/',
      detected: {
        at: expect.any(String),
        articles: 3,
        covers: 2,
        fields: ['image'],
      },
    });
    expect((await delivery.read('1', 'git', 'alpha')).cover).toEqual({
      '*': '/images/blog/alpha.png',
    });
  });
  test('a new cover is committed into the folder once and set in every language file of the article', async () => {
    const git = repo();
    const { delivery } = await setup(
      gitTarget(),
      { github: git.fetcher },
      'gh-token',
    );
    const bytes = png(1920, 1080);
    const value = await delivery.uploadCover(
      '1',
      'git',
      image('shot.png', bytes),
      { slug: 'alpha', key: 'k:img' },
    );
    expect(value).toMatch(/^\/images\/blog\/alpha-cover-[0-9a-f]{10}\.png$/);
    const path = `public${value}`;
    expect(Buffer.compare(git.read(path) as Buffer, bytes)).toBe(0);
    const head = git.state.head;
    // A retry finds the file and commits nothing.
    expect(
      await delivery.uploadCover('1', 'git', image('shot.png', bytes), {
        slug: 'alpha',
        key: 'k:img',
      }),
    ).toBe(value);
    expect(git.state.head).toBe(head);
    const base = await delivery.read('1', 'git', 'alpha');
    const p = delivery.proposal('1', {
      targetId: 'git',
      articleId: 'alpha',
      base,
      baseKey: 'k',
      draft: { locales: {}, cover: { '*': value } },
    });
    expect(await delivery.publish('1', p, base, 'key-1')).toMatchObject({
      kind: 'published',
    });
    for (const file of [
      'content/blog/alpha/index.md',
      'content/blog/alpha/index.zh.md',
    ])
      expect(readFrontmatter(git.read(file) as string)).toMatchObject({
        keys: { image: value },
        body: 'Body',
      });
  });
});

describe('article API covers', () => {
  const api = (): ArticleTarget =>
    ({
      ...ARTICLE_TARGET_PRESETS.http,
      id: 'api',
      name: 'API',
      baseUrl: 'https://site.example.com/api',
      locales: ['en'],
    }) as ArticleTarget;
  test('the site declares its cover; it takes the image and the article gets its address', async () => {
    const server = fakeArticleApi();
    server.state.capabilities = {
      cover: { ratio: '16:9', minWidth: 1200, required: false },
    };
    server.state.articles.push({
      id: 'a1',
      slug: 'hello',
      status: 'published',
      version: 'v0',
      locales: { en: { title: 'Hello', description: '', body: 'Body' } },
      cover: 'https://cdn.example.com/covers/old.png',
    });
    const { targets, delivery } = await setup(
      api(),
      { site: server.fetcher },
      'api-key',
    );
    expect(targets.target('1', 'api').cover).toMatchObject({
      field: 'cover',
      ratio: '16:9',
      minWidth: 1200,
      required: false,
    });
    const base = await delivery.read('1', 'api', 'a1');
    expect(base.cover).toEqual({
      '*': 'https://cdn.example.com/covers/old.png',
    });
    const value = await delivery.uploadCover(
      '1',
      'api',
      image('new.png', png(1920, 1080)),
      { slug: 'hello', key: 'k:img' },
    );
    expect(value).toBe('https://cdn.example.com/covers/1-new.png');
    const p = delivery.proposal('1', {
      targetId: 'api',
      articleId: 'a1',
      base,
      baseKey: 'k',
      draft: { locales: {}, cover: { '*': value } },
    });
    await delivery.publish('1', p, base, 'key-1');
    expect(
      server.state.requests.find((r) => r.method === 'PATCH')!.body,
    ).toMatchObject({ baseVersion: 'v0', cover: value });
    expect(server.state.articles[0].cover).toBe(value);
  });
  test('a site without the capabilities endpoint takes no covers', async () => {
    const server = fakeArticleApi();
    const { targets } = await setup(api(), { site: server.fetcher }, 'api-key');
    expect(targets.target('1', 'api').cover).toBeUndefined();
  });
});
