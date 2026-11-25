import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setDictionary } from '../../client/i18n';
import enDictionary from '../../shared/i18n/en.json';
import zhDictionary from '../../shared/i18n/zh.json';
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
const article = (path: string, extra: Partial<Article> = {}): Article => {
  const a = {
    url: `${ORIGIN}${path}`,
    title: path.split('/').at(-1)!,
    clicks30: 10,
    made: [],
    ...extra,
  };
  return {
    versions: [
      {
        url: a.url,
        title: a.title,
        clicks30: a.clicks30,
        ...(a.published ? { published: a.published } : {}),
      },
    ],
    ...a,
  };
};
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
  // X and community posts lit, the community icon counting two; LinkedIn and Carousel grey.
  const lit = (row: HTMLElement) =>
    [...row.querySelectorAll('[data-form]')].map((el) => [
      el.getAttribute('data-form'),
      el.hasAttribute('data-lit'),
    ]);
  expect(lit(first)).toEqual([
    ['x', true],
    ['linkedin', false],
    ['carousel', false],
    ['community', true],
  ]);
  expect(first.querySelector('[data-form="community"]')).toHaveTextContent('2');
  // Lit marks in their own colour (the community icon in the text colour), grey ones faded.
  const mark = (row: HTMLElement, form: string) =>
    row.querySelector(`[data-form="${form}"] [data-slot="source-logo"]`);
  expect(mark(first, 'community')).toHaveClass('text-foreground');
  expect(mark(first, 'linkedin')).toHaveClass('opacity-30');
  expect(
    first.querySelector('[data-form="carousel"] > [aria-hidden]'),
  ).toHaveClass('opacity-30');
  expect(
    first.querySelector('[data-form="carousel"]')?.getAttribute('aria-label'),
  ).toBe('Carousel · Not adapted');
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

