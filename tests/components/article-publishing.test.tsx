import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { NocoReachHttpError } from '../../client/lib/nocoreach-api';
import { ArticleTargetsConnect } from '../../client/pages/article-targets-connect';
import { articleRequest } from '../../client/pages/article-targets-api';
import {
  ArticleEditor,
  ArticleReview,
} from '../../client/pages/task-detail/article-review';
import {
  DriftNotice,
  TargetRows,
} from '../../client/pages/task-detail/article-release';
import { ArticleStart } from '../../client/pages/task-detail/article-start';
import {
  conflictHeading,
  defaultDelivery,
  deliveryPlan,
  type DeliveryChoice,
} from '../../client/pages/task-detail/article-model';
import { playbookRequest } from '../../client/pages/playbook-model';
import {
  TaskDraftProvider,
  TaskDraftScope,
} from '../../client/pages/task-detail/drafts';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import type { TaskData } from '../../client/pages/task-execution-types';

vi.mock('@nocobase/app-plugin-authentication/client', () => ({
  useAuthentication: () => ({
    session: { user: { id: 'admin' }, session: { id: 'session-a' } },
    refresh: vi.fn(),
  }),
}));
const authorization = vi.hoisted(() => ({
  revision: 0,
  can: vi.fn(async () => true),
  invalidate: vi.fn(),
}));
vi.mock('@nocobase/app-plugin-authorization/client', () => ({
  useAuthorizationClient: () => authorization,
  useAuthorizationRevision: () => authorization.revision,
}));
vi.mock('../../client/pages/article-targets-api', async (original) => ({
  ...(await original<
    typeof import('../../client/pages/article-targets-api')
  >()),
  articleRequest: vi.fn(),
  searchArticles: vi.fn(),
}));
vi.mock('../../client/pages/playbook-model', async (original) => ({
  ...(await original<typeof import('../../client/pages/playbook-model')>()),
  playbookRequest: vi.fn(),
}));
const PLAYBOOKS = {
  revision: 1,
  playbooks: [
    { id: 'blog-post', name: 'Blog post', kind: 'build' },
    { id: 'optimize-page', name: 'Improve a page', kind: 'build' },
    { id: 'research', name: 'Research', kind: 'plan' },
  ],
};
const staleError = () =>
  new NocoReachHttpError('stale', 409, {
    error: { metadata: { key: 'articles.stale' } },
  });
vi.mock('../../client/components/reach/confirm', () => ({
  confirmAction: vi.fn(async () => true),
}));

beforeEach(() => {
  cleanup();
  setDictionary(english);
  vi.mocked(articleRequest).mockReset();
  vi.mocked(playbookRequest).mockReset();
  vi.mocked(playbookRequest).mockResolvedValue(PLAYBOOKS as never);
});
afterEach(() => setDictionary(null));

const target = {
  id: 'cms',
  name: 'NocoBase CMS',
  kind: 'nocobase-api',
  locales: ['en', 'zh'],
  capabilities: { concurrency: 'check-before-write' },
};
const base = {
  id: '7',
  slug: 'hello',
  status: 'published' as const,
  version: 'v1',
  readAt: '2026-10-18T00:00:00Z',
  locales: {
    en: { title: 'Hello', description: 'Old summary', body: 'English body' },
    zh: { title: '你好', description: '旧摘要', body: '中文正文' },
  },
};
const proposal = {
  targetId: 'cms',
  articleId: '7',
  baseKey: 'base-1',
  baseVersion: 'v1',
  draft: { locales: { zh: { body: '新的中文正文' } } },
  changes: ['zh.body'],
};
const data = {
  articleTargets: [target],
  articleBases: { 'base-1': base },
} as unknown as TaskData;

