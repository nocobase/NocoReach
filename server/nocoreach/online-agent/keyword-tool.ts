import { z } from 'zod';
import type { OnlineTool } from '../../online-agent/executor.js';
import { keywordsFocus } from '../../../shared/keyword-subject.js';
import type { KeywordRunProposal } from '../../../shared/keyword-run.js';

const market = z.strictObject({
  locationCode: z.number().int(),
  language: z.string().min(2).max(10),
});
const input = z.strictObject({
  mode: z.enum(['list', 'group']).default('list'),
  seeds: z.array(z.string().min(2).max(80)).min(1).max(15).optional(),
  direction: z.string().min(2).max(60).optional(),
  name: z.string().min(1).max(24).optional(),
  restore: z.array(z.string().min(1).max(80)).max(150).optional(),
  market: market.optional(),
});

interface Item {
  keyword: string;
  group: string;
  reason: string;
  seeds?: string[];
  metrics: { volume: number | null; difficulty: number | null };
}
export interface KeywordRunSource {
  propose(id: string, v: object): Promise<KeywordRunProposal>;
}
const PLACES: Record<number, string> = {
  2840: 'United States',
  2826: 'United Kingdom',
  2124: 'Canada',
  2036: 'Australia',
  2702: 'Singapore',
  2276: 'Germany',
  2250: 'France',
  2392: 'Japan',
  2158: 'Taiwan',
  2344: 'Hong Kong',
};
const LANGUAGES: Record<string, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  ja: 'Japanese',
  'zh-TW': 'Traditional Chinese',
  'zh-CN': 'Simplified Chinese',
};
/** A market as people name it ("Japan · Japanese"), so the AI never speaks in location codes. */
export const marketName = (m: { locationCode: number; language: string }) =>
  `${PLACES[m.locationCode] ?? m.locationCode} · ${LANGUAGES[m.language] ?? m.language}`;

/**
 * Keywords › AI suggestions from the online agent (2026-10-28 user decision: changing seed words is a conversation,
 * not a dialog on the page). The tool only proposes: the seed words before and after (the AI's new picks with why, or
 * the user's edit), the market, whether anything changed, and the most the lookup may cost with this month's spending.
 * Nothing is looked up or saved; the proposal is drawn in the conversation, whose Confirm runs it through the page's
 * own action (suggest for the list, dig for a group).
 */
