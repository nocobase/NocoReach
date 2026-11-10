// Search & market › Backlinks (client/pages/backlinks.tsx): an opened lookup shows the overview tiles and, on a tab that was
// looked up, its rows; Hide spam hides the rows already read without another lookup, and a tab not looked up yet offers
// its own lookup.
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { brokenPagesDraft, linkProspectsDraft } from '#pages/seo-hand-off';
import { beforeEach, expect, it, vi } from 'vitest';

import BacklinksPage, {
  Backlinks,
  filterRows,
  SPAM_THRESHOLD,
} from '#pages/backlinks';

const { action } = vi.hoisted(() => ({ action: vi.fn() }));
vi.mock('#lib/nocoreach-api', () => ({ nocobaseClient: { action } }));
vi.mock('#pages/reach-data', () => ({
  useProject: () => ({ project: { id: 1, domains: ['acme.example'] } }),
}));

const spec = (view: string) => ({
  kind: 'backlinks',
  view,
  target: 'acme.example',
  scope: 'domain',
});
const overview = {
  id: 1,
  status: 'completed',
  spec: spec('overview'),
  createdAt: '2026-11-01T00:00:00Z',
  completedAt: '2026-11-01T00:00:00Z',
  result: {
    items: [],
    totalCount: null,
    summary: {
      rank: 41,
      backlinks: 18420,
      referringDomains: 1284,
      referringPages: 9310,
      spam: 6,
      brokenBacklinks: 86,
    },
    history: [
      {
        date: '2026-09-01',
        backlinks: 17000,
        referringDomains: 1200,
        newBacklinks: 800,
        lostBacklinks: 300,
      },
      {
        date: '2026-10-01',
        backlinks: 18420,
        referringDomains: 1284,
        newBacklinks: 900,
        lostBacklinks: 250,
      },
    ],
  },
};
const link = (id: string, domain: string, spam: number, dofollow = true) => ({
  id,
  urlFrom: `https://${domain}/post`,
  domainFrom: domain,
  urlTo: 'https://acme.example/',
  anchor: `anchor ${id}`,
  dofollow,
  domainRank: 30,
  spam,
  firstSeen: '2026-10-02',
  lastSeen: null,
  isNew: false,
  isLost: false,
  isBroken: false,
});
const links = {
  id: 2,
  status: 'completed',
  spec: spec('links'),
  createdAt: '2026-11-01T00:00:00Z',
  result: {
    items: [
      link('0', 'good.example', 3),
      link('1', 'spam.example', 72),
      link('2', 'nofollow.example', 5, false),
    ],
    totalCount: 3,
  },
};

const gap = {
  id: 9,
  status: 'completed',
  spec: {
    kind: 'backlinks',
    view: 'gap',
    target: 'acme.example',
    scope: 'domain',
    competitors: ['other.example', 'rival.example'],
  },
  createdAt: '2026-11-01T00:00:00Z',
  completedAt: '2026-11-01T00:00:00Z',
  result: {
    items: [
      {
        id: '0',
        domain: 'both.example',
        competitors: ['other.example', 'rival.example'],
        rank: 50,
        backlinks: 9,
        spam: 2,
        firstSeen: '2026-01-01',
      },
      {
        id: '1',
        domain: 'one.example',
        competitors: ['rival.example'],
        rank: 70,
        backlinks: 3,
        spam: 1,
        firstSeen: null,
      },
      {
        id: '2',
        domain: 'junk.example',
        competitors: ['rival.example'],
        rank: 5,
        backlinks: 1,
        spam: 80,
        firstSeen: null,
      },
    ],
    totalCount: null,
    perCompetitor: [
      { domain: 'other.example', total: 120 },
      { domain: 'rival.example', total: 340 },
    ],
  },
};

