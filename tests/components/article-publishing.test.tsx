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
import {
  articleLanguages,
  articleRequest,
  searchArticles,
} from '../../client/pages/article-targets-api';
import {
  ArticleEditor,
  ArticleReview,
} from '../../client/pages/task-detail/article-review';
import {
  DriftNotice,
  TargetRows,
} from '../../client/pages/task-detail/article-release';
import {
  DeliveryDialog,
  DeliverySummary,
  HandoffLanguage,
  PrimaryLanguage,
} from '../../client/pages/task-detail/article-start';
import { handoffTarget } from '../../client/pages/task-detail/article-model';
import {
  conflictHeading,
  defaultDelivery,
  deliveryPlan,
  translationLocales,
  pageUrlsOf,
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
  articleLanguages: vi.fn(),
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
// The target, new or update, and status tags at the top of the review card, in order.
const tagTexts = (root: ParentNode = document) =>
  [...root.querySelectorAll('[data-slot="tag"]')].map((t) => t.textContent);

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
  expect(tagTexts()).toEqual(['NocoBase CMS', 'Update article']);
  expect(screen.getByText('Hello')).toBeInTheDocument();
  const tabs = screen.getAllByRole('tab');
  expect(tabs.map((t) => t.textContent)).toEqual(['English', 'Chinese']);
  expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
  // The body changed, so the article opens as its readers will see it; Changes compares field by field.
  expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Changes' }));
  const panel = screen.getByRole('tabpanel');
  expect(within(panel).getByText('新的中文正文')).toBeInTheDocument();
  expect(within(panel).getByText('中文正文')).toBeInTheDocument();
  expect(within(panel).getByText('Title · Unchanged')).toBeInTheDocument();
  await userEvent.click(tabs[0]);
  expect(
    within(screen.getByRole('tabpanel')).getByText('Body · Unchanged'),
  ).toBeInTheDocument();
});

// 2026-10-24 user report on T-39: the address and status were tabs with a diff block each (then one grey sentence),
// the new article's English tab read "3 changes", and Chinese and Japanese were empty tabs.
it('a new article shows its target, kind and status as tags, in the languages it has, without change counts', () => {
  render(
    <ArticleReview
      data={
        {
          articleTargets: [{ ...target, status: true }],
          articleBases: {},
        } as unknown as TaskData
      }
      article={{
        targetId: 'cms',
        articleId: null,
        baseKey: null,
        baseVersion: null,
        draft: {
          slug: 'internal-tool-builder',
          locales: {
            en: { title: 'Internal tools', description: 'D', body: 'Body' },
          },
        },
        changes: ['slug', 'status', 'en.title', 'en.description', 'en.body'],
      }}
      notes=''
    />,
  );
  expect(tagTexts()).toEqual(['NocoBase CMS', 'New article', 'Save as draft']);
  expect(screen.getByText('internal-tool-builder')).toBeInTheDocument();
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
    'English',
  ]);
  expect(screen.getByText('Only English was written this time.')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Changes' })).toBeNull();
  expect(screen.queryByText('Address (slug)')).toBeNull();
  expect(screen.getByRole('heading', { name: 'Internal tools' })).toBeVisible();
});

it('a changed article tags a changed status and leaves out a language it does not have', () => {
  render(
    <ArticleReview
      data={
        {
          articleTargets: [{ ...target, status: true }],
          articleBases: {
            'base-1': { ...base, locales: { en: base.locales.en } },
          },
        } as unknown as TaskData
      }
      article={{
        ...proposal,
        draft: { status: 'draft', locales: { en: { body: 'New body' } } },
        changes: ['status', 'en.body'],
      }}
      notes=''
    />,
  );
  expect(tagTexts()).toEqual(['NocoBase CMS', 'Update article', 'Make draft']);
  // An existing article is named by its title; its unchanged address is left out.
  expect(screen.queryByText('hello')).toBeNull();
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
    'English',
  ]);
  expect(
    screen.getByText('This article has no Chinese version.'),
  ).toBeVisible();
  expect(screen.queryByRole('tab', { name: 'Status' })).toBeNull();
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

