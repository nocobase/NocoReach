// Limits shared by Search & market › Backlinks (client/pages/backlinks.tsx) and its service
// (server/nocoreach/backlinks-service.ts).

/** The most competitors one Link gap lookup compares with: one DataForSEO request each. */
export const GAP_COMPETITORS = 3;
/** OpenSEO's DEFAULT_BACKLINKS_SPAM_THRESHOLD: rows scoring this or more count as spam. */
export const SPAM_THRESHOLD = 40;

export type BacklinksView =
  'overview' | 'links' | 'domains' | 'pages' | 'broken' | 'gap';

/**
 * A backlinks lookup the online agent proposed (tool `backlinks`, when nothing is saved) and the user confirms on the
 * card in the conversation: the agent never runs a paid lookup itself.
 */
export interface BacklinksLookupProposal {
  projectId: string;
  view: BacklinksView;
  target: string;
  /** Link gap only: the competitors compared with. */
  competitors: string[] | null;
  estimatedUsd: number;
  monthUsd: number;
  budgetUsd: number;
  /** This month's spending plus the lookup's reservation stays within the budget. */
  withinBudget: boolean;
}
export const isBacklinksLookupProposal = (
  output: unknown,
): output is { proposal: BacklinksLookupProposal } => {
  const p = (output as { proposal?: Partial<BacklinksLookupProposal> } | null)
    ?.proposal;
  return Boolean(
    p &&
    typeof p.projectId === 'string' &&
    typeof p.target === 'string' &&
    ['overview', 'links', 'domains', 'pages', 'broken', 'gap'].includes(
      String(p.view),
    ) &&
    typeof p.estimatedUsd === 'number',
  );
};

/** Where Search & market › Backlinks opens a lookup: a gap on Link gap, a tab's run on its tab of Link profile. */
export function backlinksPath(
  view: BacklinksView,
  target: string,
  runId?: string | number | null,
  overviewId?: string | number | null,
): string {
  const params = new URLSearchParams();
  if (view === 'gap') {
    params.set('view', 'gap');
    if (runId != null) params.set('gap', String(runId));
  } else {
    params.set('t', target);
    const key = {
      overview: 'o',
      links: 'l',
      domains: 'r',
      pages: 'g',
      broken: 'b',
    }[view];
    if (runId != null) params.set(key, String(runId));
    if (view !== 'overview') {
      params.set('bt', view);
      if (overviewId != null) params.set('o', String(overviewId));
    }
  }
  return `/backlinks?${params.toString()}`;
}

/**
 * A page's name wherever Backlinks shows or keys it (the Broken pages table, the analysis signal, the task brief): its
 * path on our site itself, with its host on a subdomain (docs.example.com/intro), so it is not taken for the main
 * site's page of the same path. An address that does not parse is shown as it is.
 */
export function pagePlace(url: string, site: string): string {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '') || '/';
    return host !== site.toLowerCase().replace(/^www\./, '')
      ? `${host}${path}`
      : path;
  } catch {
    return url;
  }
}
