// @vitest-environment node
import { expect, it } from 'vitest';
import {
  serializeTaskInput,
  taskMaterials,
} from '../../server/nocoreach/execution/task-materials';

it('keeps full knowledge and Skills snapshots outside the prompt budget', () => {
  const knowledge = [1, 2].map((id) => ({
    id,
    title: `资料 ${id}`,
    text: '知'.repeat(120000),
  }));
  const skills = [
    {
      name: 'site-review',
      required: true,
      body: '审阅',
      files: [{ path: 'references/site.md', text: '识'.repeat(200000) }],
    },
  ];
  const snapshot = serializeTaskInput({
    mode: 'plan',
    title: '研究',
    knowledge,
    skills,
  });
  const materials = taskMaterials(JSON.parse(snapshot));
  expect(JSON.stringify(materials.context).length).toBeLessThan(1000);
  expect(JSON.parse(materials.bundle.files[0].content)).toEqual(knowledge);
  expect(JSON.parse(materials.bundle.files[1].content)).toEqual(skills);
  expect(materials.bundle.hash).toBe(materials.offer.hash);
  expect(taskMaterials(JSON.parse(snapshot)).bundle.hash).toBe(
    materials.bundle.hash,
  );
  expect(taskMaterials({ mode: 'plan', knowledge: [] }).bundle.hash).not.toBe(
    materials.bundle.hash,
  );
});

it('still bounds the task context separately from already budgeted materials', () => {
  expect(() =>
    serializeTaskInput({ mode: 'plan', title: 'x'.repeat(200000) }),
  ).toThrow('任务资料过长');
});

// 2026-11-04 (T-62): the version a change request is about goes with the source, as a file of its own.
it('puts an article run’s source and the version under review in files, and points to them', () => {
  const source = {
    id: '7',
    slug: 'hello',
    locales: { en: { title: 'Hello', body: 'B'.repeat(100000) } },
  };
  const previous = {
    version: 5,
    editedByHand: true,
    article: {
      slug: 'hello',
      locales: { en: { title: 'Hello', body: 'P'.repeat(100000) } },
    },
  };
  const input = JSON.parse(
    serializeTaskInput({
      mode: 'article',
      title: 'Article',
      article: { action: 'update', source, previous },
    }),
  );
  const materials = taskMaterials(input);
  const file = (path: string) =>
    materials.bundle.files.find((f) => f.path === path)?.content;
  expect(JSON.parse(file('article.json')!)).toEqual(source);
  expect(JSON.parse(file('previous.json')!)).toEqual(previous.article);
  expect(materials.context.article).toEqual({
    action: 'update',
    source: '.nocoreach-materials/article.json',
    previous: {
      version: 5,
      editedByHand: true,
      article: '.nocoreach-materials/previous.json',
    },
  });
  expect(JSON.stringify(materials.context).length).toBeLessThan(1000);
  // Without a version under review, the files and their hash are what they were.
  const first = taskMaterials({
    ...input,
    article: { action: 'update', source },
  });
  expect(first.bundle.files.map((f) => f.path)).not.toContain('previous.json');
  expect(first.context.article).not.toHaveProperty('previous');
  expect(first.bundle.hash).not.toBe(materials.bundle.hash);
});
