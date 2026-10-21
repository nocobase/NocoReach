import { fill, slugFromPage } from '../../../shared/article-publishing.js';
import type { TaskData } from '../task-execution-types';
import { pageUrlsOf } from './article-model';

/**
 * Where an article can be read on the site, from its target's page patterns: the task's own page when it is this
 * article's page, otherwise the pattern of the target's first language that has one. Empty when the target has no
 * patterns, so the title shows without a link.
 */
export function articlePageUrl(
  data: TaskData,
  targetId: string,
  slug: string,
): string {
  const target = data.articleTargets?.find((t) => t.id === targetId),
    pages = target?.pages;
  if (!pages || !slug) return '';
  const own = pageUrlsOf(data).find(
    (url) => slugFromPage(pages, url)?.slug === slug,
  );
  if (own) return own;
  const locale = [...(target.locales || []), ...Object.keys(pages)].find(
    (l) => pages[l],
  );
  return locale ? fill(pages[locale], encodeURIComponent(slug)) : '';
}