it('a conflict on the address reads inline, not as a diff', () => {
  render(
    <ArticleReview
      data={data}
      article={{
        ...proposal,
        conflicts: [
          { field: 'slug', base: 'hello', current: 'hello-cms', draft: 'hi' },
        ],
      }}
      notes=''
    />,
  );
  expect(screen.getByText('hello-cms → hi', { exact: false })).toBeVisible();
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

// 2026-10-27: the language a new article must have is the task's primary one, as the server checks.
it('asks a new article for the title and body of the primary language chosen at start', async () => {
  const onSave = vi.fn(async () => true);
  const user = userEvent.setup();
  render(
    <TaskDraftProvider>
      <TaskDraftScope scope='1:1'>
        <ArticleEditor
          data={
            {
              ...data,
              work: { delivery: { locales: ['zh', 'en'] } },
            } as unknown as TaskData
          }
          article={{
            ...proposal,
            articleId: null,
            baseKey: null,
            baseVersion: null,
            draft: { slug: 'new-post', locales: { zh: { title: '新文章' } } },
            changes: ['zh.title', 'slug'],
          }}
          draftKey='a2'
          busy={false}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </TaskDraftScope>
    </TaskDraftProvider>,
  );
  // Only Chinese is edited before its approval: English is translated from it, and says so once instead of as fields.
  expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
    'Chinese',
  ]);
  expect(screen.getAllByRole('textbox', { name: /^Title/ })).toHaveLength(1);
  expect(
    screen.getByText('English will be translated once Chinese is approved.'),
  ).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).not.toHaveBeenCalled();
  expect(screen.getAllByText('Enter the body')).toHaveLength(1);
  expect(screen.queryByText('Enter a title')).not.toBeInTheDocument();
  const bodies = screen.getAllByRole('textbox', { name: /^Body/ });
  await user.type(bodies[0], '中文正文');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith({
    slug: 'new-post',
    locales: { zh: { title: '新文章', body: '中文正文' } },
  });
});

