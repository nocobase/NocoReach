import { agentsRoute, runtimesRoute, modelsRoute, usageRoute } from '@nocobase/app-plugin-agents/client/routes';
// NocoReach's business pages keep the classic portal paths (apps/portal/src/routes.tsx), so links inside them keep
// working. The top menu is 洞察 → 机会 → 任务, 网站与产品, 搜索与市场, 社区, AI 团队 and 设置. Settings lists Members,
// Roles, API keys and the other settings as peers. Business pages use
// `authz: 'skip'`; official Agents pages retain their page/settings grants. MemberGate and each server action also check
// NocoReach access independently.
// Old addresses that moved redirect as they did before.
//
// Not carried over yet (docs/PORT-PLAN.md): hiding a data page until its source is connected, and the counts on 机会
// and 任务 in the menu.
import {
  AtSign,
  Clock,
  Bookmark,
  Bot,
  ChartNoAxesCombined,
  ClipboardCheck,
  Earth,
  Files,
  Github,
  Globe,
  Hash,
  Lightbulb,
  ListTodo,
  MessageCircle,
  MessagesSquare,
  MessageSquareText,
  Newspaper,
  NotebookPen,
  Package,
  DatabaseZap,
  Plug,
  Search,
  Slack,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Users,
  WandSparkles,
  Workflow,
  Globe2,
  Store,
  Settings2,
  KeyRound,
  BookHeart,
  TvMinimalPlay,
  Youtube,
} from 'lucide-react';
import { createElement, type ComponentType } from 'react';
import { Navigate } from 'react-router';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
  type AppClientRoutePageDefinition,
} from '@nocobase/app-client/plugins';

import { useNocoReachLocale } from './i18n/index.js';

type Loader = () => Promise<{ default: ComponentType<object> }>;

// Every NocoReach page sits behind the member and project gates the classic layout had (pages/nocoreach-page.tsx).
const gated =
  (
    load: () => Promise<{ default: ComponentType<object> }>,
    fullHeight = false,
    projectRequired = true,
  ): Loader =>
  async () => {
    const [{ default: Page }, { NocoReachPage }] = await Promise.all([
      load(),
      import('./pages/nocoreach-page.js'),
    ]);
    return {
      default: function NocoReachRoute(props: object) {
        useNocoReachLocale();
        return createElement(
          NocoReachPage,
          { fullHeight, projectRequired },
          createElement(Page, props),
        );
      },
    };
  };

const redirect =
  (to: string): Loader =>
  () =>
    Promise.resolve({
      default: () => createElement(Navigate, { to, replace: true }),
    });

const page = (
  name: string,
  path: string,
  load: () => Promise<{ default: ComponentType<object> }>,
  navigation?: { title: string; icon?: ComponentType<{ className?: string }>; order?: number },
): AppClientRoutePageDefinition => ({
  name,
  path,
  auth: 'required',
  authz: { resource: { type: 'page', id: name }, action: 'access' },
  componentLoader: gated(load, false, !['members', 'keys', 'demo-data'].includes(name)),
  ...(navigation ? { navigation } : {}),
});

const moved = (name: string, path: string, to: string): AppClientRouteDefinition => ({
  name,
  path,
  auth: 'required',
  authz: 'skip',
  componentLoader: redirect(to),
});

const group = (
  name: string,
  title: string,
  icon: ComponentType<{ className?: string }>,
  order: number,
  children: AppClientRouteDefinition[],
): AppClientRouteDefinition => ({ name, navigation: { title, icon, order }, children });

const nav = (key: string) => `nocoreach.nav.${key}`;

