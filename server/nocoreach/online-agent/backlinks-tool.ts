import { z } from 'zod';
import type { OnlineTool } from '../../online-agent/executor.js';
import { toolInput } from '../../online-agent/errors.js';
import { VisibilityError } from '../research-helpers.js';
import { specification } from '../backlinks-service.js';
import {
  GAP_COMPETITORS,
  backlinksPath,
  type BacklinksLookupProposal,
} from '../../../shared/backlinks.js';

const VIEWS = ['overview', 'links', 'domains', 'pages', 'gap'] as const;
const ROWS = 50;
const input = z.strictObject({
  view: z
    .enum(VIEWS)
    .default('overview')
    .describe(
      'Which view. overview: authority, backlink and referring-domain counts, spam score, broken links and 12 months of history; links: backlinks (one per linking site); domains: referring domains; pages: the site pages with the most links; gap: sites linking to competitors but not to target.',
    ),
  target: z
    .string()
    .trim()
    .min(3)
    .max(300)
    .optional()
    .describe(
      "A domain (whole site, subdomains included) or one page's full address; our site when left out.",
    ),
  competitors: z
    .array(z.string().trim().min(3).max(253))
    .min(1)
    .max(GAP_COMPETITORS)
    .optional()
    .describe(
      'gap only: competitor domains; the competitors listed on Competitors when left out.',
    ),
  offset: z.number().int().min(0).max(1000).default(0),
});

type Obj = Record<string, unknown>;
type Run = Obj & {
  id: string | number;
  status: string;
  spec: Obj;
  result?: Obj | null;
};
export interface BacklinksSource {
  saved(id: string, v: object): Promise<Run | null>;
  sites(id: string): Promise<{
    own: string[];
    competitors: { name: string; domain: string }[];
  }>;
  spend(id: string): Promise<{ monthUsd: number; budgetUsd: number }>;
}

const list = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

/**
 * Backlinks from the online agent (2026-11-09 user request): reads the saved lookups of Search & market › Backlinks for
 * free. It never runs a paid lookup: when nothing is saved it returns a proposal, drawn in the conversation as a card
 * (client/pages/backlinks-lookup-card.tsx) whose Look up runs it through the page's own action under the user's
 * permission, as propose_keyword_run does for keywords.
 */
export function backlinksTool(
  source: BacklinksSource,
  projectId: string,
  authorize: () => Promise<void>,
  allowed: (resource: string, action: string) => Promise<boolean>,
  link: (path: string) => string,
): OnlineTool {
  return {
    name: 'backlinks',
    description:
      "Backlinks of any site or page from DataForSEO's link index, as Search & market › Backlinks shows them: the overview, its backlinks, referring domains, top pages, or the link gap (sites that link to competitors but not to us, the outreach prospects). Reads the latest saved lookup without a charge. It never runs a lookup: when none is saved it returns a proposal the user sees as a card with the estimated cost and confirms there. Rows come 50 at a time; follow nextOffset.",
    inputSchema: z.toJSONSchema(input),
    async execute(args) {
      await authorize();
      const v = toolInput(input, args);
      if (!(await allowed('nrBacklinks', 'list')))
        return { accessDenied: true };
      const sites = await source.sites(projectId);
      const target = v.target ?? sites.own[0];
      if (!target) return { error: 'noSite', note: 'The project has no site.' };
      const competitors =
        v.view === 'gap'
          ? (v.competitors ??
            sites.competitors.map((c) => c.domain).slice(0, GAP_COMPETITORS))
          : undefined;
      if (v.view === 'gap' && !competitors?.length)
        return {
          error: 'noCompetitors',
          note: 'No competitor has a website on Competitors; name the competitors to compare with.',
        };
      const query = { view: v.view, target, competitors };
      let spec: {
        target: string;
        competitors?: string[];
        estimatedUsd: number;
        reservationUsd: number;
      };
      try {
        spec = specification(query) as typeof spec;
      } catch (e) {
        if (e instanceof VisibilityError) return { error: e.message };
        throw e;
      }
      const run = await source.saved(projectId, query);
      if (!run) {
        const spend = await source.spend(projectId);
        const proposal: BacklinksLookupProposal = {
          projectId,
          view: v.view,
          target: spec.target,
          competitors: spec.competitors ?? null,
          estimatedUsd: spec.estimatedUsd,
          monthUsd: spend.monthUsd,
          budgetUsd: spend.budgetUsd,
          withinBudget: spend.monthUsd + spec.reservationUsd <= spend.budgetUsd,
        };
        return {
          page: 'Search & market › Backlinks',
          saved: false,
          proposal,
          note: 'Not looked up yet. The user sees this lookup as a card with its estimated cost and decides there; it has not run, so never say it did.',
        };
      }
      const overview =
        v.view !== 'overview' && v.view !== 'gap'
          ? await source.saved(projectId, {
              view: 'overview',
              target: spec.target,
            })
          : null;
      const result = (run.result ?? {}) as Obj;
      const items = list(result.items);
      return {
        page: 'Search & market › Backlinks',
        url: link(backlinksPath(v.view, spec.target, run.id, overview?.id)),
        view: v.view,
        target: spec.target,
        ...(competitors
          ? { competitors: spec.competitors ?? competitors }
          : {}),
        status: run.status,
        errorCode: run.errorCode ?? null,
        lookedUpAt: run.completedAt ?? run.createdAt,
        costUsd: run.costUsd ?? null,
        summary: result.summary ?? null,
        history: list(result.history).slice(-12),
        perCompetitor: result.perCompetitor ?? undefined,
        totalCount: result.totalCount ?? null,
        rows: items.slice(v.offset, v.offset + ROWS),
        returnedRows: items.length,
        nextOffset:
          v.offset + ROWS < items.length ? v.offset + ROWS : undefined,
        spamNote:
          v.view === 'links' || v.view === 'domains'
            ? 'spam is a 0-100 score; 40 or more is likely spam.'
            : undefined,
      };
    },
  };
}
