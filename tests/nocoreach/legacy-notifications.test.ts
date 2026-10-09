// The notification bridge (server/nocoreach/legacy/notifications.ts): NocoReach's classic notifications, unchanged,
// sent through a stand-in for NocoBase 3's Notification service (synthetic data only).
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { legacyRecord } from '../../server/nocoreach/legacy/database.js';
import { LegacyNotifications } from '../../server/nocoreach/legacy/notifications.js';
import { Notifications } from '../../server/nocoreach/notifications.js';

type Channels = Record<string, { provider: string; enabled?: boolean }>;

function harness(channels: Channels = { inbox: { provider: 'in-app' } }, origin?: string) {
  const sent: any[] = [];
  const people: Record<string, { name: string; email?: string }> = {
    '1': { name: 'Esther', email: 'esther@example.com' },
    '2': { name: 'Lin', email: 'lin@example.com' },
    '3': { name: 'Mia' },
  };
  const users: any = {
    findOne: async ({ filterByTk }: any) =>
      people[filterByTk] ? legacyRecord({ id: filterByTk, nickname: people[filterByTk].name, email: people[filterByTk].email ?? null }) : null,
  };
  const service: any = { send: async (input: any) => (sent.push(input), { notificationId: 'n', status: 'pending' }) };
  const bridge = new LegacyNotifications(() => service, () => channels, users, { basePath: '/main', origin });
  const repos: any = { notificationChannels: bridge.repository(), users };
  const p: any = {
    db: { getRepository: (n: string) => repos[n] },
    app: { logger: { warn: () => {} }, pm: { get: (n: string) => (n === 'notification-manager' ? bridge.plugin : null) } },
    members: { list: async () => [{ id: '1', role: 'admin' }, { id: '2', role: 'member' }, { id: '4', role: 'admin' }] },
    project: async () => ({ name: 'NocoBase' }),
  };
  return { n: new Notifications(p), sent, bridge };
}

const messages = (sent: any[]) => sent.map((s) => Object.entries(s.messages)[0]);

test('a task message lands in the configured in-app channel with a route of this application', async () => {
  const h = harness();
  assert.equal(await h.n.send(['2', '2', null], { title: 'T-12 等你看方案', content: '补写文档', url: '/actions/12' }), 1);
  assert.deepEqual(messages(h.sent), [['inbox', { to: ['2'], title: 'T-12 等你看方案', body: '补写文档', target: { type: 'route', path: '/actions/12' } }]]);
  assert.equal(h.sent[0].source.type, 'nocoreach');
  assert.match(h.sent[0].idempotencyKey, /^nocoreach:/);
  await h.n.send(['3'], { title: 'x', content: '' });
  assert.notEqual(h.sent[1].idempotencyKey, h.sent[0].idempotencyKey, 'every message is its own notification');
  assert.equal(h.sent[1].messages.inbox.body, 'x', 'an empty body falls back to the title');
  assert.equal(h.sent[1].messages.inbox.target, undefined);
});

test('task events and a failed analysis reach the right people', async () => {
  const h = harness();
  await h.n.taskEvents({ id: 12, title: '补写 Block 显隐文档', evidence: { no: 12 } }, { humanOwnerId: '2' }, [
    { kind: 'waiting', step: '看方案' },
    { kind: 'owner', by: '1' },
    { kind: 'comment', by: '3', comment: '第二段再短一点' },
  ]);
  assert.deepEqual(
    messages(h.sent).map(([, m]: any) => [m.title, m.body, m.to]),
    [
      ['T-12 等你看方案', '补写 Block 显隐文档', ['2']],
      ['你是 T-12 的负责人了', '补写 Block 显隐文档（Esther 指定）', ['2']],
      ['Mia 在 T-12 留言', '第二段再短一点', ['2']],
    ],
  );
  h.sent.length = 0;
  await h.n.analysisFailed('1', '连不上在线 AI');
  assert.deepEqual(messages(h.sent), [
    ['inbox', { to: ['1', '4'], title: '今天的每日分析没有完成', body: 'NocoBase：连不上在线 AI。可以在洞察页点“重新分析”。', target: { type: 'route', path: '/home' } }],
  ]);
});

test('email goes to the first enabled email channel, to the addresses the users have, with links to this application', async () => {
  const h = harness({ inbox: { provider: 'in-app' }, off: { provider: 'smtp', enabled: false }, 'team-mail': { provider: 'smtp' } }, 'https://reach.example.com');
  await h.n.send(['2', '3'], { title: 'T-12 等你看方案', content: '补写文档', url: '/actions/12' });
  assert.deepEqual(messages(h.sent).map(([c]) => c), ['inbox', 'team-mail']);
  const mail: any = h.sent[1].messages['team-mail'];
  assert.deepEqual(mail.to, ['lin@example.com'], 'a user without an email address gets the in-app message only');
  assert.equal(mail.subject, 'NocoReach：T-12 等你看方案');
  assert.match(mail.text, /在 NocoReach 里查看：https:\/\/reach\.example\.com\/main\/actions\/12$/);
  h.sent.length = 0;
  await h.n.send(['3'], { title: 'x', content: 'y' });
  assert.deepEqual(messages(h.sent).map(([c]) => c), ['inbox'], 'nobody to email: no email notification');
});

test('without an in-app channel or the Notification plugin nothing is sent and nothing fails', async () => {
  const none = harness({});
  assert.equal(await none.n.send(['2'], { title: 'x', content: 'y' }), 0);
  assert.equal(none.sent.length, 0);
  assert.equal(await none.bridge.repository().count({ filter: { notificationType: 'email' } }), 0);
  const p: any = { db: { getRepository: () => null }, app: { logger: { warn: () => {} }, pm: { get: () => null } } };
  assert.equal(await new Notifications(p).send(['2'], { title: 'x', content: 'y' }), 0);
});
