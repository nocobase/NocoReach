// @vitest-environment node
import { randomUUID } from 'node:crypto';
import { describe, expect, vi } from 'vitest';
import {
  DEFAULT_ADMIN_CREDENTIALS,
  signIn,
} from '@nocobase/app-plugin-authentication/testing';
import { demoDataToken } from '@nocobase/app-plugin-demo-mode/server/tokens';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server/tokens';
import { driveManagerToken } from '@nocobase/app-server/drive';
import { nocoReachToken } from '../../server/providers/nocoreach';
import { PROJECT_VARIABLES } from '../../server/nocoreach/demo-data/clear';
import { pageDaysFilled } from '../../server/nocoreach/page-days';
import { taskOwner, taskState, taskClosed } from '../../shared/task-pending';
import { historyBounds } from '../../server/nocoreach/search-history';
import { projectWork } from '../../server/nocoreach/execution/model';
import { OnlineProvider } from '../../server/nocoreach/execution/provider';
import { migrateDemoIdentityEmails } from '../../server/nocoreach/demo-data/identities';
import type { StrategyState } from '../../shared/strategy-model';
import { rowsFor, opportunityState } from '../../shared/strategy-pending';
import { recentlyEnded, verdictsOf } from '../../client/pages/strategy/watch';
import { createDemoTest, json } from './demo-data-app-fixture';

const test = createDemoTest();
const accountConflictTest = createDemoTest();
const configurationTest = createDemoTest();
const entryTest = createDemoTest();
const offTest = createDemoTest(false);

describe('demo visitor entry', () => {
  const test = entryTest;
  test('enters existing accounts before generation and keeps signed-in visitors on their account', async ({
    testApp,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    const specification = await (await admin.fetch('/swagger')).json();
    expect(Object.keys(specification.paths)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/demoMode/accounts/signInDefault'),
      ]),
    );
    const users = testApp.application.container.resolve(
      userManagementServiceToken,
    );
    const person = await users.create({
      name: 'Existing visitor',
      username: 'existingvisitor',
      email: 'visitor@example.com',
      password: 'original-visitor-password',
    });
    const accounts = await (await testApp.request('/demoMode/accounts')).json();
    expect(
      accounts.data.map((account: { username: string }) => account.username),
    ).toEqual(
      expect.arrayContaining([
        DEFAULT_ADMIN_CREDENTIALS.username,
        person.username,
      ]),
    );

    const entered = await testApp.request('/demoMode/accounts/signInDefault', {
      method: 'POST',
      headers: json,
    });
    expect(entered.status).toBe(200);
    expect(await entered.json()).toEqual({ data: { signedIn: true } });
    const cookie = entered.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    expect(
      (await testApp.request('/demoMode/data', { headers: { cookie } })).status,
    ).toBe(200);

    const switched = await testApp.request(
      '/demoMode/accounts/existingvisitor/signIn',
      {
        method: 'POST',
        headers: { ...json, cookie },
      },
    );
    expect(switched.status).toBe(200);
    const visitorCookie = switched.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    const retained = await testApp.request('/demoMode/accounts/signInDefault', {
      method: 'POST',
      headers: { ...json, cookie: visitorCookie },
    });
    expect(await retained.json()).toEqual({ data: { signedIn: false } });
    const session = await (
      await testApp.request('/auth/get-session', {
        headers: { cookie: visitorCookie },
      })
    ).json();
    expect(session.user.id).toBe(person.id);
    await signIn(testApp, {
      email: person.email,
      password: 'original-visitor-password',
    });
    const demo = testApp.application.container.resolve(demoDataToken);
    expect((await demo.status()).present).toBe(false);
  });
});