it('reviews an article field by field against its source, per language', async () => {
  render(
    <ArticleReview
      data={data}
      article={proposal}
      notes='Rewrote the Chinese body.'
    />,
  );
  expect(
    screen.getByText('Publishes to NocoBase CMS · updates "Hello" (hello)'),
  ).toBeInTheDocument();
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual([
    'English',
    'Chinese (1 changes)',
  ]);
  expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  const panel = screen.getByRole('tabpanel');
  expect(within(panel).getByText('新的中文正文')).toBeInTheDocument();
  expect(within(panel).getByText('中文正文')).toBeInTheDocument();
  expect(within(panel).getByText('Title · Unchanged')).toBeInTheDocument();
  await userEvent.click(tabs[0]);
  expect(
    within(screen.getByRole('tabpanel')).getByText('Body · Unchanged'),
  ).toBeInTheDocument();
});

it('lists the fields both sides changed after a rebase', () => {
  render(
    <ArticleReview
      data={data}
      article={{
        ...proposal,
        conflicts: [
          {
            field: 'zh.body',
            base: '中文正文',
            current: '编辑的版本',
            draft: '新的中文正文',
          },
        ],
      }}
      notes=''
    />,
  );
  expect(
    screen.getByText(
      'These were also changed in NocoBase CMS; decide which version to keep:',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('编辑的版本')).toBeInTheDocument();
});

it('edits a new article with validation on save and sends only what it fills in', async () => {
  const onSave = vi.fn(async () => true);
  const user = userEvent.setup();
  const fresh = {
    ...proposal,
    articleId: null,
    baseKey: null,
    baseVersion: null,
    draft: {
      slug: 'Bad Slug',
      locales: { en: { title: 'New post', body: '' } },
    },
    changes: ['en.title', 'slug'],
  };
  render(
    <TaskDraftProvider>
      <TaskDraftScope scope='1:1'>
        <ArticleEditor
          data={data}
          article={fresh}
          draftKey='a1'
          busy={false}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </TaskDraftScope>
    </TaskDraftProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      'Enter an address of lowercase letters, digits and hyphens',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Enter the body')).toBeInTheDocument();
  const slug = screen.getByRole('textbox', { name: /Address \(slug\)/ });
  await waitFor(() => expect(slug).toHaveFocus());
  await user.clear(slug);
  await user.type(slug, 'new-post');
  const bodies = screen.getAllByRole('textbox', { name: /^Body/ });
  await user.type(bodies[0], 'Body text');
  expect(screen.queryByText('Enter the body')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith({
    slug: 'new-post',
    locales: { en: { title: 'New post', body: 'Body text' } },
  });
});

it.each([
  { create: true, status: 'published' as const },
  { create: true, status: 'draft' as const },
  { create: false, status: 'published' as const },
  { create: false, status: 'draft' as const },
])(
  'preserves $status when editing an article (create=$create)',
  async ({ create, status }) => {
    const onSave = vi.fn(async () => true);
    const user = userEvent.setup();
    render(
      <TaskDraftProvider>
        <TaskDraftScope scope='1:1'>
          <ArticleEditor
            data={data}
            article={{
              ...proposal,
              ...(create
                ? { articleId: null, baseKey: null, baseVersion: null }
                : {}),
              draft: {
                slug: 'hello',
                status,
                locales: { en: { title: 'Hello', body: 'English body' } },
              },
            }}
            draftKey='status-edit'
            busy={false}
            onSave={onSave}
            onCancel={vi.fn()}
          />
        </TaskDraftScope>
      </TaskDraftProvider>,
    );
    const title = screen.getAllByRole('textbox', { name: /^Title/ })[0];
    await user.clear(title);
    await user.type(title, 'Edited title');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSave).toHaveBeenCalledWith({
      ...(create ? { slug: 'hello' } : {}),
      status,
      locales: {
        en: {
          title: 'Edited title',
          ...(create ? { body: 'English body' } : {}),
        },
      },
    });
  },
);

it('chooses draft or published for a target that stores a status, starting from the draft', async () => {
  const onSave = vi.fn(async () => true);
  const user = userEvent.setup();
  const withStatus = {
    ...data,
    articleTargets: [{ ...target, status: true }],
  } as unknown as TaskData;
  render(
    <TaskDraftProvider>
      <TaskDraftScope scope='1:1'>
        <ArticleEditor
          data={withStatus}
          article={{
            ...proposal,
            articleId: null,
            baseKey: null,
            baseVersion: null,
            draft: {
              slug: 'new-post',
              status: 'draft',
              locales: { en: { title: 'New', body: 'Body' } },
            },
          }}
          draftKey='status-choice'
          busy={false}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </TaskDraftScope>
    </TaskDraftProvider>,
  );
  expect(screen.getByRole('radio', { name: 'Draft' })).toBeChecked();
  await user.click(screen.getByRole('radio', { name: 'Published' }));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ slug: 'new-post', status: 'published' }),
  );
});

