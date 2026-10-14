import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ago } from '../../client/pages/task-list-model';
import {
  TaskTable,
  WorkBoard,
  type WorkCard,
} from '../../client/pages/work-board';
import { setDictionary } from '../../client/i18n';
import english from '../../shared/i18n/en.json';

vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ can: () => false }),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
});
const now = Date.parse('2026-10-14T05:20:00Z');
const at = '2026-10-14T05:00:00.000Z';
const task: WorkCard = {
  id: 1,
  title: 'Timestamp verification',
  brief: '',
  status: 'open',
  updatedAt: at,
  evidence: { no: 16 },
};

for (const zone of ['UTC', 'Asia/Shanghai', 'Australia/Melbourne']) {
  it(`renders matching list/board update ages and refreshes under ${zone}`, () => {
    setDictionary(english);
    vi.stubEnv('TZ', zone);
    vi.useFakeTimers();
    vi.setSystemTime(now);
    for (const value of [
      at,
      '2026-10-14T13:00:00+08:00',
      '2026-10-14T16:00:00+11:00',
    ])
      expect(ago(value)).toBe('20 min ago');
    for (const value of [
      '',
      undefined,
      '2026-10-14T05:00:00',
      'invalid',
      '2026-02-30T01:00:00Z',
    ])
      expect(ago(value)).toBe('');
    const view = render(
      <>
        <TaskTable tasks={[task]} onOpen={() => {}} />
        <WorkBoard
          tasks={[task]}
          busy={false}
          list={false}
          onMove={() => {}}
          onOpen={() => {}}
        />
      </>,
    );
    expect(screen.getAllByText('20 min ago')).toHaveLength(2);
    view.rerender(
      <>
        <TaskTable
          tasks={[{ ...task, updatedAt: new Date(now).toISOString() }]}
          onOpen={() => {}}
        />
        <WorkBoard
          tasks={[{ ...task, updatedAt: new Date(now).toISOString() }]}
          busy={false}
          list={false}
          onMove={() => {}}
          onOpen={() => {}}
        />
      </>,
    );
    expect(screen.getAllByText('Just now')).toHaveLength(2);
    cleanup();
    render(<TaskTable tasks={[task]} onOpen={() => {}} />);
    expect(screen.getByText('20 min ago')).toBeInTheDocument();
  });
}

it('keeps existing rounding and hour/day boundaries, clamping small future clock differences', () => {
  setDictionary(english);
  const age = (minutes: number) =>
    ago(new Date(now - minutes * 60000).toISOString(), now);
  expect(age(-1)).toBe('Just now');
  expect(age(0.49)).toBe('Just now');
  expect(age(0.5)).toBe('1 min ago');
  expect(age(59.49)).toBe('59 min ago');
  expect(age(59.5)).toBe('1 h ago');
  expect(age(89.5)).toBe('2 h ago');
  expect(age(1439.49)).toBe('24 h ago');
  expect(age(1439.5)).toBe('Yesterday');
  expect(age(2879.49)).toBe('Yesterday');
  expect(age(2880)).toMatch(/^\d+\/\d+$/);
  const midnight = Date.parse('2026-11-01T00:10:00Z');
  expect(ago('2026-10-31T23:50:00Z', midnight)).toBe('20 min ago');
});
