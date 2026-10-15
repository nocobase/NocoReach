import { expect, test } from '@playwright/test';

// Opt-in against an independently provisioned mock deployment and synthetic login.
const base = process.env.APP_URL?.replace(/\/$/, '') || '';
const storageState = process.env.NOCOREACH_MOCK_MEDIA_STORAGE_STATE;
test.skip(
  !base || !storageState,
  'Requires an isolated mock deployment and synthetic administrator session',
);
test.use({
  storageState,
  viewport: { width: 1440, height: 1000 },
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});

test('Bilibili cancellation persists across refresh and preserves successful evidence', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const call = async (
    resource: string,
    action: string,
    values: object = {},
  ) => {
    const response = await context.request.post(
      `${base}/api/nocoreach/${resource}/${action}`,
      {
        headers: { origin: new URL(base).origin },
        data: values,
      },
    );
    expect(response.status()).toBe(200);
    return (await response.json()).data;
  };
  // The API prepares an isolated project and fixture scenario; connection and runs use the UI.
  const project = await call('nrProjects', 'create', {
    name: 'NocoBloom media browser',
    domain: 'https://docs.nocobloom.example',
    language: 'en-US',
  });
  const projectId = String(project.id);
  const capabilities = await call('nrProxyProfiles', 'capabilities');
  expect(capabilities.mockEnabled).toBe(true);
  const profile = await call('nrProxyProfiles', 'save', {
    kind: 'mock',
    name: `Media browser ${projectId}`,
    mock: {
      scenario: 'normal',
      seed: 'nocobloom-media-browser',
      clock: '2026-10-12T00:00:00.000Z',
    },
  });
  await call('nrProxyProfiles', 'selectAll', {
    projectId,
    profileId: profile.id,
  });
  const scenario = async (value: string) => {
    const current = await call('nrProxyProfiles', 'get', { id: profile.id });
    return call('nrProxyProfiles', 'save', {
      id: current.id,
      kind: 'mock',
      name: current.name,
      revision: current.revision,
      mock: { ...current.mock, scenario: value },
    });
  };
  await scenario('normal');
  await page.goto(`${base}/connections`);
  await page.evaluate(
    (id) => localStorage.setItem('nocoreach:project', id),
    projectId,
  );
  const open = async () => {
    await page.goto(`${base}/connections`);
    await page
      .locator('[data-source-id="bilibili"]')
      .getByRole('button')
      .click();
  };
  await open();
  const panel = page.locator('[data-bilibili-connection]');
  await panel.getByRole('combobox').click();
  await page
    .getByRole('option', { name: 'NocoReach 模拟采集器', exact: true })
    .click();
  await panel.locator('#bili-terms').fill('NocoBloom');
  await panel
    .getByRole('button', { name: /^Save configuration$|^保存配置$/ })
    .click();
  const status = () => call('nrBilibili', 'status', { projectId });
  await panel.getByRole('button', { name: /^Read now$|^立即读取$/ }).click();
  await expect.poll(async () => (await status()).lastRun?.ok).toBe(true);
  const before = await status();
  expect(before.total).toBe(3);
  await scenario('slow-cancel');
  await panel.getByRole('button', { name: /^Read now$|^立即读取$/ }).click();
  await panel
    .getByRole('button', { name: /^Stop collection$|^停止读取$/ })
    .click();
  await expect.poll(async () => (await status()).checking).toBe(false);
  await open();
  await expect(
    panel.getByText(
      /Bilibili collection has stopped. Saved data is unchanged.|Bilibili 读取已停止，已保存数据保持不变。/,
    ),
  ).toBeVisible();
  const after = await status();
  expect(after.lastRun).toMatchObject({
    ok: false,
    errorCode: 'cancelled',
    found: 0,
    added: 0,
  });
  expect(after.verifiedAt).toBe(before.verifiedAt);
  expect(after.recent).toEqual(before.recent);
  await scenario('normal');
  await panel.getByRole('button', { name: /^Read now$|^立即读取$/ }).click();
  await expect.poll(async () => (await status()).lastRun?.ok).toBe(true);
  expect((await status()).total).toBe(3);
});