export const nocoReachRoutes: AppClientRouteContribution = defineAppRoutes([
  // The main line, without a group title.
  page('growth-overview', '/home', () => import('./pages/strategy/index.js'), { title: nav('insights'), icon: Sparkles, order: 1 }),
  page('opportunity-library', '/opportunities', () => import('./pages/strategy/library.js'), { title: nav('opportunities'), icon: Lightbulb, order: 2 }),
  {...page('action-center', '/actions', () => import('./pages/optimization-work.js'), { title: nav('tasks'), icon: ListTodo, order: 3 }), children:[{name:'task-create',path:'new',auth:'required',authz:{resource:{type:'page',id:'task-create'},action:'access'},componentLoader:gated(() => import('./pages/task-create.js'))}]},
  page('task-work', '/actions/:taskId', () => import('./pages/task-work.js')),
  // 成果 is a dashboard; 全部成果 covers it at /results/all. A result's drawer opens over whichever of the two it was
  // opened from, so it is declared under both.
  { ...page('result-list', '/results', () => import('./pages/results/index.js'), { title: nav('results'), icon: ChartNoAxesCombined, order: 3.5 }), children: [
    { name: 'result-all', path: 'all', auth: 'required', authz: 'skip', componentLoader: () => import('./pages/results/all.js'), children: [
      { ...page('result-all-detail', ':taskId', () => import('./pages/results/detail.js')), authz: { resource: { type: 'page', id: 'result-detail' }, action: 'access' }, children: [{ ...page('result-all-create', 'create', () => import('./pages/results/create.js')), authz: { resource: { type: 'page', id: 'result-create' }, action: 'access' } }] },
    ] },
    { ...page('result-detail', ':taskId', () => import('./pages/results/detail.js')), children: [page('result-create', 'create', () => import('./pages/results/create.js'))] },
  ] },
  page('opportunity-explore', '/home/explore', () => import('./pages/strategy/index.js')),

  group('nav-site', nav('site'), Globe2, 4, [
    page('content-index', '/content', () => import('./pages/content-index.js'), { title: nav('pages'), icon: Files, order: 2 }),
    page('website-performance', '/website', () => import('./pages/data-website/index.js'), { title: nav('traffic'), icon: Globe, order: 1 }),
    page('site-audit', '/audit', () => import('./pages/site-audit.js'), { title: nav('audit'), icon: ClipboardCheck, order: 3 }),
    page('data-github', '/data/github', () => import('./pages/data-github/index.js'), { title: nav('github'), icon: Github, order: 4 }),
    page('data-downloads', '/data/downloads', () => import('./pages/data-downloads/index.js'), { title: nav('downloads'), icon: Package, order: 5 }),
  ]),
  group('nav-search', nav('search'), Store, 5, [
    page('search-growth', '/seo-opportunities', () => import('./pages/search-performance/index.js'), { title: nav('searchPerformance'), icon: Search, order: 1 }),
    // 关键词 详情 covers whichever tab of 关键词 opened it (RouteChildPage), at that tab's URL plus /detail. It renders
    // inside the 关键词 page, which already passed the gates; gated() would wrap it in a second content container, and
    // the layer would cover that empty container instead of the page.
    { ...page('saved-keywords', '/keywords', () => import('./pages/saved-keywords.js'), { title: nav('keywords'), icon: Bookmark, order: 2 }), children: [{ name: 'keyword-detail', path: 'detail', auth: 'required', authz: 'skip', componentLoader: () => import('./pages/keyword-detail.js') }] },
    page('data-trends', '/trends', () => import('./pages/data-trends.js'), { title: nav('trends'), icon: TrendingUp, order: 3 }),
    page('domain-overview', '/research/domain', () => import('./pages/competitors-page.js'), { title: nav('competitors'), icon: Earth, order: 4 }),
    page('ai-search', '/ai-search', () => import('./pages/ai-search.js'), { title: nav('aiSearch'), icon: MessageSquareText, order: 5 }),
  ]),
  group('nav-community', nav('community'), MessagesSquare, 6, [
    page('data-community', '/data/community', () => import('./pages/data-community.js'), { title: nav('forum'), icon: MessagesSquare, order: 1 }),
    page('data-hackernews', '/data/hackernews', () => import('./pages/data-hackernews.js'), { title: nav('hackerNews'), icon: Newspaper, order: 2 }),
    page('data-reddit', '/data/reddit', () => import('./pages/data-reddit.js'), { title: nav('reddit'), icon: MessageCircle, order: 3 }),
    page('data-x', '/data/x', () => import('./pages/data-x.js'), { title: nav('x'), icon: AtSign, order: 4 }),
    page('data-discord', '/data/discord', () => import('./pages/data-discord.js'), { title: nav('discord'), icon: Hash, order: 5 }),
    page('data-slack', '/data/slack', () => import('./pages/data-slack.js'), { title: nav('slack'), icon: Slack, order: 6 }),
    page('data-xiaohongshu', '/data/xiaohongshu', () => import('./pages/data-xiaohongshu.js'), { title: nav('xiaohongshu'), icon: BookHeart, order: 7 }),
    page('data-bilibili', '/data/bilibili', () => import('./pages/data-bilibili.js'), { title: nav('bilibili'), icon: TvMinimalPlay, order: 8 }),
    page('data-youtube', '/data/youtube', () => import('./pages/data-youtube.js'), { title: nav('youtube'), icon: Youtube, order: 9 }),
  ]),
  group('nav-ai', nav('aiTeam'), Sparkles, 7, [
    { ...page('agents', '/agents', () => import('./pages/agents/index.js'), { title: nav('agent'), icon: Bot, order: 1 }), children: [
      { ...page('runner-agents', 'runner', () => import('./pages/agents/runner.js')), authz: agentsRoute.authz },
      { ...page('online-agents', 'online', () => import('./online-agent/settings.js')), children: [page('online-agent-new', 'new', () => import('./online-agent/edit.js')), page('online-agent-edit', ':onlineAgentId/edit', () => import('./online-agent/edit.js'))] },
      // The runtimes, models and usage pages are tabs of Agent, keeping the Agents plugin's own grants.
      { ...runtimesRoute, path: 'runtimes', componentLoader: gated(runtimesRoute.componentLoader) },
      { ...modelsRoute, path: 'models', componentLoader: gated(modelsRoute.componentLoader) },
      { ...usageRoute, path: 'usage', componentLoader: gated(usageRoute.componentLoader) },
    ] },
    page('playbooks', '/playbooks', () => import('./pages/playbooks.js'), { title: nav('playbooks'), icon: Workflow, order: 3 }),
    page('skills', '/skills', () => import('./pages/skills.js'), { title: nav('skills'), icon: WandSparkles, order: 4 }),
    // 项目知识 has two tabs, 记忆 and 知识库; each opens its dialogs and drawer over itself.
    { ...page('project-settings', '/project', () => import('./pages/project-knowledge/index.js'), { title: nav('projectKnowledge'), icon: NotebookPen, order: 5 }), children: [
      { name: 'project-memory', path: 'memory', auth: 'required', authz: 'skip', componentLoader: () => import('./pages/project-knowledge/memory.js'), children: [
        { name: 'project-memory-edit', path: 'edit', auth: 'required', authz: 'skip', componentLoader: () => import('./pages/project-knowledge/memory-edit.js') },
        { name: 'project-memory-generate', path: 'generate', auth: 'required', authz: 'skip', componentLoader: () => import('./pages/project-knowledge/memory-generate.js') },
      ] },
      { name: 'project-knowledge-base', path: 'knowledge', auth: 'required', authz: 'skip', componentLoader: () => import('./pages/project-knowledge/knowledge-base.js'), children: [
        { name: 'project-knowledge-new', path: 'new', auth: 'required', authz: 'skip', componentLoader: () => import('./pages/project-knowledge/knowledge-add.js') },
        { name: 'project-knowledge-item', path: ':itemId', auth: 'required', authz: 'skip', componentLoader: () => import('./pages/project-knowledge/knowledge-item.js') },
      ] },
    ] },
    page('analysis-rules', '/rules', () => import('./pages/analysis-rules.js'), { title: nav('analysisRules'), icon: SlidersHorizontal, order: 6 }),
  ]),
  group('nav-settings', nav('settings'), Settings2, 8, [
    {
      name: 'schedules',
      path: '/schedules',
      auth: 'required',
      // Match the official Scheduler API; membership alone does not grant task administration.
      authz: {
        resource: { type: 'page', id: 'scheduler.schedules' },
        action: 'access',
      },
      navigation: { title: 'schedules.title', icon: Clock, order: 6 },
      // Anchor the history layer to the available content height, not the list's height.
      componentLoader: gated(() => import('./pages/schedules/index.js'), true),
      children: [
        {
          name: 'schedule-edit',
          path: ':scheduleId/edit',
          breadcrumb: { title: 'schedules.editTime' },
          componentLoader: () => import('./pages/schedules/detail.js'),
        },
        {
          name: 'schedule-detail',
          path: ':scheduleId',
          breadcrumb: { title: 'schedules.history' },
          componentLoader: () => import('./pages/schedules/detail.js'),
        },
      ],
    },
    page('data-connections', '/connections', () => import('./pages/source-connections.js'), { title: nav('connections'), icon: Plug, order: 1 }),
    page('demo-data', '/demo-data', () => import('./pages/demo-management/index.js'), { title: nav('demoData'), icon: DatabaseZap, order: 7 }),
    { ...page('proxy-profiles', '/proxy-profiles', () => import('./pages/network.js'), { title: nav('proxyProfiles'), icon: Globe2, order: 5 }), children: [
      { name: 'network-proxy', path: 'proxy', componentLoader: () => import('./pages/proxy-profiles/proxy-form.js') },
      { name: 'proxy-profile-new', path: 'new', componentLoader: () => import('./pages/proxy-profiles/edit.js') },
      { name: 'proxy-profile-edit', path: ':profileId/edit', componentLoader: () => import('./pages/proxy-profiles/edit.js') },
    ] },
    { ...page('members', '/members', () => import('./pages/members.js'), { title: nav('members'), icon: Users, order: 2 }), children: [
      { name: 'member-invite', path: 'invite', componentLoader: () => import('./pages/access/invite-form.js') },
      // Role paths come before :memberId/roles so /members/roles/roles opens the role, not a member.
      { name: 'role-new', path: 'roles/new', componentLoader: () => import('./pages/access/role-form.js') },
      { name: 'role-edit', path: 'roles/:roleKey', componentLoader: () => import('./pages/access/role-form.js') },
      { name: 'member-roles', path: ':memberId/roles', componentLoader: () => import('./pages/access/member-form.js') },
    ] },
    { ...page('keys', '/keys', () => import('./pages/access/keys.js'), { title: nav('apiKeys'), icon: KeyRound, order: 4 }), authz: { resource: { type: 'page', id: 'members' }, action: 'access' }, children: [
        { name: 'key-new', path: 'new', componentLoader: () => import('./pages/access/key-form.js') },
        { name: 'key-history', path: ':ownerId/:keyId', componentLoader: () => import('./pages/access/key-history.js') },
    ] },
  ]),

  // Old addresses.
  moved('flows-legacy', '/flows', '/playbooks'),
  moved('network-settings', '/network', '/proxy-profiles'),
  moved('data-overview', '/data', '/home'),
  moved('data-chat', '/data/chat', '/data/discord'),
  moved('keyword-research', '/research/keywords', '/keywords?tab=research'),
  moved('project-strategy', '/project/strategy', '/home'),
  moved('insights-opportunities', '/insights', '/home'),
  moved('action-plan', '/action-plan', '/actions'),
  page('search-overview-legacy', '/seo-opportunities/overview', () => import('./pages/search-performance/index.js')),
  page('search-performance-legacy', '/seo-opportunities/performance', () => import('./pages/search-performance/index.js')),
  moved('search-opportunities-legacy', '/seo-opportunities/opportunities', '/keywords'),
  moved('website-overview', '/website/overview', '/website'),
  moved('website-sources', '/website/sources', '/website'),
  moved('website-conversion', '/website/conversion', '/website'),
  moved('website-pages', '/website/pages', '/website?tab=pages'),
]);
