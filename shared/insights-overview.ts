import type {
  Evidence,
  InsightBatch,
  StrategyState,
} from './strategy-model.js';

export type InsightsOverview = {
  state: StrategyState;
  periodDays: number;
  availableThrough: string | null;
};

// A display snapshot for Insights only. Task creation still reads the complete
// frozen evidence on the server; never reuse this view as an analysis context.
function evidenceView(evidence: Evidence, signalKeys?: Set<string>): Evidence {
  return {
    analysisVersion: evidence.analysisVersion,
    capturedAt: evidence.capturedAt,
    availableThrough: evidence.availableThrough,
    periodDays: evidence.periodDays,
    githubReferral: evidence.githubReferral,
    summary: evidence.summary,
    searchQueries: evidence.searchQueries,
    pages: evidence.pages,
    industryCandidates: evidence.industryCandidates,
    limitations: evidence.limitations,
    publicSources: evidence.publicSources?.map(
      ({ id, title, url, kind, capturedAt, warnings }) => ({
        id,
        title,
        url,
        kind,
        capturedAt,
        warnings,
      }),
    ),
    ...(evidence.signals && (!signalKeys || signalKeys.size)
      ? {
          signals: {
            ...evidence.signals,
            items: signalKeys
              ? evidence.signals.items.filter((signal) =>
                  signalKeys.has(signal.key),
                )
              : evidence.signals.items,
          },
        }
      : {}),
  };
}

export function insightsState(state: StrategyState): StrategyState {
  const batchView = (
    batch: InsightBatch,
    historical = false,
  ): InsightBatch => ({
    ...batch,
    evidence: evidenceView(
      batch.evidence,
      historical
        ? new Set(batch.items.flatMap((card) => card.signalIds ?? []))
        : undefined,
    ),
  });
  return {
    revision: state.revision,
    goal: state.goal,
    // Proposals are needed for task links, not for their duplicated signals.
    proposals: state.proposals.map((proposal) => ({
      ...proposal,
      evidence: proposal.evidence
        ? evidenceView(proposal.evidence, new Set())
        : proposal.evidence,
    })),
    insights: state.insights ? batchView(state.insights) : undefined,
    insightHistory: state.insightHistory?.map((batch) =>
      batchView(batch, true),
    ),
    resultOpportunities: state.resultOpportunities,
    opportunityMeta: state.opportunityMeta,
    signalMeta: state.signalMeta,
    watch: state.watch,
  };
}
