// @vitest-environment node
import { fileURLToPath } from 'node:url';
import { describeMigration } from '@nocobase/app-testing/server';

const migrations = [
  {
    packageName: 'nocoreach',
    directory: fileURLToPath(
      new URL('../../database/main/migrations', import.meta.url),
    ),
  },
];

describeMigration('202610220001_create_insight_threads', {
  sources: migrations,
  up: async ({ expectCollection }) => {
    await expectCollection('nrInsightThreads').toHaveIndex(
      ['ownerId', 'projectId', 'day'],
      { unique: true },
    );
  },
});
