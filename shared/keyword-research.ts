/**
 * What one Keywords › Find keywords query costs on DataForSEO's list price (official-list-2026-09-23): each way of
 * looking (Contains this term, Related searches, Similar topics) is one DataForSEO Labs live call, $0.012 plus
 * $0.00012 a keyword returned; a page's top 10 (serp) is $0.002. The server stores it as the run's estimate and the
 * page shows it before anything is looked up.
 */
export const researchQueryUsd = (view: string, limit: number) =>
  view === 'serp' ? 0.002 : Number((0.012 + limit * 0.00012).toFixed(6));

/** How many results each research query asks for. */
export const RESEARCH_LIMIT = 100;