it('lights one Carousel icon for every place a carousel went, naming the places first', () => {
  const made = article('/blog/choose-pm-tool', {
    made: [
      { form: 'xhs', taskId: '41', no: 41, standing: 'done' },
      { form: 'linkedin-carousel', taskId: '52', no: 52, standing: 'done' },
      { form: 'instagram', taskId: '53', no: 53, standing: 'review' },
    ],
  });
  const { unmount } = render(
    <MemoryRouter>
      <Library view={view([made])} />
    </MemoryRouter>,
  );
  const icon = () =>
    screen.getAllByRole('row')[1].querySelector('[data-form="carousel"]')!;
  expect(icon()).toHaveAttribute('data-lit');
  expect(icon()).toHaveTextContent('3');
  expect(icon().querySelector('[aria-hidden]')).toHaveClass('text-foreground');
  // Places in the reader's order: Xiaohongshu last outside Chinese.
  expect(icon().getAttribute('aria-label')).toBe(
    'Carousel: Instagram, LinkedIn, Xiaohongshu; T-41 Xiaohongshu carousel · Done; T-52 LinkedIn carousel · Done; T-53 Instagram carousel · Needs you',
  );
  expect(
    screen.getAllByRole('row')[1].querySelectorAll('[data-form]'),
  ).toHaveLength(4);
  unmount();
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

// One row per article (2026-11-17 user decision): nocobase.com writes most articles in English, Chinese and Japanese.
const NB = 'https://www.nocobase.com';
const governance: Article = {
  url: `${NB}/blog/governance/`,
  title: 'From AI Coding to Application Governance',
  published: '2026-11-11',
  clicks30: 73,
  made: [],
  versions: [
    {
      url: `${NB}/blog/governance/`,
      title: 'From AI Coding to Application Governance',
      lang: 'en',
      published: '2026-11-11',
      clicks30: 56,
    },
    {
      url: `${NB}/zh-CN/blog/governance/`,
      title: '从 AI 编程到应用治理',
      lang: 'zh-CN',
      published: '2026-11-11',
      clicks30: 17,
    },
    {
      url: `${NB}/ja-JP/blog/governance/`,
      title: 'AI コーディングからアプリケーションガバナンスへ',
      lang: 'ja-JP',
      published: '2026-11-11',
      clicks30: 0,
    },
  ],
};
const firebase: Article = {
  url: `${NB}/blog/firebase/`,
  title: 'Alternatives to Firebase',
  published: '2026-10-20',
  clicks30: 11,
  made: [],
  versions: [
    {
      url: `${NB}/blog/firebase/`,
      title: 'Alternatives to Firebase',
      lang: 'en',
      published: '2026-10-20',
      clicks30: 11,
    },
  ],
};
function Opened() {
  return <p data-testid='opened'>{useLocation().search}</p>;
}
const library = (articles: Article[]) =>
  render(
    <MemoryRouter initialEntries={['/workshop']}>
      <Routes>
        <Route path='/workshop' element={<Library view={view(articles)} />} />
        <Route path='/workshop/new' element={<Opened />} />
      </Routes>
    </MemoryRouter>,
  );
const opened = () =>
  Object.fromEntries(
    new URLSearchParams(screen.getByTestId('opened').textContent || ''),
  );

it('lists an article once with its languages and their clicks together, and adapts the version shown', async () => {
  const user = userEvent.setup();
  library([governance, firebase]);
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows).toHaveLength(2);
  const [first, second] = rows;
  // The English version for an English reader; every language tagged by its own name.
  expect(
    within(first).getByRole('link', {
      name: 'From AI Coding to Application Governance',
    }),
  ).toHaveAttribute('href', `${NB}/blog/governance/`);
  const tags = (row: HTMLElement) =>
    [...row.querySelectorAll('[data-languages] [data-slot="tag"]')].map(
      (t) => t.textContent,
    );
  expect(tags(first)).toEqual(['English', '简体中文', '日本語']);
  expect(tags(second)).toEqual(['English']);
  // The clicks of all three, each language's on hover.
  expect(
    first.querySelector('[data-clicks-each]')?.getAttribute('aria-label'),
  ).toBe('73: English 56; 简体中文 17; 日本語 0');
  expect(second.querySelector('[data-clicks-each]')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'What is 30-day clicks' }),
  ).toBeInTheDocument();
  // Articles are counted, not pages.
  expect(screen.getByRole('tab', { name: 'All 2' })).toBeInTheDocument();
  // A title in any language finds it.
  await user.type(
    screen.getByRole('textbox', { name: 'Search titles or links' }),
    '应用治理',
  );
  expect(screen.getAllByRole('row').slice(1)).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Adapt' }));
  expect(opened()).toEqual({
    url: `${NB}/blog/governance/`,
    title: 'From AI Coding to Application Governance',
  });
});

it('shows a Chinese reader the Chinese version, and the original when there is none', async () => {
  setDictionary(zhDictionary as Record<string, string>, 'zh-CN');
  const user = userEvent.setup();
  library([governance, firebase]);
  const [first, second] = screen.getAllByRole('row').slice(1);
  expect(
    within(first).getByRole('link', { name: '从 AI 编程到应用治理' }),
  ).toHaveAttribute('href', `${NB}/zh-CN/blog/governance/`);
  expect(
    within(first).getByText('/zh-CN/blog/governance/'),
  ).toBeInTheDocument();
  expect(
    within(second).getByRole('link', { name: 'Alternatives to Firebase' }),
  ).toBeInTheDocument();
  await user.click(within(first).getByRole('button', { name: '加工' }));
  expect(opened()).toEqual({
    url: `${NB}/zh-CN/blog/governance/`,
    title: '从 AI 编程到应用治理',
  });
});

it('tags no language on a site written in one language', () => {
  library([firebase]);
  expect(document.querySelector('[data-languages]')).toBeNull();
  expect(screen.getByText('/blog/firebase/')).toBeInTheDocument();
});
