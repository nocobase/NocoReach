import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setDictionary } from '../../client/i18n';
import { entryTitleKey, taskSource } from '../../client/pages/task-source';
import { WorkBoard, type WorkCard } from '../../client/pages/work-board';

vi.mock('../../client/pages/me', () => ({
  useMe: () => ({ me: { id: '1' }, can: () => true, mine: () => true }),
}));

beforeEach(() => setDictionary(null));
afterEach(() => cleanup());

const card = (
  id: number,
  evidence: WorkCard['evidence'] & Record<string, unknown>,
  taskKey = `strategy:${id}`,
): WorkCard => ({
  id,
  title: `Task ${id}`,
  brief: '',
  status: 'open',
  updatedAt: '2026-10-22',
  createdAt: '2026-10-22T02:00:00Z',
  taskKey,
  evidence: { no: id, ...evidence },
});

test('says whether the AI or a person found a task, and from where', () => {
  const at = '2026-10-22T02:00:00Z';
  // An opportunity from the daily analysis, dated by the analysis.
  expect(
    taskSource({
      taskKey: 'strategy:1',
      createdAt: at,
      evidence: {
        insight: { id: 'o-41', no: 41 },
        context: { capturedAt: '2026-10-21T00:00:00Z' },
        createdBy: { id: '2', name: '王磊' },
      },
    }),
  ).toEqual({
    by: 'ai',
    via: 'opportunity',
    insight: { id: 'o-41', no: 41 },
    at: '2026-10-21T00:00:00Z',
  });
  // A change on Insights the person only confirmed.
  expect(taskSource({ evidence: { signalKey: 'gsc:/ja' } }).by).toBe('ai');
  // A data page hand-off, with the page it came from.
  expect(
    taskSource({
      taskKey: 'strategy:2',
      createdAt: at,
      evidence: { createdBy: { name: '王磊' }, entry: '/main/data/github' },
    }),
  ).toEqual({
    by: 'person',
    via: 'dataPage',
    name: '王磊',
    entry: '/main/data/github',
    at,
  });
  expect(
    taskSource({ evidence: { origin: 'manual', createdBy: { name: 'Li' } } }),
  ).toMatchObject({ by: 'person', via: 'newTask', name: 'Li' });
  expect(taskSource({ taskKey: 'content:x', evidence: {} })).toMatchObject({
    by: 'person',
    via: 'content',
  });
  // Created on Results, even when handed off as an opportunity.
  expect(
    taskSource({
      evidence: { resultSource: { taskId: '9' }, insight: { id: 'r-1' } },
    }).via,
  ).toBe('results');
  // An older task without its creator: a person, unnamed.
  expect(taskSource({ taskKey: 'strategy:3', evidence: {} })).toEqual({
    by: 'person',
    via: 'dataPage',
  });
  expect(entryTitleKey('/main/data/github')).toBe('nocoreach.nav.github');
  expect(entryTitleKey('/apps/x/research/domain')).toBe(
    'nocoreach.nav.competitors',
  );
  expect(entryTitleKey('/main/keywords/detail')).toBe('nocoreach.nav.keywords');
  expect(entryTitleKey('/main/unknown')).toBeUndefined();
});

test('board cards show Found by AI or Found by the person beside the task number', () => {
  render(
    <MemoryRouter>
      <WorkBoard
        tasks={[
          card(41, { insight: { id: 'o-41', no: 41 } }),
          card(42, { createdBy: { id: '2', name: '王磊' } }),
          card(43, {}),
        ]}
        busy={false}
        list={false}
        onMove={() => undefined}
        onOpen={() => undefined}
      />
    </MemoryRouter>,
  );
  const of = (id: number) =>
    document.querySelector(`[data-task-id="${id}"]`) as HTMLElement;
  expect(within(of(41)).getByText('Found by AI')).toBeVisible();
  expect(of(41).querySelector('[data-found-by="ai"]')).not.toBeNull();
  expect(within(of(42)).getByText('Found by 王磊')).toBeVisible();
  // Nothing to say for an older task without its person.
  expect(of(43).querySelector('[data-found-by]')).toBeNull();
  expect(screen.queryByText(/手动/)).toBeNull();
});