// 2026-10-27 user report: the editor opened on empty English fields while the Chinese ones were further down.
it('edits the languages written, one at a time from the one shown, and opens the one with an error on save', async () => {
  const onSave = vi.fn(async () => true);
  const user = userEvent.setup();
  render(
    <TaskDraftProvider>
      <TaskDraftScope scope='1:1'>
        <ArticleEditor
          data={
            {
              ...data,
              work: {
                delivery: {
                  locales: ['zh', 'en'],
                  translateFrom: { artifactId: 'a0', at: '2026-10-27' },
                },
              },
            } as unknown as TaskData
          }
          article={{
            ...proposal,
            articleId: null,
            baseKey: null,
            baseVersion: null,
            draft: {
              slug: 'new-post',
              locales: {
                zh: { title: '新文章', body: '中文正文' },
                en: { title: 'New post', body: 'English body' },
              },
            },
            changes: ['zh.title', 'zh.body', 'en.title', 'en.body', 'slug'],
          }}
          draftKey='a3'
          tab='en'
          busy={false}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </TaskDraftScope>
    </TaskDraftProvider>,
  );
  const tab = (name: string) => screen.getByRole('tab', { name });
  expect(tab('English')).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue(
    'New post',
  );
  await user.click(tab('Chinese'));
  expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue('新文章');
  await user.clear(screen.getByRole('textbox', { name: /^Body/ }));
  await user.click(tab('English'));
  const title = screen.getByRole('textbox', { name: /^Title/ });
  await user.clear(title);
  await user.type(title, 'Edited');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).not.toHaveBeenCalled();
  // The Chinese body is required: its language opens, with the field focused.
  expect(tab('Chinese')).toHaveAttribute('aria-selected', 'true');
  const body = screen.getByRole('textbox', { name: /^Body/ });
  await waitFor(() => expect(body).toHaveFocus());
  await user.type(body, '新的正文');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith({
    slug: 'new-post',
    locales: {
      zh: { title: '新文章', body: '新的正文' },
      en: { title: 'Edited', body: 'English body' },
    },
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
              changes: [],
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

it('shows status changes as words in the review', () => {
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
  // A tag at the top, as words: no tab or diff for one value.
  expect(tagTexts()).toContain('Save as draft');
  expect(screen.queryByRole('tab', { name: 'Status' })).toBeNull();
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
  expect(tagTexts()).toEqual([
    'NocoBase CMS',
    'Update article',
    'News',
    'Update article',
  ]);
  expect(screen.getByText('Also to')).toBeInTheDocument();
  expect(screen.getByText('Hello (news)')).toBeInTheDocument();
  expect(
    screen.getByText('Without: Chinese · Title, Japanese'),
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

it('chooses other targets in the Change dialog: the primary leaves them, a limit applies', async () => {
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
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(
    <DeliveryDialog
      open
      onClose={() => undefined}
      data={d}
      projectId={1}
      choice={{ target: 'cms', mode: 'new', also: [] }}
      busy={false}
      link={async () => true}
      onSave={onSave}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Choose article' });
  expect(
    within(dialog).getByText(
      'Matched by address (slug): an existing article is updated, otherwise a new one is created.',
    ),
  ).toBeInTheDocument();
  for (const n of ['A', 'B', 'C', 'D'])
    await user.click(within(dialog).getByRole('checkbox', { name: n }));
  expect(within(dialog).getByRole('checkbox', { name: 'E' })).toHaveAttribute(
    'data-disabled',
  );
  expect(within(dialog).getByText('Up to 4 more targets')).toBeInTheDocument();
  await user.selectOptions(within(dialog).getByLabelText('Publish to'), 'a');
  expect(
    within(dialog).queryByRole('checkbox', { name: 'A' }),
  ).not.toBeInTheDocument();
  expect(within(dialog).getByRole('checkbox', { name: 'B' })).toBeChecked();
  // Nothing reaches the card before Save.
  expect(onSave).not.toHaveBeenCalled();
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith({
    target: 'a',
    mode: 'new',
    also: ['b', 'c', 'd'],
  });
});

it('picks an existing article in the Change dialog: saved on the task at Save, nothing on Cancel', async () => {
  const d = {
    ...data,
    articleTargets: [target],
    work: { article: undefined },
    agent: { repo: null },
  } as unknown as TaskData;
  const found = {
    targetId: 'cms',
    articleId: '9',
    slug: 'workflow-tools',
    title: 'Workflow tools',
    url: 'https://www.example.com/blog/workflow-tools',
  };
  vi.mocked(searchArticles).mockResolvedValue([
    { id: '9', slug: 'workflow-tools', title: 'Workflow tools' },
    { id: '12', slug: 'open-source-crm', title: 'Open source CRM' },
  ]);
  const link = vi.fn(async () => true),
    onSave = vi.fn(),
    onClose = vi.fn();
  const user = userEvent.setup();
  const show = () =>
    render(
      <DeliveryDialog
        open
        onClose={onClose}
        data={d}
        projectId={1}
        choice={{ target: 'cms', mode: 'existing', also: [], article: found }}
        found={found}
        busy={false}
        link={link}
        onSave={onSave}
      />,
    );
  show();
  let dialog = screen.getByRole('dialog', { name: 'Choose article' });
  expect(
    within(dialog).getByText('Selected: Workflow tools (workflow-tools)'),
  ).toBeInTheDocument();
  await user.click(
    await within(dialog).findByRole('button', { name: /Open source CRM/ }),
  );
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(onClose).toHaveBeenCalled();
  expect(link).not.toHaveBeenCalled();
  expect(onSave).not.toHaveBeenCalled();
  cleanup();
  // Picking the article found from the page again keeps it for the start; another one is saved on the task.
  show();
  dialog = screen.getByRole('dialog', { name: 'Choose article' });
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(link).not.toHaveBeenCalled();
  expect(onSave).toHaveBeenLastCalledWith({
    target: 'cms',
    mode: 'existing',
    also: [],
    article: found,
  });
  cleanup();
  show();
  dialog = screen.getByRole('dialog', { name: 'Choose article' });
  await user.click(
    await within(dialog).findByRole('button', { name: /Open source CRM/ }),
  );
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(link).toHaveBeenCalledWith('cms', '12');
  expect(onSave).toHaveBeenLastCalledWith({
    target: 'cms',
    mode: 'existing',
    also: [],
  });
  cleanup();
  // Existing article with none picked yet: Save waits for one.
  render(
    <DeliveryDialog
      open
      onClose={onClose}
      data={d}
      projectId={1}
      choice={{ target: 'cms', mode: 'existing', also: [] }}
      busy={false}
      link={link}
      onSave={onSave}
    />,
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByText('Pick the article to change')).toBeInTheDocument();
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
  ).toEqual({ targetId: 'cms', also: ['news'], locales: ['en', 'zh'] });
  // The languages chosen at start go with it, primary first (2026-10-24).
  expect(
    deliveryPlan(d({}), {
      target: 'cms',
      mode: 'new',
      also: [],
      locales: ['zh', 'en'],
    }).delivery,
  ).toEqual({ targetId: 'cms', locales: ['zh', 'en'] });
  // A single chosen language goes too (2026-10-27): without it the server writes every language.
  expect(
    deliveryPlan(d({}), {
      target: 'cms',
      mode: 'new',
      also: [],
      locales: ['zh'],
    }).delivery,
  ).toEqual({ targetId: 'cms', locales: ['zh'] });
  expect(
    deliveryPlan(
      { ...d({}), work: { article: { targetId: 'cms', articleId: '7' } } },
      { target: 'cms', mode: 'existing', also: [], locales: ['zh'] },
    ).delivery,
  ).toEqual({ locales: ['zh'] });
});

it('decides where the change goes from the page: the article found, the repository, or a pick', () => {
  const d = (entries: Record<string, string> = {}, repo = true) =>
    ({
      ...data,
      articleTargets: [
        { ...target, default: true },
        { ...target, id: 'news', name: 'News' },
      ],
      articlePlaybookTargets: entries,
      work: {},
      agent: { repo: repo ? { repo: 'org/site', baseBranch: 'main' } : null },
    }) as unknown as TaskData;
  const article = {
    targetId: 'news',
    articleId: '9',
    slug: 'workflow-tools',
    title: 'Workflow tools',
    url: 'https://www.example.com/blog/workflow-tools',
  };
  // Found from the page: that article, in the target holding it, saved on the task as it starts.
  const found = defaultDelivery(d(), 'optimize-page', {
    article,
    unchecked: false,
  });
  expect(found).toEqual({
    target: 'news',
    mode: 'existing',
    also: [],
    article,
  });
  expect(deliveryPlan(d(), found)).toMatchObject({
    ready: true,
    link: { targetId: 'news', articleId: '9' },
  });
  // The page is known and no target holds it: a page of the site itself, changed by a pull request.
  const none = { article: null, unchecked: false };
  expect(defaultDelivery(d(), 'optimize-page', none)).toEqual({
    target: 'repo',
    mode: 'new',
    also: [],
  });
  // Unless the playbook names a target, there is no repository, or the targets could not be asked: pick by hand.
  for (const [data2, f] of [
    [d({ 'optimize-page': 'news' }), none],
    [d({}, false), none],
    [d(), { article: null, unchecked: true }],
    [d(), undefined],
  ] as const)
    expect(defaultDelivery(data2, 'optimize-page', f)).toMatchObject({
      mode: 'existing',
    });
  // A blog post is a new article whatever page the task names.
  expect(
    defaultDelivery(d(), 'blog-post', { article, unchecked: false }),
  ).toEqual({ target: 'cms', mode: 'new', also: [] });
});

it("reads a task's pages from the page linked on it and the opportunity it came from", () => {
  const task = (evidence: Record<string, unknown>, page?: string) =>
    ({
      ...data,
      task: { id: 1, title: '', brief: '', evidence },
      work: page ? { page: { url: page, title: '' } } : {},
    }) as unknown as TaskData;
  expect(
    pageUrlsOf(
      task(
        {
          insight: {
            target: 'https://www.example.com/blog/a',
            signalIds: ['s1', 's3'],
          },
          context: {
            signals: {
              items: [
                { key: 's1', url: 'https://www.example.com/blog/a' },
                { key: 's2', url: 'https://www.example.com/blog/b' },
                { key: 's3', url: 'https://www.example.com/blog/c' },
              ],
            },
          },
        },
        'https://www.example.com/blog/linked',
      ),
    ),
  ).toEqual([
    'https://www.example.com/blog/linked',
    'https://www.example.com/blog/a',
    'https://www.example.com/blog/c',
  ]);
  expect(pageUrlsOf(task({ insight: { target: 'the docs site' } }))).toEqual(
    [],
  );
});

it('reads the page of a change handed off on its own, which has no opportunity', () => {
  // T-33: handed off from Insights › Today's changes; no opportunity, the change and its page kept on the task.
  const task = (evidence: Record<string, unknown>) =>
    ({
      ...data,
      task: { id: 33, title: '', brief: '', evidence },
      work: {},
    }) as unknown as TaskData;
  const context = {
    signals: {
      items: [
        { key: 'other', url: 'https://www.example.com/blog/other' },
        { key: 'gsc:x', url: 'https://www.example.com/blog/x' },
      ],
    },
  };
  expect(
    pageUrlsOf(task({ insight: null, signalKey: 'gsc:x', context })),
  ).toEqual(['https://www.example.com/blog/x']);
  expect(
    pageUrlsOf(
      task({
        insight: null,
        page: 'https://www.example.com/blog/x',
        signalKey: 'gsc:x',
        context,
      }),
    ),
  ).toEqual(['https://www.example.com/blog/x']);
  // Without either, nothing names a page: the article is picked by hand, as before.
  expect(pageUrlsOf(task({ insight: null, context }))).toEqual([]);
});

it('shows where the change goes in one line, with Change for the exceptions', async () => {
  const d = {
    ...data,
    articleTargets: [target],
    work: {},
  } as unknown as TaskData;
  const onChange = vi.fn();
  const article = {
    targetId: 'cms',
    articleId: '9',
    slug: 'workflow-tools',
    title: 'Workflow tools',
    url: 'https://www.example.com/blog/workflow-tools',
  };
  const show = (choice: DeliveryChoice, finding = false) =>
    render(
      <DeliverySummary
        data={d}
        choice={choice}
        finding={finding}
        allowed
        busy={false}
        onChange={onChange}
      />,
    );
  const { unmount } = show({
    target: 'cms',
    mode: 'existing',
    also: [],
    article,
  });
  expect(screen.getByText('Article to change')).toBeInTheDocument();
  expect(screen.getByText('Found from the page address')).toBeInTheDocument();
  // The title opens the article where readers see it.
  expect(screen.getByRole('link', { name: 'Workflow tools' })).toHaveAttribute(
    'href',
    article.url,
  );
  expect(screen.getByRole('link', { name: 'Workflow tools' })).toHaveAttribute(
    'target',
    '_blank',
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Change' }));
  expect(onChange).toHaveBeenCalled();
  unmount();
  show({ target: 'repo', mode: 'new', also: [] }).unmount();
  show({ target: 'cms', mode: 'new', also: [] });
  expect(screen.getByText('Publishes to NocoBase CMS')).toBeInTheDocument();
  cleanup();
  // Still to be picked: the line says so and Choose article opens the dialog.
  show({ target: 'cms', mode: 'existing', also: [] });
  expect(screen.getByText('Pick the article to change')).toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Choose article' }));
  expect(onChange).toHaveBeenCalledTimes(2);
  cleanup();
  show({ target: 'cms', mode: 'existing', also: [] }, true);
  expect(
    screen.getByText('Finding the article for this page…'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
});

it('links a saved article through its target page patterns, preferring the task page, and lists other targets', () => {
  const withPages = {
    ...target,
    pages: {
      en: 'https://www.example.com/en/blog/{slug}',
      zh: 'https://www.example.com/cn/blog/{slug}',
    },
  };
  const d = (targets: unknown[], page?: string) =>
    ({
      ...data,
      articleTargets: targets,
      task: { id: 1, title: 'T', brief: '' },
      work: {
        article: {
          targetId: 'cms',
          articleId: '7',
          slug: 'hello',
          title: 'Hello',
          sourceKey: null,
        },
        ...(page ? { page: { url: page, title: '' } } : {}),
      },
    }) as unknown as TaskData;
  const show = (task: TaskData, also: string[] = []) =>
    render(
      <DeliverySummary
        data={task}
        choice={{ target: 'cms', mode: 'existing', also }}
        finding={false}
        allowed
        busy={false}
        onChange={() => undefined}
      />,
    );
  show(d([withPages]));
  expect(screen.getByRole('link', { name: 'Hello' })).toHaveAttribute(
    'href',
    'https://www.example.com/en/blog/hello',
  );
  cleanup();
  show(d([withPages], 'https://example.com/cn/blog/hello/'));
  expect(screen.getByRole('link', { name: 'Hello' })).toHaveAttribute(
    'href',
    'https://example.com/cn/blog/hello/',
  );
  cleanup();
  // No patterns: the title stays plain text.
  show(d([target, { ...target, id: 'news', name: 'News' }]), ['news']);
  expect(screen.getByText('Hello')).toBeInTheDocument();
  expect(screen.queryByRole('link')).toBeNull();
  expect(screen.getByText('Also publishes to News')).toBeInTheDocument();
});

// 2026-10-24 user request: the primary language first, the others translated from it once it is approved.
it('the start card names the languages, primary first, and the dialog changes the primary', async () => {
  const d = {
    ...data,
    articleTargets: [{ ...target, locales: ['en', 'zh', 'ja'] }],
    work: { article: undefined },
  } as unknown as TaskData;
  const view = render(
    <DeliverySummary
      data={d}
      choice={{ target: 'cms', mode: 'new', also: [] }}
      finding={false}
      allowed
      busy={false}
      onChange={() => undefined}
    />,
  );
  expect(
    screen.getByText('Languages: English (primary) · Chinese · Japanese'),
  ).toBeInTheDocument();
  view.unmount();
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(
    <DeliveryDialog
      open
      onClose={() => undefined}
      data={d}
      projectId={1}
      choice={{ target: 'cms', mode: 'new', also: [] }}
      busy={false}
      link={async () => true}
      onSave={onSave}
    />,
  );
  const dialog = screen.getByRole('dialog');
  await user.selectOptions(
    within(dialog).getByLabelText('Primary language'),
    'zh',
  );
  await user.click(within(dialog).getByRole('checkbox', { name: 'Japanese' }));
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({ target: 'cms', locales: ['zh', 'en'] }),
  );
});

// 2026-10-28 (T-53): an existing article's other languages get the primary's changes in place, not a new translation.
it('the languages help says how they are written: translated for a new article, updated for an existing one', () => {
  const dialog = (mode: 'new' | 'existing') =>
    render(
      <DeliveryDialog
        open
        onClose={() => undefined}
        data={
          {
            ...data,
            articleTargets: [{ ...target, locales: ['en', 'zh', 'ja'] }],
            work: {
              article: {
                targetId: 'cms',
                articleId: '7',
                slug: 'hello',
                title: 'Hello',
                sourceKey: 'k',
                locales: ['en', 'zh'],
              },
            },
          } as unknown as TaskData
        }
        projectId={1}
        choice={{ target: 'cms', mode, also: [] }}
        busy={false}
        link={async () => true}
        onSave={() => undefined}
      />,
    );
  let view = dialog('new');
  expect(
    within(screen.getByRole('dialog')).getByText(
      /the Agent translates it into the other languages checked here/,
    ),
  ).toBeVisible();
  view.unmount();
  view = dialog('existing');
  expect(
    within(screen.getByRole('dialog')).getByText(
      /the Agent makes the same changes in the other languages checked here, keeping their existing wording/,
    ),
  ).toBeVisible();
  view.unmount();
});

it('before the primary is approved, the review says which languages follow', () => {
  render(
    <ArticleReview
      data={
        {
          articleTargets: [{ ...target, locales: ['en', 'zh'] }],
          articleBases: {},
          work: {
            delivery: {
              kind: 'article',
              targetId: 'cms',
              articleId: null,
              sourceKey: null,
              locales: ['en', 'zh'],
            },
          },
        } as unknown as TaskData
      }
      article={{
        targetId: 'cms',
        articleId: null,
        baseKey: null,
        baseVersion: null,
        draft: {
          slug: 'post',
          locales: { en: { title: 'Post', body: 'Body' } },
        },
        changes: ['slug', 'en.title', 'en.body'],
      }}
      notes=''
    />,
  );
  expect(
    screen.getByText('Chinese will be translated once English is approved.'),
  ).toBeVisible();
});

// 2026-10-25 user decision: Translate into other languages takes a published article and the languages it lacks,
// shown as tags; the dialog chooses the source and the languages to write, marking the missing ones.
const translation = (locales = ['en', 'zh', 'ja'], present?: string[]) =>
  ({
    ...data,
    articleTargets: [{ ...target, locales }],
    articlePlaybookTargets: {},
    work: {
      article: {
        targetId: 'cms',
        articleId: '7',
        slug: 'hello',
        title: 'Hello',
        sourceKey: 'source-1',
        ...(present ? { locales: present } : {}),
      },
    },
  }) as unknown as TaskData;

it('a translation starts from the article it lacks languages in, and the card says from and into which', () => {
  const d = translation(['en', 'zh', 'ja'], ['en', 'zh']);
  const choice = defaultDelivery(d, 'sync-translations', undefined, true);
  expect(choice).toEqual({ target: 'cms', mode: 'existing', also: [] });
  // Into the language it lacks; the source and the languages to write always go with the start.
  expect(deliveryPlan(d, choice, true)).toMatchObject({
    ready: true,
    delivery: { locales: ['en', 'ja'] },
  });
  // Lacking none: every other language, to bring them up to date. Unknown languages count as present.
  expect(
    translationLocales(translation(['en', 'zh'], ['en', 'zh']), choice),
  ).toEqual(['en', 'zh']);
  expect(translationLocales(translation(['en', 'zh', 'ja']), choice)).toEqual([
    'en',
    'zh',
    'ja',
  ]);
  // A new article cannot be translated: the linked target without an article is still an existing pick.
  const unlinked = {
    ...d,
    work: { article: { targetId: 'cms', articleId: null } },
  } as unknown as TaskData;
  expect(
    defaultDelivery(unlinked, 'sync-translations', undefined, true).mode,
  ).toBe('existing');
  expect(
    deliveryPlan(unlinked, { target: 'cms', mode: 'existing', also: [] }, true)
      .ready,
  ).toBe(false);
  render(
    <DeliverySummary
      data={d}
      choice={choice}
      finding={false}
      allowed
      busy={false}
      translate
      onChange={() => undefined}
    />,
  );
  expect(screen.getByText('Article to translate')).toBeInTheDocument();
  const line = document.querySelector('[data-delivery-languages]')!;
  expect(line.textContent).toBe('From English into Japanese');
  expect(tagTexts(line)).toEqual(['English', 'Japanese']);
});

it('the translation dialog chooses the source and the languages to write, marking the missing ones', async () => {
  const d = translation(['en', 'zh', 'ja'], ['en', 'zh']);
  const onSave = vi.fn();
  const user = userEvent.setup();
  render(
    <DeliveryDialog
      open
      onClose={() => undefined}
      data={d}
      projectId={1}
      choice={{ target: 'cms', mode: 'existing', also: [] }}
      translate
      busy={false}
      link={async () => true}
      onSave={onSave}
    />,
  );
  const dialog = screen.getByRole('dialog');
  expect(
    within(dialog).getByText('Choose article and languages'),
  ).toBeInTheDocument();
  // An existing article only, and no other targets.
  expect(within(dialog).queryByLabelText('New article')).toBeNull();
  expect(within(dialog).queryByText('Also publish to')).toBeNull();
  // The source is a language the article has; Japanese, which it lacks, is ticked and marked.
  const source = within(dialog).getByLabelText('Source language');
  expect(
    [...source.querySelectorAll('option')].map((o) => o.textContent),
  ).toEqual(['English', 'Chinese']);
  expect(
    within(dialog).getByRole('checkbox', { name: 'Japanese' }),
  ).toBeChecked();
  expect(
    within(dialog).getByRole('checkbox', { name: 'Chinese' }),
  ).not.toBeChecked();
  expect(tagTexts(dialog)).toEqual(['Missing']);
  await user.click(within(dialog).getByRole('checkbox', { name: 'Chinese' }));
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(onSave).toHaveBeenLastCalledWith(
    expect.objectContaining({
      target: 'cms',
      mode: 'existing',
      also: [],
      locales: ['en', 'zh', 'ja'],
    }),
  );
  // Another source starts from its own default; with nothing left to write, Save waits.
  await user.selectOptions(source, 'zh');
  expect(
    within(dialog).getByRole('checkbox', { name: 'English' }),
  ).not.toBeChecked();
  await user.click(within(dialog).getByRole('checkbox', { name: 'Japanese' }));
  expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled();
});

it('an article picked by hand for a translation has its languages read, and a one-language target says why', async () => {
  vi.mocked(searchArticles).mockResolvedValue([
    { id: '9', slug: 'other', title: 'Other post' },
  ] as never);
  vi.mocked(articleLanguages).mockResolvedValue({ locales: ['zh'] } as never);
  const user = userEvent.setup();
  const view = render(
    <DeliveryDialog
      open
      onClose={() => undefined}
      data={translation(['en', 'zh', 'ja'], ['en', 'zh'])}
      projectId={1}
      choice={{ target: 'cms', mode: 'existing', also: [] }}
      translate
      busy={false}
      link={async () => true}
      onSave={() => undefined}
    />,
  );
  const dialog = screen.getByRole('dialog');
  await user.click(
    await within(dialog).findByRole('button', { name: /Other post/ }),
  );
  await waitFor(() =>
    expect(articleLanguages).toHaveBeenCalledWith(
      1,
      'cms',
      '9',
      expect.anything(),
    ),
  );
  // Only Chinese has text: it is the source, and the two others are missing.
  await waitFor(() => expect(tagTexts(dialog)).toEqual(['Missing', 'Missing']));
  expect(within(dialog).getByLabelText('Source language')).toHaveValue('zh');
  view.unmount();
  render(
    <DeliverySummary
      data={translation(['en'], ['en'])}
      choice={{ target: 'cms', mode: 'existing', also: [] }}
      finding={false}
      allowed
      busy={false}
      translate
      onChange={() => undefined}
    />,
  );
  expect(
    screen.getByText(
      'This publishing target has only one language, so there is nothing to translate.',
    ),
  ).toBeInTheDocument();
  expect(
    deliveryPlan(
      translation(['en'], ['en']),
      { target: 'cms', mode: 'existing', also: [] },
      true,
    ).ready,
  ).toBe(false);
});

// The primary language (2026-10-30, T-58): chosen with a hand-over, and changed on the review card until approved.
it('offers the primary language with a hand-over and on the review card until it is approved', async () => {
  const cms = { ...target, locales: ['en', 'zh', 'ja'] };
  const d = (delivery: object) =>
    ({
      ...data,
      articleTargets: [cms],
      articlePlaybookTargets: { 'new-doc': 'repo' },
      work: { delivery },
    }) as unknown as TaskData;
  const pending = d({
    kind: 'article',
    targetId: 'cms',
    locales: ['en', 'zh', 'ja'],
  });
  expect(
    handoffTarget(pending, { id: 'blog-post', kind: 'build' }, false)?.id,
  ).toBe('cms');
  expect(
    handoffTarget(pending, { id: 'new-doc', kind: 'build' }, false),
  ).toBeNull();
  expect(
    handoffTarget(pending, { id: 'keyword-research', kind: 'plan' }, false),
  ).toBeNull();
  const onPick = vi.fn();
  const user = userEvent.setup();
  render(
    <HandoffLanguage
      id='next'
      all={['en', 'zh', 'ja']}
      primary='zh'
      busy={false}
      onChange={onPick}
    />,
  );
  expect(
    screen.getByText(
      'The primary language is written first; once you approve it, the agent translates it into English, Japanese, then everything is published together.',
    ),
  ).toBeInTheDocument();
  cleanup();
  const onChange = vi.fn();
  const { rerender } = render(
    <PrimaryLanguage data={pending} busy={false} allowed onChange={onChange} />,
  );
  await user.click(screen.getByRole('combobox'));
  await user.click(await screen.findByRole('option', { name: 'Chinese' }));
  expect(onChange).toHaveBeenCalledWith('zh');
  // Approved and being translated: no longer offered.
  rerender(
    <PrimaryLanguage
      data={d({
        kind: 'article',
        targetId: 'cms',
        locales: ['en', 'zh'],
        translateFrom: { artifactId: 'a' },
      })}
      busy={false}
      allowed
      onChange={onChange}
    />,
  );
  expect(screen.queryByRole('combobox')).toBeNull();
});
