import { CMS_ARTICLES, DEMO_CMS } from '../cms-article.js';
import { HOUR, iso, json, notFound, object } from './kit.js';
import type { World } from './world.js';

/**
 * The main demo site's blog CMS, read as NocoBase's API answers it (articles/nocobase-api.ts): the posts the demo's
 * article tasks pushed (cms-article.ts), one still a draft waiting for someone to publish it and one published there;
 * the third task's draft was deleted, so it is not found. Reads only: the tasks got there in the import, and the demo
 * never writes to it.
 */
export function cms(world: World, u: URL): Response | undefined {
  if (!world.main || u.hostname !== DEMO_CMS.host(world.project.domain))
    return undefined;
  const action = u.pathname.match(
    new RegExp(`^/api/${DEMO_CMS.collection}:(get|list)$`),
  )?.[1];
  if (!action) return notFound();
  const lang = world.lang;
  const rows = CMS_ARTICLES.filter((a) => a.state !== 'deleted').map((a) => ({
    id: a.id,
    slug: a.slug,
    // A draft was saved a few hours ago, as its task's push reads; the published post when it went out (activity.ts).
    updatedAt: iso(
      Math.floor(world.now / HOUR) * HOUR -
        (a.state === 'published' ? 4 * 24 : 5) * HOUR,
    ),
    status: a.state,
    title: a.title[lang],
    description: a.description[lang],
    content: a.body[lang],
  }));
  if (action === 'get')
    return json({
      data:
        rows.find((r) => String(r.id) === u.searchParams.get('filterByTk')) ??
        null,
    });
  let filter: Record<string, unknown> = {};
  try {
    filter = object(JSON.parse(u.searchParams.get('filter') || '{}'));
  } catch {
    return json({ errors: [{ message: 'Invalid filter' }] }, 400);
  }
  // By address ({slug: {$eq}}) or a search on address and title ({$or: [{field: {$includes}}]}).
  const slug = object(filter.slug).$eq;
  const words = (Array.isArray(filter.$or) ? filter.$or : [])
    .flatMap((c) => Object.values(object(c)))
    .map((c) => object(c).$includes)
    .filter((q): q is string => typeof q === 'string');
  const hit = (row: (typeof rows)[number]) =>
    slug !== undefined
      ? slug === row.slug
      : !words.length ||
        words.some((q) =>
          [row.slug, row.title].some((v) =>
            v.toLowerCase().includes(q.toLowerCase()),
          ),
        );
  return json({ data: rows.filter(hit) });
}
