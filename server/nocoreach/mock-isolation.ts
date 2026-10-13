import {
  MockError,
  MOCK_DATASET_MARKER,
} from '../../app-plugins/nocoreach-mock/server/engine.js';
import type { LegacyDatabase } from './legacy/database.js';

/** First activation is allowed only on a dedicated empty NocoReach dataset, never an existing live project. */
export async function assertPristineMockDataset(
  db: LegacyDatabase,
): Promise<void> {
  for (const name of [
    'nrTasks',
    'nrGoogleLinks',
    'nrSyncJobs',
    'nrSyncPartitions',
    'nrKeywordRuns',
    'nrKeywordCandidates',
    'nrYouTubeVideos',
    'nrTaskRuns',
    'nrTaskObservations',
    'nrAnalysisRuns',
    'nrAnalysisOccurrences',
    'nrLifecycleTransitions',
    'nrLifecycleEffectRuns',
    'nrVariables',
  ]) {
    // Inspect the repository, not decrypted variables: unreadable stored credentials must also refuse activation.
    if (await db.table(name).count())
      throw new MockError('NR_MOCK_PRISTINE_DATABASE_REQUIRED', 503);
  }
  const snapshots = await db
    .getRepository('nrSnapshots')
    .find({ fields: ['key'], limit: 1001 });
  if (
    snapshots.length > 1000 ||
    snapshots.some(
      (row) =>
        typeof row.key !== 'string' ||
        (row.key !== 'daily-analysis:workflow' &&
          !row.key.startsWith('nr-migrations:')),
    )
  )
    throw new MockError('NR_MOCK_PRISTINE_DATABASE_REQUIRED', 503);
}

/** Must run before any plugin boots workers. Presence, including an empty or unreadable marker, refuses live mode. */
export async function assertMockDatasetMode(
  db: LegacyDatabase,
  enabled: boolean,
): Promise<void> {
  const marker = await db
    .getRepository('nrVariables')
    .findOne({ filter: { name: MOCK_DATASET_MARKER } });
  if (marker && !enabled)
    throw new MockError('NR_MOCK_DATASET_CANNOT_RUN_LIVE', 503);
  if (!enabled) return;
  if (!marker) return assertPristineMockDataset(db);
  try {
    const value: unknown = JSON.parse(String(marker.value));
    if (
      marker.secret ||
      !value ||
      typeof value !== 'object' ||
      (value as { version?: unknown }).version !== 1 ||
      !['demo', 'test'].includes(
        String((value as { environment?: unknown }).environment),
      )
    )
      throw new Error('invalid marker');
  } catch {
    throw new MockError('NR_MOCK_DATASET_MARKER_INVALID', 503);
  }
}
