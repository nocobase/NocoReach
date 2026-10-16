import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
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
afterEach(cleanup);
test('data page presets use one 90-day option in GitHub order', () => {
  setDictionary(null);
  expect(presetRanges).toEqual(['7', '28', '90', '12m']);
  expect(githubRanges).toEqual([...presetRanges, 'all', 'custom']);
  render(<RangePicker value={{ range: '90' }} onChange={vi.fn()} />);
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
  expect(screen.getByLabelText('开始日期')).toBeVisible();
  expect(screen.getByLabelText('结束日期')).toBeVisible();
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

test('clearing one custom date preserves the other and allows correction', () => {
  setDictionary(null);
  function Harness() {
    const [value, onChange] = useRange();
    return <RangePicker value={value} onChange={onChange} />;
  }
  render(
    <MemoryRouter
      initialEntries={['/?days=custom&from=2026-09-01&to=2026-09-10']}
    >
      <Harness />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText('开始日期'), {
    target: { value: '' },
  });
  expect(screen.getByLabelText('结束日期')).toHaveValue('2026-09-10');
  expect(screen.getByRole('alert')).toBeVisible();
  fireEvent.change(screen.getByLabelText('开始日期'), {
    target: { value: '2026-09-02' },
  });
  expect(screen.getByLabelText('开始日期')).toHaveValue('2026-09-02');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
