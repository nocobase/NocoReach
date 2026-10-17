import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { RangePicker } from '#pages/range-picker';
import {
  useRange,
  defaultRanges,
  presetRanges,
  githubRanges,
  validRange,
} from '#pages/range-state';
import { setDictionary } from '#i18n';
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
test('data page presets use one 90-day option in GitHub order', () => {
  setDictionary(null);
  expect(presetRanges).toEqual(['7', '28', '90', '12m']);
  expect(githubRanges).toEqual([...presetRanges, 'all', 'custom']);
  render(
    <MemoryRouter>
      <RangePicker value={{ range: '90' }} onChange={vi.fn()} />
    </MemoryRouter>,
  );
  expect(
    screen.queryByRole('button', { name: '近 3 个月' }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(defaultRanges.length);
  expect(screen.getByRole('button', { name: '近 90 天' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
test('old three-month links select 90 days and keep custom dates working', async () => {
  setDictionary(null);
  function Harness() {
    const [range, setRange] = useRange();
    return <RangePicker value={range} onChange={setRange} />;
  }
  render(
    <MemoryRouter initialEntries={['/?days=3m']}>
      <Harness />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: '近 90 天' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: '自定义' }));
  expect(
    screen.getByRole('button', { name: '2026年9月18日 – 2026年10月15日' }),
  ).toBeVisible();
  expect(screen.getByRole('grid', { name: '2026年9月' })).toBeVisible();
  expect(screen.getByRole('grid', { name: '2026年10月' })).toBeVisible();
  expect(
    screen.getByRole('button', { name: /^2026年10月16日/ }),
  ).toBeDisabled();
});

test('invalid custom dates are rejected before a query can be sent', () => {
  expect(
    validRange({ range: 'custom', from: '2026-02-30', to: '2026-03-05' }),
  ).toBe(false);
  expect(
    validRange({ range: 'custom', from: '2026-03-05', to: '2026-03-01' }),
  ).toBe(false);
  expect(
    validRange({ range: 'custom', from: '2020-01-01', to: '2026-01-01' }),
  ).toBe(false);
  expect(validRange({ range: 'custom', from: '2026-01-01' })).toBe(false);
});

test('custom date picks stay local until Apply and keep the one linked end', async () => {
  setDictionary(null);
  const onChange = vi.fn();
  function Harness() {
    const [value] = useRange();
    return <RangePicker value={value} onChange={onChange} />;
  }
  render(
    <MemoryRouter initialEntries={['/?days=custom&from=2026-09-10']}>
      <Harness />
    </MemoryRouter>,
  );
  await userEvent.click(
    screen.getByRole('button', { name: '2026年9月10日 – 结束日期' }),
  );
  await userEvent.click(screen.getByRole('button', { name: '应用' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    '请输入完整且有效的结束日期。',
  );
  // A day before the kept start becomes the start, and the kept start becomes the end.
  await userEvent.click(screen.getByRole('button', { name: /^2026年9月2日/ }));
  const selected = screen.getAllByRole('gridcell', { selected: true });
  expect(selected).toHaveLength(9);
  expect(selected[0]).toHaveAttribute('data-day', '2026-09-02');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: '应用' }));
  expect(onChange).toHaveBeenCalledWith({
    range: 'custom',
    from: '2026-09-02',
    to: '2026-09-10',
  });
});
