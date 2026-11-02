import { $t, getCurrentLocale } from '#i18n';
import { toast } from '#lib/toast';
import { useTranslation } from '@nocobase/i18n/client';
import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

import type { RouteNavigationItem } from '../../routing/route-navigation.js';
import {
  useNavSources,
  useNavSourcesState,
  type NavSources,
} from './nav-badges.js';

/**
 * Which sources put a data page in the menu, keyed by route name (client/nocoreach-routes.ts): the page shows once any
 * of them is in `nrHealth:connected`. Pages not listed (Insights, Opportunities, Tasks, Results, AI team, Settings,
 * Demo data) always show. The keys are the server's (server/nocoreach/data-health.ts `connected`).
 */
export const PAGE_SOURCES: Readonly<Record<string, readonly string[]>> = {
  'website-performance': ['ga4'],
  'content-index': ['site'],
  'site-audit': ['site', 'dataforseo'],
  'data-github': ['github'],
  'data-downloads': ['packages'],
  'search-growth': ['gsc'],
  // Saved and tracked keywords list on their tabs whatever is connected.
  'saved-keywords': ['gsc', 'dataforseo', 'keywords'],
  'data-trends': ['trends'],
  'domain-overview': ['competitors', 'dataforseo'],
  'ai-search': ['dataforseo'],
  'data-community': ['discourse'],
  'data-hackernews': ['hackernews'],
  'data-reddit': ['reddit'],
  'data-x': ['x'],
  'data-discord': ['discord'],
  'data-slack': ['slack'],
  'data-xiaohongshu': ['xiaohongshu'],
  'data-bilibili': ['bilibili'],
  'data-youtube': ['youtube'],
};

/**
 * Whether the menu lists this page. Until the sources are known (`null`) a data page stays out rather than appear and
 * vanish; `'*'` (they could not be read) lists every page.
 */
export function pageInMenu(name: string, sources: NavSources | null): boolean {
  const needs = PAGE_SOURCES[name];
  if (!needs) return true;
  if (!sources) return false;
  return Boolean(sources['*']) || needs.some((source) => sources[source]);
}

/** The permission-filtered menu without the data pages whose sources are not connected, and without emptied groups. */
export function bySources(
  items: readonly RouteNavigationItem[],
  sources: NavSources | null,
): RouteNavigationItem[] {
  return items.flatMap((item) => {
    if (!pageInMenu(item.route.name, sources)) return [];
    if (!item.children.length) return [item];
    const children = bySources(item.children, sources);
    // A group (an entry with no page of its own) left with nothing in it goes too.
    if (!children.length && !item.route.componentLoader) return [];
    return [{ ...item, children }];
  });
}

// Where each data page lives (client/nocoreach-routes.ts), and the old addresses that still lead to one, for links that
// name a path: the longest that the link's path starts with wins.
const PAGE_PATHS: readonly (readonly [string, string])[] = [
  ['/website', 'website-performance'],
  ['/content', 'content-index'],
  ['/audit', 'site-audit'],
  ['/data/github', 'data-github'],
  ['/data/downloads', 'data-downloads'],
  ['/seo-opportunities', 'search-growth'],
  ['/seo-opportunities/opportunities', 'saved-keywords'],
  ['/keywords', 'saved-keywords'],
  ['/research/keywords', 'saved-keywords'],
  ['/trends', 'data-trends'],
  ['/research/domain', 'domain-overview'],
  ['/ai-search', 'ai-search'],
  ['/data/community', 'data-community'],
  ['/data/hackernews', 'data-hackernews'],
  ['/data/reddit', 'data-reddit'],
  ['/data/x', 'data-x'],
  ['/data/discord', 'data-discord'],
  ['/data/chat', 'data-discord'],
  ['/data/slack', 'data-slack'],
  ['/data/xiaohongshu', 'data-xiaohongshu'],
  ['/data/bilibili', 'data-bilibili'],
  ['/data/youtube', 'data-youtube'],
];

/** The data page an in-application path opens, if any (`/website?days=7` is Traffic). */
export function dataPageOf(to: string): string | undefined {
  const path = to.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  return PAGE_PATHS.filter(
    ([p]) => path === p || path.startsWith(`${p}/`),
  ).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
}

/**
 * Whether a link may lead there: anything but a data page the menu leaves out (2026-11-02: nothing on Insights, in a
 * conversation or elsewhere leads to a page the menu hides). Until the sources are known, links stay as they are.
 */
export function linkInMenu(to: string, sources: NavSources | null): boolean {
  const name = dataPageOf(to);
  return !name || !sources || pageInMenu(name, sources);
}

export function useLinkInMenu(): (to: string) => boolean {
  const sources = useNavSources();
  return useCallback((to: string) => linkInMenu(to, sources), [sources]);
}

type Entry = {
  readonly name: string;
  readonly path: string;
  readonly item: RouteNavigationItem;
  /** The groups above it, outermost first. */
  readonly groups: readonly RouteNavigationItem[];
};

function entries(
  items: readonly RouteNavigationItem[],
  groups: readonly RouteNavigationItem[] = [],
): Entry[] {
  return items.flatMap((item) => [
    ...(item.route.componentLoader && item.route.path
      ? [{ name: item.route.name, path: item.route.path, item, groups }]
      : []),
    ...entries(item.children, [...groups, item]),
  ]);
}

/**
 * After a source connects on Settings › Data connections, says which pages it put in the menu ("Added to the menu:
 * Community › Bilibili"), one toast per menu group, each with a way to open its first page. `items` is the
 * permission-filtered menu before `bySources`. Only a change between two lists of the same project counts, the newer
 * one read just now, so neither the first read nor the fallback announces anything.
 */
export function useMenuAdditions(items: readonly RouteNavigationItem[]): void {
  const { projectId, sources, fresh } = useNavSourcesState();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const latestRef = useRef({ items, pathname, navigate, t });
  // Kept current after each render, and read by the effect below, which runs only when the sources change.
  useEffect(() => {
    latestRef.current = { items, pathname, navigate, t };
  });
  const previousRef = useRef<{
    projectId: string | null;
    sources: NavSources;
  } | null>(null);
  useEffect(() => {
    if (!sources || sources['*']) return;
    const before = previousRef.current;
    previousRef.current = { projectId, sources };
    const { items, pathname, navigate, t } = latestRef.current;
    if (
      !fresh ||
      !before ||
      before.projectId !== projectId ||
      !pathname.startsWith('/connections')
    )
      return;
    // Read when the toast shows, so its words follow the language.
    const label = (item: RouteNavigationItem) => {
      const title = item.route.navigation?.title ?? '';
      return t(title, { ns: item.route.packageName, defaultValue: title });
    };
    const added = entries(items).filter(
      ({ name }) =>
        PAGE_SOURCES[name] &&
        pageInMenu(name, sources) &&
        !pageInMenu(name, before.sources),
    );
    const groupOf = (entry: Entry) =>
      entry.groups.map((group) => group.route.name).join('/');
    for (const group of new Set(added.map(groupOf))) {
      const pages = added.filter((entry) => groupOf(entry) === group);
      const text = () => {
        const list = new Intl.ListFormat(getCurrentLocale(), {
          type: 'conjunction',
        }).format(pages.map((page) => label(page.item)));
        return [...pages[0].groups.map(label), list].join(' › ');
      };
      const id = toast.success(
        () => $t('navSources.addedToMenu', { 0: text() }),
        {
          action: {
            label: () => $t('common.openPage'),
            onClick: () => {
              toast.dismiss(id);
              void navigate(pages[0].path);
            },
          },
        },
      );
    }
  }, [projectId, sources, fresh]);
}
