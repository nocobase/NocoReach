'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { ReachStore } = require('../../server/providers/reach/store.cjs');
const {
  ReachOperations,
} = require('../../server/providers/reach/operations.cjs');
const {
  ReachDomain,
} = require('../../server/providers/reach/domain/runtime.cjs');
test('native SQLite domain parity and role boundary', async () => {
  const { createDatabaseManager } = await import('@nocobase/db');
  const sqlite = (await import('@nocobase/db-sqlite')).default;
  const db = createDatabaseManager({
    connections: { main: sqlite({ filename: ':memory:' }) },
  });
  await db.connect();
  try {
    const migration = (
      await import('../../database/main/migrations/202610090001_create_nocoreach.ts')
    ).default;
    await migration.up({ builder: db.builder() });
    await (
      await import('../../database/main/migrations/202610090002_sortable_sync_date.ts')
    ).default.up({ builder: db.builder() });
    const root = '1234567890123456789',
      member = 'member_opaque_native_id',
      unknown = '1234567890123456791';
    const users = {
      list: async () => ({
        items: [
          { id: root, name: 'Local Admin' },
          { id: member, name: 'Local Member' },
          { id: '0-native-id', name: 'Zero Prefix' },
        ],
        total: 3,
      }),
      get: async (id) => ({ id, name: 'Local User' }),
    };
    const authorization = {
      subjects: { resolveFor: async () => [] },
      for: ({ principal }) => ({
        snapshot: async () => ({ unrestricted: principal.id === root }),
      }),
    };
    const store = new ReachStore(db, users, authorization),
      domain = new ReachDomain({
        store,
        users,
        authorization,
        routes: new ReachOperations(),
        settings: new Map(),
        logger: { warn() {}, info() {} },
        ai: { llmProviderManager: { listLLMProviders: () => [] } },
        notification: { send: async () => {} },
        analysisSchedule: async () => null,
      });
    await domain.load();
    domain.memoryUpdates.start = () => false;
    const invoke = async (resource, action, values = {}, id = root) => {
      const operation = domain.routes.entries.get(`${resource}/${action}`);
      assert.ok(operation, `${resource}/${action} registered`);
      const context = {
        method: 'POST',
        auth: id ? { user: { id, name: 'Local Test' } } : null,
        store,
        logger: { warn() {} },
        state: {},
        action: {
          resourceName: resource,
          actionName: action,
          params: { values },
        },
        request: { query: {}, headers: {} },
        set: () => {},
        cache: { set: async () => {}, get: async () => null },
        get: () => '',
        throw: (status, message) => {
          throw Object.assign(Error(message), { status });
        },
      };
      await operation.handler(context, async () => {});
      return context.body;
    };
    assert.deepEqual(await invoke('nrProjects', 'list'), []);
    const project = await invoke('nrProjects', 'create', {
      name: 'Local Verification',
      domain: 'verification.example.com',
    });
    const projectId = String(project.id);
    await assert.rejects(
      invoke('nrProjects', 'list', {}, null),
      (e) => e.status === 401,
    );
    await assert.rejects(
      invoke('nrProjects', 'list', {}, unknown),
      (e) => e.status === 403,
    );
    await invoke('nrMembers', 'setRole', { userId: member, role: 'member' });
    assert.equal((await invoke('nrMembers', 'me', {}, member)).role, 'member');
    await invoke('nrMembers', 'setRole', {
      userId: '0-native-id',
      role: 'member',
    });
    assert.equal(
      (await invoke('nrMembers', 'me', {}, '0-native-id')).role,
      'member',
    );
    await assert.rejects(
      invoke(
        'nrProjects',
        'create',
        { name: 'Denied', domain: 'denied.example.com' },
        member,
      ),
      (e) => e.status === 403,
    );
    const checked = [];
    for (const [resource, action] of [
      ['nrProjects', 'list'],
      ['nrMembers', 'list'],
      ['nrStrategy', 'state'],
      ['nrStrategy', 'badges'],
      ['nrTaskWork', 'list'],
      ['nrPlaybooks', 'list'],
      ['nrAgent', 'status'],
      ['nrSkills', 'list'],
      ['nrKnowledge', 'list'],
      ['nrAnalysisRules', 'view'],
      ['nrGoogle', 'status'],
      ['nrGoogle', 'syncStatus'],
      ['nrSources', 'list'],
      ['nrGitHub', 'status'],
      ['nrCommunity', 'status'],
      ['nrPackages', 'status'],
      ['nrHackerNews', 'status'],
      ['nrReddit', 'status'],
      ['nrTrends', 'status'],
      ['nrCompetitors', 'status'],
      ['nrX', 'status'],
      ['nrChat', 'status'],
      ['nrOnlineAI', 'status'],
      ['nrKeywords', 'saved'],
      ['nrDomains', 'list'],
      ['nrAiSearch', 'list'],
      ['nrAiQuestions', 'view'],
      ['nrRankTracking', 'status'],
      ['nrDataViews', 'overview'],
      ['nrDataViews', 'search'],
      ['nrDataViews', 'website'],
      ['nrDataViews', 'github'],
      ['nrDataViews', 'community'],
      ['nrDataViews', 'downloads'],
      ['nrDataViews', 'hackernews'],
      ['nrAudit', 'report'],
      ['nrSiteContent', 'list'],
      ['nrSiteContent', 'summary'],
      ['nrKeywords', 'status'],
      ['nrKeywords', 'spend'],
      ['nrKeywords', 'list'],
      ['nrDataViews', 'searchCountries'],
      ['nrDataViews', 'ranks'],
      ['nrInsights', 'summary'],
      ['nrHealth', 'list'],
      ['nrHealth', 'connected'],
    ]) {
      assert.ok(
        domain.routes.entries.has(`${resource}/${action}`),
        `${resource}/${action} is registered`,
      );
      try {
        await invoke(resource, action, {
          projectId,
          start: '2026-09-01',
          end: '2026-09-28',
        });
        checked.push(`${resource}/${action}`);
      } catch (e) {
        throw new Error(`${resource}/${action}: ${e.stack}`);
      }
    }
    const added = await invoke('nrKnowledge', 'add', {
      projectId,
      title: 'Verification note',
      text: 'Synthetic local knowledge.',
      category: 'product',
    });
    const knowledge = await invoke('nrKnowledge', 'get', {
      projectId,
      itemId: added.item.id,
    });
    assert.equal(knowledge.text, 'Synthetic local knowledge.');
    await invoke('nrStrategy', 'confirmDirection', {
      projectId,
      title: 'Synthetic task',
      brief: 'Check supplied local content',
      objective: 'Verify task flow',
      revision: 0,
      requestId: require('node:crypto').randomUUID(),
    });
    const tasks = await invoke('nrTaskWork', 'list', { projectId });
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].evidence.no, 1);
    assert.equal(
      (await invoke('nrStrategy', 'badges', { projectId })).tasks,
      1,
    );
    const view = await invoke('nrTaskWork', 'get', {
      projectId,
      taskId: String(tasks[0].id),
    });
    assert.equal(view.task.title, 'Synthetic task');
    const rules = await invoke('nrAnalysisRules', 'save', {
      projectId,
      focus: 'Local product focus',
      watchDays: 14,
    });
    assert.ok(JSON.stringify(rules).includes('Local product focus'));
    assert.ok(checked.length >= 40);
    console.log(
      `Verified ${checked.length} registered domain reads, knowledge persistence and role boundaries`,
    );
  } finally {
    await db.destroy();
  }
});
