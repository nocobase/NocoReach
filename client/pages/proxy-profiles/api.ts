import type { MockScenario } from '../../../app-plugins/nocoreach-mock/server/types.js';
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
