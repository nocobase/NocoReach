import { defineMigration, type MigrationDefinition } from '@nocobase/db';

const migration: MigrationDefinition = defineMigration({
  name: '202610090001_create_nocoreach',
  async up({ builder }) {
    await builder.createCollection('nrSnapshots', (collection) => {
      collection.increments('id');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.text('key').nullable();
      collection.json('payload').nullable();
    });
    await builder.createCollection('nrTasks', (collection) => {
      collection.increments('id');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.text('taskKey').nullable();
      collection.unique('taskKey');
      collection.text('title').nullable();
      collection.text('status').nullable();
      collection.text('projectId').nullable();
      collection.json('evidence').nullable();
      collection.text('brief').nullable();
    });
    await builder.createCollection('nrGoogleLinks', (collection) => {
      collection.increments('id');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.text('projectId').nullable();
      collection.unique('projectId');
      collection.text('accountEmail').nullable();
      collection.text('status').nullable();
      collection.text('authorizedAt').nullable();
      collection.text('ga4PropertyId').nullable();
      collection.text('gscSiteUrl').nullable();
      collection.boolean('scheduleEnabled').nullable();
      collection.text('nextSyncAt').nullable();
      collection.text('lastSyncAt').nullable();
    });
    await builder.createCollection('nrSyncJobs', (collection) => {
      collection.increments('id');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.text('projectId').nullable();
      collection.text('status').nullable();
      collection.text('source').nullable();
      collection.text('startDate').nullable();
      collection.text('endDate').nullable();
      collection.text('cursor').nullable();
      collection.text('resource').nullable();
      collection.text('errorCode').nullable();
      collection.integer('attempts').nullable();
      collection.integer('recordCount').nullable();
      collection.text('trigger').nullable();
      collection.text('finishedAt').nullable();
      collection.text('retryAt').nullable();
    });
    await builder.createCollection('nrSyncPartitions', (collection) => {
      collection.increments('id');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.text('partitionKey').nullable();
      collection.unique('partitionKey');
      collection.text('projectId').nullable();
      collection.text('source').nullable();
      collection.text('resource').nullable();
      collection.text('date').nullable();
      collection.text('grain').nullable();
      collection.json('payload').nullable();
    });
    await builder.createCollection('nrKeywordRuns', (collection) => {
      collection.increments('id');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.text('projectId').nullable();
      collection.text('requestKey').nullable();
      collection.unique('requestKey');
      collection.text('queryHash').nullable();
      collection.text('status').nullable();
      collection.json('spec').nullable();
      collection.json('result').nullable();
      collection.double('costUsd').nullable();
      collection.double('reservedUsd').nullable();
      collection.text('taskId').nullable();
      collection.text('errorCode').nullable();
      collection.text('completedAt').nullable();
    });
    await builder.createCollection('nrKeywordCandidates', (collection) => {
      collection.increments('id');
      collection.datetime('createdAt').notNull();
      collection.datetime('updatedAt').notNull();
      collection.text('candidateKey').nullable();
      collection.unique('candidateKey');
      collection.text('projectId').nullable();
      collection.text('keyword').nullable();
      collection.text('runId').nullable();
      collection.json('payload').nullable();
    });
    await builder.createCollection('nrSettings', (c) => { c.string('name').primary(); c.text('value').nullable(); c.boolean('secret').notNull(); });
  },
  async down({ builder }) {
    await builder.dropCollection('nrSettings');
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
