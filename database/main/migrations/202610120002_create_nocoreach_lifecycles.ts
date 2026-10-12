import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610120002_create_nocoreach_lifecycles',

  async up({ builder }) {
    // This is the complete repository store schema for @nocobase/lifecycle
    // beta.1, including durable continuations. Keep migration history literal.
    await builder.createCollection('nrLifecycleTransitions', (c) => {
      c.bigInt('id').primary().autoIncrement().notNull();
      c.string('lifecycle').notNull();
      c.string('recordId').notNull();
      c.string('transition').notNull();
      c.string('from').nullable();
      c.string('to').notNull();
      c.string('actorId').notNull();
      c.json('input').notNull().defaultTo({});
      c.datetimeTz('at').notNull();
      c.integer('version').notNull();
      c.string('requestId').nullable();
      c.string('requestKey').notNull();
      c.index(['lifecycle', 'recordId', 'id']);
      c.unique(['lifecycle', 'recordId', 'version']);
      c.unique(['lifecycle', 'recordId', 'requestKey']);
    });

    await builder.createCollection('nrLifecycleEffectRuns', (c) => {
      c.bigInt('id').primary().autoIncrement().notNull();
      c.bigInt('transitionId').notNull();
      c.string('lifecycle').notNull();
      c.string('recordId').notNull();
      c.string('effect').notNull();
      c.boolean('stayBound').notNull();
      c.string('status').notNull();
      c.integer('attempts').notNull().defaultTo(0);
      c.integer('maxAttempts').notNull().defaultTo(1);
      c.json('result').nullable();
      c.text('error').nullable();
      c.datetimeTz('createdAt').notNull();
      c.datetimeTz('updatedAt').notNull();
      c.datetimeTz('claimedAt').nullable();
      c.datetimeTz('runAfter').nullable();
      c.json('continuation').nullable();
      c.datetimeTz('continuationDueAt').nullable();
      c.datetimeTz('continuationAbandonedAt').nullable();
      c.index(['status', 'id']);
      c.index(['lifecycle', 'recordId', 'id']);
      c.index('continuationDueAt');
      c.index('continuationAbandonedAt');
    });

    await builder.createCollection('nrAnalysisRuns', (c) => {
      c.bigInt('id').primary().autoIncrement().notNull();
      c.string('runKey', { length: 255 }).notNull();
      c.string('activeKey', { length: 255 }).notNull();
      c.string('projectId', { length: 255 }).notNull();
      c.string('trigger', { length: 32 }).notNull();
      c.string('day', { length: 10 }).notNull();
      c.string('status', { length: 32 }).notNull();
      c.datetimeTz('statusChangedAt').notNull();
      c.integer('lifecycleVersion').notNull().defaultTo(0);
      c.integer('attempt').notNull().defaultTo(0);
      c.datetimeTz('requestedAt').notNull();
      c.string('requestedBy', { length: 255 }).nullable();
      c.datetimeTz('startedAt').nullable();
      c.datetimeTz('completedAt').nullable();
      c.datetimeTz('requestStartedAt').nullable();
      c.string('requestToken', { length: 64 }).nullable();
      c.datetimeTz('retryAt').nullable();
      c.json('result').nullable();
      c.json('mockSnapshot').nullable();
      c.unique('runKey');
      c.unique('activeKey');
      c.index(['status', 'statusChangedAt']);
      c.index(['projectId', 'requestedAt']);
      c.index(['status', 'retryAt']);
    });

    await builder.createCollection('nrAnalysisOccurrences', (c) => {
      c.string('id', { length: 255 }).primary().notNull();
      c.datetimeTz('acceptedAt').notNull();
      c.json('projectRuns').notNull();
    });

    await builder.createCollection('nrTaskRuns', (c) => {
      c.string('id', { length: 80 }).primary().notNull();
      c.string('projectId', { length: 255 }).notNull();
      c.string('taskId', { length: 32 }).notNull();
      c.string('engine', { length: 32 }).notNull();
      c.string('status', { length: 32 }).notNull();
      c.string('pluginRunId', { length: 80 }).nullable();
      c.json('payload').notNull();
      c.datetimeTz('nextSyncAt').nullable();
      c.datetimeTz('createdAt').notNull();
      c.datetimeTz('updatedAt').notNull();
      c.index(['projectId', 'taskId', 'createdAt']);
      c.index(['nextSyncAt', 'id']);
    });

    await builder.createCollection('nrTaskObservations', (c) => {
      c.bigInt('id').primary().autoIncrement().notNull();
      c.string('observationKey', { length: 255 }).notNull();
      c.bigInt('taskId').notNull();
      c.string('projectId', { length: 255 }).notNull();
      c.integer('day').notNull();
      c.datetimeTz('observeFrom').notNull();
      c.datetimeTz('dueAt').notNull();
      c.string('status', { length: 32 }).notNull();
      c.datetimeTz('statusChangedAt').notNull();
      c.integer('lifecycleVersion').notNull().defaultTo(0);
      c.json('result').nullable();
      c.datetimeTz('completedAt').nullable();
      c.string('reason', { length: 255 }).nullable();
      c.unique('observationKey');
      c.unique(['taskId', 'day']);
      c.index(['status', 'dueAt', 'id']);
      c.index('taskId');
    });

    await builder.alterCollection('nrTasks', (c) => {
      // Existing tasks retain their legacy execution data. Adoption is an
      // explicit business command under the task lock, never a migration job.
      c.string('executionState', { length: 32 }).nullable();
      c.datetimeTz('executionStateChangedAt').nullable();
      c.integer('lifecycleVersion').notNull().defaultTo(0);
      c.string('executionEngine', { length: 32 }).nullable();
      c.string('activeRunId', { length: 80 }).nullable();
      c.datetimeTz('nextCheckAt').nullable();
      c.index(['executionState', 'executionStateChangedAt'], {
        name: 'ix_nr_tasks_execution_state',
      });
      c.index(['nextCheckAt', 'id'], {
        name: 'ix_nr_tasks_execution_check',
      });
    });
  },

  async down({ builder }) {
    await builder.alterCollection('nrTasks', (c) => {
      c.dropIndex('ix_nr_tasks_execution_check');
      c.dropIndex('ix_nr_tasks_execution_state');
    });
    // Drop indexes first: SQLite rebuilds the table when dropping columns.
    await builder.alterCollection('nrTasks', (c) => {
      c.dropFields(
        'nextCheckAt',
        'activeRunId',
        'executionEngine',
        'lifecycleVersion',
        'executionStateChangedAt',
        'executionState',
      );
    });
    await builder.dropCollection('nrTaskObservations');
    await builder.dropCollection('nrTaskRuns');
    await builder.dropCollection('nrAnalysisOccurrences');
    await builder.dropCollection('nrAnalysisRuns');
    await builder.dropCollection('nrLifecycleEffectRuns');
    await builder.dropCollection('nrLifecycleTransitions');
  },
});

export default migration;
