import { nocobaseClient as api } from '#lib/nocoreach-api';
export interface Profile {
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
  reachable: boolean;
  status: number;
  elapsedMs: number;
  target: string;
}
export const proxyKey = ['nocoreach', 'proxyProfiles'];
export const connectionLabels: Record<string, string> = {
  google: 'Google',
  dataforseo: 'DataForSEO',
  github: 'GitHub',
  site: '网站内容',
  community: '论坛',
  packages: '包下载量',
  hackernews: 'Hacker News',
  competitors: '竞品',
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
