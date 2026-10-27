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
  label: string;
  description: string;
  enabled: boolean;
  params: Param[];
  found: number | null;
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
  focus: string;
  watchDays: number;
  watchLimits: { default: number; min: number; max: number };
  last: {
    computedAt: string;
    found: number | null;
    passed: number | null;
    missing: string[];
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