let recent: unknown[] = [];
beforeEach(() => {
  recent = [];
  action.mockReset();
  action.mockImplementation(
    async (
      resource: string,
      act: string,
      options: { body: { runId?: string } },
    ) => {
      if (resource === 'nrKeywords' && act === 'status')
        return {
          configured: true,
          verifiedAt: '2026-10-01',
          monthlyBudgetUsd: 5,
        };
      if (resource === 'nrBacklinks' && act === 'list') return recent;
      if (resource === 'nrBacklinks' && act === 'getRun')
        return options.body.runId === '1'
          ? overview
          : options.body.runId === '9'
            ? gap
            : links;
      if (resource === 'nrBacklinks' && act === 'sites')
        return {
          own: ['acme.example'],
          competitors: [{ name: 'Rival', domain: 'rival.example' }],
        };
      throw new Error(`unexpected ${resource}/${act}`);
    },
  );
});

function open(url: string) {
  const router = createMemoryRouter(
    [{ path: '/backlinks', element: <Backlinks /> }],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

it('shows the overview and the looked-up backlinks, hiding spam until asked', async () => {
  open('/backlinks?t=acme.example&o=1&l=2');
  expect(await screen.findByText('18,420')).toBeTruthy();
  expect(screen.getByText('1,284')).toBeTruthy();
  expect(await screen.findByText('good.example')).toBeTruthy();
  expect(screen.queryByText('spam.example')).toBeNull();
  await userEvent.click(screen.getByRole('switch', { name: /隐藏垃圾链接/ }));
  expect(await screen.findByText('spam.example')).toBeTruthy();
  // Filtering is local: no other run was asked for.
  expect(action.mock.calls.filter(([, act]) => act === 'run')).toHaveLength(0);
});

it('offers a separate lookup for a tab not looked up yet', async () => {
  const router = open('/backlinks?t=acme.example&o=1&bt=domains');
  expect(await screen.findByText('18,420')).toBeTruthy();
  const button = await screen.findByRole('button', {
    name: /查询引用域名/,
  });
  action.mockImplementationOnce(async () => ({
    ...links,
    id: 3,
    spec: spec('domains'),
    result: {
      items: [
        {
          id: '0',
          domain: 'ref.example',
          backlinks: 4,
          referringPages: 2,
          rank: 20,
          spam: 1,
          firstSeen: null,
          brokenBacklinks: 0,
        },
      ],
      totalCount: 1,
    },
  }));
  await userEvent.click(button);
  expect(await screen.findByText('ref.example')).toBeTruthy();
  const run = action.mock.calls.find(([, act]) => act === 'run');
  expect(run?.[2].body).toMatchObject({
    view: 'domains',
    target: 'acme.example',
  });
  expect(router.state.location.search).toContain('r=3');
  expect(
    within(screen.getByRole('tablist')).getByText(/引用域名 1/),
  ).toBeTruthy();
});

it('filters spam at the threshold and keeps rows without a score', () => {
  const rows = [
    { spam: SPAM_THRESHOLD - 1 },
    { spam: SPAM_THRESHOLD },
    { spam: null },
  ];
  expect(filterRows(rows, { hideSpam: true }, () => '')).toEqual([
    rows[0],
    rows[2],
  ]);
  expect(filterRows(rows, { hideSpam: false }, () => '')).toHaveLength(3);
});

it('shows the link gap with the competitors each site links to, spam hidden, and offers it to the agent', async () => {
  const router = createMemoryRouter(
    [{ path: '/backlinks', element: <BacklinksPage /> }],
    { initialEntries: ['/backlinks?view=gap&gap=9'] },
  );
  render(<RouterProvider router={router} />);
  expect(await screen.findByText('both.example')).toBeTruthy();
  expect(screen.getByText('one.example')).toBeTruthy();
  expect(screen.queryByText('junk.example')).toBeNull();
  expect(screen.getByText('340')).toBeTruthy();
  // The form shows the lookup's own site and competitors.
  expect((screen.getByLabelText('本站域名') as HTMLInputElement).value).toBe(
    'acme.example',
  );
  expect((screen.getByLabelText('竞品 2') as HTMLInputElement).value).toBe(
    'rival.example',
  );
  await userEvent.click(screen.getAllByRole('checkbox', { name: /选择/ })[1]);
  expect(
    await screen.findByRole('button', { name: /交给 Agent/ }),
  ).toBeTruthy();
  expect(action.mock.calls.filter(([, act]) => act === 'run')).toHaveLength(0);
});

it('arriving with a target opens its saved overview and only completed tab lookups', async () => {
  const row = (id: string, view: string, status: string) => ({
    id,
    status,
    spec: spec(view),
    createdAt: '2026-11-01T00:00:00Z',
    completedAt: null,
    count: 1,
    summary: null,
  });
  recent = [
    row('5', 'links', 'unknown'),
    row('1', 'overview', 'completed'),
    row('2', 'links', 'completed'),
  ];
  const router = open('/backlinks?t=acme.example');
  expect(await screen.findByText('18,420')).toBeTruthy();
  expect(router.state.location.search).toContain('o=1');
  expect(router.state.location.search).toContain('l=2');
  expect(router.state.location.search).not.toContain('l=5');
});

it("says a competitor's referring domains were not checked against our links", () => {
  const rows = [
    {
      domain: 'ref.example',
      rank: 20,
      spam: 1,
      competitors: ['rival.example'],
    },
  ];
  const unchecked = linkProspectsDraft(
    'acme.example',
    ['rival.example'],
    rows,
    '2026-11-01T00:00:00Z',
    false,
  );
  expect(unchecked.brief).toContain('没有和 acme.example 的外链核对过');
  expect(unchecked.brief).not.toContain('没有链接 acme.example');
  const gap = linkProspectsDraft(
    'docs.acme.example',
    ['rival.example'],
    rows,
    '2026-11-01T00:00:00Z',
  );
  expect(gap.brief).toContain('但没有链接 docs.acme.example');
  expect(gap.title).toContain('ref.example');
});

it('Query again on Link gap starts the new result with nothing ticked', async () => {
  const fresh = {
    ...gap,
    id: 10,
    reused: false,
    result: {
      ...gap.result,
      items: [
        {
          id: '0',
          domain: 'other-first.example',
          competitors: ['rival.example'],
          rank: 40,
          backlinks: 2,
          spam: 1,
          firstSeen: null,
        },
        {
          id: '1',
          domain: 'other-second.example',
          competitors: ['rival.example'],
          rank: 30,
          backlinks: 1,
          spam: 1,
          firstSeen: null,
        },
      ],
    },
  };
  const base = action.getMockImplementation()!;
  action.mockImplementation(
    async (
      resource: string,
      act: string,
      options: { body: { runId?: string } },
    ) =>
      resource === 'nrBacklinks' &&
      act === 'getRun' &&
      options.body.runId === '9'
        ? { ...gap, reused: true }
        : resource === 'nrBacklinks' && act === 'run'
          ? fresh
          : base(resource, act, options),
  );
  const router = createMemoryRouter(
    [{ path: '/backlinks', element: <BacklinksPage /> }],
    {
      initialEntries: ['/backlinks?view=gap&gap=9'],
    },
  );
  render(<RouterProvider router={router} />);
  expect(await screen.findByText('both.example')).toBeTruthy();
  await userEvent.click(screen.getAllByRole('checkbox', { name: /选择/ })[1]);
  expect(
    screen.getAllByRole('checkbox', { checked: true }).length,
  ).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole('button', { name: '重新查询' }));
  expect(await screen.findByText('other-first.example')).toBeTruthy();
  expect(screen.queryAllByRole('checkbox', { checked: true })).toHaveLength(0);
  expect(screen.queryByRole('button', { name: /交给 Agent/ })).toBeNull();
});

it("Query again on Link gap refreshes the lookup on screen, not the form's edits", async () => {
  const base = action.getMockImplementation()!;
  action.mockImplementation(
    async (
      resource: string,
      act: string,
      options: { body: { runId?: string } },
    ) =>
      resource === 'nrBacklinks' &&
      act === 'getRun' &&
      options.body.runId === '9'
        ? { ...gap, reused: true }
        : resource === 'nrBacklinks' && act === 'run'
          ? { ...gap, id: 12 }
          : base(resource, act, options),
  );
  const router = createMemoryRouter(
    [{ path: '/backlinks', element: <BacklinksPage /> }],
    { initialEntries: ['/backlinks?view=gap&gap=9'] },
  );
  render(<RouterProvider router={router} />);
  expect(await screen.findByText('both.example')).toBeTruthy();
  const second = screen.getByLabelText('竞品 2');
  await userEvent.clear(second);
  await userEvent.type(second, 'zzz.example');
  await userEvent.click(screen.getByRole('button', { name: '重新查询' }));
  const run = action.mock.calls.find(([, act]) => act === 'run');
  expect(run?.[2].body).toMatchObject({
    target: 'acme.example',
    competitors: ['other.example', 'rival.example'],
    forceRefresh: true,
  });
});

it('Query again on the same overview keeps the tabs already looked up', async () => {
  const base = action.getMockImplementation()!;
  action.mockImplementation(
    async (
      resource: string,
      act: string,
      options: { body: { runId?: string } },
    ) =>
      resource === 'nrBacklinks' &&
      act === 'getRun' &&
      options.body.runId === '1'
        ? { ...overview, reused: true }
        : resource === 'nrBacklinks' && act === 'run'
          ? { ...overview, id: 11 }
          : base(resource, act, options),
  );
  // On a tab not looked up yet, the overview's Query again shows; the Backlinks tab's lookup is open beside it.
  const router = open('/backlinks?t=acme.example&o=1&l=2&bt=domains');
  await userEvent.click(
    await screen.findByRole('button', { name: '重新查询' }),
  );
  await waitFor(() => expect(router.state.location.search).toContain('o=11'));
  expect(router.state.location.search).toContain('l=2');
  await userEvent.click(screen.getByRole('tab', { name: /外链 3/ }));
  expect(await screen.findByText('good.example')).toBeTruthy();
});

it('the Broken backlinks tile opens Broken pages, whose pages on our site go to the agent as a Technical fix', async () => {
  const broken = {
    id: 20,
    status: 'completed',
    spec: spec('broken'),
    createdAt: '2026-11-01T00:00:00Z',
    completedAt: '2026-11-01T00:00:00Z',
    result: {
      items: [
        {
          id: '0',
          url: 'https://acme.example/blog/old',
          status: 404,
          title: 'Old post',
          backlinks: 37,
          referringDomains: 9,
          rank: 12,
          firstSeen: null,
        },
      ],
      totalCount: 1,
    },
  };
  const base = action.getMockImplementation()!;
  action.mockImplementation(
    async (
      resource: string,
      act: string,
      options: { body: { runId?: string } },
    ) =>
      resource === 'nrBacklinks' &&
      act === 'getRun' &&
      options.body.runId === '20'
        ? broken
        : base(resource, act, options),
  );
  const router = createMemoryRouter(
    [{ path: '/backlinks', element: <BacklinksPage /> }],
    { initialEntries: ['/backlinks?t=acme.example&o=1&b=20'] },
  );
  render(<RouterProvider router={router} />);
  await userEvent.click(
    await screen.findByRole('button', { name: '查看这些外链指向的失效页面' }),
  );
  expect(router.state.location.search).toContain('bt=broken');
  expect(await screen.findByText('/blog/old')).toBeTruthy();
  expect(screen.getByText('404')).toBeTruthy();
  await userEvent.click(screen.getByRole('checkbox', { name: '选择这一行' }));
  expect(
    await screen.findByRole('button', { name: /交给 Agent/ }),
  ).toBeTruthy();
});

it('a broken-pages brief lists each address with its links and says how to win them back', () => {
  const draft = brokenPagesDraft(
    'acme.example',
    [
      {
        url: 'https://acme.example/blog/old',
        status: 404,
        backlinks: 37,
        referringDomains: 9,
      },
    ],
    '2026-11-01T00:00:00Z',
  );
  expect(draft.pages).toEqual(['https://acme.example/blog/old']);
  expect(draft.title).toContain('/blog/old');
  expect(draft.brief).toContain('状态码 404');
  expect(draft.brief).toContain('301');
});