export function keywordRunTool(
  source: KeywordRunSource,
  projectId: string,
  authorize: () => Promise<void>,
  allowed: (resource: string, action: string) => Promise<boolean>,
): OnlineTool {
  return {
    name: 'propose_keyword_run',
    description:
      "Propose a keyword lookup for Keywords › AI suggestions; it looks nothing up and saves nothing. mode list (default) finds the whole list again: give seeds as the complete new list of seed words (for an edit: the current seeds with some added or removed), or leave seeds out to have the AI choose new ones (with direction to lean them, e.g. toward use cases), and give market only to switch markets (locationCode and language: 2840 en United States, 2826 en United Kingdom, 2124 en Canada, 2036 en Australia, 2702 en Singapore, 2276 de Germany, 2250 fr France, 2392 ja Japan, 2158 zh-TW Taiwan, 2344 zh-TW Hong Kong). mode group digs from a direction and adds a group (seeds optional); give name, a short name for the group in the user's language of at most 16 characters (such as 自托管与开源 or Self-hosting), and a direction already dug adds to that group. Keywords the user removed stay out of every lookup; pass restore with the ones the user asks to have back. Returns the seed words before and after with why the AI chose each new one, whether they are the same as now, and the most the lookup may cost: seeds looked up in the last 30 days are free, and the month's spending against the budget. The user sees this in the conversation and confirms it there.",
    inputSchema: z.toJSONSchema(input),
    async execute(args) {
      await authorize();
      const v = input.parse(args);
      if (!(await allowed('nrKeywordSuggest', 'suggest')))
        return { accessDenied: true };
      try {
        const proposal = await source.propose(projectId, {
          mode: v.mode === 'group' ? 'dig' : 'list',
          seeds: v.seeds,
          direction: v.direction,
          name: v.name,
          restore: v.restore,
          market: v.mode === 'group' ? undefined : v.market,
        });
        await authorize();
        return {
          proposal,
          market: marketName(proposal.market),
          note: proposal.same
            ? 'The seed words are the same as now: say why (nothing in the inputs points elsewhere, or the edit changed nothing), and that finding again would only pick again from the same looked-up keywords at no DataForSEO cost.'
            : 'Shown to the user with a Confirm button. Do not say the lookup ran.',
        };
      } catch (error) {
        // The page's own wording (budget, a run already going, no list yet) goes back to the model.
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
  seedNotes?: { seed: string; from: string[]; why: string }[];
  seedStats?: { seed: string; found: number; picked: number }[];
  stats?: { found: number; picked: number; minVolume: number };
  minVolume: number;
  costUsd?: number;
  running?: { stage: string; mode: string; direction: string | null } | null;
  lastError?: { message: string } | null;
  dataforseo: boolean;
  items: (Item & { site?: { position: number } | null })[];
  digs?: {
    id: string;
    direction: string;
    name?: string | null;
    seeds: string[];
    items: Item[];
  }[];
  removed?: string[];
  pendingSeeds?: string[] | null;
  groupNames?: Record<string, string>;
  deletedGroups?: string[];
}
const quote = (text: string) => `"${text.replaceAll('"', "'")}"`;
/**
 * What the AI knows when the chat opens from Keywords › AI suggestions: what it was opened on (the list, a keyword
 * row, the seed words or one seed), the market, how each seed was chosen and what it found, the groups dug and the
 * list itself in brief.
 */
export async function keywordsPageContext(
  source: { view(id: string): Promise<SuggestionView> },
  projectId: string,
  item: string | undefined,
  allowed: (resource: string, action: string) => Promise<boolean>,
) {
  const focus = keywordsFocus(item);
  const opened =
    focus.kind === 'keyword'
      ? `The user opened this conversation from Keywords › AI suggestions, on the keyword ${quote(focus.keyword)}, to dig further from it: unless they say otherwise, propose a group (propose_keyword_run, mode group) with that keyword as direction and as the first seed, plus up to four shorter or broader ways people search for the same need, in the market's language.`
      : focus.kind === 'seeds'
        ? "The user opened this conversation from Keywords › AI suggestions to adjust the seed words. Explain how they were chosen from seedNotes (which inputs led to each: project memory, the site's Search Console queries, competitors, a direction, or the user) and what each found from seedStats; for a change, propose it with propose_keyword_run so the user sees the seeds before and after and the cost, and confirms it."
        : focus.kind === 'seed'
          ? `The user opened this conversation from Keywords › AI suggestions on the seed word ${quote(focus.seed)}: say why it was chosen (seedNotes), how many real keywords it found and how many were picked (seedStats), and which of the list came from it (each list row names its seeds). To replace or drop it, propose the new seed list with propose_keyword_run.`
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
    seeds: i.seeds ?? [],
  });
  return [
    opened,
    `How the list was made: seed words (${v.seedsBy === 'person' ? 'given or edited by the user' : 'chosen by AI'}) were looked up in DataForSEO's Google search data; only keywords with at least ${v.minVolume} monthly searches in the market were kept, and AI picked those closest to the product, ranked by search volume, relevance, difficulty and the site's position. Name markets as countries and languages and never mention tool parameters or codes to the user. A list made before 2026-10-28 has no seedNotes: say that the reasons were not recorded then. Its state now:`,
    JSON.stringify({
      madeAt: v.at ?? null,
      market: marketName(v.market),
      seeds: v.seeds ?? [],
      // Saved in Edit seed words for the next re-find; the list was still found with seeds.
      seedsForNextFind: v.pendingSeeds ?? null,
      groupsRenamed: v.groupNames ?? {},
      groupsDeleted: v.deletedGroups ?? [],
      seedNotes: v.seedNotes ?? null,
      seedStats: v.seedStats ?? null,
      realKeywordsFound: v.stats?.found ?? null,
      picked: v.stats?.picked ?? v.items.length,
      costUsd: v.costUsd ?? null,
      dataforseoConnected: v.dataforseo,
      running: v.running ?? null,
      lastError: v.lastError?.message ?? null,
      groupsDug: (v.digs ?? []).map((d) => ({
        name: d.name ?? null,
        direction: d.direction,
        seeds: d.seeds,
        keywords: d.items.map((i) => i.keyword),
      })),
      list: v.items.slice(0, 50).map(row),
      removedByUser: (v.removed ?? []).slice(-100),
    }),
  ].join('\n');
}
