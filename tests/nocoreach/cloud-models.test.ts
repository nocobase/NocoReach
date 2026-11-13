import { expect, test } from 'vitest';
import {
  EDITING_MODEL_KEY,
  EditingModel,
  cloudModelWork,
} from '../../server/nocoreach/cloud-models';

// A stand-in for the application's settings table (nrSnapshots): rows of key and payload.
function snapshots() {
  const rows: { id: number; key: string; payload: unknown }[] = [];
  const record = (row: (typeof rows)[number]) => ({
    ...row,
    get: (key: 'payload') => row[key],
  });
  const repository = {
    findOne: async ({ filter }: { filter: { key: string } }) => {
      const row = rows.find((r) => r.key === filter.key);
      return row ? record(row) : null;
    },
    create: async ({
      values,
    }: {
      values: { key: string; payload: unknown };
    }) => {
      rows.push({ id: rows.length + 1, ...values });
    },
    update: async ({
      filterByTk,
      values,
    }: {
      filterByTk: number;
      values: { payload: unknown };
    }) => {
      Object.assign(
        rows.find((r) => r.id === filterByTk)!,
        values,
      );
    },
  };
  return { rows, db: { getRepository: () => repository } as never };
}

test('editing and suggestions keep one application-wide model choice, empty until made', async () => {
  const { rows, db } = snapshots();
  const editing = new EditingModel(db);
  expect(await editing.get()).toBeNull();
  await editing.set({ modelService: 'gemini', model: 'gemini-pro' }, '7');
  expect(await editing.get()).toEqual({
    modelService: 'gemini',
    model: 'gemini-pro',
  });
  await editing.set(null, '7');
  expect(await editing.get()).toBeNull();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    key: EDITING_MODEL_KEY,
    payload: { model: null, changedBy: '7' },
  });
});

test('scheduled and background model calls are the daily analysis’s, everything else editing and suggestions’', () => {
  for (const operation of [
    'daily-report',
    'daily-judge',
    'daily-judge-many',
    'daily-rewrite',
    'analysis-rule-evaluate',
    'memory-check',
    'memory-topics',
    'content-source-map',
  ])
    expect(cloudModelWork(operation)).toBe('analysis');
  for (const operation of [
    'article-rewrite',
    'task-draft',
    'keyword-seeds',
    'keyword-curate',
    'keyword-names',
    'competitor-suggest',
    'knowledge-suggest',
    'memory-draft',
    'analysis-rules-propose',
    'analysis-rule-draft',
    undefined,
  ])
    expect(cloudModelWork(operation)).toBe('editing');
});
