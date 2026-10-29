/**
 * Business roles in administrator terms. A role chooses which projects it reaches (the projects its holders are
 * members of, or every project) and a short list of capabilities. The server expands each capability into the
 * registered business actions (`resource.action`) it covers; every action belongs to exactly one capability or to the
 * base every member receives. Pages follow from the capabilities.
 */

/** How far a role's project capabilities reach: the projects its holder belongs to, or every project. */
export type RoleScope = 'member' | 'all';

export const PROJECT_CAPABILITIES = [
  'view',
  'analyze',
  'tasks',
  'knowledge',
] as const;

/** Data sources a role may use: read their data and sync or search them. Configuring sources is one capability. */
export const SITES = [
  'google',
  'github',
  'website',
  'keywords',
  'competitors',
  'community',
  'packages',
  'hackernews',
  'reddit',
  'x',
  'trends',
  'chat',
  'youtube',
  'bilibili',
  'xiaohongshu',
  'web',
] as const;

export const APP_CAPABILITIES = [
  'projects',
  'members',
  'keys',
  'skills',
  'agents',
  'settings',
] as const;

export type Site = (typeof SITES)[number];
export const SOURCES_CONFIGURE = 'sources.configure';
export const siteCapability = (site: Site) => `sources.use.${site}`;
export const appCapability = (name: (typeof APP_CAPABILITIES)[number]) =>
  `app.${name}`;

export const TASK_COMMANDS = [
  'moveWork',
  'startSimple',
  'linkContent',
  'takeOwnership',
  'setOwner',
  'setAgent',
  'setCollaborators',
  'linkPage',
  'savePlan',
  'approvePlan',
  'saveResult',
  'approveResult',
  'requestChanges',
  'replan',
  'recordExecution',
  'verify',
  'selectPlaybook',
  'startTask',
  'comment',
  'approveStage',
  'requestStageChanges',
  'editStageOutput',
  'recordManual',
  'recoverResult',
  'retryStage',
  'cancelRun',
  'retryMerge',
  'markMerged',
  'confirmLive',
  'waitLonger',
  'revertRelease',
  'cancelTask',
  'archiveTask',
  'unarchiveTask',
  'snoozeTask',
  'unsnoozeTask',
  'confirmPublish',
  'linkArticle',
  'editArticleDraft',
  'retryPublish',
  'rebaseArticle',
] as const;

const list = (resource: string, actions: readonly string[]) =>
  actions.map((action) => `${resource}.${action}`);

/** Granted with every business role. Application actions among them use the application selector. */
export const BASE_ACTIONS = [
  'nrMembers.me',
  'nrMembers.list',
  'nrMock.status',
  'nrOnlineAI.status',
  'nrProxyProfiles.capabilities',
];

