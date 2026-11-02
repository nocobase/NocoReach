import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  NavBadgeProvider,
  refreshNavBadges,
  useNavSources,
} from '../../client/components/app-shell/nav-badges';
import {
  PAGE_SOURCES,
  bySources,
  dataPageOf,
  linkInMenu,
  pageInMenu,
  useMenuAdditions,
} from '../../client/components/app-shell/nav-sources';
import { MarkdownLink } from '../../client/components/markdown-link';
import type { RouteNavigationItem } from '../../client/routing/route-navigation';

const state = vi.hoisted(() => ({
  project: { id: 1 } as { id: number } | null,
  projectError: null as Error | null,
  me: { id: 'u', role: 'member' },
  action: vi.fn(),
  toast: vi.fn(),
  dismiss: vi.fn(),
}));
vi.mock('../../client/pages/reach-data', () => ({
  useProject: () => ({ project: state.project, error: state.projectError }),
}));
vi.mock('../../client/pages/me', () => ({ useMe: () => ({ me: state.me }) }));
vi.mock('../../client/lib/nocoreach-api', () => ({
  nocobaseClient: { action: state.action },
}));
vi.mock('../../client/i18n', () => ({
  $t: (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${Object.values(vars).join(',')}` : key,
  getCurrentLocale: () => 'en-US',
}));
vi.mock('../../client/lib/toast', () => ({
  toast: Object.assign(vi.fn(), {
    success: state.toast,
    dismiss: state.dismiss,
  }),
}));
vi.mock('@nocobase/app-client', () => ({ resolveAppBase: () => '/main/' }));
vi.mock('@nocobase/i18n/client', () => ({
  useTranslation: () => ({
    t: (key: string) => key.replace('nocoreach.nav.', ''),
  }),
}));

// The data pages as client/nocoreach-routes.ts declares them in Site & product, Search & market and Community.
const routesFile = readFileSync(
  path.resolve(import.meta.dirname, '../../client/nocoreach-routes.ts'),
  'utf8',
);
const dataPages = [
  ...routesFile
    .slice(
      routesFile.indexOf("group('nav-site'"),
      routesFile.indexOf("group('nav-ai'"),
    )
    .matchAll(/page\('([\w-]+)', '([^']+)'/g),
].map(([, name, path]) => ({ name, path }));

function route(
  name: string,
  path?: string,
  children?: AppClientRegisteredRoute[],
): AppClientRegisteredRoute {
  return {
    id: name,
    name,
    path: path ?? '',
    packageName: 'app',
    source: 'application',
    auth: 'required',
    authz: 'skip',
    navigation: { title: `nocoreach.nav.${name}` },
    ...(children
      ? { children }
      : { componentLoader: async () => ({ default: () => null }) }),
  } as AppClientRegisteredRoute;
}
const item = (
  r: AppClientRegisteredRoute,
  children: RouteNavigationItem[] = [],
): RouteNavigationItem => ({ route: r, children });
const page = (name: string, path = `/${name}`) => item(route(name, path));
const group = (name: string, pages: RouteNavigationItem[]) =>
  item(
    route(
      name,
      undefined,
      pages.map((p) => p.route),
    ),
    pages,
  );
// A menu like NocoReach's: the main line, the three data groups and Settings.
const menu: RouteNavigationItem[] = [
  page('growth-overview', '/home'),
  page('opportunity-library', '/opportunities'),
  group('site', [
    page('website-performance', '/website'),
    page('data-github', '/data/github'),
  ]),
  group('search', [
    page('search-growth', '/seo-opportunities'),
    page('saved-keywords', '/keywords'),
    page('domain-overview', '/research/domain'),
  ]),
  group('community', [
    page('data-reddit', '/data/reddit'),
    page('data-discord', '/data/discord'),
    page('data-slack', '/data/slack'),
    page('data-xiaohongshu', '/data/xiaohongshu'),
    page('data-bilibili', '/data/bilibili'),
  ]),
  group('settings', [page('data-connections', '/connections')]),
];
const names = (items: RouteNavigationItem[]): string[] =>
  items.flatMap((i) => [i.route.name, ...names([...i.children])]);

beforeEach(() => {
  state.project = { id: 1 };
  state.projectError = null;
  state.me = { id: 'u', role: 'member' };
  state.action.mockReset();
  state.toast.mockReset().mockReturnValue('toast-1');
  state.dismiss.mockReset();
  localStorage.clear();
});

describe('which source puts each page in the menu', () => {
  it('names a source for every data page and for nothing else, and finds each page by its path', () => {
    expect(dataPages.length).toBe(19);
    expect(Object.keys(PAGE_SOURCES).sort()).toEqual(
      dataPages.map((p) => p.name).sort(),
    );
    for (const { name, path } of dataPages) {
      expect(dataPageOf(path)).toBe(name);
      expect(dataPageOf(`${path}?days=7`)).toBe(name);
    }
    // Old addresses that lead to a data page count as that page; others are not data pages.
    expect(dataPageOf('/website/conversion')).toBe('website-performance');
    expect(dataPageOf('/seo-opportunities/opportunities')).toBe(
      'saved-keywords',
    );
    expect(dataPageOf('/keywords/detail?k=crm')).toBe('saved-keywords');
    expect(dataPageOf('/data/xiaohongshu')).toBe('data-xiaohongshu');
    expect(dataPageOf('/opportunities')).toBeUndefined();
    expect(dataPageOf('/connections?source=bilibili')).toBeUndefined();
  });

  it('waits only for sources the server checks, each in one place', () => {
    const server = readFileSync(
      path.resolve(
        import.meta.dirname,
        '../../server/nocoreach/data-health.ts',
      ),
      'utf8',
    );
    const table = server.slice(
      server.indexOf('const CONNECTED_CHECKS={'),
      server.indexOf('\n};', server.indexOf('const CONNECTED_CHECKS={')),
    );
    const checked = [...table.matchAll(/^ (\w+):/gm)].map(([, key]) => key);
    expect(new Set(checked).size).toBe(checked.length);
    expect([...new Set(Object.values(PAGE_SOURCES).flat())].sort()).toEqual(
      [...checked].sort(),
    );
  });

  it('follows the agreed rule: any one of a page’s sources is enough', () => {
    const only = (key: string) => ({ [key]: true });
    expect(pageInMenu('site-audit', only('dataforseo'))).toBe(true);
    expect(pageInMenu('site-audit', only('site'))).toBe(true);
    expect(pageInMenu('saved-keywords', only('gsc'))).toBe(true);
    expect(pageInMenu('saved-keywords', only('keywords'))).toBe(true);
    expect(pageInMenu('domain-overview', only('competitors'))).toBe(true);
    expect(pageInMenu('ai-search', only('gsc'))).toBe(false);
    expect(pageInMenu('website-performance', only('gsc'))).toBe(false);
    expect(pageInMenu('growth-overview', {})).toBe(true);
  });
});

describe('the menu', () => {
  it('leaves out pages whose source is not connected, and a group left empty', () => {
    // Discord, Slack and Xiaohongshu not connected; Bilibili disconnected but its videos still saved counts as connected.
    const sources = {
      ga4: true,
      gsc: true,
      github: true,
      reddit: true,
      discord: false,
      slack: false,
      xiaohongshu: false,
      bilibili: true,
    };
    expect(names(bySources(menu, sources))).toEqual([
      'growth-overview',
      'opportunity-library',
      'site',
      'website-performance',
      'data-github',
      'search',
      'search-growth',
      'saved-keywords',
      'community',
      'data-reddit',
      'data-bilibili',
      'settings',
      'data-connections',
    ]);
    // No community source at all: the Community group goes.
    expect(names(bySources(menu, { gsc: true }))).toEqual([
      'growth-overview',
      'opportunity-library',
      'search',
      'search-growth',
      'saved-keywords',
      'settings',
      'data-connections',
    ]);
  });

  it('keeps data pages out until the sources are known, and shows them all when they could not be read', () => {
    expect(names(bySources(menu, null))).toEqual([
      'growth-overview',
      'opportunity-library',
      'settings',
      'data-connections',
    ]);
    expect(names(bySources(menu, { '*': true }))).toEqual(names(menu));
  });
});

function Probe() {
  const sources = useNavSources();
  return (
    <output>{sources === null ? 'unknown' : JSON.stringify(sources)}</output>
  );
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const answer = (sources: Promise<unknown>) =>
  state.action.mockImplementation((resource: string) =>
    resource === 'nrHealth'
      ? sources
      : Promise.resolve({ insights: 0, opportunities: 0, tasks: 0 }),
  );

describe('reading the sources', () => {
  it('draws the list remembered from the last visit while the new one loads, then the new one', async () => {
    localStorage.setItem(
      'nocoreach:nav-sources:u:1',
      JSON.stringify({ reddit: true }),
    );
    const read = deferred<unknown>();
    answer(read.promise);
    render(
      <MemoryRouter>
        <NavBadgeProvider>
          <Probe />
        </NavBadgeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status').textContent).toBe('{"reddit":true}');
    await act(async () => read.resolve({ reddit: true, bilibili: true }));
    expect(screen.getByRole('status').textContent).toBe(
      '{"reddit":true,"bilibili":true}',
    );
    expect(
      JSON.parse(localStorage.getItem('nocoreach:nav-sources:u:1')!),
    ).toEqual({ reddit: true, bilibili: true });
  });

  it('shows every page when the first read fails, but keeps the menu when a later refresh fails', async () => {
    answer(Promise.reject(new Error('down')));
    const first = render(
      <MemoryRouter>
        <NavBadgeProvider>
          <Probe />
        </NavBadgeProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('{"*":true}'),
    );
    first.unmount();
    answer(Promise.resolve({ reddit: true }));
    render(
      <MemoryRouter>
        <NavBadgeProvider>
          <Probe />
        </NavBadgeProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('{"reddit":true}'),
    );
    answer(Promise.reject(new Error('down')));
    await act(async () => refreshNavBadges());
    await act(async () => Promise.resolve());
    expect(screen.getByRole('status').textContent).toBe('{"reddit":true}');
  });

  it('keeps the sources when the counts fail, and shows every page when the project cannot be read', async () => {
    state.action.mockImplementation((resource: string) =>
      resource === 'nrHealth'
        ? Promise.resolve({ reddit: true })
        : Promise.reject(new Error('counts down')),
    );
    const view = render(
      <MemoryRouter>
        <NavBadgeProvider>
          <Probe />
        </NavBadgeProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('{"reddit":true}'),
    );
    await act(async () => refreshNavBadges());
    expect(screen.getByRole('status').textContent).toBe('{"reddit":true}');
    view.unmount();
    state.project = null;
    state.projectError = new Error('gone');
    render(
      <MemoryRouter>
        <NavBadgeProvider>
          <Probe />
        </NavBadgeProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole('status').textContent).toBe('{"*":true}');
  });
});

describe('after a source connects', () => {
  function Additions() {
    useMenuAdditions(menu);
    const { pathname } = useLocation();
    return <output>{pathname}</output>;
  }
  const at = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <NavBadgeProvider>
          <Routes>
            <Route path='*' element={<Additions />} />
          </Routes>
        </NavBadgeProvider>
      </MemoryRouter>,
    );

  it('says on Data connections which page it added to the menu, with a way to open it', async () => {
    answer(Promise.resolve({ reddit: true, bilibili: false }));
    at('/connections');
    await waitFor(() =>
      expect(state.action).toHaveBeenCalledWith(
        'nrHealth',
        'connected',
        expect.anything(),
      ),
    );
    await act(async () => Promise.resolve());
    // The first read announces nothing.
    expect(state.toast).not.toHaveBeenCalled();
    answer(Promise.resolve({ reddit: true, bilibili: true }));
    await act(async () => refreshNavBadges());
    await waitFor(() => expect(state.toast).toHaveBeenCalledTimes(1));
    const [title, options] = state.toast.mock.calls[0];
    expect(title()).toBe('navSources.addedToMenu:community › data-bilibili');
    expect(options.action.label()).toBe('common.openPage');
    act(() => options.action.onClick());
    expect(state.dismiss).toHaveBeenCalledWith('toast-1');
    expect(screen.getByRole('status').textContent).toBe('/data/bilibili');
  });

  it('names the pages of one group together, and says nothing elsewhere or when nothing was added', async () => {
    answer(Promise.resolve({}));
    at('/connections');
    await waitFor(() => expect(state.action).toHaveBeenCalled());
    await act(async () => Promise.resolve());
    answer(Promise.resolve({ gsc: true, ga4: true }));
    await act(async () => refreshNavBadges());
    await waitFor(() => expect(state.toast).toHaveBeenCalledTimes(2));
    expect(state.toast.mock.calls.map(([title]) => title())).toEqual([
      'navSources.addedToMenu:site › website-performance',
      'navSources.addedToMenu:search › search-growth and saved-keywords',
    ]);
    await act(async () => refreshNavBadges());
    await act(async () => Promise.resolve());
    expect(state.toast).toHaveBeenCalledTimes(2);
  });

  it('does not announce a page added while on another page', async () => {
    answer(Promise.resolve({}));
    at('/home');
    await waitFor(() => expect(state.action).toHaveBeenCalled());
    await act(async () => Promise.resolve());
    answer(Promise.resolve({ bilibili: true }));
    await act(async () => refreshNavBadges());
    await act(async () => Promise.resolve());
    expect(state.toast).not.toHaveBeenCalled();
  });
});

describe('links into data pages', () => {
  it('do not lead to a page the menu leaves out, and stay as they are until the sources are known', () => {
    expect(linkInMenu('/data/discord', { discord: false })).toBe(false);
    expect(linkInMenu('/website?days=7', { ga4: true })).toBe(true);
    expect(linkInMenu('/data/discord', null)).toBe(true);
    expect(linkInMenu('/actions/12', {})).toBe(true);
  });

  it('in a conversation, a link to a hidden data page reads as text', async () => {
    answer(Promise.resolve({ reddit: true, discord: false }));
    render(
      <MemoryRouter>
        <NavBadgeProvider>
          <MarkdownLink href='/main/data/discord'>
            Discord this week
          </MarkdownLink>
          <MarkdownLink
            href={`${window.location.origin}/main/data/reddit?days=7`}
          >
            Reddit this week
          </MarkdownLink>
        </NavBadgeProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Discord this week' }),
      ).toBeNull(),
    );
    expect(screen.getByText('Discord this week')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Reddit this week' })).toBeTruthy();
  });
});