test('imports the demo through the API and clears all business data while preserving system configuration', async ({
  testApp,
  connection,
}) => {
  const runtime = testApp.application.container.resolve(nocoReachToken);
  await runtime.ready;
  const demo = testApp.application.container.resolve(demoDataToken);
  expect((await testApp.request('/demoMode/data')).status).toBe(401);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  // An unrelated account named admin must survive generation and resets.
  const users = testApp.application.container.resolve(
    userManagementServiceToken,
  );
  const existingAccount = await users.create({
    name: 'Existing account',
    username: 'admin',
    email: 'existing-account@example.com',
    password: 'existing-account-password',
  });
  // A project made before the demo: requests are read-only in a demo, so it is made outside one.
  await runtime.plugin.projects.create({
    name: 'Own project',
    domain: 'own.example',
    language: 'zh-CN',
  });

  const before = await admin.fetch('/demoMode/data');
  expect(before.status).toBe(200);
  const listed = (await before.json()) as {
    data: {
      available: boolean;
      accountsByLanguage: Record<string, { username: string }[]>;
    };
  };
  expect(listed.data.available).toBe(true);
  expect(
    listed.data.accountsByLanguage['zh-CN']!.map((a) => a.username),
  ).toContain('zhouning');

  const started = await admin.fetch('/demoMode/data/import', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ language: 'zh-CN' }),
  });
  expect(started.status).toBe(200);
  await demo.whenIdle();
  const status = await demo.status();
  expect(status.failure).toBeNull();
  expect(status).toMatchObject({ present: true, language: 'zh-CN' });
  expect(status.accounts).toHaveLength(5);
  expect(status.accounts.map((account) => account.username)).not.toContain(
    'admin',
  );
  expect(
    (await runtime.plugin.db.access!.authorization.permissionSets.list()).map(
      (permissionSet) => permissionSet.key,
    ),
  ).not.toContain('nr.demo-admin');
  const row = await connection
    .repository('demoModeDatasets')
    .findOne({ filter: { id: 'nocoreach' } });
  const data = (
    typeof row!.data === 'string' ? JSON.parse(row!.data) : row!.data
  ) as {
    projects: { main: string; second: string };
    skipped: string[];
  };
  expect(data.skipped).toEqual([]);
  const { main, second } = data.projects;

  for (const projectId of [main, second]) {
    const saved = await runtime.plugin.keywordService.saved(projectId);
    expect(saved.items.length).toBeGreaterThan(30);
    const ranks = await runtime.plugin.dataViews.ranks(projectId, {
      keywords: saved.items.map((keyword) => keyword.keyword),
    });
    for (const keyword of saved.items) {
      expect(keyword.market).toEqual({ locationCode: 2158, language: 'zh-TW' });
      const body = { projectId, keyword: keyword.keyword, ...keyword.market };
      const detail = async (action: string) => {
        const response = await admin.fetch(
          `/nocoreach/nrKeywordDetail/${action}`,
          { method: 'POST', headers: json, body: JSON.stringify(body) },
        );
        expect(response.status).toBe(200);
        return (await response.json()).data;
      };
      const market = await detail('market');
      expect(market.overview.status).toBe('ready');
      expect(market.overview.item).toMatchObject({
        volume: keyword.metrics.volume,
        difficulty: keyword.metrics.difficulty,
        cpc: keyword.metrics.cpc,
      });
      expect(market.overview.item.monthlySearches).toHaveLength(12);
      for (const group of ['related', 'matching', 'questions'])
        expect(
          market.related[group].length,
          `${keyword.keyword}: ${group}`,
        ).toBeGreaterThan(0);
      const site = await detail('site');
      expect(site.gsc.queries.length).toBeGreaterThan(0);
      expect(site.gsc.pages.length).toBeGreaterThan(0);
      const rank = ranks.ranks[keyword.keyword.toLowerCase()];
      expect(site.gsc.pages[0].position).toBeCloseTo(rank.position, 6);
      const serp = await detail('serp');
      expect(serp.status).toBe('ready');
      expect(serp.items).toHaveLength(10);
    }
    const tracking = await runtime.plugin.rankTracking.status(projectId);
    expect(tracking.keywords).toHaveLength(6);
    for (const keyword of tracking.keywords) {
      expect(keyword.latest.position).toBeGreaterThan(0);
      expect(keyword.history).toHaveLength(4);
    }
    const trends = await runtime.plugin.trends.state(projectId);
    expect(trends.keywords).toHaveLength(3);
    for (const keyword of trends.keywords) {
      expect(keyword.lastRun.ok).toBe(true);
      expect(keyword.latest.points.length).toBeGreaterThan(0);
    }
    const competitors = await runtime.plugin.competitorResearch.view(projectId);
    expect(competitors.market).toEqual({
      locationCode: 2158,
      language: 'zh-TW',
    });
    expect(competitors.sites.length).toBeGreaterThan(0);
  }

  // Both projects must reach the same business surfaces with their own content.
  for (const [id, name, domain, count] of [
    [main, 'Acme', 'acme.example', 57],
    [second, 'Acme CRM', 'crm.acme.example', 39],
  ] as const) {
    const project = await runtime.plugin.projects.get(id);
    expect(project).toMatchObject({ name, domains: [domain] });
    const rows = await runtime.plugin.db
      .getRepository('nrTasks')
      .find({ filter: { projectId: id } });
    expect(rows).toHaveLength(count);
    expect(
      new Set(
        rows.map((row) => projectWork(row.toJSON()).boardState).filter(Boolean),
      ),
    ).toEqual(new Set(['todo', 'doing', 'review', 'done']));
    const adminUser = await connection
      .repository('user')
      .findOne({ filter: { username: DEFAULT_ADMIN_CREDENTIALS.username } });
    const waiting = rows
      .map((row) => row.toJSON())
      .filter(
        (task) =>
          taskOwner(task) === String(adminUser!.id) &&
          !taskClosed(task.evidence?.work) &&
          ['todo', 'review'].includes(
            taskState(task.evidence?.work, task.status),
          ),
      );
    expect(
      waiting.length,
      `${name}: default visitor's waiting work`,
    ).toBeGreaterThanOrEqual(3);
    expect(
      new Set(
        waiting.map((task) => taskState(task.evidence?.work, task.status)),
      ),
    ).toEqual(new Set(['todo', 'review']));
    for (const row of rows.filter((row) =>
      String(row.get('taskKey')).includes('nocoreach-demo:'),
    )) {
      const task = row.toJSON(),
        work = projectWork(task);
      for (const artifact of work.results.filter(Boolean)) {
        expect(Date.parse(artifact!.createdAt)).toBeGreaterThanOrEqual(
          Date.parse(task.createdAt),
        );
        expect(Date.parse(artifact!.createdAt)).toBeLessThanOrEqual(
          Date.parse(task.updatedAt),
        );
      }
      for (const result of work.observation?.results ?? []) {
        expect(Date.parse(result.after.end)).toBeLessThan(
          Date.parse(result.computedAt),
        );
        expect(Date.parse(result.computedAt)).toBeLessThanOrEqual(
          Date.parse(task.updatedAt),
        );
        expect(result.coverage?.gsc.afterDays).toBe(7);
      }
    }
    const outcomes = new Set(
      rows.flatMap(
        (row) =>
          projectWork(row.toJSON()).observation?.results.map(
            (result) => result.conclusion,
          ) ?? [],
      ),
    );
    expect(outcomes, `${name}: measured outcome coverage`).toEqual(
      new Set(['up', 'down', 'flat', 'insufficient']),
    );
    // Each synced day is summed by page for the page drawer after the sync (page-days.ts); the tick's fill takes what
    // a running fill left.
    await pageDaysFilled(runtime.plugin.db, String(id));
    await runtime.plugin.sync.fillPageDays(id);
    const pageDayMarks = await connection
      .repository('nrPageDayMarks')
      .count({ filter: { projectId: id } });
    let pagePartitions = 0;
    for (const grain of ['query_page', 'page'])
      pagePartitions += await connection
        .repository('nrSyncPartitions')
        .count({ filter: { projectId: id, grain } });
    expect(pageDayMarks, `${name}: page days held`).toBe(pagePartitions);
    const pageScopes = (
      await connection
        .repository('nrPageScopes')
        .findMany({ filter: { projectId: id } })
    ).map((s) => s.id);
    let pageDays = 0;
    for (const scopeId of pageScopes)
      pageDays += await connection
        .repository('nrPageDays')
        .count({ filter: { scopeId } });
    expect(pageDays).toBeGreaterThan(0);
    const search = await runtime.plugin.dataViews.search(id, { range: '12m' });
    expect(search.complete, `${name}: full year of search`).toBe(true);
    expect(search.coverage.current.missingDays).toBe(0);
    expect(search.coverage.current.recordedDays).toBe(search.window.days);
    expect(search.trend.every((point) => point.clicks !== null)).toBe(true);
    // A year-over-year Search Console comparison exceeds its 16-month retention, so remain honest about that gap.
    expect(search.previousComplete).toBe(false);
    expect(search.previous).toBeNull();
    const longest = await runtime.plugin.dataViews.search(id, { range: '16m' });
    const bounds = historyBounds(runtime.plugin, id);
    expect(longest.coverage.current.records[0].start).toBe(bounds.earliest);
    const website = await runtime.plugin.dataViews.website(id, {
      range: '12m',
    });
    expect(website.complete, `${name}: yearly website report`).toBe(true);
    expect(website.missing).toEqual([]);
    expect(website.daily.length).toBeGreaterThanOrEqual(365);
    expect(website.previousDaily.length).toBeGreaterThanOrEqual(365);
    expect(website.totals.current.sessions).toBeGreaterThan(0);
    expect(website.totals.previous.sessions).toBeGreaterThan(0);
    const historical = await runtime.plugin.dataViews.search(id, {
      range: 'custom',
      from: search.window.start,
      to: new Date(Date.parse(search.window.start) + 6 * 86400000)
        .toISOString()
        .slice(0, 10),
    });
    expect(historical.complete).toBe(true);
    expect(historical.totals.clicks).toBeGreaterThan(0);
    const snapshots = runtime.plugin.db.getRepository('nrSnapshots');
    const read = async (key: string) =>
      (await snapshots.findOne({ filter: { key: `${key}:${id}` } }))?.get(
        'payload',
      );
    expect((await read('knowledge')).items).toHaveLength(8);
    const strategy = await read('strategy');
    expect(strategy.insights.items).toHaveLength(id === main ? 22 : 14);
    expect(strategy.proposals).toHaveLength(14);
    const timeline = strategy as StrategyState;
    const watches = Object.values(timeline.watch!).filter(
      (watch) => !watch.ended,
    );
    expect(watches).toHaveLength(6);
    expect(
      new Set(watches.map((watch) => watch.decideBy)).size,
    ).toBeGreaterThanOrEqual(5);
    for (const watch of watches) {
      const current = timeline.insights!.evidence.signals!.items.find(
        (signal) => signal.key === watch.key,
      )!;
      expect(current.chip?.text).toMatch(/\d/);
      expect(watch.startChip?.text).toMatch(/\d/);
      expect(watch.decideBy > timeline.insights!.generatedAt.slice(0, 10)).toBe(
        true,
      );
      expect(
        Date.parse(watch.decideBy) - Date.parse(watch.since.slice(0, 10)),
      ).toBeLessThan(14 * 86400000);
      if (
        watch.since.slice(0, 10) !== timeline.insights!.generatedAt.slice(0, 10)
      )
        expect(verdictsOf(timeline, watch.key).length).toBeGreaterThan(1);
    }
    expect(
      watches.filter(
        (watch) =>
          watch.startChip?.text !==
          timeline.insights!.evidence.signals!.items.find(
            (signal) => signal.key === watch.key,
          )!.chip?.text,
      ).length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      new Set(recentlyEnded(timeline).map((watch) => watch.ended!.outcome)),
    ).toEqual(new Set(['opportunity', 'normal', 'skip', 'expired', 'ignored']));
    const handled = rowsFor(timeline).filter(
      (row) => opportunityState(row, timeline).state !== 'pending',
    );
    expect(handled.length).toBeGreaterThanOrEqual(16);
    expect(
      new Set(handled.map((row) => row.firstSeenAt.slice(0, 7))).size,
    ).toBeGreaterThanOrEqual(10);
    for (const proposal of timeline.proposals) {
      const task = rows.find(
        (row) => String(row.id) === String(proposal.taskId),
      )!;
      expect(Date.parse(proposal.insight!.firstSeenAt!)).toBeLessThan(
        new Date(task.get('createdAt') as string).getTime(),
      );
    }
    for (const key of id === main
      ? ['acme-dependencies', 'acme-weekly-report', 'acme-kanban-wip']
      : ['crm-import', 'crm-pipeline', 'crm-routing']) {
      const task = rows.find((row) => String(row.taskKey).endsWith(`:${key}`))!;
      const response = await admin.fetch('/nocoreach/nrTaskWork/get', {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ projectId: id, taskId: String(task.id) }),
      });
      expect(response.status).toBe(200);
      const detail = (await response.json()).data;
      const activity = detail.work.history;
      expect(
        activity.some(
          (event: { action: string }) => event.action === 'startTask',
        ),
      ).toBe(true);
      const latestVersion = Math.max(
        ...detail.artifacts.map(
          (artifact: { version: number }) => artifact.version,
        ),
      );
      for (const artifact of detail.artifacts) {
        expect(activity).toContainEqual(
          expect.objectContaining({
            action: 'runSucceeded',
            artifactId: artifact.id,
            runId: artifact.runId,
          }),
        );
        expect(artifact.content).toContain('##');
        expect(artifact.content.length).toBeGreaterThan(
          artifact.version === latestVersion ? 500 : 200,
        );
      }
      for (const event of activity) {
        expect(Date.parse(event.at)).toBeGreaterThanOrEqual(
          new Date(task.get('createdAt') as string).getTime(),
        );
        expect(Date.parse(event.at)).toBeLessThanOrEqual(
          new Date(task.get('updatedAt') as string).getTime(),
        );
      }
      expect(detail.runs.length).toBeGreaterThanOrEqual(1);
      expect(detail.execution.canInspect).toBe(true);
      expect(detail.execution.events.length).toBeGreaterThanOrEqual(9);
      expect(
        detail.execution.events.some(
          (event: { type: string }) => event.type === 'toolResult',
        ),
      ).toBe(true);
      expect(
        detail.runs.every(
          (run: { simulated: boolean; pluginRunId?: string }) =>
            run.simulated && !run.pluginRunId,
        ),
      ).toBe(true);
      for (const run of detail.runs) {
        expect(Date.parse(run.startedAt)).toBeGreaterThanOrEqual(
          new Date(task.get('createdAt') as string).getTime(),
        );
        expect(Date.parse(run.endedAt)).toBeLessThanOrEqual(
          new Date(task.get('updatedAt') as string).getTime(),
        );
      }
      if (key === 'acme-dependencies' || key === 'crm-import') {
        expect(
          new Set(detail.runs.map((run: { status: string }) => run.status)),
        ).toEqual(new Set(['succeeded']));
        const previous = await admin.fetch('/nocoreach/nrTaskWork/get', {
          method: 'POST',
          headers: json,
          body: JSON.stringify({
            projectId: id,
            taskId: String(task.id),
            runId: detail.runs.find(
              (run: { status: string }) => run.status === 'succeeded',
            ).id,
          }),
        });
        expect(
          (await previous.json()).data.execution.events.length,
        ).toBeGreaterThan(5);
      }
      if (key === 'acme-weekly-report' || key === 'crm-pipeline') {
        expect(detail.artifacts).toHaveLength(2);
        const versions = [...detail.artifacts].sort(
          (a, b) => a.version - b.version,
        );
        expect(versions[1].content.length).toBeGreaterThan(
          versions[0].content.length,
        );
        const request = activity.find(
          (event: { action: string }) => event.action === 'requestStageChanges',
        );
        expect(request.artifactId).toBe(versions[0].id);
        expect(Date.parse(request.at)).toBeGreaterThan(
          Date.parse(versions[0].createdAt),
        );
        expect(Date.parse(request.at)).toBeLessThan(
          Date.parse(versions[1].createdAt),
        );
        expect(
          detail.reviews.some(
            (review: { decision: string }) =>
              review.decision === 'requestChanges',
          ),
        ).toBe(true);
      }
    }
    const taskIds = new Set(rows.map((row) => String(row.id)));
    expect(
      strategy.proposals.every((proposal: { taskId: string }) =>
        taskIds.has(String(proposal.taskId)),
      ),
    ).toBe(true);
    for (const key of [
      'site-content',
      'github',
      'github-trends',
      'community',
      'packages',
      'chat',
      'rank-tracking',
      'youtube',
    ]) {
      const snapshot = await read(key);
      expect(snapshot, `${name}: ${key}`).toBeTruthy();
      expect(JSON.stringify(snapshot)).not.toMatch(/nocobase|nococrm/i);
    }
    expect(
      (await runtime.plugin.aiSearch.list(id)).length,
    ).toBeGreaterThanOrEqual(2);
    const token = await runtime.plugin.demoProjects.worldRequest(
      id,
      'https://oauth2.googleapis.com/token',
      { method: 'POST' },
    );
    expect(token.status).toBe(200);
  }

  // The importer and the demo's own people see the demo projects; a member sees only theirs.
  const member = await signIn(testApp, {
    email: 'chencheng@acme.example',
    password: 'chencheng123',
  });
  expect((await member.fetch('/demoMode/data')).status).toBe(403);
  expect(
    (
      await member.fetch('/demoMode/data/reset', {
        method: 'POST',
        headers: json,
        body: '{}',
      })
    ).status,
  ).toBe(403);
  const projects = (await (
    await member.fetch('/nocoreach/nrProjects/list', {
      method: 'POST',
      headers: json,
      body: '{}',
    })
  ).json()) as { data: { id: number }[] };
  expect(projects.data.map((p) => String(p.id))).toEqual([main]);

  const tasks = (await (
    await admin.fetch('/nocoreach/nrTaskWork/list', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ projectId: main }),
    })
  ).json()) as { data: unknown[] };
  expect(tasks.data.length).toBeGreaterThan(0);

  // Requests for a demo project are answered in process; anything the fixtures do not cover is refused.
  await expect(
    runtime.plugin.network.fetch('site', 'https://unknown.invalid/', {}, main),
  ).rejects.toMatchObject({
    code: 'NR_DEMO_OFFLINE',
  });
  const google = await admin.fetch('/nocoreach/nrGoogle/status', {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ projectId: main }),
  });
  expect(google.status).toBe(200);

  // The demo's business AI answers from the simulated model.
  const defaults = await runtime.plugin.agents.models.services.defaults();
  expect(runtime.plugin.demoModels?.isDemoModel(defaults.effectiveChat)).toBe(
    true,
  );
  runtime.plugin.demoModels?.bind(null, null);
  const judgment = await new OnlineProvider(runtime.plugin).complete(
    '',
    JSON.stringify({ signal: { key: 'test-signal' } }),
    'daily-judge',
  );
  expect(JSON.parse(judgment)).toMatchObject({
    key: 'test-signal',
    verdict: 'skip',
  });
  const environmentModel = (await demo.status()).model.service;
  expect(environmentModel).toBeTruthy();

  // Visitor-created project content must go too; a global snapshot whose skill ID matches the project must stay.
  const visitorKey = `nr-task-op:${main}:visitor-task:request`;
  const sharedKey = `nr-skill:${main}`;
  for (const key of [visitorKey, `google-local-reports:${main}`, sharedKey])
    await runtime.plugin.db.getRepository('nrSnapshots').create({
      values: {
        key,
        payload: { value: 'preserve boundaries' },
      },
    });
  const demoChat = `demo-chat-${randomUUID()}`;
  const ownChat = `own-chat-${randomUUID()}`;
  for (const [id, projectId] of [
    [demoChat, main],
    [ownChat, 'non-demo-project'],
  ])
    await connection.repository('nrOnlineAgentRecords').createOne({
      values: {
        id,
        kind: 'conversation',
        ownerId: 'test-owner',
        groupId: '',
        status: '',
        revision: 0,
        payload: JSON.stringify({ projectId }),
      },
    });

  for (const key of [
    'nr-task-materials:orphan',
    'project-icon:missing',
    'nr-migrations:cleanup-test',
    'mock-demo:cleanup-test',
  ])
    await runtime.plugin.db
      .getRepository('nrSnapshots')
      .create({ values: { key, payload: { saved: true } } });
  await runtime.variables.set('NOREACH_GITHUB_TOKEN_orphan', 'project-secret');
  await runtime.cache.set('project-data', { stale: true });
  const disk = testApp.application.container
    .resolve(driveManagerToken)
    .use('local');
  const fileId = randomUUID();
  const fileKey = `tests/demo-data/${fileId}.txt`;
  await disk.put(fileKey, Buffer.from('old project attachment'));
  await connection.repository('nrTaskMedia').createOne({
    values: {
      id: fileId,
      disk: 'local',
      key: fileKey,
      filename: 'attachment.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 22,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: 'test-owner',
      sessionId: 'test-session',
      projectId: 'missing',
      draftId: randomUUID(),
      expiresAt: new Date(Date.now() + 60000),
      deleting: false,
    },
  });
  const legacyChatId = randomUUID();
  const legacyRunId = randomUUID();
  const createdAt = new Date();
  await connection.repository('agConversations').createOne({
    values: {
      id: legacyChatId,
      userId: 'test-owner',
      agentId: 'test-agent',
      mode: 'online',
      titleSource: 'user',
      category: 'chat',
      source: 'application',
      lastMessageAt: createdAt,
      createdAt,
      updatedAt: createdAt,
    },
  });
  await connection.repository('agConversationMessages').createOne({
    values: {
      id: randomUUID(),
      conversationId: legacyChatId,
      seq: 1,
      role: 'user',
      content: 'Old conversation',
      searchText: 'Old conversation',
      createdAt,
      updatedAt: createdAt,
    },
  });
  await connection.repository('agRuns').createOne({
    values: {
      id: legacyRunId,
      agentId: 'test-agent',
      status: 'completed',
      subjectKind: 'conversation',
      subjectId: legacyChatId,
      threadScope: '',
      actorUserId: 'test-owner',
      createdAt,
      updatedAt: createdAt,
    },
  });
  const chatFileKey = `tests/demo-data/${legacyChatId}.txt`;
  await disk.put(chatFileKey, Buffer.from('old chat attachment'));
  await connection.repository('agChatAttachments').createOne({
    values: {
      id: randomUUID(),
      disk: 'local',
      key: chatFileKey,
      filename: 'chat.txt',
      ext: 'txt',
      mimeType: 'text/plain',
      size: 19,
      uploaderId: 'test-owner',
      conversationId: legacyChatId,
      createdAt,
      updatedAt: createdAt,
    },
  });
  const globalAgents = await connection
    .repository('nrOnlineAgentRecords')
    .findMany({ filter: { kind: 'agent' } });
  // A live conversation refuses the operation before any business record or blob is deleted.
  const activeId = randomUUID();
  await connection.repository('nrOnlineAgentRecords').createOne({
    values: {
      id: activeId,
      kind: 'run',
      ownerId: 'test-owner',
      groupId: '',
      status: 'running',
      revision: 0,
      payload: '{}',
    },
  });
  // More than one cleanup page, with retained messages between stale ones on every page.
  const inbox = Array.from({ length: 450 }, (_, index) => ({
    id: `inbox-cleanup-${String(index).padStart(4, '0')}`,
    kind: (['demo', 'task', 'other'] as const)[index % 3],
  }));
  for (const { id, kind } of inbox)
    await connection.repository('notificationInAppItems').createOne({
      values: {
        id,
        deliveryId: randomUUID(),
        notificationId:
          kind === 'demo' ? `nocoreach-demo-${id.slice(-4)}` : randomUUID(),
        userId: 'test-owner',
        title: id,
        body: id,
        actionUrl: null,
        readAt: null,
        createdAt,
        updatedAt: createdAt,
        target:
          kind === 'task'
            ? { type: 'route', path: `/actions/${id}` }
            : { type: 'route', path: '/settings' },
      },
    });
  const clearRequest = () =>
    admin.fetch('/demoMode/data/clear', {
      method: 'POST',
      headers: json,
      body: '{}',
    });
  const blocked = await clearRequest();
  expect(blocked.status).toBe(400);
  expect(await blocked.json()).toMatchObject({
    error: { reason: 'DEMO_DATA_WORK_RUNNING' },
  });
  expect(await runtime.plugin.projects.all()).toHaveLength(3);
  expect(await disk.exists(fileKey)).toBe(true);
  await connection
    .repository('nrOnlineAgentRecords')
    .deleteOne({ filter: { id: activeId } });
  // An unavailable storage disk leaves the cleanup record intact so the same action can retry.
  const deletion = vi
    .spyOn(disk, 'delete')
    .mockRejectedValueOnce(new Error('storage unavailable'));
  expect((await clearRequest()).status).toBe(500);
  deletion.mockRestore();
  expect(
    await connection
      .repository('nrTaskMedia')
      .findOne({ filter: { id: fileId } }),
  ).toBeDefined();
  expect(await runtime.plugin.projects.all()).toHaveLength(3);
  const cleared = await admin.fetch('/demoMode/data/clear', {
    method: 'POST',
    headers: json,
    body: '{}',
  });
  expect(cleared.status).toBe(200);
  const remaining = (await runtime.plugin.projects.all()) as {
    id: number;
    name: string;
  }[];
  expect(remaining).toEqual([]);
  expect(
    (
      await connection.query
        .selectFrom('notificationInAppItems')
        .select(['id'])
        .where('id', 'like', 'inbox-cleanup-%')
        .orderBy('id', 'asc')
        .execute<{ id: string }>()
    ).map(({ id }) => id),
  ).toEqual(inbox.filter(({ kind }) => kind === 'other').map(({ id }) => id));
  expect(await disk.exists(fileKey)).toBe(false);
  expect(await disk.exists(chatFileKey)).toBe(false);
  for (const table of [
    'agConversations',
    'agConversationMessages',
    'agChatAttachments',
    'agRuns',
  ])
    expect(await connection.repository(table).count()).toBe(0);
  expect(
    await connection
      .repository('nrOnlineAgentRecords')
      .findMany({ filter: { kind: 'agent' } }),
  ).toEqual(globalAgents);
  expect(await connection.repository('nrTaskMedia').count()).toBe(0);
  expect(await runtime.cache.get('project-data')).toBeUndefined();
  expect(runtime.variables.get('NOREACH_GITHUB_TOKEN_orphan')).toBeUndefined();
  for (const key of ['nr-task-materials:orphan', 'project-icon:missing'])
    expect(
      await connection.repository('nrSnapshots').findOne({ filter: { key } }),
    ).toBeUndefined();
  for (const key of ['nr-migrations:cleanup-test', 'mock-demo:cleanup-test'])
    expect(
      await connection.repository('nrSnapshots').findOne({ filter: { key } }),
    ).toBeDefined();
  expect((await admin.fetch('/demoMode/data')).status).toBe(200);
  for (const id of [main, second]) {
    const keys = (await connection.repository('nrSnapshots').findMany({})).map(
      (r) => String(r.key),
    );
    expect(
      keys.filter((key) => key.split(':')[1] === id && key !== sharedKey),
    ).toEqual([]);
    for (const table of [
      'nrTasks',
      'nrGoogleLinks',
      'nrSyncPartitions',
      'nrPageDayMarks',
      'nrPageScopes',
      'nrPageAddresses',
      'nrProjectMembers',
    ])
      expect(
        await connection.repository(table).count({ filter: { projectId: id } }),
      ).toBe(0);
    for (const prefix of PROJECT_VARIABLES)
      expect(runtime.variables.get(`${prefix}${id}`)).toBeUndefined();
  }
  expect(
    await connection
      .repository('nrSnapshots')
      .findOne({ filter: { key: sharedKey } }),
  ).toMatchObject({ payload: { value: 'preserve boundaries' } });
  expect(
    await connection
      .repository('nrOnlineAgentRecords')
      .findOne({ filter: { id: demoChat } }),
  ).toBeUndefined();
  expect(
    await connection
      .repository('nrOnlineAgentRecords')
      .findOne({ filter: { id: ownChat } }),
  ).toBeUndefined();
  // NocoReach does not configure account deletion, so the demo's accounts are disabled and can no longer sign in.
  const people = await connection.query
    .selectFrom('user')
    .select(['email', 'disabledAt'])
    .where('email', 'like', '%@acme.example')
    .execute();
  expect(people).toHaveLength(5);
  expect(people.every((person) => person.disabledAt)).toBe(true);
  expect(
    (await runtime.plugin.agents.models.services.list()).map((s) => s.title),
  ).toContain('Demo model');
  expect((await demo.status()).present).toBe(false);
  expect(
    (await runtime.plugin.agents.models.services.defaults()).chat,
  ).toMatchObject({
    modelService: environmentModel,
    model: 'demo-chat',
  });

  // Imported again, in English: the disabled accounts come back, under the English story's names.
  const adminId = String(
    people.length &&
      (await connection.query
        .selectFrom('user')
        .select(['id'])
        .where('email', '=', DEFAULT_ADMIN_CREDENTIALS.email)
        .executeTakeFirst())!.id,
  );
  const english = await demo.importNow(adminId, 'en-US');
  expect(english.failure).toBeNull();
  expect(english.accounts.map((account) => account.username)).toEqual([
    'grace',
    'ethan',
    'sophie',
    'henry',
    'chloe',
  ]);
  // The existing administrator keeps managing the demo after regeneration.
  const administrator = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  expect((await administrator.fetch('/demoMode/configuration')).status).toBe(
    200,
  );
  expect((await administrator.fetch('/demoMode/data')).status).toBe(200);
  expect(await users.get(existingAccount.id)).toMatchObject({
    username: 'admin',
    disabledAt: null,
  });
  await signIn(testApp, {
    email: 'existing-account@example.com',
    password: 'existing-account-password',
  });
  const grace = await signIn(testApp, {
    email: 'grace@acme.example',
    password: 'grace123',
  });
  const graceProjects = (await (
    await grace.fetch('/nocoreach/nrProjects/list', {
      method: 'POST',
      headers: json,
      body: '{}',
    })
  ).json()) as { data: { name: string; language: string }[] };
  expect(graceProjects.data.map((p) => p.name)).toEqual(['Acme', 'Acme CRM']);
  expect(graceProjects.data.at(-1)!.language).toBe('en-US');

  const reset = await demo.reset(undefined, 'zh-CN', { wait: true });
  expect(reset).toMatchObject({
    present: true,
    language: 'zh-CN',
    failure: null,
  });
  expect(reset.model.service).toBe(environmentModel);
  await demo.clear(adminId);
  expect(((await runtime.plugin.projects.all()) as unknown[]).length).toBe(0);
});

