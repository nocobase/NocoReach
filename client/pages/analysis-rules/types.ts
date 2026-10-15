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
};
export type View = {
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
export type Change = {
  ruleId: string;
  field: string;
  before: number | boolean;
  after: number | boolean;
  reason: string;
};
export type Proposal = {
  revision: string;
  explanation: string;
  changes: Change[];
};
