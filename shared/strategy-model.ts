import type { TaskPart } from './opportunity-parts.js';
import type { ResultSource } from './result-source.js';
import type { Growth, NewPage } from './growth.js';
export type GoalFields = {
  intent: string;
  audience: string;
  focus: string;
  progress: string;
};
export type Goal = GoalFields & { version: number; confirmedAt: string };
export type Proposal = {
  resultSource?: ResultSource;
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
  /** The place of its opportunity the task was created for, when the opportunity was handed off one place at a time. */
  part?: TaskPart;
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
  sourceName?: string;
  title: string;
  facts: string[];
  url?: string;
  strength: number;
  chip?: { tone: string; text: string };
  actionable: boolean;
  action: string | null;
  isNew?: boolean;
  topics?: { title: string; url: string | null }[];
  /** A growth point's size and the rows behind it (shared/growth.ts); only growth points are actionable. */
  growth?: Growth;
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
  resultOpportunities?: Opportunity[];
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
  resultSource?: ResultSource;
  no?: number;
  reason?: string;
  signalIds?: string[];
  /** The growth of the first growth point it cites, as the server computed it. */
  growth?: Growth;
  lifecycle?: string;
  reviewAt?: string;
  category?: string;
  priority?: string;
  priorityReason?: string;
  confidence?: string;
  effort?: string;
  /** The existing page to change; empty when the opportunity writes a new page (`newPage`). */
  target?: string;
  /** A page that does not exist yet: the section it would go under and existing pages to link to it from (paths). */
  newPage?: NewPage;
  /** Where the change is made off the site (a list, a review, a community), when neither `target` nor `newPage`. */
  offsite?: string;
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
export type ActionDraft = {
  title: string;
  objective: string;
  brief: string;
  /** What the task is about; the server titles it with the playbook (server/nocoreach/execution/task-title.ts). */
  subject?: string;
};
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
  /** The first observation is the finding most worth seeing today; this is the opportunity it is about, if any. */
  leadId?: string;
  observations?: string[];
  sourceReviews?: SourceReview[];
  signalReviews?: Record<string, SignalReview>;
  generatedAt: string;
  evidence: Evidence;
  items: Opportunity[];
};
