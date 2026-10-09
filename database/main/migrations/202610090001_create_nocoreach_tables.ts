import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * NocoReach's tables, as the classic plugin had them (plugins/connections/server/tables.js on the old main branch), so
 * the ported services and the one-time import of old data (docs/PORT-PLAN.md, step 5) keep the same shape. Ids are
 * long generated numbers (Snowflake) like the classic records, filled in by NocoReach's repository layer; `createdAt`
 * and `updatedAt` are kept by that layer too. Text columns the classic tables held as short inputs stay strings.
 *
 * `nrVariables` replaces classic NocoBase's environment variables for NocoReach's own settings: the Google OAuth
 * application and the refresh tokens. A secret row's value is sealed with the application's secrets service.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610090001_create_nocoreach_tables',

  async up({ builder }) {
    await builder.createCollection('nrSnapshots', (c) => {
      c.bigInt('id').notNull();
      c.string('key', { length: 255 }).nullable();
      c.json('payload').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_nr_snapshots' });
      c.index('key', { name: 'ix_nr_snapshots_key' });
    });

    await builder.createCollection('nrTasks', (c) => {
      c.bigInt('id').notNull();
      c.string('taskKey', { length: 255 }).nullable();
      c.string('title', { length: 255 }).nullable();
      c.string('status', { length: 255 }).nullable();
      c.string('projectId', { length: 255 }).nullable();
      c.json('evidence').nullable();
      c.text('brief').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_nr_tasks' });
      c.unique('taskKey', { name: 'uq_nr_tasks_task_key' });
      c.index('projectId', { name: 'ix_nr_tasks_project_id' });
    });

    await builder.createCollection('nrGoogleLinks', (c) => {
      c.bigInt('id').notNull();
      c.string('projectId', { length: 255 }).nullable();
      c.string('accountEmail', { length: 255 }).nullable();
      c.string('status', { length: 255 }).nullable();
      c.string('authorizedAt', { length: 255 }).nullable();
      c.string('ga4PropertyId', { length: 255 }).nullable();
      c.string('gscSiteUrl', { length: 255 }).nullable();
      c.boolean('scheduleEnabled').nullable();
      c.string('nextSyncAt', { length: 255 }).nullable();
      c.string('lastSyncAt', { length: 255 }).nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_nr_google_links' });
      c.unique('projectId', { name: 'uq_nr_google_links_project_id' });
    });

    await builder.createCollection('nrSyncJobs', (c) => {
      c.bigInt('id').notNull();
      c.string('projectId', { length: 255 }).nullable();
      c.string('status', { length: 255 }).nullable();
      c.string('source', { length: 255 }).nullable();
      c.string('startDate', { length: 255 }).nullable();
      c.string('endDate', { length: 255 }).nullable();
      c.string('cursor', { length: 255 }).nullable();
      c.string('resource', { length: 255 }).nullable();
      c.string('errorCode', { length: 255 }).nullable();
      c.integer('attempts').nullable();
      c.integer('recordCount').nullable();
      c.string('trigger', { length: 255 }).nullable();
      c.string('finishedAt', { length: 255 }).nullable();
      c.string('retryAt', { length: 255 }).nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_nr_sync_jobs' });
      c.index('projectId', { name: 'ix_nr_sync_jobs_project_id' });
    });

    await builder.createCollection('nrSyncPartitions', (c) => {
      c.bigInt('id').notNull();
      c.string('partitionKey', { length: 255 }).nullable();
      c.string('projectId', { length: 255 }).nullable();
      c.string('source', { length: 255 }).nullable();
      c.string('resource', { length: 255 }).nullable();
      c.string('date', { length: 255 }).nullable();
      c.string('grain', { length: 255 }).nullable();
      c.json('payload').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_nr_sync_partitions' });
      c.unique('partitionKey', { name: 'uq_nr_sync_partitions_partition_key' });
      c.index(['projectId', 'source', 'date'], {
        name: 'ix_nr_sync_partitions_project_source_date',
      });
    });

    await builder.createCollection('nrKeywordRuns', (c) => {
      c.bigInt('id').notNull();
      c.string('projectId', { length: 255 }).nullable();
      c.string('requestKey', { length: 255 }).nullable();
      c.string('queryHash', { length: 255 }).nullable();
      c.string('status', { length: 255 }).nullable();
      c.json('spec').nullable();
      c.json('result').nullable();
      c.double('costUsd').nullable();
      c.double('reservedUsd').nullable();
      c.string('taskId', { length: 255 }).nullable();
      c.text('errorCode').nullable();
      c.string('completedAt', { length: 255 }).nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_nr_keyword_runs' });
      c.unique('requestKey', { name: 'uq_nr_keyword_runs_request_key' });
      c.index('projectId', { name: 'ix_nr_keyword_runs_project_id' });
    });

    await builder.createCollection('nrKeywordCandidates', (c) => {
      c.bigInt('id').notNull();
      c.string('candidateKey', { length: 255 }).nullable();
      c.string('projectId', { length: 255 }).nullable();
      c.string('keyword', { length: 255 }).nullable();
      c.string('runId', { length: 255 }).nullable();
      c.json('payload').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_nr_keyword_candidates' });
      c.unique('candidateKey', { name: 'uq_nr_keyword_candidates_candidate_key' });
      c.index('projectId', { name: 'ix_nr_keyword_candidates_project_id' });
    });

    await builder.createCollection('nrVariables', (c) => {
      c.bigInt('id').notNull();
      c.string('name', { length: 255 }).notNull();
      c.boolean('secret').notNull();
      c.text('value').nullable();
      c.datetime('createdAt').nullable();
      c.datetime('updatedAt').nullable();
      c.primary('id', { name: 'pk_nr_variables' });
      c.unique('name', { name: 'uq_nr_variables_name' });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('nrVariables');
    await builder.dropCollection('nrKeywordCandidates');
    await builder.dropCollection('nrKeywordRuns');
    await builder.dropCollection('nrSyncPartitions');
    await builder.dropCollection('nrSyncJobs');
    await builder.dropCollection('nrGoogleLinks');
    await builder.dropCollection('nrTasks');
    await builder.dropCollection('nrSnapshots');
  },
});

export default migration;
