// @vitest-environment node
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestSpecification } from 'vitest/node';
import { expect, test } from 'vitest';
import { DurationSequencer } from '../setup/shard-sequencer';

const root = fileURLToPath(new URL('../..', import.meta.url));

function testFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory())
      return entry.name === 'playwright' ? [] : testFiles(file);
    return /\.test\.tsx?$/u.test(entry.name) ? [file] : [];
  });
}

async function split(count: number) {
  const files = testFiles(path.join(root, 'tests')).map(
    (moduleId) => ({ moduleId }) as TestSpecification,
  );
  const shards = [];
  for (let index = 1; index <= count; index++) {
    const ctx = { config: { root, shard: { index, count } } };
    const sequencer = new DurationSequencer(ctx as never);
    shards.push(
      (await sequencer.shard(files)).map((spec) =>
        path.relative(root, spec.moduleId).split(path.sep).join('/'),
      ),
    );
  }
  return { files, shards };
}

test('puts every test file on exactly one shard', async () => {
  const { files, shards } = await split(4);
  const assigned = shards.flat();
  expect(assigned).toHaveLength(files.length);
  expect(new Set(assigned).size).toBe(files.length);
});

test('keeps the slowest files on different shards', async () => {
  const { shards } = await split(4);
  const slowest = [
    'tests/nocoreach/demo-data-app.test.ts',
    'tests/nocoreach/demo-data-lifecycle-app.test.ts',
    'tests/nocoreach/mock-app.test.ts',
    'tests/nocoreach/preview-sample-data-app.test.ts',
  ];
  const owners = slowest.map((file) =>
    shards.findIndex((shard) => shard.includes(file)),
  );
  expect(new Set(owners).size).toBe(slowest.length);
});
