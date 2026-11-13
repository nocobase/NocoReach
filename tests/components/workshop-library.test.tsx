import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setDictionary } from '../../client/i18n';
import enDictionary from '../../shared/i18n/en.json';
import { Library } from '../../client/pages/workshop/library';
import { TopicStep } from '../../client/pages/workshop/pick';
import type { Article, WorkshopView } from '../../client/pages/workshop/model';

// Content workshop homepage v5 (2026-11-13): Library lists every blog article with read-only icons for the forms made
// from it, filters and searches them; Adapt a new topic's step 1 is the topic's form alone.

beforeEach(() => setDictionary(enDictionary as Record<string, string>));
afterEach(() => {
  cleanup();
  setDictionary(null);
});

const ORIGIN = 'https://acme.example';
const article = (path: string, extra: Partial<Article> = {}): Article => ({
  url: `${ORIGIN}${path}`,
  title: path.split('/').at(-1)!,
  clicks30: 10,
  made: [],
  ...extra,
});
const view = (articles: Article[]) =>
  ({
    hot: [],
    articles,
    records: [],
    recordCount: 0,
    brand: { revision: 0, community: null },
    voice: '',
    destinations: { reddit: { subreddits: [], weeks: 4, recent: [] } },
  }) as WorkshopView;

const releaseNotes = article('/blog/release-notes', {
  published: '2026-10-29',
  clicks30: 40,
  made: [
    { form: 'x', taskId: '47', no: 47, standing: 'done' },
    {
      form: 'community',
      destination: { kind: 'hn' },
      taskId: '49',
      no: 49,
      standing: 'done',
    },
    {
      form: 'community',
      destination: {
        kind: 'own',
        name: 'Acme Community',
        url: 'https://community.acme.example/',
        section: 'Announcements',
      },
      taskId: '48',
      no: 48,
      standing: 'review',
    },
  ],
});

it('lists every article with its date, clicks and the forms made from it, lit or grey', () => {
  render(
    <MemoryRouter>
      <Library
        view={view([
          releaseNotes,
          article('/blog/estimation', { clicks30: null }),
        ])}
      />
    </MemoryRouter>,
  );
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  const [first, second] = rows;
  expect(within(first).getByText('release-notes')).toBeInTheDocument();
  expect(within(first).getByText('/blog/release-notes')).toBeInTheDocument();
  expect(within(first).getByText('40')).toBeInTheDocument();
  // X and community posts lit, the community icon counting two; LinkedIn and Xiaohongshu grey.
  const lit = (row: HTMLElement) =>
    [...row.querySelectorAll('[data-form]')].map((el) => [
      el.getAttribute('data-form'),
      el.hasAttribute('data-lit'),
    ]);
  expect(lit(first)).toEqual([
    ['x', true],
    ['linkedin', false],
    ['xhs', false],
    ['community', true],
  ]);
  expect(first.querySelector('[data-form="community"]')).toHaveTextContent('2');
  // What each icon stands for, with its tasks and where they stand.
  expect(
    first.querySelector('[data-form="x"]')?.getAttribute('aria-label'),
  ).toBe('T-47 X posts · Done');
  expect(
    first.querySelector('[data-form="community"]')?.getAttribute('aria-label'),
  ).toBe('T-48 Acme Community post · Needs you; T-49 Hacker News post · Done');
  expect(
    first.querySelector('[data-form="linkedin"]')?.getAttribute('aria-label'),
  ).toBe('LinkedIn post · Not adapted');
  // No date and no Search Console: a dash.
  expect(within(second).getAllByText('—')).toHaveLength(2);
  expect(lit(second).every(([, on]) => !on)).toBe(true);
  // Read-only: no checkboxes, one Adapt per row.
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getAllByRole('button', { name: 'Adapt' })).toHaveLength(2);
});

it('filters by whether anything was made, searches titles and links, and shows more after 20', async () => {
  const user = userEvent.setup();
  const many = Array.from({ length: 25 }, (_, i) =>
    article(`/blog/post-${String(i).padStart(2, '0')}`),
  );
  render(
    <MemoryRouter>
      <Library view={view([releaseNotes, ...many])} />
    </MemoryRouter>,
  );
  const body = () => screen.getAllByRole('row').slice(1);
  expect(body()).toHaveLength(20);
  await user.click(screen.getByRole('button', { name: 'Show more · 6 left' }));
  expect(body()).toHaveLength(26);
  await user.click(screen.getByRole('tab', { name: 'Adapted 1' }));
  expect(
    body().map((r) => within(r).getAllByRole('link')[0].textContent),
  ).toEqual(['release-notes']);
  await user.click(screen.getByRole('tab', { name: 'Not adapted 25' }));
  expect(body()).toHaveLength(20);
  await user.type(
    screen.getByRole('textbox', { name: 'Search titles or links' }),
    '/blog/post-2',
  );
  expect(body()).toHaveLength(5);
  await user.clear(
    screen.getByRole('textbox', { name: 'Search titles or links' }),
  );
  await user.type(
    screen.getByRole('textbox', { name: 'Search titles or links' }),
    'nothing',
  );
  expect(
    screen.getByText('No article titles or links contain “nothing”.'),
  ).toBeInTheDocument();
});

it('offers to connect website content when there are no articles', () => {
  render(
    <MemoryRouter>
      <Library view={view([])} />
    </MemoryRouter>,
  );
  expect(screen.getByText('No blog articles yet')).toBeInTheDocument();
  expect(screen.queryByRole('table')).toBeNull();
});

it('asks Adapt a new topic for the topic alone: no article list', () => {
  render(
    <TopicStep
      topic={{ topic: '', points: '', links: '' }}
      onTopic={() => {}}
      problem=''
    />,
  );
  expect(screen.getByRole('textbox', { name: 'Topic' })).toBeInTheDocument();
  expect(screen.getAllByRole('textbox')).toHaveLength(3);
  expect(screen.queryByRole('radio')).toBeNull();
  expect(screen.queryByRole('tab')).toBeNull();
});
