export type GoalFields = {
  intent: string;
  audience: string;
  focus: string;
  progress: string;
};
export type Goal = GoalFields & { version: number; confirmedAt: string };
export type Proposal = {
  id: string;
  title: string;
  brief: string;
  signalKey?: string;
  status: string;
  goalVersion: number | null;
  objective?: string;
  insight?: Opportunity | null;
  taskId?: number;
  taskNo?: number;
  evidence: Evidence;
};
export type SourceSummary = {
  from: string | null;
  through: string | null;
  availableFrom: string | null;
  availableDays: number;
  days: number;
  start?: string | null;
  end?: string;
  previousStart?: string | null;
  previousEnd?: string | null;
  previousDays?: number;
  expectedDays?: number;
  metrics?: Record<
    string,
    {
      current: number | null;
      previous: number | null;
      comparable: boolean;
      change: number | null;
      percent: number | null;
    }
  >;
  [key: string]: unknown;
};
export type Signal = {
  key: string;
  type: string;
  source: string;
  title: string;
  facts: string[];
  url?: string;
  strength: number;
  chip?: { tone: string; text: string };
  actionable: boolean;
  action: string | null;
  isNew?: boolean;
  topics?: { title: string; url: string | null }[];
};
export type Evidence = {
  signals?: {
    computedAt: string;
    coverage: Record<string, string | null>;
    missing: string[];
    items: Signal[];
  };
  analysisVersion?: number;
  githubReferral?: SourceSummary;
  publicSources?: {
    id: string;
    title: string;
    url: string;
    kind: string;
    capturedAt: string;
    warnings: string[];
  }[];
  summary?: { web: SourceSummary; search: SourceSummary };
  capturedAt: string;
  availableThrough: string | null;
  periodDays: number;
  searchQueries: unknown[];
  pages: unknown[];
  industryCandidates: unknown[];
  limitations: string[];
};
export type StrategyState = {
  opportunityMeta?: Record<
    string,
    {
      priority?: string;
      status?: string;
      reviewedAt?: string;
      restoredAt?: string;
      ignoredAt?: string;
    }
  >;
  signalMeta?: Record<string, { status: string; at?: string }>;
  watch?: Record<string, WatchRecord>;
  revision: number;
  goal: Goal | null;
  proposals: Proposal[];
  insights?: InsightBatch;
  insightHistory?: InsightBatch[];
};
export type Opportunity = {
  no?: number;
  reason?: string;
  signalIds?: string[];
  lifecycle?: string;
  reviewAt?: string;
  category?: string;
  priority?: string;
  priorityReason?: string;
  confidence?: string;
  effort?: string;
  target?: string;
  audience?: string;
  sources?: string[];
  firstSeenAt?: string;
  updatedAt?: string;
  change?: string;
  id: string;
  title: string;
  observation: string;
  meaning: string;
  evidenceText: string;
  limitation: string;
  suggestion: string;
  objective: string;
  source: string;
};
export type ActionDraft = { title: string; objective: string; brief: string };
export type SourceReview = { sourceId: string; reason: string; result: string };
export type SignalReview = {
  verdict: 'do' | 'watch' | 'skip';
  reason: string;
  waitingFor?: string;
  decideBy?: string;
};
export type WatchOutcome =
  'opportunity' | 'skip' | 'expired' | 'normal' | 'ignored';
export type WatchRecord = {
  key: string;
  source: string;
  since: string;
  startTitle: string;
  startFacts: string[];
  startChip?: { tone: string; text: string } | null;
  waitingFor?: string;
  decideBy: string;
  lastSeen?: string;
  ended?: {
    at: string;
    outcome: WatchOutcome;
    reason?: string;
    opportunityId?: string;
  };
};
export type InsightBatch = {
  observations?: string[];
  sourceReviews?: SourceReview[];
  signalReviews?: Record<string, SignalReview>;
  generatedAt: string;
  evidence: Evidence;
  items: Opportunity[];
};