const SITE_ACTIONS: Record<Site, { use: string[]; configure: string[] }> = {
  google: {
    use: [
      ...list('nrGoogle', ['status', 'syncStatus', 'syncNow', 'syncControl']),
      ...list('nrDataViews', [
        'search',
        'searchCountries',
        'searchBreakdown',
        'searchRow',
        'website',
        'websiteRow',
        'websiteToday',
        'websiteRealtime',
        'page',
      ]),
    ],
    configure: list('nrGoogle', [
      'configure',
      'authorize',
      'callback',
      'resources',
      'select',
      'disconnect',
    ]),
  },
  github: {
    use: [
      ...list('nrGitHub', ['status', 'sync', 'backfill']),
      'nrDataViews.github',
    ],
    configure: list('nrGitHub', [
      'preview',
      'connect',
      'setToken',
      'removeToken',
      'disconnect',
    ]),
  },
  website: {
    use: list('nrSiteContent', ['summary', 'list', 'refresh']),
    configure: list('nrSiteContent', ['discover', 'confirm', 'remove']),
  },
  keywords: {
    use: list('nrKeywords', [
      'inspectRun',
      'status',
      'check',
      'preview',
      'run',
      'spend',
      'list',
      'getRun',
      'saved',
      'saveFromRun',
      'saveQueries',
      'removeSaved',
      'tagSaved',
      'updateTag',
      'deleteTag',
    ]),
    configure: list('nrKeywords', ['configure', 'setBudget', 'disconnect']),
  },
  competitors: {
    use: list('nrCompetitors', ['status', 'view', 'check']),
    configure: list('nrCompetitors', ['add', 'suggest', 'remove', 'edit']),
  },
  community: {
    use: [...list('nrCommunity', ['status', 'sync']), 'nrDataViews.community'],
    configure: list('nrCommunity', ['preview', 'connect', 'disconnect']),
  },
  packages: {
    use: [...list('nrPackages', ['status', 'sync']), 'nrDataViews.downloads'],
    configure: list('nrPackages', ['preview', 'add', 'remove']),
  },
  hackernews: {
    use: [
      ...list('nrHackerNews', ['status', 'sync']),
      'nrDataViews.hackernews',
    ],
    configure: list('nrHackerNews', ['preview', 'connect', 'disconnect']),
  },
  reddit: {
    use: list('nrReddit', ['status', 'check', 'view']),
    configure: list('nrReddit', ['connect', 'disconnect']),
  },
  x: {
    use: list('nrX', ['status', 'check', 'view']),
    configure: list('nrX', ['connect', 'disconnect']),
  },
  trends: {
    use: list('nrTrends', [
      'status',
      'check',
      'retry',
      'view',
      'addKeyword',
      'removeKeyword',
      'pick',
    ]),
    configure: list('nrTrends', ['connect', 'disconnect']),
  },
  chat: {
    use: list('nrChat', ['status', 'view', 'sync']),
    configure: list('nrChat', ['inspect', 'connect', 'disconnect']),
  },
  youtube: {
    use: list('nrYouTube', ['status', 'report', 'sync', 'cancel']),
    configure: list('nrYouTube', ['connect', 'disconnect', 'clear']),
  },
  bilibili: {
    use: list('nrBilibili', ['status', 'report', 'test', 'sync', 'cancel']),
    configure: list('nrBilibili', ['connect', 'disconnect', 'clear']),
  },
  xiaohongshu: {
    use: list('nrXiaohongshu', [
      'status',
      'view',
      'report',
      'test',
      'search',
      'cancel',
    ]),
    configure: list('nrXiaohongshu', ['connect', 'disconnect', 'clear']),
  },
  web: {
    use: list('nrSources', ['list', 'refresh']),
    configure: list('nrSources', ['preview', 'save', 'disconnect']),
  },
};

