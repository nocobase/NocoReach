import { z } from 'zod';
import type { OnlineTool } from '../../online-agent/executor.js';

const market = z.strictObject({
  locationCode: z.number().int(),
  language: z.string().min(2).max(10),
});
const input = z.strictObject({
  mode: z.enum(['group', 'list']).default('group'),
  direction: z.string().min(2).max(60).optional(),
  seeds: z.array(z.string().min(2).max(80)).max(15).optional(),
  market: market.optional(),
  confirm: z.boolean().default(false),
});

interface Item {
  keyword: string;
  group: string;
  reason: string;
  metrics: { volume: number | null; difficulty: number | null };
}
export interface KeywordDigSource {
  estimate(
    id: string,
    v: object,
  ): Promise<{
    maxUsd: number;
    seeds: string[] | null;
    reused: number;
    monthUsd: number;
    budgetUsd: number;
    market: { locationCode: number; language: string };
  }>;
  start(id: string, v: object): Promise<{ promise: Promise<Built> }>;
}
interface Built {
  state: {
    market: { locationCode: number; language: string };
    stats?: { found: number };
  };
  group: {
    id: string;
    direction: string;
    found: number;
    costUsd: number;
  } | null;
  items: Item[];
}

/**
 * Keywords › AI suggestions from the online agent: the same demand-first run as the page (seeds, DataForSEO's real
 * keywords, at least the page's minimum volume, the AI's pick), added as a group named after its direction, or
 * rebuilding the whole list (another market). A paid lookup needs confirm: true; without it the tool only estimates.
 */
export function keywordDigTool(
  source: KeywordDigSource,
  projectId: string,
  authorize: () => Promise<void>,
  allowed: (resource: string, action: string) => Promise<boolean>,
  link: (path: string) => string,
): OnlineTool {
  return {
    name: 'keyword_dig',
    description:
      "Find keywords with real search demand for Keywords › AI suggestions: from seed topics (short phrases the way people search, in the market's language) or a direction, DataForSEO returns real keywords with their monthly volume, and only those with enough searches are picked. mode group (default) adds them to the page as a new group named after direction; mode list rebuilds the whole list, for example for another market (market: locationCode and language as DataForSEO uses them, such as 2392 and ja for Japan). The lookup is paid from the project's monthly DataForSEO budget, with seeds looked up in the last 30 days reused for free. Without confirm: true nothing is spent and the tool returns the most it may cost: tell the user that amount and run with confirm: true only after the user agrees. Read the current list, its seeds and groups with query_data (source keyword_suggestions).",
    inputSchema: z.toJSONSchema(input),
    async execute(args) {
      await authorize();
      const v = input.parse(args);
      if (!(await allowed('nrKeywordSuggest', 'suggest')))
        return { accessDenied: true };
      const request = {
        mode: v.mode === 'list' ? 'list' : 'dig',
        direction: v.direction,
        seeds: v.seeds,
        market: v.mode === 'list' ? v.market : undefined,
      };
      try {
        if (!v.confirm) {
          const cost = await source.estimate(projectId, request);
          return {
            confirmed: false,
            spent: 0,
            maxCostUsd: cost.maxUsd,
            seeds: cost.seeds ?? 'chosen by the AI when the lookup runs',
            seedsReusedFree: cost.reused,
            market: cost.market,
            monthSpentUsd: cost.monthUsd,
            monthlyBudgetUsd: cost.budgetUsd,
          };
        }
        const job = await source.start(projectId, request);
        const built = await job.promise;
        await authorize();
        const group = built.group;
        return {
          confirmed: true,
          ...(group
            ? {
                group: {
                  name: group.direction,
                  keywords: built.items.length,
                  url: link(`/keywords?tab=suggest&group=${group.id}`),
                },
              }
            : {
                list: {
                  keywords: built.items.length,
                  market: built.state.market,
                  url: link('/keywords?tab=suggest'),
                },
              }),
          realKeywordsFound: group ? group.found : built.state.stats?.found,
          costUsd:
            group?.costUsd ?? (built.state as { costUsd?: number }).costUsd,
          keywords: built.items.slice(0, 25).map((item) => ({
            keyword: item.keyword,
            volume: item.metrics.volume,
            difficulty: item.metrics.difficulty,
            reason: item.reason,
          })),
        };
      } catch (error) {
        // The page's own wording (budget, a run already going, nothing with enough searches) goes back to the model.
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

interface SuggestionView {
  at?: string;
  market: { locationCode: number; language: string };
  seeds?: string[];
  seedsBy?: string;
  stats?: { found: number; picked: number; minVolume: number };
  minVolume: number;
  costUsd?: number;
  running?: { stage: string; mode: string; direction: string | null } | null;
  lastError?: { message: string } | null;
  dataforseo: boolean;
  items: (Item & { site?: { position: number } | null })[];
  digs?: { id: string; direction: string; seeds: string[]; items: Item[] }[];
}
/**
 * What the AI knows when the chat opens from Keywords › AI suggestions (`PageAiEntry`, or a row's "Dig from this
 * keyword"): the market, how the list was made, the groups dug before and the list itself in brief.
 */
export async function keywordsPageContext(
  source: { view(id: string): Promise<SuggestionView> },
  projectId: string,
  item: string | undefined,
  allowed: (resource: string, action: string) => Promise<boolean>,
) {
  const opened = item
    ? `The user opened this conversation from Keywords › AI suggestions, on the keyword "${item.replaceAll('"', "'")}", to dig further from it: unless they say otherwise, call keyword_dig with mode group, that keyword as direction and as the first seed, plus up to four shorter or broader ways people search for the same need, in the market's language.`
    : 'The user opened this conversation from Keywords › AI suggestions, to find more keywords with real search demand, change direction or market, or understand how the list was made.';
  if (!(await allowed('nrKeywordSuggest', 'view')))
    return `${opened} They may not see the suggestions now; say so.`;
  const v = await source.view(projectId);
  const row = (i: SuggestionView['items'][number]) => ({
    keyword: i.keyword,
    volume: i.metrics.volume,
    difficulty: i.metrics.difficulty,
    group: i.group,
    position: i.site?.position ?? null,
  });
  return [
    opened,
    `How the list was made: seed topics (${v.seedsBy === 'person' ? 'given by the user' : 'chosen by AI'}) were looked up in DataForSEO's Google search data; only keywords with at least ${v.minVolume} monthly searches in the market were kept, and AI picked those closest to the product, ranked by search volume, relevance, difficulty and the site's position. Its state now:`,
    JSON.stringify({
      madeAt: v.at ?? null,
      market: v.market,
      seeds: v.seeds ?? [],
      realKeywordsFound: v.stats?.found ?? null,
      picked: v.stats?.picked ?? v.items.length,
      costUsd: v.costUsd ?? null,
      dataforseoConnected: v.dataforseo,
      running: v.running ?? null,
      lastError: v.lastError?.message ?? null,
      groupsDug: (v.digs ?? []).map((d) => ({
        name: d.direction,
        seeds: d.seeds,
        keywords: d.items.map((i) => i.keyword),
      })),
      list: v.items.slice(0, 50).map(row),
    }),
  ].join('\n');
}
