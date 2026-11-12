import { CMS_DRAFT, DEMO_CMS } from '../cms-article.js';
import { HOUR, iso, json, notFound, object } from './kit.js';
import type { World } from './world.js';

/**
 * The main demo site's blog CMS, read as NocoBase's API answers it (articles/nocobase-api.ts): one post, the draft the
 * demo's article task pushed, still waiting for someone to publish it. Reads only: the task got there in the import,
 * and the demo never writes to it.
 */
export function cms(world: World, u: URL): Response | undefined {
  if (!world.main || u.hostname !== DEMO_CMS.host(world.project.domain))
    return undefined;
  const action = u.pathname.match(
    new RegExp(`^/api/${DEMO_CMS.collection}:(get|list)$`),
  )?.[1];
  if (!action) return notFound();
  const lang = world.lang;
  const row = {
    id: CMS_DRAFT.id,
    slug: CMS_DRAFT.slug,
    // Saved a few hours ago, as the task's push reads.
    updatedAt: iso(Math.floor(world.now / HOUR) * HOUR - 5 * HOUR),
    status: 'draft',
    title: CMS_DRAFT.title[lang],
    description: CMS_DRAFT.description[lang],
    content: CMS_DRAFT.body[lang],
  };
  if (action === 'get')
    return json({
      data:
        u.searchParams.get('filterByTk') === String(CMS_DRAFT.id) ? row : null,
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
  const hit =
    slug !== undefined
      ? slug === row.slug
      : !words.length ||
        words.some((q) =>
          [row.slug, row.title].some((v) =>
            v.toLowerCase().includes(q.toLowerCase()),
          ),
        );
  return json({ data: hit ? [row] : [] });
}