describe('existing account conflicts', () => {
  const test = accountConflictTest;
  test('renames owned legacy demo emails without changing unrelated identities or passwords', async ({
    testApp,
    connection,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const users = testApp.application.container.resolve(
      userManagementServiceToken,
    );
    const specs = [
      {
        username: 'grace',
        email: 'grace@nocobase.example',
        dataset: 'nocoreach',
      },
      { username: 'xulan', email: 'xulan@nocobase.example' },
      {
        username: 'ethan',
        email: 'ethan@nocobase.example',
        dataset: 'another-demo',
      },
      {
        username: 'sophie',
        email: 'sophie@team.example',
        dataset: 'nocoreach',
      },
    ];
    const accounts = [];
    for (const spec of specs) {
      const account = await users.create({
        name: spec.username,
        username: spec.username,
        email: spec.email,
        password: 'original-password-123',
      });
      if (spec.dataset)
        await connection.repository('demoModeAccounts').createOne({
          values: {
            userId: account.id,
            datasetId: spec.dataset,
            passwordHash: 'fixture-owned-account',
          },
        });
      accounts.push(account);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await migrateDemoIdentityEmails(
        runtime.plugin.db.access!.database,
        users,
      );
      for (const [index, account] of accounts.entries()) {
        const current = await users.get(account.id);
        expect(current).toMatchObject({
          id: account.id,
          username: account.username,
          name: account.name,
          email: index === 0 ? 'grace@acme.example' : account.email,
        });
        expect(current.roleScopes).toEqual(account.roleScopes);
      }
    }
    await signIn(testApp, {
      email: 'grace@acme.example',
      password: 'original-password-123',
    });
  });

  test('refuses to reuse a pre-existing account even when both demo username and email match', async ({
    testApp,
    connection,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const users = testApp.application.container.resolve(
      userManagementServiceToken,
    );
    const own = await users.create({
      name: 'Existing person',
      username: 'zhouning',
      email: 'zhouning@acme.example',
      password: 'original-password-123',
    });
    const adminId = (await connection.query
      .selectFrom('user')
      .select(['id'])
      .where('email', '=', DEFAULT_ADMIN_CREDENTIALS.email)
      .executeTakeFirst())!.id;
    const demo = testApp.application.container.resolve(demoDataToken);
    await runtime.plugin.db.getRepository('nrSnapshots').create({
      values: {
        key: 'project:41',
        payload: { id: 41, name: 'Existing project' },
      },
    });
    await expect(
      demo.importNow(String(adminId), 'zh-CN'),
    ).rejects.toMatchObject({
      reason: 'DEMO_DATA_ACCOUNT_CONFLICT',
    });
    const existing = await connection.query
      .selectFrom('user')
      .select(['name', 'disabledAt'])
      .where('id', '=', own.id)
      .executeTakeFirst();
    expect(existing).toMatchObject({
      name: 'Existing person',
      disabledAt: null,
    });
    await signIn(testApp, {
      email: 'zhouning@acme.example',
      password: 'original-password-123',
    });
    expect(await runtime.plugin.projects.all()).toEqual([]);
  });
});

describe('demo configuration permissions', () => {
  const test = configurationTest;
  test('enforces independent read/configure permissions and configuration versions through HTTP', async ({
    testApp,
    connection,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const { authorizationToken } =
      await import('@nocobase/app-plugin-authorization');
    const authz = testApp.application.container.resolve(authorizationToken);
    const users = testApp.application.container.resolve(
      userManagementServiceToken,
    );
    const reader = await users.create({
      name: 'Configuration reader',
      username: 'configreader',
      email: 'configreader@example.com',
      password: 'test-password-1234',
    });
    await authz.permissionSets.create({
      key: 'configuration-reader',
      title: 'Configuration reader',
      grants: [
        {
          resource: { type: 'settings', id: 'demoMode.configuration' },
          actions: [{ action: 'read' }],
        },
      ],
    });
    await authz.permissionSets.assign({
      subject: { type: 'user', id: reader.id },
      permissionSet: 'configuration-reader',
    });
    expect((await testApp.request('/demoMode/configuration')).status).toBe(401);
    const signedReader = await signIn(testApp, {
      email: 'configreader@example.com',
      password: 'test-password-1234',
    });
    expect((await signedReader.fetch('/demoMode/configuration')).status).toBe(
      200,
    );
    expect((await signedReader.fetch('/demoMode/data')).status).toBe(403);
    const put = (expectedRevision: number, value: unknown) => ({
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ expectedRevision, value }),
    });
    expect(
      (await signedReader.fetch('/demoMode/configuration/mocks', put(0, {})))
        .status,
    ).toBe(403);
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    // A beta.2 deployment may have a disabled schedule saved beside its write and simulation policies.
    await connection.query
      .updateTable('demoModeConfiguration')
      .set({
        value: JSON.stringify({
          schedule: {
            enabled: false,
            hour: 8,
            minute: 15,
            timezone: 'Asia/Shanghai',
            language: 'zh-CN',
          },
          collections: ['nrTasks'],
          mocks: { 'nocoreach.runner': false },
        }),
      })
      .where('id', '=', 'default')
      .execute();
    const before = (await (
      await admin.fetch('/demoMode/configuration')
    ).json()) as { data: { revision: number } };
    expect(before.data).toMatchObject({
      schedule: {
        enabled: true,
        hour: 3,
        minute: 0,
        timezone: 'UTC',
        language: 'en-US',
      },
      collections: ['nrTasks'],
      mocks: { 'nocoreach.runner': false },
    });
    const revision = before.data.revision;
    expect(
      (await admin.fetch('/demoMode/configuration/schedule', put(revision, {})))
        .status,
    ).toBe(404);
    expect(
      (
        await admin.fetch(
          // Collection exceptions must name an existing logical collection.
          '/demoMode/configuration/collections',
          put(revision, ['nrMissingDemoCollection']),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await admin.fetch(
          '/demoMode/configuration/mocks',
          put(revision, { 'nocoreach.runner': false }),
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await admin.fetch(
          '/demoMode/configuration/mocks',
          put(revision, { 'nocoreach.runner': true }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await admin.fetch(
          '/demoMode/configuration/mocks',
          put(revision + 1, { 'nocoreach.runner': true }),
        )
      ).status,
    ).toBe(200);
    expect((await signedReader.fetch('/demoMode/configuration')).status).toBe(
      200,
    );
  });
});
describe('disabled demo environment', () => {
  const test = offTest;
  test('does not expose demo management outside demo deployments', async ({
    testApp,
  }) => {
    const runtime = testApp.application.container.resolve(nocoReachToken);
    await runtime.ready;
    const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
    expect((await admin.fetch('/demoMode/configuration')).status).toBe(404);
    expect((await admin.fetch('/demoMode/data')).status).toBe(404);
    expect(
      await (await testApp.request('/demoMode/accounts')).json(),
    ).toMatchObject({ data: [] });
    const entry = await testApp.request('/demoMode/accounts/signInDefault', {
      method: 'POST',
      headers: json,
    });
    expect(await entry.json()).toEqual({ data: { signedIn: false } });
    expect(entry.headers.get('set-cookie')).toBeNull();
    const demo = testApp.application.container.resolve(demoDataToken);
    await expect(demo.importNow('admin')).rejects.toMatchObject({
      reason: 'DEMO_MODE_REQUIRED',
    });
  });
});