it('shows status changes as words in the review', async () => {
  render(
    <ArticleReview
      data={data}
      article={{
        ...proposal,
        articleId: null,
        baseKey: null,
        baseVersion: null,
        draft: {
          slug: 'new-post',
          status: 'draft',
          locales: { en: { title: 'New', body: 'Body' } },
        },
        changes: ['en.body', 'en.title', 'slug', 'status'],
      }}
      notes=''
    />,
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Status' }));
  expect(screen.getByText('Draft')).toBeInTheDocument();
});

it('shows an overwrite after publishing with a comparison, and when it was restored', async () => {
  const release = {
    state: 'live',
    note: '',
    pages: [],
    article: {
      artifactId: 'a',
      targetId: 'cms',
      articleId: '7',
      drift: {
        at: '2026-10-18',
        fields: [
          { field: 'zh.body', published: '新的中文正文', current: '中文正文' },
        ],
      },
    },
  } as const;
  const { rerender } = render(<DriftNotice data={data} r={release} />);
  expect(
    screen.getByText(
      'After publishing, these were changed again in NocoBase CMS: Chinese · Body',
    ),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Compare/ }));
  expect(screen.getByText('Published → now')).toBeInTheDocument();
  rerender(
    <DriftNotice
      data={data}
      r={{
        ...release,
        article: {
          ...release.article,
          drift: { ...release.article.drift, resolvedAt: '2026-10-19' },
        },
      }}
    />,
  );
  expect(
    screen.getByText('Back in line with the published version.'),
  ).toBeInTheDocument();
});

it('creates a publishing target: empty state, field errors on save, then a card without the key', async () => {
  const saved = {
    ...target,
    baseUrl: 'https://cms.example.com',
    hasSecret: true,
    fields: { id: 'id', slug: 'slug', version: 'updatedAt', locales: {} },
  };
  vi.mocked(articleRequest).mockImplementation(async (action: string) => {
    if (action === 'targets') return { revision: 0, targets: [] };
    if (action === 'saveTarget') return { revision: 1, targets: [saved] };
    throw new Error(action);
  });
  const onSaving = vi.fn();
  const user = userEvent.setup();
  render(
    <ArticleTargetsConnect
      projectId={1}
      onChange={vi.fn()}
      onSavingChange={onSaving}
    />,
  );
  expect(
    await screen.findByText('No publishing targets yet'),
  ).toBeInTheDocument();
  await user.click(
    screen.getByRole('button', { name: 'New publishing target' }),
  );
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(screen.getByText('Enter a name')).toBeInTheDocument();
  expect(
    screen.getByText('Enter an address starting with https://'),
  ).toBeInTheDocument();
  expect(articleRequest).not.toHaveBeenCalledWith(
    'saveTarget',
    expect.anything(),
    expect.anything(),
    expect.anything(),
  );
  await user.type(
    screen.getByRole('textbox', { name: /^Name/ }),
    'NocoBase CMS',
  );
  await user.type(
    screen.getByRole('textbox', { name: /^Address/ }),
    'https://cms.example.com/',
  );
  await user.type(screen.getByLabelText(/^Access key/), 'secret-key');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText(/Checked before writing/);
  const [, , body, session] = vi
    .mocked(articleRequest)
    .mock.calls.find((c) => c[0] === 'saveTarget')!;
  expect(session).toBe('session-a');
  expect(body).toMatchObject({
    revision: 0,
    secret: 'secret-key',
    target: {
      kind: 'nocobase-api',
      name: 'NocoBase CMS',
      baseUrl: 'https://cms.example.com',
      collection: 'articles',
    },
  });
  expect(onSaving).toHaveBeenCalledWith(true);
  expect(onSaving).toHaveBeenLastCalledWith(false);
  expect(screen.queryByDisplayValue('secret-key')).not.toBeInTheDocument();
});

