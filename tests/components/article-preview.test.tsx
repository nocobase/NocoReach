import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { ArticlePreview } from '../../client/pages/task-detail/article-preview';
import { AgentNotes } from '../../client/pages/task-detail/agent-notes';
import { leadOf, siteUrl } from '../../client/pages/task-detail/article-text';
import { MarkdownEditor } from '../../client/pages/task-detail/markdown-editor';
import { ArticleReview } from '../../client/pages/task-detail/article-review';
import type { TaskData } from '../../client/pages/task-execution-types';

beforeEach(() => {
  cleanup();
  setDictionary(english);
});
afterEach(() => setDictionary(null));

const PAGE = 'https://www.nocobase.com/en/blog/airtable-alternatives';

it('renders an article as its readers see it, images included, without running raw HTML', () => {
  const { container } = render(
    <ArticlePreview
      pageUrl={PAGE}
      text={{
        title: 'Top 5 open-source Airtable alternatives',
        description: 'Five open-source tools compared.',
        body: [
          '## NocoBase',
          '',
          '![NocoBase main screen](https://cdn.example.com/nocobase.png)',
          '',
          '![Teable grid](/images/teable.png)',
          '',
          '| Tool | Self-hosted |',
          '| --- | --- |',
          '| NocoBase | Yes |',
          '',
          '```bash',
          'docker compose up -d',
          '```',
          '',
          '<img src="x" onerror="alert(1)"><script>alert(1)</script>',
        ].join('\n'),
      }}
    />,
  );
  expect(
    screen.getByRole('heading', {
      level: 1,
      name: 'Top 5 open-source Airtable alternatives',
    }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Five open-source tools compared.'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('heading', { level: 2, name: 'NocoBase' }),
  ).toBeInTheDocument();
  const image = screen.getByRole('img', { name: 'NocoBase main screen' });
  expect(image).toHaveAttribute('src', 'https://cdn.example.com/nocobase.png');
  expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
  // A relative image is read against the article's page on its site.
  expect(screen.getByRole('img', { name: 'Teable grid' })).toHaveAttribute(
    'src',
    'https://www.nocobase.com/images/teable.png',
  );
  expect(screen.getByRole('table')).toHaveTextContent('NocoBase');
  expect(container.querySelector('pre')).toHaveTextContent(
    'docker compose up -d',
  );
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('img[onerror]')).toBeNull();
});

it('shows the alternative text and Could not load when an image fails', () => {
  render(
    <ArticlePreview
      text={{
        body: '![Rowy screen](https://cdn.example.com/rowy.png)\n\n![Local](/local.png)',
      }}
    />,
  );
  fireEvent.error(screen.getByRole('img', { name: 'Rowy screen' }));
  const failed = screen.getByRole('img', { name: 'Rowy screen' });
  expect(failed.tagName).toBe('SPAN');
  expect(failed).toHaveTextContent('Rowy screenCould not load');
  // Without a page to read it against, a relative image is not loaded from NocoReach's own address.
  expect(screen.getByRole('img', { name: 'Local' }).tagName).toBe('SPAN');
});

it('reads only http(s) addresses', () => {
  expect(siteUrl('javascript:alert(1)', PAGE)).toBe('');
  expect(siteUrl('data:image/png;base64,AAAA', PAGE)).toBe('');
  expect(siteUrl('img/a.png', PAGE)).toBe(
    'https://www.nocobase.com/en/blog/img/a.png',
  );
  expect(siteUrl('img/a.png')).toBe('');
});

it('shows the summary first and the full notes on demand', async () => {
  const notes =
    '## 修改说明\n\n按审核意见，把文中 5 张截图全部换成最新界面。\n\n## 时间戳\n\n- 2026-10-22T08:09:41Z';
  render(
    <AgentNotes summary='Replaced 5 screenshots as asked.' notes={notes} />,
  );
  expect(
    screen.getByText('Replaced 5 screenshots as asked.'),
  ).toBeInTheDocument();
  expect(screen.queryByText(/2026-10-22T08:09:41Z/)).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Full notes' }));
  expect(screen.getByText(/2026-10-22T08:09:41Z/)).toBeInTheDocument();
  // A result from before the Agent wrote a summary starts with its first paragraph.
  cleanup();
  render(<AgentNotes notes={notes} />);
  expect(
    screen.getByText('按审核意见，把文中 5 张截图全部换成最新界面。'),
  ).toBeInTheDocument();
  expect(leadOf('- **One** change\n- [two](https://x.test)')).toBe(
    'One change two',
  );
});

it('updates the preview as the Markdown is written', async () => {
  function Editor() {
    const [value, setValue] = useState('# Draft');
    return (
      <MarkdownEditor
        aria-label='Body'
        value={value}
        onChange={(e) => setValue(e.target.value)}
        preview={(text) => <ArticlePreview text={{ body: text }} />}
      />
    );
  }
  const user = userEvent.setup();
  render(<Editor />);
  await user.type(screen.getByRole('textbox', { name: 'Body' }), ' two');
  await user.click(screen.getByRole('button', { name: 'Preview' }));
  expect(
    within(screen.getByRole('region', { name: 'Preview' })).getByRole(
      'heading',
      { name: 'Draft two' },
    ),
  ).toBeInTheDocument();
});

const data = {
  articleTargets: [
    {
      id: 'cms',
      name: 'NocoBase CMS',
      kind: 'nocobase-api',
      locales: ['en'],
      capabilities: { concurrency: 'check-before-write' },
      pages: { en: 'https://www.nocobase.com/en/blog/{slug}' },
    },
  ],
  articleBases: {
    b1: {
      slug: 'airtable-alternatives',
      status: 'published',
      locales: {
        en: {
          title: 'Airtable alternatives',
          description: 'Compared.',
          body: '![Old screen](old.png)',
        },
      },
    },
  },
} as unknown as TaskData;
const article = (changes: string[], locale: Record<string, string>) => ({
  targetId: 'cms',
  articleId: '41',
  baseKey: 'b1',
  baseVersion: 'v3',
  draft: { locales: { en: locale }, summary: 'Replaced the screenshot.' },
  changes,
});

it('opens a body change as it will read, with Before and Compare in one switch', async () => {
  render(
    <ArticleReview
      data={data}
      article={article(['en.body'], { body: '![New screen](new.png)' })}
      notes='Long notes'
    />,
  );
  expect(screen.getByText('Replaced the screenshot.')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'New screen' })).toHaveAttribute(
    'src',
    'https://www.nocobase.com/en/blog/new.png',
  );
  expect(screen.getByRole('button', { name: 'After' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Before' }));
  expect(screen.getByRole('img', { name: 'Old screen' })).toBeInTheDocument();
  // No text links beside the switch (2026-10-24 user request).
  expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
});

it('opens a title-only change field by field', () => {
  render(
    <ArticleReview
      data={data}
      article={article(['en.title'], { title: 'Five Airtable alternatives' })}
      notes=''
    />,
  );
  expect(screen.getByRole('button', { name: 'Compare' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByText('Body · Unchanged')).toBeInTheDocument();
});
