import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610220001_create_insight_threads',
  async up({ builder }) {
    // The project and analysis day of each conversation asked from Insights; the Agents plugin keeps the conversation.
    await builder.createCollection('nrInsightThreads', (c) => {
      c.string('conversationId', { length: 64 }).primary().notNull();
      c.string('ownerId', { length: 64 }).notNull();
      c.string('projectId', { length: 32 }).notNull();
      c.string('day', { length: 10 }).notNull();
      c.string('opportunityId', { length: 100 }).nullable();
      c.string('createdAt', { length: 40 }).notNull();
      // The questions counted so far, up to which message, and the conversation's last message when they were.
      c.integer('turns').nullable();
      c.integer('countedSeq').nullable();
      c.string('countedAt', { length: 40 }).nullable();
      // One conversation per person, project and analysis day, also when two processes start it at once.
      c.unique(['ownerId', 'projectId', 'day'], {
        name: 'uq_nr_insight_threads_day',
      });
    });
  },
  async down({ builder }) {
    await builder.dropCollection('nrInsightThreads');
  },
});
export default migration;
