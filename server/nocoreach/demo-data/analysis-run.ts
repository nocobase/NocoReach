import type { StrategyState } from '../../../shared/strategy-model.js';
import { RULES } from '../analysis-rules.js';

// The demo's last daily analysis (2026-11-17), as signals.ts records it: what each rule of the default scheme found
// and what each of its Skills proposed. Analysis rules shows these beside each rule only for the run whose id the
// latest Insights batch carries, so the import stamps that batch with the same id. The counts are hand-set to match
// the demo's sources; a rule not listed found nothing this time.

type Which = 'main' | 'second';

const FOUND: Record<Which, Record<string, number>> = {
  main: {
    'topic-rise': 2,
    'topic-new': 1,
    'topic-hot': 2,
    'youtube-hot': 1,
    'keyword-rising': 2,
    'trends-rising': 1,
    'gsc-new-query': 3,
    'github-topic-heat': 1,
    'github-new-repo': 1,
    'keyword-demand': 3,
    'asked-often': 2,
    'other-market': 1,
    'site-search': 1,
    'people-also-ask': 2,
    'competitor-gap': 2,
    'link-gap': 1,
    'ai-missing': 2,
    'ai-cited': 1,
    'competitor-release': 1,
    'gsc-near-first': 3,
    'gsc-low-ctr': 2,
    'ai-uncited': 1,
    rank: 2,
    'gsc-click-drop': 1,
    'site-stale': 1,
    'site-thin': 1,
    'ai-dropped': 1,
    audit: 1,
    'gsc-site': 1,
    'ga4-site': 1,
    'ga4-low-conversion': 1,
    'github-star-spike': 1,
    'github-release': 1,
    'github-rival-stars': 1,
    'community-theme': 1,
    'community-digest': 1,
    'community-unanswered': 2,
    'packages-downloads': 1,
    'hn-story': 1,
    'reddit-new': 2,
    'trends-move': 1,
    'competitor-pages': 2,
    'x-hot': 1,
    'ai-share': 1,
    'ai-answer': 1,
    'youtube-new': 1,
  },
  second: {
    'topic-rise': 1,
    'topic-hot': 1,
    'keyword-rising': 2,
    'gsc-new-query': 2,
    'keyword-demand': 3,
    'asked-often': 1,
    'people-also-ask': 1,
    'competitor-gap': 2,
    'ai-missing': 1,
    'competitor-release': 1,
    'gsc-near-first': 2,
    'gsc-low-ctr': 1,
    rank: 1,
    'site-stale': 1,
    'gsc-site': 1,
    'ga4-site': 1,
    'community-unanswered': 1,
    'competitor-pages': 1,
    'ai-share': 1,
  },
};

/** What each default Skill proposed in that run; the kept ones are among the opportunities they found. */
const SKILL_RUNS: Record<
  Which,
  { skillId: string; proposed: number; found: number }[]
> = {
  main: [
    { skillId: 'content-strategy', proposed: 3, found: 1 },
    { skillId: 'competitors', proposed: 2, found: 1 },
    { skillId: 'ai-seo', proposed: 2, found: 1 },
  ],
  second: [
    { skillId: 'content-strategy', proposed: 2, found: 0 },
    { skillId: 'competitors', proposed: 1, found: 1 },
    { skillId: 'ai-seo', proposed: 1, found: 0 },
  ],
};

/** The `signals:<project>` payload of the latest analysis, and the latest batch stamped with its run id. */
export function demoAnalysisRun(
  state: StrategyState,
  which: Which,
  projectId: string,
) {
  const signals = state.insights?.evidence?.signals;
  const computedAt = signals?.computedAt ?? new Date().toISOString();
  const analysisRunId = `demo-analysis-${projectId}-${computedAt.slice(0, 10)}`;
  if (signals) signals.analysisRunId = analysisRunId;
  const found = FOUND[which];
  return {
    computedAt,
    analysisRunId,
    // The default scheme as Analysis rules first shows it (analysis-rules.ts store()).
    schemeId: 'default',
    schemeVersion: 1,
    seen: {},
    coverage: signals?.coverage ?? {},
    found,
    total: Object.values(found).reduce((sum, n) => sum + n, 0),
    ruleRuns: RULES.map((rule) => ({
      ruleId: rule.id,
      status: found[rule.id] ? 'matched' : 'not_matched',
      source: rule.source,
    })),
    skillRuns: SKILL_RUNS[which].map((run) => ({
      ...run,
      name: run.skillId,
      status: 'ok',
    })),
  };
}
