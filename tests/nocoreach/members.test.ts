import { expect, test } from 'vitest';
import { Members } from '../../server/nocoreach/members.js';

test('members reflect only framework business roles and keep service identities and disabled accounts out', async () => {
  const users = [
    { id: 'root', username: 'Administrator', roles: [{ name: 'root' }], kind: 'person' },
    { id: 'member', username: 'Member', roles: [{ name: 'member' }, { name: 'nr.reader' }, { name: 'nr.writer' }], kind: 'person' },
    { id: 'outsider', username: 'Outsider', roles: [{ name: 'member' }], kind: 'person' },
    { id: 'service', username: 'Service', roles: [{ name: 'nr.reader' }], kind: 'service' },
    { id: 'disabled', username: 'Disabled', roles: [{ name: 'nr.admin' }], kind: 'person', disabledAt: new Date() },
  ];
  const members = new Members({ db: { getRepository: (name: string) => {
    expect(name).toBe('users');
    return { find: async () => users };
  } } });
  expect(await members.list()).toEqual([
    { id: 'root', name: 'Administrator', account: 'Administrator', role: 'admin', roles: [], locked: true },
    { id: 'member', name: 'Member', account: 'Member', role: 'member', roles: ['nr.reader', 'nr.writer'], locked: false },
    { id: 'outsider', name: 'Outsider', account: 'Outsider', role: null, roles: [], locked: false },
  ]);
  expect((await members.joined()).map((person: { id: string }) => person.id)).toEqual(['root', 'member']);
});
