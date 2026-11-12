import { useBusinessAccess } from '#hooks/use-business-access';

const actions = (resource: string, names: string[]) =>
  names.map((name) => `${resource}.${name}`);
const google = actions('nrGoogle', [
  'configure',
  'authorize',
  'resources',
  'select',
  'disconnect',
  'syncNow',
  'syncControl',
]);
const github = actions('nrGitHub', [
  'preview',
  'connect',
  'sync',
  'backfill',
  'setToken',
  'removeToken',
  'disconnect',
]);
const chat = actions('nrChat', ['inspect', 'connect', 'disconnect', 'sync']);
const keywords = actions('nrKeywords', [
  'configure',
  'check',
  'setBudget',
  'disconnect',
]);
// A connection drawer serves several actions; permission for any of them makes it reachable.
const managementActions: Record<string, readonly string[]> = {
  gsc: google,
  ga4: google,
  github,
  'github-traffic': github,
  'github-discussions': github,
  site: actions('nrSiteContent', ['discover', 'confirm', 'remove']),
  repo: actions('nrAgent', ['saveRepo', 'removeRepo', 'checkRepo']),
  articles: actions('nrArticles', [
    'saveTarget',
    'removeTarget',
    'setDefaultTarget',
    'savePlaybookTargets',
    'testTarget',
  ]),
  keywords,
  'ai-visibility': keywords,
  discourse: actions('nrCommunity', [
    'preview',
    'connect',
    'sync',
    'disconnect',
  ]),
  packages: actions('nrPackages', ['preview', 'add', 'remove', 'sync']),
  mentions: actions('nrHackerNews', [
    'preview',
    'connect',
    'sync',
    'disconnect',
  ]),
  reddit: actions('nrReddit', ['connect', 'check', 'disconnect']),
  trends: actions('nrTrends', ['connect', 'check', 'disconnect']),
  competitors: actions('nrCompetitors', ['suggest', 'add', 'edit', 'remove']),
  social: actions('nrX', ['connect', 'check', 'disconnect']),
  discord: chat,
  slack: chat,
  youtube: actions('nrYouTube', [
    'connect',
    'sync',
    'cancel',
    'disconnect',
    'clear',
  ]),
  bilibili: actions('nrBilibili', [
    'connect',
    'test',
    'sync',
    'cancel',
    'disconnect',
  ]),
  xiaohongshu: actions('nrXiaohongshu', [
    'connect',
    'test',
    'search',
    'cancel',
    'disconnect',
  ]),
};
const noActions: readonly string[] = [];

export function useSourceAccess(
  source: string | undefined,
  projectId: number | undefined,
) {
  return useBusinessAccess(
    source ? (managementActions[source] ?? noActions) : noActions,
    projectId ?? null,
  );
}
