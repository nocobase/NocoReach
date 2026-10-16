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
