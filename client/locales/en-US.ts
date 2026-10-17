import schedules from './schedules/en-US.js';
import businessMessages from '../../shared/i18n/en.json';
import systemEnUS from './system/en-US.js';
import agentChat from '../extensions/nocobase-agent-chat/locales/en-US.js';
import type { LocaleResource } from '@nocobase/i18n';

const enUS = {
  'nocoreach.nav.apiKeys': 'API keys',
  ...businessMessages,
  schedules,
  ...systemEnUS,
  ...agentChat,
  'agentSetup.title': 'Use NocoReach in your agent',
  'agentSetup.description':
    'Copy these instructions into Claude Code, Codex, or another coding agent to connect to NocoReach.',
  'agentSetup.prompt':
    'Help me use NocoReach from this coding agent.\n\n1. Install the NocoReach CLI:\n{{install}}\n\n2. Start browser sign-in:\n{{login}}\nShow me the verification URL and code. Wait for me to check and approve the code in my browser; do not approve it for me.\n\n3. After I approve, run `nocoreach whoami` to verify the signed-in account, then `nocoreach docs` to learn the available commands. Use those commands for my requests, within my existing permissions. Do not ask for my password or use the download token as an API key.',
  'agentSetup.identity':
    'The download token only installs the CLI. After you approve browser sign-in, the agent acts as your account with your existing permissions.',
  'agentSetup.expiry':
    'The installation token lasts 30 minutes and permits up to 3 downloads. Keep the instructions private. Generate a new token if it expires.',
  'agentSetup.runtime':
    'Requires Node.js 24+ on macOS or Linux; on Windows, use WSL. This installs the CLI only.',
  'agentSetup.preparing': 'Preparing installation instructions…',
  'agentSetup.promptLabel': 'Agent setup instructions',
  'agentSetup.failed':
    'Could not prepare installation instructions. Please try again.',
  'agentSetup.signedOut':
    'Your session has expired. Sign in again to continue.',
  'agentSetup.forbidden':
    'You do not have permission to generate installation instructions. Contact your administrator.',
  'agentSetup.expired':
    'This installation token has expired. Generate a new token to continue.',
  'agentSetup.regenerate': 'Generate new token',
  'agentSetup.copy': 'Copy instructions',
  'agentSetup.copied': 'Copied',
  'agentSetup.copyFailed':
    'Could not copy. Select the instructions and copy them manually.',
  'agentSetup.signIn': 'Sign in again',
  'agentSetup.signInFailed':
    'Could not refresh your session. Please try again.',
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
  'nocoreach.nav.results': 'Results',
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
  'nocoreach.nav.proxyProfiles': 'Network',
  'nocoreach.nav.members': 'Members',
  'nocoreach.nav.membersPermissions': 'Members and permissions',
  'nocoreach.nav.roles': 'Roles',
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
    templateVersionUnknown: 'Version unknown',
    buildFreely: 'Find the opportunities in your data.',
    reliability: '<brand>NocoReach</brand> gets them done.',
  },
  app: {
    title: 'NocoReach',
  },
};

export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
