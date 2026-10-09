// NocoReach's pages, as the classic portal declared them (apps/portal/src/routes.tsx): the same paths, so every link
// inside the pages keeps working, and the same menu — 洞察 → 机会 → 任务 at the top, then 网站与产品, 搜索与市场, 社区,
// AI 团队 and 设置. Every page is open to everyone signed in (`authz: 'skip'`): who may use NocoReach is decided by
// NocoReach itself (MemberGate: 管理员 and 成员 picked in 设置 · 成员), and the server checks each action the same way.
// Old addresses that moved redirect as they did before.
//
// Not carried over yet (docs/PORT-PLAN.md): hiding a data page until its source is connected, and the counts on 机会
// and 任务 in the menu.
import {
  AtSign,
  Bookmark,
  Bot,
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
} from 'lucide-react';
import { createElement, type ComponentType } from 'react';
import { Navigate } from 'react-router';
import {
  defineAppRoutes,
  type AppClientRouteContribution,
  type AppClientRouteDefinition,
} from '@nocobase/app-client/plugins';

type Loader = () => Promise<{ default: ComponentType<object> }>;

// Every NocoReach page sits behind the member and project gates the classic layout had (pages/nocoreach-page.tsx).
const gated =
  (load: () => Promise<{ default: ComponentType<object> }>): Loader =>
  async () => {
    const [{ default: Page }, { NocoReachPage }] = await Promise.all([
      load(),
      import('./pages/nocoreach-page.js'),
    ]);
    return {
      default: (props: object) =>
        createElement(NocoReachPage, null, createElement(Page, props)),
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
): AppClientRouteDefinition => ({
  name,
  path,
  auth: 'required',
  authz: 'skip',
  componentLoader: gated(load),
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
  page('action-center', '/actions', () => import('./pages/optimization-work.js'), { title: nav('tasks'), icon: ListTodo, order: 3 }),
  page('task-work', '/actions/:taskId', () => import('./pages/task-work.js')),
  page('opportunity-explore', '/home/explore', () => import('./pages/strategy/index.js')),

  group('nav-site', nav('site'), Globe2, 4, [
    page('content-index', '/content', () => import('./pages/content-index.js'), { title: nav('pages'), icon: Files, order: 2 }),
    page('website-performance', '/website', () => import('./pages/data-website.js'), { title: nav('traffic'), icon: Globe, order: 1 }),
    page('site-audit', '/audit', () => import('./pages/site-audit.js'), { title: nav('audit'), icon: ClipboardCheck, order: 3 }),
    page('data-github', '/data/github', () => import('./pages/data-github.js'), { title: nav('github'), icon: Github, order: 4 }),
    page('data-downloads', '/data/downloads', () => import('./pages/data-downloads.js'), { title: nav('downloads'), icon: Package, order: 5 }),
  ]),
  group('nav-search', nav('search'), Store, 5, [
    page('search-growth', '/seo-opportunities', () => import('./pages/search-performance.js'), { title: nav('searchPerformance'), icon: Search, order: 1 }),
    page('saved-keywords', '/keywords', () => import('./pages/saved-keywords.js'), { title: nav('keywords'), icon: Bookmark, order: 2 }),
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
  ]),
  group('nav-ai', nav('aiTeam'), Bot, 7, [
    page('agents', '/agents', () => import('./pages/agents.js'), { title: nav('agent'), icon: Bot, order: 1 }),
    page('playbooks', '/playbooks', () => import('./pages/playbooks.js'), { title: nav('playbooks'), icon: Workflow, order: 3 }),
    page('skills', '/skills', () => import('./pages/skills.js'), { title: nav('skills'), icon: WandSparkles, order: 4 }),
    page('project-settings', '/project', () => import('./pages/project-knowledge.js'), { title: nav('projectKnowledge'), icon: NotebookPen, order: 5 }),
    page('analysis-rules', '/rules', () => import('./pages/analysis-rules.js'), { title: nav('analysisRules'), icon: SlidersHorizontal, order: 6 }),
  ]),
  group('nav-settings', nav('settings'), Settings2, 8, [
    page('data-connections', '/connections', () => import('./pages/source-connections.js'), { title: nav('connections'), icon: Plug, order: 1 }),
    page('members', '/members', () => import('./pages/members.js'), { title: nav('members'), icon: Users, order: 2 }),
  ]),

  // Old addresses.
  moved('flows-legacy', '/flows', '/playbooks'),
  moved('data-overview', '/data', '/home'),
  moved('data-chat', '/data/chat', '/data/discord'),
  moved('keyword-research', '/research/keywords', '/keywords?tab=research'),
  moved('project-strategy', '/project/strategy', '/home'),
  moved('insights-opportunities', '/insights', '/home'),
  moved('action-plan', '/action-plan', '/actions'),
  page('search-overview-legacy', '/seo-opportunities/overview', () => import('./pages/search-performance.js')),
  page('search-performance-legacy', '/seo-opportunities/performance', () => import('./pages/search-performance.js')),
  moved('search-opportunities-legacy', '/seo-opportunities/opportunities', '/keywords'),
  moved('website-overview', '/website/overview', '/website'),
  moved('website-sources', '/website/sources', '/website'),
  moved('website-conversion', '/website/conversion', '/website'),
  moved('website-pages', '/website/pages', '/website?tab=pages'),
]);