/** Every capability with the business actions it covers. Project capabilities follow the role's scope. */
export const CAPABILITY_ACTIONS: Readonly<Record<string, readonly string[]>> = {
  view: [
    'nrAgent.status',
    'nrAiQuestions.view',
    ...list('nrAiSearch', ['list', 'open', 'brand', 'gap', 'gaps']),
    'nrAnalysisRules.view',
    'nrAnalysis.status',
    'nrAudit.report',
    'nrAutomaticSources.list',
    'nrCompetitorResearch.view',
    'nrContentIndex.list',
    ...list('nrDataViews', ['overview', 'ranks']),
    ...list('nrDomains', ['list', 'getRun']),
    'nrGitHubTrends.view',
    ...list('nrHealth', ['list', 'connected']),
    'nrInsights.summary',
    'nrKeywordSuggest.view',
    ...list('nrKnowledge', ['list', 'get']),
    ...list('nrLighthouse', ['status', 'list', 'getRun']),
    ...list('nrMemory', ['status', 'seen']),
    'nrPlaybooks.list',
    'nrProjectIcon.get',
    'nrProjects.list',
    'nrRankTracking.status',
    ...list('nrSearchIndex', ['view', 'page', 'sitemaps']),
    'nrSignals.current',
    ...list('nrSkills', ['list', 'get']),
    ...list('nrStrategy', ['state', 'badges']),
    ...list('nrTaskWork', [
      'results',
      'result',
      'get',
      'numbers',
      'members',
      'list',
      'pages',
      'pagePlaces',
    ]),
    'nrArticles.targets',
  ],
  analyze: [
    ...list('nrAiQuestions', ['suggest', 'topics']),
    'nrAiSearch.ask',
    ...list('nrAnalysis', ['run', 'judge', 'judgeMissing']),
    'nrAudit.recheck',
    'nrCompetitorResearch.market',
    'nrDomains.run',
    ...list('nrGitHubTrends', ['setTopics', 'refresh']),
    ...list('nrKeywordDetail', ['site', 'save', 'market', 'serp']),
    ...list('nrKeywordSuggest', ['suggest', 'dig', 'save', 'renameDig', 'deleteDig', 'removeItems']),
    'nrLighthouse.run',
    ...list('nrRankTracking', ['add', 'remove', 'check']),
  ],
  tasks: [
    ...list('nrTaskWork', ['advance', 'execute']),
    ...TASK_COMMANDS.map((command) => `nrTaskWork.command.${command}`),
    // New task › Organize with AI goes with creating a task by hand.
    ...list('nrTasks', ['createManual', 'draftManual']),
    ...list('nrStrategy', [
      'reviewOpportunity',
      'saveInsights',
      'context',
      'saveGoal',
      'saveProposal',
      'approve',
      'confirmDirection',
      'splitTask',
      'handOffPlan',
      'decideSignal',
    ]),
    ...list('nrContentIndex', ['createWork', 'save']),
    'nrOnline.read',
    'nrArticles.search',
    'nrArticles.match',
    'nrArticles.languages',
  ],
  knowledge: [
    ...list('nrKnowledge', ['add', 'edit', 'remove', 'saveMemory']),
    ...list('nrKnowledgeAdd', ['suggest', 'confirm']),
    ...list('nrMemory', ['sources', 'draft', 'check', 'accept', 'dismiss']),
    ...list('nrPlaybooks', ['save', 'copy', 'remove', 'restore', 'draft']),
    ...list('nrAnalysisRules', [
      'create',
      'rename',
      'activate',
      'draft',
      'addRule',
      'updateRule',
      'propose',
      'apply',
      'save',
    ]),
    'nrAgent.saveDefault',
    ...list('nrSkills', ['readLink', 'setEnabled']),
    'nrProjects.edit',
  ],
  ...Object.fromEntries(
    SITES.map((site) => [siteCapability(site), SITE_ACTIONS[site].use]),
  ),
  [SOURCES_CONFIGURE]: [
    ...SITES.flatMap((site) => SITE_ACTIONS[site].configure),
    ...list('nrCollectors', ['status', 'save']),
    ...list('nrDiscovery', ['discover', 'connections']),
    ...list('nrAutomaticSources', ['ingest', 'disconnect']),
    ...list('nrProxyProfiles', ['selections', 'select', 'testConnection']),
    ...list('nrAgent', ['saveRepo', 'removeRepo']),
    ...list('nrArticles', [
      'saveTarget',
      'removeTarget',
      'setDefaultTarget',
      'savePlaybookTargets',
      'testTarget',
    ]),
  ],
  'app.projects': ['nrProjects.create'],
  'app.members': ['nrMembers.setRole'],
  'app.keys': ['nrKeys.manage'],
  'app.skills': list('nrSkills', [
    'create',
    'import',
    'importLink',
    'edit',
    'addFiles',
    'removeFile',
    'remove',
  ]),
  'app.agents': [
    'nrOnline.manage',
    'nrSchedules.manage',
    'nrOnlineAI.setModel',
  ],
  'app.settings': [
    ...list('nrProxyProfiles', [
      'list',
      'get',
      'save',
      'remove',
      'test',
      'network',
      'saveNetwork',
      'selectAll',
    ]),
    ...list('nrMock', ['configure', 'reset']),
  ],
};

/** In the order the role editor lists them. */
export const CAPABILITIES = [
  ...PROJECT_CAPABILITIES,
  ...SITES.map(siteCapability),
  SOURCES_CONFIGURE,
  ...APP_CAPABILITIES.map(appCapability),
];

export const isAppCapability = (capability: string) =>
  capability.startsWith('app.');

/** The built-in member role: everyday work in the projects a person belongs to. */
export const MEMBER_CAPABILITIES = [
  'view',
  'analyze',
  'tasks',
  ...SITES.map(siteCapability),
];

/** What the role editor and the server exchange. */
export type RoleAccess = {
  scope: RoleScope;
  capabilities: string[];
};
