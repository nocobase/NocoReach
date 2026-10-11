import { expect, type Locator } from '@playwright/test';

export async function readTaskSearch(input: Locator) {
  // Read all three boundaries in one browser turn so a router transition cannot
  // make independently sampled input, address and results appear consistent.
  return input.evaluate((element) => ({
    input: 'value' in element ? element.value : null,
    query: new URL(element.ownerDocument.URL).searchParams.get('q'),
    taskIds: Array.from(
      element.ownerDocument.querySelectorAll('tbody tr[data-task-id]'),
      (row: { getAttribute(name: string): string | null }) =>
        row.getAttribute('data-task-id'),
    ),
  }));
}

export async function expectTaskSearch(
  input: Locator,
  query: string,
  taskId: string,
) {
  // The 300ms debounce is a minimum delay, not a browser scheduling deadline.
  // A lost update, wrong URL or stale result must still fail within five seconds.
  await expect
    .poll(() => readTaskSearch(input), {
      timeout: 5_000,
      message: 'Task search input, URL and unique fixture result must agree',
    })
    .toEqual({ input: query, query, taskIds: [taskId] });
}
