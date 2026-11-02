import assert from 'node:assert/strict';

const DATA_NOT_READY =
  'Demo data is not ready. Follow docs/STUDIO-PREVIEW.md for first initialization; never reset an existing preview automatically.';

export function verificationFailure(error) {
  const message =
    error instanceof assert.AssertionError &&
    error.message.startsWith(DATA_NOT_READY)
      ? DATA_NOT_READY
      : 'Preview verification failed: inspect demo status, native visitor entry, effects protection and representative pages using the preview runbook.';
  return new Error(message);
}

export function assertDemoData(data) {
  assert(
    data?.enabled === true &&
      data.available === true &&
      data.datasetId === 'nocoreach',
    'The preview must provide the NocoReach demo dataset',
  );
  assert(
    data.present === true &&
      data.state === 'ready' &&
      data.failure === null &&
      data.finishedAt,
    DATA_NOT_READY,
  );
  for (const key of ['projects', 'accounts', 'tasks', 'opportunities'])
    assert(data.counts?.[key] > 0, `Demo data has no ${key}`);
}

/** Uses only the preview's public native visitor entry, never a Studio or administrator credential. */
export async function verifyPreviewExperience(url, options = {}) {
  const { chromium, expect } = await import('@playwright/test');
  const browser = await chromium.launch({
    headless: true,
    ...(options.executablePath
      ? { executablePath: options.executablePath }
      : {}),
  });
  const context = await browser.newContext({ locale: 'en-US' });
  try {
    const base = new URL(url);
    const request = async (path, body) => {
      const target = new URL(`api/${path}`, base).href;
      const response =
        body === undefined
          ? await context.request.get(target, { maxRedirects: 0 })
          : await context.request.post(target, {
              headers: { origin: base.origin },
              data: body,
              maxRedirects: 0,
            });
      // Do not print response bodies: the demo status includes account passwords.
      assert.equal(response.status(), 200, `Preview check failed: ${path}`);
      return (await response.json()).data;
    };
    assert.equal(
      (await request('demoMode/status'))?.enabled,
      true,
      'Demo Mode is disabled',
    );
    await request('demoMode/accounts/signInDefault', {});
    assertDemoData(await request('demoMode/data'));
    const projects = await request('nocoreach/nrProjects/list', {});
    const project = projects.find((item) => item.demo?.dataset === 'nocoreach');
    assert(project, 'No generated demo project is accessible to the visitor');
    const configuration = await request('demoMode/configuration');
    for (const id of ['nocoreach.sources', 'nocoreach.runner']) {
      assert(
        configuration.adapters?.some((adapter) => adapter.id === id),
        `Missing demo adapter: ${id}`,
      );
      assert(
        configuration.mocks?.[id] !== false,
        `Disabled demo adapter: ${id}`,
      );
    }
    // The effects guard must reject this before it can contact an external provider.
    const blocked = await context.request.post(
      new URL('api/agents/discoverModels', base).href,
      {
        headers: { origin: base.origin },
        data: {},
        maxRedirects: 0,
      },
    );
    assert.equal(blocked.status(), 400, 'External model probe was not blocked');
    assert.equal(
      (await blocked.json()).error?.reason,
      'DEMO_READ_ONLY',
      'External effects guard is absent',
    );

    const page = await context.newPage();
    await page.goto(url);
    await page.evaluate(
      ({ path, id }) => {
        localStorage.setItem(
          `nocobase.locale:${path.replace(/\/$/u, '')}`,
          'en-US',
        );
        localStorage.setItem('nocoreach:project', id);
      },
      { path: base.pathname, id: String(project.id) },
    );
    for (const [path, title, content] of [
      ['home', 'Insights', '[data-situation-column]'],
      ['opportunities', 'Opportunities', '[data-opportunity-id]'],
      ['actions', 'Tasks', 'tbody tr'],
    ]) {
      await page.goto(new URL(path, base).href);
      await expect(
        page.getByRole('heading', { name: title, exact: true }),
      ).toBeVisible();
      await expect(page.locator(content).first()).toBeVisible();
      await expect(page.locator('[role="alert"]')).toHaveCount(0);
    }
    // A visible list is insufficient: prove the task filter responds and restores its rows.
    const filter = page.getByRole('textbox').first();
    await filter.fill('preview-verification-no-matching-task');
    await expect(page.locator('tbody tr')).toHaveCount(0);
    await filter.fill('');
    await expect(page.locator('tbody tr').first()).toBeVisible();
  } catch (error) {
    // Playwright transport errors can contain authentication cookies. Never expose their text or cause in CI logs.
    throw verificationFailure(error);
  } finally {
    await context.close();
    await browser.close();
  }
}
