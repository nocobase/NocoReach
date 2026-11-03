// @vitest-environment node
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, vi } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import { DEFAULT_ADMIN_CREDENTIALS } from '@nocobase/app-plugin-authentication/testing';
import {
  userManagementServiceToken,
  userPreferencesServiceToken,
} from '@nocobase/app-plugin-users/server/tokens';
import { createStandaloneServer } from '../../server/standalone';

vi.setConfig({ testTimeout: 120000, hookTimeout: 120000 });

const createTest = (
  origin: string,
  enabled = true,
  cookieOverrides?: { sameSite: 'lax'; partitioned: false },
) =>
  createAppTest({
    createServer: createStandaloneServer,
    env: {
      ...process.env,
      NOCOBASE_TEST_DB_SQLITE_DIRECTORY: path.join(
        tmpdir(),
        `nocoreach-demo-preferences-${randomUUID()}`,
      ),
    },
    server: {
      env: { DB_FILENAME: undefined, APP_PUBLIC_ORIGIN: origin },
    },
    config: {
      app: { publicOrigin: origin },
      users: { initialAdmin: DEFAULT_ADMIN_CREDENTIALS },
      secrets: { keys: [{ version: 1, key: randomBytes(32).toString('hex') }] },
      nocoreach: { publicDns: '' },
      demoMode: { enabled },
      ...(cookieOverrides
        ? { auth: { advanced: { defaultCookieAttributes: cookieOverrides } } }
        : {}),
    },
  });

function keepCookies(response: Response, previous = ''): string {
  const jar = new Map(
    previous
      .split('; ')
      .filter(Boolean)
      .map((value) => [value.slice(0, value.indexOf('=')), value]),
  );
  for (const cookie of response.headers.getSetCookie()) {
    const value = cookie.split(';')[0];
    const name = value.slice(0, value.indexOf('='));
    if (/Max-Age=0(?:;|$)/iu.test(cookie)) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar.values()].join('; ');
}

const origin = 'https://demo.example.com';
const test = createTest(origin);
test('uses plugin cookies and keeps presentation choices with each visitor across account switches', async ({
  testApp,
}) => {
  const json = { origin, 'Content-Type': 'application/json' };
  const enter = () =>
    testApp.request('/demoMode/accounts/signInDefault', {
      method: 'POST',
      headers: json,
    });
  const first = await enter();
  expect(first.status).toBe(200);
  const sessionCookie = first.headers
    .getSetCookie()
    .find(
      (cookie) =>
        cookie.includes('session_token=') && !cookie.includes('Max-Age=0'),
    );
  expect(sessionCookie).toMatch(/SameSite=None/iu);
  expect(sessionCookie).toMatch(/Secure/iu);
  expect(sessionCookie).toMatch(/Partitioned/iu);
  let visitor = keepCookies(first);
  const second = keepCookies(await enter());
  const read = async (cookie: string) => {
    const response = await testApp.request('/users/me/preferences', {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    return (await response.json()).data;
  };
  const defaults = await read(second);
  const session = await (
    await testApp.request('/auth/get-session', { headers: { cookie: visitor } })
  ).json();
  const preferences = testApp.application.container.resolve(
    userPreferencesServiceToken,
  );
  const saved = await preferences.list(session.user.id);
  const choices = {
    locale: 'zh-CN',
    'theme.mode': 'dark',
    'theme.preset': 'compact',
  };
  const changed = await testApp.request('/users/me/preferences', {
    method: 'PATCH',
    headers: { ...json, cookie: visitor },
    body: JSON.stringify(choices),
  });
  expect(changed.status).toBe(200);
  visitor = keepCookies(changed, visitor);
  expect(await read(visitor)).toMatchObject(choices);
  expect(await read(second)).toEqual(defaults);
  expect(await preferences.list(session.user.id)).toEqual(saved);

  const person = await testApp.application.container
    .resolve(userManagementServiceToken)
    .create({
      name: 'Preference visitor',
      username: 'preferencevisitor',
      email: 'preferencevisitor@example.com',
      password: 'preference-visitor-password',
    });
  const switched = await testApp.request(
    `/demoMode/accounts/${person.username}/signIn`,
    {
      method: 'POST',
      headers: { ...json, cookie: visitor },
    },
  );
  expect(switched.status).toBe(200);
  visitor = keepCookies(switched, visitor);
  expect(await read(visitor)).toMatchObject(choices);
  const reset = await testApp.request('/users/me/preferences/locale', {
    method: 'DELETE',
    headers: { ...json, cookie: visitor },
  });
  expect(reset.status).toBe(204);
  visitor = keepCookies(reset, visitor);
  expect((await read(visitor)).locale).toBe(defaults.locale);
});

for (const scenario of [
  { name: 'HTTP demo', origin: 'http://localhost', enabled: true },
  { name: 'ordinary HTTPS deployment', origin, enabled: false },
]) {
  const test = createTest(scenario.origin, scenario.enabled);
  test(`keeps the existing cookie policy for an ${scenario.name}`, ({
    testApp,
  }) => {
    expect(
      testApp.application.config.get('auth.advanced.defaultCookieAttributes'),
    ).toBeUndefined();
  });
}

{
  const test = createTest(origin, true, {
    sameSite: 'lax',
    partitioned: false,
  });
  test('preserves explicit deployment cookie overrides', ({ testApp }) => {
    expect(
      testApp.application.config.get('auth.advanced.defaultCookieAttributes'),
    ).toMatchObject({
      sameSite: 'lax',
      partitioned: false,
    });
  });
}