it('marks the default target and makes another one the default from its menu', async () => {
  const card = (id: string, name: string) => ({
    ...target,
    id,
    name,
    baseUrl: `https://${id}.example.com`,
    hasSecret: true,
    fields: { id: 'id', slug: 'slug', version: 'updatedAt', locales: {} },
  });
  const targets = [card('cms', 'NocoBase CMS'), card('blog', 'Blog API')];
  vi.mocked(articleRequest).mockImplementation(async (action: string) => {
    if (action === 'targets')
      return { revision: 3, defaultTargetId: 'cms', targets };
    if (action === 'setDefaultTarget')
      return { revision: 4, defaultTargetId: 'blog', targets };
    throw new Error(action);
  });
  const user = userEvent.setup();
  render(
    <ArticleTargetsConnect
      projectId={1}
      onChange={vi.fn()}
      onSavingChange={vi.fn()}
    />,
  );
  await screen.findByText('Blog API');
  expect(screen.getAllByText('Default')).toHaveLength(1);
  // Permission checks resolve asynchronously: wait for the item rather than the first render.
  await user.click(
    screen.getByRole('button', { name: 'Actions for "Blog API"' }),
  );
  await user.click(
    await screen.findByRole('menuitem', { name: 'Make default' }),
  );
  expect(articleRequest).toHaveBeenCalledWith(
    'setDefaultTarget',
    1,
    { revision: 3, id: 'blog' },
    'session-a',
  );
  await waitFor(() =>
    expect(
      within(
        screen.getByText('Blog API').closest('[data-slot=card]') as HTMLElement,
      ).getByText('Default'),
    ).toBeInTheDocument(),
  );
  // The default target itself offers no "Make default".
  await user.click(
    screen.getByRole('button', { name: 'Actions for "Blog API"' }),
  );
  expect(
    await screen.findByRole('menuitem', { name: 'Delete' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('menuitem', { name: 'Make default' }),
  ).not.toBeInTheDocument();
});

// Several targets and per-playbook targets (design: storage/ui-workflow/article-multi-target/design.md).
const panelTarget = (id: string, name: string) => ({
  ...target,
  id,
  name,
  baseUrl: `https://${id}.example.com`,
  hasSecret: true,
  fields: { id: 'id', slug: 'slug', version: 'updatedAt', locales: {} },
});

it('sets a publishing target per playbook: saved choices, Save only after a change, stale saves reload', async () => {
  const targets = [
    panelTarget('cms', 'NocoBase CMS'),
    panelTarget('news', 'News'),
  ];
  let saves = 0;
  vi.mocked(articleRequest).mockImplementation(
    async (action: string, _p: number, body?: object) => {
      if (action === 'targets')
        return {
          revision: 3,
          defaultTargetId: 'cms',
          playbookTargets: { 'blog-post': 'news' },
          targets,
        };
      if (action === 'savePlaybookTargets') {
        saves++;
        if (saves === 1) throw staleError();
        return {
          revision: 4,
          defaultTargetId: 'cms',
          playbookTargets: (body as { playbookTargets: object })
            .playbookTargets,
          targets,
        };
      }
      throw new Error(action);
    },
  );
  const user = userEvent.setup();
  render(
    <ArticleTargetsConnect
      projectId={1}
      onChange={vi.fn()}
      onSavingChange={vi.fn()}
    />,
  );
  expect(
    await screen.findByText('Publishing target per playbook'),
  ).toBeInTheDocument();
  // Only playbooks with a change step are listed.
  expect(screen.queryByText('Research')).not.toBeInTheDocument();
  const blog = await screen.findByRole('combobox', { name: 'Blog post' });
  const page = screen.getByRole('combobox', { name: 'Improve a page' });
  expect(blog).toHaveTextContent('News');
  expect(page).toHaveTextContent('Follow the default target (NocoBase CMS)');
  const save = screen.getByRole('button', { name: 'Save' });
  expect(save).toBeDisabled();
  await user.click(page);
  await user.click(
    await screen.findByRole('option', {
      name: 'Website source repository (PR)',
    }),
  );
  expect(save).toBeEnabled();
  await user.click(save);
  expect(
    await screen.findByText('The settings were changed by someone else.'),
  ).toBeInTheDocument();
  expect(articleRequest).toHaveBeenCalledWith(
    'savePlaybookTargets',
    1,
    {
      revision: 3,
      playbookTargets: { 'blog-post': 'news', 'optimize-page': 'repo' },
    },
    'session-a',
  );
  // Reload replaces the local choices with the saved ones.
  await user.click(screen.getByRole('button', { name: 'Reload' }));
  await waitFor(() =>
    expect(page).toHaveTextContent('Follow the default target (NocoBase CMS)'),
  );
  expect(
    screen.queryByText('The settings were changed by someone else.'),
  ).not.toBeInTheDocument();
  await user.click(page);
  await user.click(await screen.findByRole('option', { name: 'News' }));
  await user.click(save);
  await waitFor(() => expect(save).toBeDisabled());
  expect(page).toHaveTextContent('News');
});

it('hides the per-playbook card without permission and shows a retry when playbooks cannot be read', async () => {
  vi.mocked(articleRequest).mockImplementation(async (action: string) => {
    if (action === 'targets')
      return {
        revision: 1,
        defaultTargetId: 'cms',
        targets: [panelTarget('cms', 'NocoBase CMS')],
      };
    throw new Error(action);
  });
  vi.mocked(playbookRequest).mockRejectedValueOnce(new Error('down'));
  const user = userEvent.setup();
  render(
    <ArticleTargetsConnect
      projectId={1}
      onChange={vi.fn()}
      onSavingChange={vi.fn()}
    />,
  );
  expect(
    await screen.findByText("Couldn't load the playbooks."),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(
    await screen.findByRole('combobox', { name: 'Blog post' }),
  ).toBeInTheDocument();
  cleanup();
  authorization.can.mockImplementation(
    async (...args: unknown[]) =>
      !JSON.stringify(args).includes('savePlaybookTargets'),
  );
  render(
    <ArticleTargetsConnect
      projectId={1}
      onChange={vi.fn()}
      onSavingChange={vi.fn()}
    />,
  );
  await screen.findByText('NocoBase CMS');
  await waitFor(() => expect(authorization.can).toHaveBeenCalled());
  expect(
    screen.queryByText('Publishing target per playbook'),
  ).not.toBeInTheDocument();
  authorization.can.mockImplementation(async () => true);
});

it('reviews the other targets: update or new, and what each cannot hold', () => {
  render(
    <ArticleReview
      data={
        {
          ...data,
          articleTargets: [target, { ...target, id: 'news', name: 'News' }],
        } as TaskData
      }
      article={{
        ...proposal,
        also: [
          {
            targetId: 'news',
            articleId: '70',
            baseKey: 'b2',
            baseVersion: 'v',
            draft: proposal.draft,
            changes: ['zh.body'],
            skipped: ['zh.title', 'ja'],
            slug: 'hello',
            title: 'Hello (news)',
          },
        ],
      }}
      notes=''
    />,
  );
  expect(
    screen.getByText(
      'Also publishes to News · updates "Hello (news)" (hello) · Without: Chinese · Title, Japanese',
    ),
  ).toBeInTheDocument();
});

it('lists each target of a release with its state and a conflict with its details', async () => {
  const release = {
    state: 'publish_conflict',
    note: '',
    pages: [],
    article: {
      artifactId: 'a',
      targetId: 'cms',
      articleId: '7',
      state: 'published',
    },
    also: [
      {
        targetId: 'news',
        articleId: null,
        slug: 'hello',
        state: 'publish_conflict',
        conflict: { reason: 'slug_taken', at: 'x' },
      },
      {
        targetId: 'demo',
        articleId: null,
        state: 'publish_failed',
        error: 'unavailable',
      },
    ],
  } as const;
  const d = {
    ...data,
    articleTargets: [
      target,
      { ...target, id: 'news', name: 'News' },
      { ...target, id: 'demo', name: 'Demo' },
    ],
  } as TaskData;
  render(<TargetRows data={d} r={release as never} />);
  const rows = screen.getAllByRole('listitem');
  expect(rows.map((r) => r.textContent)).toEqual([
    expect.stringMatching(/^NocoBase CMSSaved/),
    expect.stringMatching(/^NewsConflictAddress already taken/),
    expect.stringMatching(/^DemoDid not complete/),
  ]);
  expect(conflictHeading(d, release as never)).toBe(
    'The address "hello" is used by another article in News',
  );
  await userEvent.click(
    within(rows[1]).getByRole('button', { name: /Details/ }),
  );
  expect(
    screen.getByText(
      'After another review, the article already at this address in this target is updated instead.',
    ),
  ).toBeInTheDocument();
});

it('chooses other targets on the start card: the primary leaves them, a limit applies', async () => {
  const many = ['cms', 'a', 'b', 'c', 'd', 'e'].map((id) => ({
    ...target,
    id,
    name: id.toUpperCase(),
  }));
  const d = {
    ...data,
    articleTargets: many,
    work: { article: undefined },
    agent: { repo: { repo: 'org/site', baseBranch: 'main' } },
  } as unknown as TaskData;
  function Harness() {
    const [choice, setChoice] = useState<DeliveryChoice>({
      target: 'cms',
      mode: 'new',
      also: [],
    });
    return (
      <>
        <ArticleStart
          data={d}
          projectId={1}
          choice={choice}
          setChoice={setChoice}
          busy={false}
          allowed
          link={async () => true}
        />
        <output>{choice.also.join(',')}</output>
      </>
    );
  }
  const user = userEvent.setup();
  render(<Harness />);
  expect(
    screen.getByText(
      'Matched by address (slug): an existing article is updated, otherwise a new one is created.',
    ),
  ).toBeInTheDocument();
  for (const n of ['A', 'B', 'C', 'D'])
    await user.click(screen.getByRole('checkbox', { name: n }));
  expect(screen.getByRole('checkbox', { name: 'E' })).toHaveAttribute(
    'data-disabled',
  );
  expect(screen.getByText('Up to 4 more targets')).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Publish to'), 'a');
  expect(document.querySelector('output')?.textContent).toBe('b,c,d');
  expect(screen.queryByRole('checkbox', { name: 'A' })).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Publish to'), 'repo');
  expect(document.querySelector('output')?.textContent).toBe('');
  expect(screen.queryByText('Also publish to')).not.toBeInTheDocument();
});

it('defaults the start card to the playbook target, the repository, or the default target', () => {
  const d = (entries: Record<string, string>) =>
    ({
      ...data,
      articleTargets: [
        { ...target, default: true },
        { ...target, id: 'news', name: 'News' },
      ],
      articlePlaybookTargets: entries,
      work: {},
    }) as unknown as TaskData;
  expect(defaultDelivery(d({ 'blog-post': 'news' }), 'blog-post')).toEqual({
    target: 'news',
    mode: 'new',
    also: [],
  });
  expect(
    defaultDelivery(d({ 'optimize-page': 'repo' }), 'optimize-page'),
  ).toEqual({ target: 'repo', mode: 'new', also: [] });
  expect(defaultDelivery(d({}), 'optimize-page')).toEqual({
    target: 'cms',
    mode: 'existing',
    also: [],
  });
  expect(
    deliveryPlan(d({}), { target: 'cms', mode: 'new', also: ['news', 'cms'] })
      .delivery,
  ).toEqual({ targetId: 'cms', also: ['news'] });
});
