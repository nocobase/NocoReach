import { expect, test } from '@playwright/test';
import { expectTaskSearch } from './support/task-search.js';

// Exercise the acceptance assertion itself in Chromium against a synthetic page.
// These negative controls never load or modify application code or data.
test.use({
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {},
});

const query = 'Review unique fixture';
const taskId = 'fixture-canonical';

test.beforeEach(async ({ page }) => {
  await page.route('http://search-assertion.test/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<input aria-label="Search tasks"><table><tbody></tbody></table>',
    }),
  );
  await page.goto('http://search-assertion.test/');
});

test('search assertion accepts a delayed, complete state after 400ms', async ({
  page,
}) => {
  const input = page.getByRole('textbox', { name: 'Search tasks' });
  await input.fill(query);
  const initialQuery = await input.evaluate(
    (element, { query, taskId }) => {
      const document = element.ownerDocument;
      const window = document.defaultView!;
      window.setTimeout(() => {
        window.history.replaceState(
          null,
          '',
          `?q=${encodeURIComponent(query)}`,
        );
        const row = document.createElement('tr');
        row.dataset.taskId = taskId;
        document.querySelector('tbody')!.append(row);
      }, 850);
      return new URL(document.URL).searchParams.get('q');
    },
    { query, taskId },
  );
  expect(initialQuery).toBeNull();
  await expectTaskSearch(input, query, taskId);
});

for (const defect of [
  'dropped final callback',
  'wrong URL',
  'dropped final character',
  'wrong task result',
] as const) {
  test(`search assertion rejects ${defect}`, async ({ page }) => {
    const input = page.getByRole('textbox', { name: 'Search tasks' });
    await input.fill(
      defect === 'dropped final character' ? query.slice(0, -1) : query,
    );
    await input.evaluate(
      (element, { defect, query, taskId }) => {
        const document = element.ownerDocument;
        if (defect !== 'dropped final callback')
          document.defaultView!.history.replaceState(
            null,
            '',
            `?q=${encodeURIComponent(defect === 'wrong URL' ? 'wrong' : query)}`,
          );
        const row = document.createElement('tr');
        row.dataset.taskId = defect === 'wrong task result' ? 'other' : taskId;
        document.querySelector('tbody')!.append(row);
      },
      { defect, query, taskId },
    );
    await expect(expectTaskSearch(input, query, taskId)).rejects.toThrow(
      'Task search input, URL and unique fixture result must agree',
    );
  });
}
