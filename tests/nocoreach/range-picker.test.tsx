import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import { RangePicker } from '../../client/pages/range-picker';
import { customRangeError, useRange } from '../../client/pages/range-state';

beforeEach(() => {
  // Only the clock is fake, so user-event and the popover keep their real timers.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
  setDictionary(english);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  setDictionary(null);
});

let go: ReturnType<typeof useNavigate>;
function Harness() {
  const [value, setValue] = useRange();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    go = navigate;
  }, [navigate]);
  return (
    <>
      <RangePicker value={value} onChange={setValue} />
      <output aria-label='URL'>{location.search}</output>
      <button onClick={() => navigate('/?days=7&view=repo')}>Navigate</button>
      <button onClick={() => navigate(-1)}>Back</button>
      <button onClick={() => navigate(1)}>Forward</button>
    </>
  );
}
function mount(url = '/?days=custom&from=2026-09-01&to=2026-09-20&view=repo') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Harness />
    </MemoryRouter>,
  );
}
const trigger = (name: string) => screen.getByRole('button', { name });
// Day buttons are named by their full date, e.g. "Tuesday, September 1st, 2026, selected".
const day = (date: string) =>
  screen.getByRole('button', { name: new RegExp(`, ${date}, 2026`) });
const url = () => screen.getByLabelText('URL').textContent;
// The draft lives in the calendar: each selected day's cell carries its yyyy-mm-dd date.
// The neighbouring month's hidden outside days are skipped.
const selected = () =>
  screen
    .getAllByRole('gridcell', { selected: true })
    .filter((cell) => !cell.hasAttribute('data-outside'))
    .map((cell) => cell.getAttribute('data-day'));

it('keeps picks and validation local until Apply, then writes both ends and keeps other parameters', async () => {
  mount();
  const user = userEvent.setup();
  const initial = url();
  await user.click(trigger('Sep 1, 2026 – Sep 20, 2026'));
  expect(screen.getByRole('grid', { name: 'August 2026' })).toBeVisible();
  expect(screen.getByRole('grid', { name: 'September 2026' })).toBeVisible();
  expect(day('September 1st').getAttribute('aria-label')).toMatch(/selected$/);
  expect(day('September 20th').getAttribute('aria-label')).toMatch(/selected$/);

  // A complete range restarts on the next click; the click after that ends it.
  await user.click(day('September 2nd'));
  expect(selected()).toEqual(['2026-09-02']);
  // The trigger keeps the committed range until Apply.
  expect(trigger('Sep 1, 2026 – Sep 20, 2026')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter a complete, valid end date.',
  );
  expect(url()).toBe(initial);
  await user.click(day('September 25th'));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(selected()).toHaveLength(24);
  expect(selected().at(-1)).toBe('2026-09-25');
  expect(url()).toBe(initial);

  await user.click(screen.getByRole('button', { name: 'Apply' }));
  expect(url()).toBe('?days=custom&from=2026-09-02&to=2026-09-25&view=repo');
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  expect(trigger('Sep 2, 2026 – Sep 25, 2026')).toHaveFocus();
});

it('opens Custom on the last 28 days without committing them, discards closed drafts, and presets drop Custom', async () => {
  mount('/?days=28&view=repo');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Custom', exact: true }));
  expect(url()).toBe('?days=28&view=repo');
  expect(trigger('Sep 18, 2026 – Oct 15, 2026')).toBeVisible();
  expect(screen.getByRole('grid', { name: 'October 2026' })).toBeVisible();
  // Nothing after today can be picked, and the calendar stops at this month.
  expect(day('October 16th')).toBeDisabled();
  expect(
    screen.getByRole('button', { name: 'Go to the Next Month' }),
  ).toHaveAttribute('aria-disabled', 'true');

  await user.click(day('September 30th'));
  expect(selected()).toEqual(['2026-09-30']);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  expect(url()).toBe('?days=28&view=repo');
  await user.click(trigger('Sep 18, 2026 – Oct 15, 2026'));
  expect(selected()).toHaveLength(28);
  await user.keyboard('{Escape}');

  await user.click(
    screen.getByRole('button', { name: 'Last 7 days', exact: true }),
  );
  expect(
    screen.queryByRole('button', { name: /2026 –/ }),
  ).not.toBeInTheDocument();
  expect(url()).toBe('?days=7&view=repo');
});

it('restores committed deep links on Back/Forward and replaces open drafts on external navigation', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(trigger('Sep 1, 2026 – Sep 20, 2026'));
  await user.click(day('September 3rd'));
  act(() => {
    void go('/?days=custom&from=2026-09-05&to=2026-09-06');
  });
  expect(screen.queryByRole('grid')).not.toBeInTheDocument();
  expect(trigger('Sep 5, 2026 – Sep 6, 2026')).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(trigger('Sep 1, 2026 – Sep 20, 2026')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Forward' }));
  expect(trigger('Sep 5, 2026 – Sep 6, 2026')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Navigate' }));
  expect(
    screen.queryByRole('button', { name: /2026 –/ }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Back' }));
  await user.click(trigger('Sep 5, 2026 – Sep 6, 2026'));
  expect(day('September 5th').getAttribute('aria-label')).toMatch(/selected$/);
  expect(day('September 6th').getAttribute('aria-label')).toMatch(/selected$/);
});

it('keeps the one valid end of an incomplete link, and localizes the calendar and errors', async () => {
  setDictionary(null);
  mount('/?days=custom&to=2026-09-20');
  const user = userEvent.setup();
  await user.click(trigger('开始日期 – 2026年9月20日'));
  expect(screen.getByRole('grid', { name: '2026年9月' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: '应用' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    '请输入完整且有效的开始日期。',
  );
  // A day after the kept end becomes the end, and the kept end becomes the start.
  await user.click(screen.getByRole('button', { name: /^2026年9月25日/ }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '应用' }));
  const params = new URLSearchParams(url()!);
  expect([params.get('from'), params.get('to')]).toEqual([
    '2026-09-20',
    '2026-09-25',
  ]);
});

it('reports long ranges on Apply and keeps them out of the URL', async () => {
  mount('/?days=custom&from=2025-01-01&to=2026-05-06');
  const user = userEvent.setup();
  await user.click(trigger('Jan 1, 2025 – May 6, 2026'));
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByRole('alert')).toHaveTextContent('490 days');
  expect(url()).toBe('?days=custom&from=2025-01-01&to=2026-05-06');
});

it.each([
  ['', '2026-09-20', 'rangePicker.invalidStart'],
  ['2026-02-30', '2026-09-20', 'rangePicker.invalidStart'],
  ['2026-09-01', '', 'rangePicker.invalidEnd'],
  ['2026-09-20', '2026-09-01', 'rangePicker.reversedDates'],
  ['2026-09-01', '2027-01-01', 'rangePicker.futureDate'],
  ['0001-09-18', '2026-10-15', 'rangePicker.rangeTooLong'],
  ['2025-01-01', '2026-05-05', null], // 490 inclusive days
  ['2025-01-01', '2026-05-06', 'rangePicker.rangeTooLong'],
  ['2024-02-29', '2024-02-29', null],
])('validates %s through %s', (from, to, error) => {
  expect(customRangeError(from, to, '2026-10-15')).toBe(error);
});
