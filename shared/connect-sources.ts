/**
 * The data sources of the Data sources page as both the page and the `nocoreach connect` commands see them: what each
 * needs, whether a command can connect it, and the state its saved connection is in. `name` and `needs` are semantic
 * message keys; a brand name that is never translated is written as itself.
 */
export type ConnectVia = 'cli' | 'browser';
export interface ConnectSource {
  readonly id: string;
  readonly name: string;
  readonly needs: readonly string[];
  /** `cli`: public data a command connects as the signed-in person. `browser`: a credential, an authorization or a
   * Collector, entered only on the source's panel. */
  readonly via: ConnectVia;
  /** Another source that must be connected first. */
  readonly requires?: string;
}

export const CONNECT_SOURCES: readonly ConnectSource[] = [
  {
    id: 'ga4',
    name: 'GA4',
    needs: ['dataSources.googleAccountAccessGa4'],
    via: 'browser',
  },
  {
    id: 'site',
    name: 'common.websiteContent',
    needs: [
      'dataSources.homepageUrlExampleHttpsExample',
      'dataSources.docsSiteUrlIfSeparate',
    ],
    via: 'cli',
  },
  {
    id: 'github',
    name: 'dataSources.githubRepository',
    needs: ['dataSources.publicRepositoryUrlExampleHttps'],
    via: 'cli',
  },
  {
    id: 'github-discovery',
    name: 'githubDiscovery.title',
    needs: ['githubDiscovery.needs'],
    via: 'browser',
  },
  {
    id: 'github-traffic',
    name: 'GitHub Traffic',
    needs: [
      'dataSources.repositoryAdminAccount',
      'dataSources.readFineGrainedTokenI',
    ],
    via: 'browser',
    requires: 'github',
  },
  {
    id: 'github-discussions',
    name: 'GitHub Discussions',
    needs: [
      'dataSources.connectedGithubRepository',
      'dataSources.readTokenGithubTraffic',
    ],
    via: 'browser',
    requires: 'github-traffic',
  },
  {
    id: 'packages',
    name: 'dataSources.npmPypiDockerHubDownloads',
    needs: ['dataSources.packageNamesPackagePageUrls'],
    via: 'cli',
  },
  {
    id: 'repo',
    name: 'dataSources.websiteSourceGitRepository',
    needs: [
      'dataSources.linkGithubRepositoryWebsiteSource',
      'dataSources.connectedRunnerTeamAccessibleAgent',
    ],
    via: 'browser',
  },
  {
    id: 'articles',
    name: 'dataSources.articlePublishing',
    needs: [
      'dataSources.articlePublishingNeedAddress',
      'dataSources.articlePublishingNeedMapping',
    ],
    via: 'browser',
  },
  {
    id: 'gsc',
    name: 'Google Search Console',
    needs: ['dataSources.googleAccountSearchConsoleAccess'],
    via: 'browser',
  },
  {
    id: 'keywords',
    name: 'dataSources.dataforseoKeywordsCompetitorsAiSearch',
    needs: [
      'dataSources.dataforseoApiLoginPassword',
      'dataSources.monthlyBudgetCapUsd',
    ],
    via: 'browser',
  },
  {
    id: 'trends',
    name: 'Google Trends',
    needs: [
      'dataSources.connectedDataforseo',
      'dataSources.productNameExampleNocobase',
    ],
    via: 'cli',
    requires: 'keywords',
  },
  {
    id: 'competitors',
    name: 'common.competitorActivity',
    needs: [
      'common.competitorName',
      'dataSources.competitorWebsitesGithubRepositories',
    ],
    via: 'cli',
  },
  {
    id: 'ai-visibility',
    name: 'dataSources.aiSearchVisibility',
    needs: ['dataSources.connectedDataforseo'],
    via: 'browser',
    requires: 'keywords',
  },
  {
    id: 'discourse',
    name: 'common.discourseForum',
    needs: ['dataSources.forumHomepageUrlExampleHttps'],
    via: 'cli',
  },
  {
    id: 'mentions',
    name: 'common.hackerNewsMentions',
    needs: ['dataSources.productNameWebsiteDomainExample'],
    via: 'cli',
  },
  {
    id: 'reddit',
    name: 'dataSources.redditDiscussions',
    needs: [
      'dataSources.connectedDataforseo',
      'dataSources.productNameExampleNocobase',
    ],
    via: 'cli',
    requires: 'keywords',
  },
  {
    id: 'social',
    name: 'X',
    needs: [
      'dataSources.bearerTokenXDeveloperPortal',
      'dataSources.productNameSearchExampleNocobase',
      'dataSources.optionalOfficialAccountExampleNocobase',
    ],
    via: 'browser',
  },
  { id: 'bilibili', name: 'Bilibili', needs: [], via: 'browser' },
  {
    id: 'xiaohongshu',
    name: 'dataSources.xiaohongshuBrowserCollection',
    needs: [],
    via: 'browser',
  },
  { id: 'youtube', name: 'YouTube', needs: [], via: 'browser' },
  {
    id: 'discord',
    name: 'Discord',
    needs: ['dataSources.discordBotToken', 'dataSources.channelsReadUp10'],
    via: 'browser',
  },
  {
    id: 'slack',
    name: 'Slack',
    needs: [
      'dataSources.slackBotUserOauthToken',
      'dataSources.publicChannelsReadUp10',
    ],
    via: 'browser',
  },
];

export const connectSource = (id: string) =>
  CONNECT_SOURCES.find((source) => source.id === id);

