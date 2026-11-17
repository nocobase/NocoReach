import type { RuleCategory } from '../../../shared/analysis-rule-categories.js';

export type Param = {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  unit: string;
  value: number;
};
export type Rule = {
  id: string;
  source: string;
  sourceName?: string;
  /** The Opportunities category the rule finds, or Current situation for one that finds none. */
  category?: RuleCategory;
  label: string;
  description: string;
  enabled: boolean;
  params: Param[];
  found: number | null;
  /** The most a paid rule may spend a month (USD), from the DataForSEO budget. */
  costUsd?: number;
  custom?: boolean;
  definition?: {
    id: string;
    name: string;
    source: string;
    condition: string;
    evidence: string;
  };
  run?: { status: string; reason?: string };
};
/** A Skill the scheme uses in the daily analysis, with its last run in this scheme. */
export type AnalysisSkill = {
  id: string;
  name: string;
  description: string;
  summaryKey?: string;
  builtIn?: boolean;
  run: {
    status: 'ok' | 'error';
    found: number;
    error?: 'model' | 'timeout' | 'call' | 'output' | 'empty';
  } | null;
};
/** Add Skill's list: every Skill of the library with the input tokens it would add a month. */
export type SkillChoice = Omit<AnalysisSkill, 'run'> & {
  monthlyTokens: number;
  selected: boolean;
};
export type View = {
  schemeId?: string;
  schemeName?: string;
  schemeVersion?: number;
  storeRevision?: number;
  activeSchemeId?: string;
  schemes?: { id: string; name: string; version: number }[];
  addedRuleId?: string;
  sourceStatuses?: Record<
    string,
    {
      state:
        'ready' | 'waiting' | 'stale' | 'error' | 'unknown' | 'disconnected';
      collectedAt?: string;
      sampleCount?: number;
    }
  >;
  sourceStatusesDemo?: boolean;
  revision: string;
  rules: Rule[];
  skills?: { max: number; selected: AnalysisSkill[] };
  focus: string;
  watchDays: number;
  watchLimits: { default: number; min: number; max: number };
  last: {
    computedAt: string;
    found: number | null;
    passed: number | null;
    missing: string[];
    /** How many Skills ran in the last analysis and how many growth points they found. */
    skills?: { count: number; found: number };
    analyzedAt: string | null;
    verdicts: { do: number; watch: number; skip: number };
  } | null;
};
export type Settings = {
  rules?: Record<
    string,
    { enabled?: boolean; values?: Record<string, number> }
  >;
  focus?: string;
  watchDays?: number;
  expectedRevision?: string;
};
