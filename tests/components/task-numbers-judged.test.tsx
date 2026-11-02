import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setDictionary } from '../../client/i18n/index.js';
import { TaskNumbers } from '../../client/pages/task-detail/task-numbers.js';
import type { EffectResult } from '../../client/pages/effect-model.js';
import type { TaskData } from '../../client/pages/task-execution-types.js';
import english from '../../shared/i18n/en.json';

// Task page › Performance from day 7 (2026-11-02): the numbers of the metric the change was judged by, and with too
// little data, what there was.

beforeEach(() => setDictionary(english));
afterEach(() => {
  cleanup();
  setDictionary(null);
});

const page = 'https://www.example.com/en/blog/workflow-automation-tools';
const week = { baselineDays: 7, afterDays: 7 };
const result = (extra: Partial<EffectResult>) =>
  ({
    day: 7,
    baseline: { start: '2026-10-15', end: '2026-10-21' },
    after: { start: '2026-10-23', end: '2026-10-29' },
    pages: [page],
    gsc: {
      clicks: [2, 1],
      impressions: [6071, 4318],
      ctr: [0, 0],
      position: [22.9, 23.7],
    },
    ga4: { views: [4, 7], conversions: [0, 0] },
    primary: 'impressions',
    change: -0.289,
    conclusion: 'down',
    notes: [],
    computedAt: '2026-11-01T09:09:59.451Z',
    coverage: { gsc: week, ga4: week },
    rule: 2,
    ...extra,
  }) as EffectResult;
const show = (r: EffectResult) =>
  render(
    <MemoryRouter>
      <TaskNumbers
        data={
          {
            work: {
              observeFrom: '2026-10-22T10:03:36.435Z',
              observation: { results: [r] },
            },
          } as unknown as TaskData
        }
        projectId={1}
        taskId='33'
      />
    </MemoryRouter>,
  );

it('shows the metric the change was judged by, page by page', () => {
  show(result({}));
  expect(
    screen.getByText(
      'Search impressions · 7 days before → 7 days after going live',
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole('listitem')).toHaveTextContent('6,071 → 4,318');
});

it('says what there was when nothing had enough data, and lists no numbers', () => {
  show(
    result({
      gsc: {
        clicks: [0, 1],
        impressions: [15, 20],
        ctr: [0, 0],
        position: [30, 28],
      },
      ga4: { views: [2, 4], conversions: [0, 0] },
      primary: null,
      change: null,
      conclusion: 'insufficient',
    }),
  );
  expect(
    screen.getByText(
      'Not enough data: Only 35 search impressions and 6 views in the 7 days before and after going live, too few to judge',
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
});

it('shows only the total for several pages judged before each page kept its impressions', () => {
  const other = 'https://www.example.com/en/blog/other';
  show(
    result({
      pages: [page, other],
      byPage: [
        { page, clicks: [1, 1], position: [20, 21] },
        { page: other, clicks: [1, 0], position: [25, 26] },
      ],
    }),
  );
  expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  expect(
    screen.getByText(english['taskNumbers.total'].replace('{0}', '2'))
      .parentElement,
  ).toHaveTextContent('6,071 → 4,318');
});
