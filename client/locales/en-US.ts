import type { LocaleResource } from '@nocobase/i18n';
import deviceApprovalEnUS from '@/extensions/nocobase-device-approval/locales/en-US';
import inboxEnUS from '@/extensions/nocobase-inbox/locales/en-US';

const enUS = {
  // The UI Library block of the `/device` page; the keys below may reword it.
  ...deviceApprovalEnUS,
  // The UI Library block of the `/inbox` page; the keys below may reword it.
  ...inboxEnUS,
  // The UI Library component of the header's inbox button.
  // NocoReach's menu (client/nocoreach-routes.ts).
  'nocoreach.nav.insights': 'Insights',
  'nocoreach.nav.opportunities': 'Opportunities',
  'nocoreach.nav.tasks': 'Tasks',
  'nocoreach.nav.site': 'Website and product',
  'nocoreach.nav.pages': 'Pages',
  'nocoreach.nav.traffic': 'Traffic',
  'nocoreach.nav.audit': 'Site audit',
  'nocoreach.nav.github': 'GitHub',
  'nocoreach.nav.downloads': 'Downloads',
  'nocoreach.nav.search': 'Search and market',
  'nocoreach.nav.searchPerformance': 'Search performance',
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
  'nocoreach.nav.playbooks': 'Playbooks',
  'nocoreach.nav.skills': 'Skills',
  'nocoreach.nav.projectKnowledge': 'Project knowledge',
  'nocoreach.nav.analysisRules': 'Analysis rules',
  'nocoreach.nav.settings': 'Settings',
  'nocoreach.nav.connections': 'Data sources',
  'nocoreach.nav.proxyProfiles': 'Proxy profiles',
  'nocoreach.nav.members': 'Members',
  'inboxButton.title': 'Inbox',
  'inboxButton.pending': 'Inbox, {{count}} waiting',
  'inboxButton.unread': 'Inbox, {{count}} unread',
  'inboxButton.pendingHint':
    '{{count}} waiting for you; it goes down once they are handled.',
  'inboxButton.unreadHint': '{{count}} unread; it goes down as you read them.',
  'auth.welcome': 'Welcome back',
  'auth.loginDescription': 'Sign in with your username or email and password.',
  'auth.registerTitle': 'Create an account',
  'auth.registerDescription': 'Create an account to get started.',
  'auth.forgotTitle': 'Forgot password',
  'auth.forgotDescription':
    'Enter your email and we will send a reset link if the account exists.',
  'auth.resetDescription': 'Choose a new password for your account.',
  'auth.resetTitle': 'Reset password',
  'auth.identifier': 'Username or email',
  'auth.password': 'Password',
  'auth.signIn': 'Sign in',
  'auth.signingIn': 'Signing in…',
  'auth.hidePassword': 'Hide password',
  'auth.showPassword': 'Show password',
  'auth.forgotLink': 'Forgot password?',
  'auth.noAccount': "Don't have an account?",
  'auth.signUp': 'Sign up',
  'auth.createAccount': 'Create account',
  'auth.creatingAccount': 'Creating account…',
  'auth.name': 'Name',
  'auth.username': 'Username',
  'auth.email': 'Email',
  'auth.confirmPassword': 'Confirm password',
  'auth.existingAccount': 'Already have an account?',
  'auth.passwordMismatch': "Passwords don't match.",
  'auth.resetting': 'Resetting…',
  'auth.newPassword': 'New password',
  'auth.confirmNewPassword': 'Confirm new password',
  'auth.invalidResetLink':
    'This password reset link is invalid or has expired.',
  'auth.backToSignIn': 'Back to sign in',
  'auth.sendResetLink': 'Send reset link',
  'auth.sending': 'Sending…',
  'auth.resetSent': 'If the account exists, a reset link has been sent.',
  'auth.rememberPassword': 'Remember your password?',
  'auth.methods': 'Sign-in methods',
  'auth.or': 'Or continue with',
  'auth.continueWith': 'Continue with {provider}',
  'auth.about': 'About this application',
  'auth.platform': 'AI growth team',
  'auth.marketingTitleFirst': 'Find what to do,',
  'auth.marketingTitleSecond': 'hand it to an Agent,',
  'auth.marketingTitleThird': 'ship it.',
  'auth.marketingDescription':
    'NocoReach reads your search, traffic, community and GitHub data every day and finds what is worth doing; once you agree, your local Agent makes the change in your repository and opens a pull request.',
  'auth.frontend': 'Daily analysis',
  'auth.frontendDescription':
    'Online AI reads the data every day and proposes opportunities with evidence.',
  'auth.foundation': 'Repository-native',
  'auth.foundationDescription':
    'Your local Agent edits the repository and opens a pull request for you to review.',
  'auth.marketingFooter': 'Find it, ship it, measure it.',
  'status.loading': 'Loading',
  'status.loadingPage': 'Loading page',
  'status.loadingSettings': 'Loading settings',
  'status.denied': 'Access denied',
  'status.pageFailed': 'Unable to load page',
  'status.retry': 'Retry',
  'navigation.brandHome': 'NocoReach home',
  'navigation.brandApps': 'NocoReach applications',
  'routeOverlay.close': 'Close',
  'status.deniedDescription': 'You do not have permission to access {{label}}.',
  'status.routeFailedDescription':
    'Route {{label}} from {{packageName}} could not be loaded.',
  shell: {
    buildFreely: 'Find the opportunities in your data.',
    reliability: '<brand>NocoReach</brand> gets them done.',
  },
  surface: {
    backToApp: 'Back to app',
    loading: 'Loading {{title}}',
    navigation: '{{title}} navigation',
    page: '{{title}} page',
  },
  settings: {
    title: 'Settings',
    emptyTitle: 'No settings available',
    emptyDescription:
      'No enabled plugin contributes a settings page you have access to.',
  },
  home: {
    title: 'Start building your application',
    description:
      'Describe what you need to your AI Agent, then build pages, data models, and business workflows.',
  },

  appearance: {
    title: 'Appearance',
    mode: 'Color mode',
    preset: 'Theme',
    light: 'Light',
    dark: 'Dark',
    system: 'System',
    themes: { default: 'Spacious', compact: 'Compact' },
  },
  app: {
    title: 'NocoReach',
  },
  actions: {
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    confirm: 'Confirm',
    language: 'Language',
  },
  notices: {
    serverLocaleFallback:
      'The server does not support this language, so server messages will use English.',
    languageChangeFailed:
      'Unable to complete the language change. Please try again.',
  },
  account: {
    signOutFailed: 'Unable to sign out. Please try again.',
    openMenu: 'Open account menu',
    fallback: 'Account',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  navigation: {
    home: 'Home',
    open: 'Open navigation',
    close: 'Close navigation',
    expand: 'Expand navigation',
    collapse: 'Collapse navigation',
    toggle: 'Expand or collapse navigation',
    label: 'Application navigation',
    description: 'Go to a page of this application.',
    breadcrumb: 'Breadcrumb',
    breadcrumbMore: 'Show the levels in between',
    back: 'Back',
  },
  dataTable: {
    noResults: 'No results.',
    sortAscending: 'Asc',
    sortDescending: 'Desc',
    hideColumn: 'Hide',
    view: 'View',
    toggleColumns: 'Toggle columns',
    selectedCount: '{{selected}} of {{total}} row(s) selected.',
    rowsPerPage: 'Rows per page',
    pageOf: 'Page {{page}} of {{pageCount}}',
    firstPage: 'Go to first page',
    previousPage: 'Go to previous page',
    nextPage: 'Go to next page',
    lastPage: 'Go to last page',
  },
  datePicker: {
    placeholder: 'Pick a date',
    rangePlaceholder: 'Pick a date range',
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