export type SourceState =
  | 'connected'
  | 'partial'
  | 'ready'
  | 'soon'
  | 'planned'
  | 'needs-admin'
  | 'unconfigured'
  | 'pending'
  | 'attention'
  | 'done';

/** The saved state of each connection, as the status actions of the Data sources page answer it. */
export type StatusInput = {
  youtube?: {
    configured: boolean;
    connected: boolean;
    lastSync?: { ok: boolean; errors?: string[] } | null;
  } | null;
  bilibili?: {
    connected: boolean;
    configured: boolean;
    verifiedAt: string | null;
    lastRun?: { ok: boolean } | null;
  } | null;
  xiaohongshu?: {
    configured: boolean;
    connected: boolean;
    verifiedAt?: string | null;
    lastRun?: { ok: boolean } | null;
  } | null;
  packages?: { connected: boolean } | null;
  hackernews?: { connected: boolean } | null;
  reddit?: { connected: boolean } | null;
  trends?: { connected: boolean } | null;
  competitors?: { connected: boolean } | null;
  x?: { connected: boolean } | null;
  chat?: {
    discord: { connected: boolean };
    slack: { connected: boolean };
  } | null;
  community?: { connected: boolean; lastSync?: { ok: boolean } | null } | null;
  githubDiscovery?: {
    connected: boolean;
    lastRun?: { ok: boolean } | null;
  } | null;
  github?: {
    connected: boolean;
    token?: { error: string | null } | null;
    discussions?: { enabled: boolean; total: number } | null;
  } | null;
  keyword?: { configured: boolean; verifiedAt: string | null } | null;
  google?: {
    configured: boolean;
    authorized: boolean;
    connection: {
      ga4PropertyId?: string | null;
      gscSiteUrl?: string | null;
    } | null;
  } | null;
  publicSources?: { kind: string; status: string; error?: string }[];
  site?: { pages: number } | null;
  repo?: { repo: string } | null;
  articles?: { targets: number } | null;
};

/** A source's state, derived only from saved connection state, never assumed. */
export function connectionState(id: string, input: StatusInput): SourceState {
  if (id === 'bilibili') {
    const b = input.bilibili;
    return b && !b.configured
      ? 'needs-admin'
      : !b?.connected
        ? 'ready'
        : b.verifiedAt && b.lastRun?.ok
          ? 'connected'
          : 'partial';
  }
  const g = input.google;
  if (id === 'gsc' || id === 'ga4') {
    if (!g) return 'ready';
    if (!g.configured) return 'needs-admin';
    const picked =
      id === 'gsc' ? g.connection?.gscSiteUrl : g.connection?.ga4PropertyId;
    return g.authorized && picked
      ? 'connected'
      : g.authorized
        ? 'partial'
        : 'ready';
  }
  if (id === 'github-discovery')
    return input.githubDiscovery?.connected
      ? input.githubDiscovery.lastRun?.ok === false
        ? 'attention'
        : 'connected'
      : 'ready';
  if (id === 'github') {
    if (input.github?.connected) return 'connected';
    const repos = (input.publicSources || []).filter(
      (s) => s.kind === 'github' && s.status !== 'disconnected',
    );
    return repos.length ? 'partial' : 'ready';
  }
  if (id === 'github-discussions') {
    const gh = input.github;
    if (!gh?.connected) return 'ready';
    if (!gh.token) return 'partial';
    return gh.discussions?.enabled ? 'connected' : 'ready';
  }
  if (id === 'github-traffic') {
    const t = input.github?.token;
    return !input.github?.connected || !t
      ? 'ready'
      : t.error
        ? 'partial'
        : 'connected';
  }
  if (id === 'site') return input.site?.pages ? 'connected' : 'ready';
  if (id === 'repo') return input.repo?.repo ? 'connected' : 'ready';
  if (id === 'articles') return input.articles?.targets ? 'connected' : 'ready';
  if (id === 'discourse') {
    const c = input.community;
    return !c?.connected
      ? 'ready'
      : c.lastSync && !c.lastSync.ok
        ? 'partial'
        : 'connected';
  }
  if (id === 'youtube') {
    const y = input.youtube;
    return y?.connected
      ? (y.lastSync && !y.lastSync.ok) || y.lastSync?.errors?.length
        ? 'partial'
        : 'connected'
      : y?.configured
        ? 'partial'
        : 'ready';
  }
  if (id === 'packages')
    return input.packages?.connected ? 'connected' : 'ready';
  if (id === 'mentions')
    return input.hackernews?.connected ? 'connected' : 'ready';
  if (id === 'reddit') return input.reddit?.connected ? 'connected' : 'ready';
  if (id === 'trends') return input.trends?.connected ? 'connected' : 'ready';
  if (id === 'competitors')
    return input.competitors?.connected ? 'connected' : 'ready';
  if (id === 'xiaohongshu') {
    const x = input.xiaohongshu;
    if (x === undefined) return 'pending';
    if (!x) return 'attention';
    if (!x.configured) return 'unconfigured';
    if (!x.connected) return 'ready';
    if (x.lastRun && !x.lastRun.ok) return 'attention';
    return x.verifiedAt && x.lastRun?.ok ? 'done' : 'pending';
  }
  if (id === 'social') return input.x?.connected ? 'connected' : 'ready';
  if (id === 'discord' || id === 'slack')
    return input.chat?.[id]?.connected ? 'connected' : 'ready';
  if (id === 'keywords')
    return input.keyword?.configured
      ? input.keyword.verifiedAt
        ? 'connected'
        : 'partial'
      : 'ready';
  if (id === 'ai-visibility')
    return input.keyword?.verifiedAt ? 'connected' : 'ready';
  return 'ready';
}
