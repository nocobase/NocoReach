import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';
import {
  customRangeError,
  RangePicker,
  useRange,
} from '../../client/pages/range-picker';

beforeEach(() => setDictionary(english));
afterEach(() => {
  cleanup();
  setDictionary(null);
});

function Harness() {
  const [value, setValue] = useRange();
  const location = useLocation();
  const navigate = useNavigate();
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

it('keeps edits and validation local until Apply, preserving the opposite endpoint and other parameters', async () => {
  mount();
  const user = userEvent.setup();
  const start = screen.getByLabelText('Start date');
  const end = screen.getByLabelText('End date');
  const initial = screen.getByLabelText('URL').textContent;
  fireEvent.input(start, { target: { value: '' } });
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Enter a complete, valid start date.',
  );
  expect(start).toHaveFocus();
  expect(end).toHaveValue('2026-09-20');
  expect(screen.getByLabelText('URL')).toHaveTextContent(initial!);
  fireEvent.input(start, { target: { value: '2026-09-02' } });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByLabelText('URL')).toHaveTextContent(initial!);
  await user.click(screen.getByRole('button', { name: 'Apply' }));
  expect(screen.getByLabelText('URL')).toHaveTextContent(
    '?days=custom&from=2026-09-02&to=2026-09-20&view=repo',
  );
});

it('opens Custom without committing defaults, and presets discard drafts', async () => {
  mount('/?days=28&view=repo');
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Custom', exact: true }));
  expect(screen.getByLabelText('URL')).toHaveTextContent('?days=28&view=repo');
  fireEvent.input(screen.getByLabelText('End date'), { target: { value: '' } });
  await user.click(
    screen.getByRole('button', { name: 'Last 7 days', exact: true }),
  );
  expect(screen.queryByLabelText('End date')).not.toBeInTheDocument();
  expect(screen.getByLabelText('URL')).toHaveTextContent('?days=7&view=repo');
});

it('restores committed deep links on Back/Forward and external navigation', async () => {
  mount();
  const user = userEvent.setup();
  fireEvent.input(screen.getByLabelText('Start date'), {
    target: { value: '2026-09-03' },
  });
  await user.click(screen.getByRole('button', { name: 'Navigate' }));
  await user.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByLabelText('Start date')).toHaveValue('2026-09-01');
  await user.click(screen.getByRole('button', { name: 'Forward' }));
  expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument();
});

it('keeps incomplete deep links empty and localizes errors', async () => {
  setDictionary(null);
  mount('/?days=custom&to=2026-09-20');
  expect(screen.getByLabelText('开始日期')).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: '应用' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    '请输入完整且有效的开始日期。',
  );
  expect(screen.getByLabelText('结束日期')).toHaveValue('2026-09-20');
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
