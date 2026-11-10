import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OnlineTool } from '../../online-agent/executor.js';
import { toolInput } from '../../online-agent/errors.js';
import { VisibilityError } from '../research-helpers.js';
import { specification } from '../backlinks-service.js';
import { GAP_COMPETITORS } from '../../../shared/backlinks.js';

const VIEWS = ['overview', 'links', 'domains', 'pages', 'gap'] as const;
// Which URL parameter of Search & market › Backlinks holds each view's run.
const RUN_PARAMS = {
  overview: 'o',
  links: 'l',
  domains: 'r',
  pages: 'g',
} as const;
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
  lookUp: z
    .boolean()
    .default(false)
    .describe(
      'true runs a new DataForSEO lookup, charged to the project; only when the user asks for one. The same lookup within 30 days returns the saved result without a charge.',
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
  run(id: string, v: object): Promise<Run>;
  saved(id: string, v: object): Promise<Run | null>;
  sites(id: string): Promise<{
    own: string[];
    competitors: { name: string; domain: string }[];
  }>;
}

const list = (v: unknown): Obj[] => (Array.isArray(v) ? (v as Obj[]) : []);

/**
 * Backlinks from the online agent (2026-11-09 user request): reads the saved lookups of Search & market › Backlinks for
 * free, and runs a new one only with lookUp, which the instructions keep to a user's request. A lookup goes through the
 * page's own service (budget, 30-day reuse, uncertain runs not retried) under the user's nrBacklinks.run permission.
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
      "Backlinks of any site or page from DataForSEO's link index, as Search & market › Backlinks shows them: the overview, its backlinks, referring domains, top pages, or the link gap (sites that link to competitors but not to us, the outreach prospects). Reads the latest saved lookup without a charge; when there is none it says so with the estimated cost, and lookUp true runs one (charged, about $0.03–0.09, against the project's monthly DataForSEO budget). Rows come 50 at a time; follow nextOffset.",
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
      let estimatedUsd: number;
      try {
        estimatedUsd = Number(
          (specification(query) as { estimatedUsd: number }).estimatedUsd,
        );
      } catch (e) {
        if (e instanceof VisibilityError) return { error: e.message };
        throw e;
      }
      let run: Run | null;
      if (v.lookUp) {
        if (!(await allowed('nrBacklinks', 'run')))
          return { accessDenied: true };
        try {
          run = await source.run(projectId, {
            ...query,
            requestKey: randomUUID().replace(/-/g, ''),
          });
        } catch (e) {
          if (e instanceof VisibilityError) return { error: e.message };
          throw e;
        }
      } else run = await source.saved(projectId, query);
      const spec = (run?.spec ?? {}) as Obj;
      // The page's own parameters (client/pages/backlinks.tsx): a gap opens on Link gap; a tab's run opens that tab of
      // Link profile, beside the target's latest saved overview when there is one.
      const params = new URLSearchParams();
      if (v.view === 'gap') {
        params.set('view', 'gap');
        if (run) params.set('gap', String(run.id));
      } else {
        params.set('t', String(spec.target ?? target));
        if (run) params.set(RUN_PARAMS[v.view], String(run.id));
        if (v.view !== 'overview') {
          params.set('bt', v.view);
          const overview = await source.saved(projectId, {
            view: 'overview',
            target: spec.target ?? target,
          });
          if (overview) params.set('o', String(overview.id));
        }
      }
      const where = {
        page: 'Search & market › Backlinks',
        url: link(`/backlinks?${params.toString()}`),
        view: v.view,
        target: spec.target ?? target,
        ...(competitors
          ? { competitors: spec.competitors ?? competitors }
          : {}),
      };
      if (!run)
        return {
          ...where,
          saved: false,
          estimatedUsd,
          note: 'Not looked up yet. Offer a lookup with its estimated cost; run it with lookUp true only when the user asks.',
        };
      const result = (run.result ?? {}) as Obj;
      const items = list(result.items);
      return {
        ...where,
        status: run.status,
        errorCode: run.errorCode ?? null,
        lookedUpAt: run.completedAt ?? run.createdAt,
        reused: Boolean(run.reused),
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
