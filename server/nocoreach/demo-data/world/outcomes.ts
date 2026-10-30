import { completedAgo, type EditorialStory } from '../editorial.js';
import type { Change, Query, Site } from './script/types.js';
import { ctrAt } from './series.js';

// How far a measured page moves once its change is live, well clear of the observation's 15% threshold and of noise.
const MOVE = { up: 1.5, down: 0.6 } as const;
// Search clicks a day a measured page brings at its lower level, so the observation always judges it by clicks.
const MIN_CLICKS = 8;

/** Each measured story's page, with the step its change made on the day it went live; none for a flat result. */
function measuredPages(
  stories: readonly EditorialStory[],
): Map<string, Change[]> {
  const pages = new Map<string, Change[]>();
  stories.forEach((story, index) => {
    const { outcome, path } = story;
    if (outcome !== 'up' && outcome !== 'down' && outcome !== 'flat') return;
    if (pages.has(path))
      throw new Error(`Two measured demo stories share ${path}`);
    pages.set(
      path,
      outcome === 'flat'
        ? []
        : [
            {
              kind: 'step',
              at: completedAgo(story, index),
              to: MOVE[outcome],
              over: 1,
            },
          ],
    );
  });
  return pages;
}

/**
 * The site with each story's measured outcome scripted in: the page steps up or down on the day the story's change
 * went live, or holds for a flat result, so the effect observation finds what the story says on any import day.
 */
export function measuredSite(
  site: Site,
  stories: readonly EditorialStory[],
): Site {
  const measured = measuredPages(stories);
  return {
    ...site,
    pages: site.pages.map((page) => {
      const changes = measured.get(page.path);
      return changes
        ? {
            ...page,
            changes: [...(page.changes ?? []), ...changes],
            measured: true,
          }
        : page;
    }),
  };
}

/**
 * The searches landing on a measured page follow it (see `measuredSite`), and are busy enough between them to bring
 * `MIN_CLICKS` a day at the page's lower level.
 */
export function measuredQueries(
  queries: readonly Query[],
  stories: readonly EditorialStory[],
): Query[] {
  const measured = measuredPages(stories);
  const clicks = new Map<string, number>();
  for (const query of queries) {
    const changes = measured.get(query.path);
    if (!changes) continue;
    const low = Math.min(
      1,
      ...changes.map((c) => (c.kind === 'step' ? 1 / c.to : 1)),
    );
    clicks.set(
      query.path,
      (clicks.get(query.path) ?? 0) +
        query.impressions * ctrAt(query.position) * (query.ctr ?? 1) * low,
    );
  }
  return queries.map((query) => {
    const changes = measured.get(query.path);
    if (!changes) return query;
    const busier = Math.max(1, MIN_CLICKS / clicks.get(query.path)!);
    return {
      ...query,
      impressions: query.impressions * busier,
      changes: [...(query.changes ?? []), ...changes],
      measured: true,
    };
  });
}
