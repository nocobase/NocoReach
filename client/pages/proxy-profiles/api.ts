import type { MockScenario } from '../../../app-plugins/nocoreach-mock/server/types.js';
import { $t } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
export interface MockProfileSettings {
  scenario: MockScenario;
  seed: string;
  clock: string;
}
export interface ProfileCapabilities {
  mockEnabled: boolean;
  scenarios: MockScenario[];
}
export interface Profile {
  kind?: 'proxy' | 'mock';
  mock?: MockProfileSettings;
  id: string;
  name: string;
  url: string;
  username: string;
  hasPassword: boolean;
  revision: number;
  references: number;
  referenceDetails: { projectId: string; connection: string }[];
  updatedAt: string;
}
export interface NetworkTest {
  simulated?: boolean;
  validation?: 'configuration';
  reachable: boolean;
  status: number;
  elapsedMs: number;
  target: string;
  /** Whether the test went through a proxy. */
  proxied?: boolean;
  /** Why an unreachable target gave no answer. */
  reason?: 'timeout' | 'reset' | 'refused' | 'dns' | 'certificate' | 'other';
}
export const proxyKey = ['nocoreach', 'proxyProfiles'];
/** Settings › Network: the deployment's one proxy, or null for direct. */
export interface NetworkSettings {
  proxy: {
    id: string;
    url: string;
    username: string;
    hasPassword: boolean;
    revision: number;
  } | null;
}
export const networkKey = [...proxyKey, 'network'];
/** A project's choice that keeps one connection off the default proxy. */
export const DIRECT = 'direct';
/** Settings › Network lists the connections the default proxy can carry, in this order, with what each one covers.
 * YouTube, Bilibili and Xiaohongshu are read through collectors and never take it. */
export const networkSources: readonly {
  connection: string;
  name: string;
  detail?: string;
}[] = [
  {
    connection: 'google',
    name: 'Google',
    detail: 'network.sources.googleDetail',
  },
  {
    connection: 'github',
    name: 'GitHub',
    detail: 'network.sources.githubDetail',
  },
  {
    connection: 'dataforseo',
    name: 'DataForSEO',
    detail: 'network.sources.dataforseoDetail',
  },
  {
    connection: 'site',
    name: 'common.websiteContent',
    detail: 'network.sources.siteDetail',
  },
  { connection: 'community', name: 'common.discourseForum' },
  {
    connection: 'packages',
    name: 'proxyProfiles.packageDownloads',
    detail: 'network.sources.packagesDetail',
  },
  { connection: 'hackernews', name: 'common.hackerNewsMentions' },
  { connection: 'competitors', name: 'common.competitorActivity' },
  { connection: 'x', name: 'X' },
  { connection: 'discord', name: 'Discord' },
  { connection: 'slack', name: 'Slack' },
];
/** Checks are kept apart from `proxyKey`, so saving a setting never re-runs every check. */
export const checkKey = ['nocoreach', 'networkCheck'];
export const connectionLabels: Record<string, string> = {
  google: 'Google',
  youtube: 'YouTube',
  bilibili: 'Bilibili',
  xiaohongshu: 'common.xiaohongshu',
  dataforseo: 'DataForSEO',
  github: 'GitHub',
  site: 'common.websiteContent',
  community: 'common.forum',
  packages: 'proxyProfiles.packageDownloads',
  hackernews: 'Hacker News',
  competitors: 'common.competitor',
  x: 'X',
  discord: 'Discord',
  slack: 'Slack',
};
export const proxyRequest = <T>(action: string, body: object = {}) =>
  api.action<T>('nrProxyProfiles', action, {
    method: 'POST',
    body,
    unwrap: 'data',
  });
// Catalog entries share the actual upstream connection, not their display name.
export const sourceConnection: Record<string, string> = {
  ga4: 'google',
  youtube: 'youtube',
  bilibili: 'bilibili',
  xiaohongshu: 'xiaohongshu',
  gsc: 'google',
  github: 'github',
  'github-discovery': 'github',
  'github-traffic': 'github',
  'github-discussions': 'github',
  keywords: 'dataforseo',
  trends: 'dataforseo',
  reddit: 'dataforseo',
  'ai-visibility': 'dataforseo',
  site: 'site',
  discourse: 'community',
  packages: 'packages',
  mentions: 'hackernews',
  competitors: 'competitors',
  social: 'x',
  discord: 'discord',
  slack: 'slack',
};

/** The proxy server as people name it: host and port, without the scheme. */
export const proxyHost = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

/** Why a check got no answer, then what to try next. `proxySet` says whether turning the proxy on is an option. */
export function unreachableNotes(
  result: NetworkTest,
  name: string,
  proxySet: boolean,
) {
  return [
    $t(`network.reasons.${result.reason ?? 'other'}`),
    result.proxied
      ? $t('network.hintProxied')
      : $t(proxySet ? 'network.hintDirect' : 'network.hintNoProxy', {
          0: name,
        }),
  ];
}
