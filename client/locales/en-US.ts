import businessMessages from '../../shared/i18n/en.json';
import systemEnUS from './system/en-US.js';
import agentChat from '../extensions/nocobase-agent-chat/locales/en-US.js';
import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  ...businessMessages,
  ...systemEnUS,
  ...agentChat,
  'nocoreach.nav.projectAi': 'Project AI',
  'nocoreach.agentCapabilities.group': 'NocoReach tasks',
  'nocoreach.agentCapabilities.read': 'Read current task data',
  'nocoreach.agentCapabilities.readDescription':
    'Read the task snapshots: metrics, keywords, pages, audit, knowledge, skills and forum posts.',
  'nocoreach.agentCapabilities.draft': 'Save a candidate draft',
  'nocoreach.agentCapabilities.draftDescription':
    'Save a draft for the current run without approving or publishing it.',
  'nocoreach.agentCapabilities.research': 'NocoReach Research',
  'nocoreach.agentCapabilities.community': 'NocoReach Community',
  'nocoreach.agentCapabilities.presetDescription':
    'Work from project evidence and submit a draft for human review.',
  'nocoreach.nav.insights': 'Insights',
  'nocoreach.nav.opportunities': 'Opportunities',
  'nocoreach.nav.tasks': 'Tasks',
  'nocoreach.nav.site': 'Site & product',
  'nocoreach.nav.pages': 'Pages',
  'nocoreach.nav.traffic': 'Traffic',
  'nocoreach.nav.audit': 'Site audit',
  'nocoreach.nav.github': 'GitHub',
  'nocoreach.nav.downloads': 'Downloads',
  'nocoreach.nav.search': 'Search & market',
  'nocoreach.nav.searchPerformance': 'Performance',
  'nocoreach.nav.keywords': 'Keywords',
  'nocoreach.nav.trends': 'Trends',
  'nocoreach.nav.competitors': 'Competitors',
  'nocoreach.nav.aiSearch': 'AI search',
  'nocoreach.nav.community': 'Community',
  'nocoreach.nav.forum': 'Forum',
  'nocoreach.nav.hackerNews': 'Hacker News',
  'nocoreach.nav.reddit': 'Reddit',
  'nocoreach.nav.x': 'X',
  'nocoreach.nav.discord': 'Discord',
  'nocoreach.nav.slack': 'Slack',
  'nocoreach.nav.aiTeam': 'AI team',
  'nocoreach.nav.agent': 'Agent',
  'nocoreach.nav.runners': 'Runner',
  'nocoreach.nav.models': 'Models',
  'nocoreach.nav.usage': 'Usage',
  'nocoreach.nav.playbooks': 'Playbooks',
  'nocoreach.nav.skills': 'Skills',
  'nocoreach.nav.projectKnowledge': 'Knowledge',
  'nocoreach.nav.analysisRules': 'Analysis rules',
  'nocoreach.nav.settings': 'Settings',
  'nocoreach.nav.connections': 'Data sources',
  'nocoreach.nav.proxyProfiles': 'Proxy profiles',
  'nocoreach.nav.members': 'Members',
  'auth.platform': 'AI growth team',
  'auth.marketingTitleFirst': 'Find what to do,',
  'auth.marketingTitleSecond': 'hand it to an Agent,',
  'auth.marketingTitleThird': 'ship it.',
  'auth.marketingDescription':
    'NocoReach reads your search, traffic, community and GitHub data every day and finds what is worth doing; once you agree, your Agent makes the change in your repository and opens a pull request.',
  'auth.frontend': 'Daily analysis',
  'auth.frontendDescription':
    'Online AI reads the data every day and proposes opportunities with evidence.',
  'auth.foundation': 'Repository-native',
  'auth.foundationDescription':
    'Your Agent edits the repository and opens a pull request for you to review.',
  'auth.marketingFooter': 'Find it, ship it, measure it.',
  'navigation.brandHome': 'NocoReach home',
  'navigation.brandApps': 'NocoReach applications',
  shell: {
    buildFreely: 'Find the opportunities in your data.',
    reliability: '<brand>NocoReach</brand> gets them done.',
  },
  app: {
    title: 'NocoReach',
  },
};

export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
