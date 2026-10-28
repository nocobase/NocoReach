export type DiscoveryQuery = { kind: 'repositories' | 'code'; query: string };
export type DiscoveryRule = {
  id: string;
  name: string;
  enabled: boolean;
  queries: DiscoveryQuery[];
  dependencies: { name: string; range: string }[];
  files: { path: string; contains: string }[];
  json: { path: string; field: string; equals: string }[];
  excludeOwners: string[];
  excludeRepositories: string[];
  includeForks: boolean;
  includeArchived: boolean;
  includeTemplates: boolean;
  intervalHours: number;
  batchSize: number;
};
export type Detection = 'verified' | 'candidate' | 'mention';
export type DiscoveryEvidence = {
  path: string;
  url: string;
  field?: string;
  expected: string;
  actual: string | null;
  matched: boolean;
};
export type DiscoveryMatch = {
  ruleId: string;
  status: Detection;
  commit: string;
  base: string;
  checkedAt: string;
  evidence: DiscoveryEvidence[];
};
export type DiscoveredRepository = {
  id: string;
  name: string;
  url: string;
  description: string;
  stars: number;
  createdAt: string;
  pushedAt: string | null;
  license: string | null;
  fork: boolean;
  archived: boolean;
  template: boolean;
  firstDiscoveredAt: string;
  checkedAt: string;
  matches: DiscoveryMatch[];
  review: 'unreviewed' | 'confirmed' | 'ignored';
  favorite: boolean;
  revision: number;
};
export type DiscoveryRun = {
  at: string;
  finishedAt: string;
  ok: boolean;
  checked: number;
  added: number;
  partial: boolean;
  capped: boolean;
  errors: string[];
  configError?: boolean;
  retryAt?: string;
};
export type DiscoveryStatus = {
  revision: number;
  credential: 'dedicated' | 'shared' | 'missing';
  connected: boolean;
  running: boolean;
  rules: DiscoveryRule[];
  savedCount: number;
  lastRun: DiscoveryRun | null;
  lastSuccessAt: string | null;
  nextScanAt: string | null;
  capped: boolean;
};
export type DiscoveryList = {
  items: DiscoveredRepository[];
  total: number;
  storedTotal: number;
  page: number;
  pageSize: number;
  capped: boolean;
};
export const DISCOVERY_LIMIT = 2000;
export function discoveryDetection(repo: DiscoveredRepository): Detection {
  return repo.matches.some((m) => m.status === 'verified')
    ? 'verified'
    : repo.matches.some((m) => m.status === 'candidate')
      ? 'candidate'
      : 'mention';
}
export function newDiscoveryRule(preset = false): DiscoveryRule {
  return {
    id: '',
    name: preset ? 'NocoBase 3' : '',
    enabled: true,
    queries: preset
      ? [
          {
            kind: 'code',
            query: '"@nocobase/app-server" filename:package.json',
          },
          { kind: 'repositories', query: 'nocobase in:readme' },
        ]
      : [{ kind: 'repositories', query: '' }],
    dependencies: preset
      ? [{ name: '@nocobase/app-server', range: '>=3.0.0-0 <4.0.0-0' }]
      : [],
    files: preset
      ? [
          {
            path: 'server/runtime.ts',
            contains: '@nocobase/app-server/runtime',
          },
          { path: 'client/runtime.ts', contains: '@nocobase/app-client' },
        ]
      : [],
    json: preset
      ? [
          {
            path: 'package.json',
            field: 'nocobase.templateKind',
            equals: 'app',
          },
        ]
      : [],
    excludeOwners: [],
    excludeRepositories: [],
    includeForks: false,
    includeArchived: false,
    includeTemplates: false,
    intervalHours: 24,
    batchSize: 20,
  };
}
