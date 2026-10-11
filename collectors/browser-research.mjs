/** Static composition of the two reviewed read-only platform handlers.
 * An operator enables platforms explicitly; no module path/command is accepted.
 */
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { createReadOnlyCollector } from './read-only-browser.mjs';
import { createXiaohongshuHandlers } from './xiaohongshu.mjs';
import { createBilibiliHandlers } from './bilibili.mjs';

export function createBrowserResearchCollector({
  token,
  platforms,
  xiaohongshu,
  bilibili,
  now,
}) {
  if (
    !Array.isArray(platforms) ||
    !platforms.length ||
    platforms.some((p) => !['xiaohongshu', 'bilibili'].includes(p))
  )
    throw new Error('Select the supported collector platforms explicitly.');
  return createReadOnlyCollector({
    token,
    now,
    platforms: {
      ...(platforms.includes('xiaohongshu')
        ? { xiaohongshu: createXiaohongshuHandlers(xiaohongshu) }
        : {}),
      ...(platforms.includes('bilibili')
        ? { bilibili: createBilibiliHandlers(bilibili) }
        : {}),
    },
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.NOCOREACH_COLLECTOR_PORT || '18061');
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('Invalid collector port.');
  const platforms = (process.env.NOCOREACH_COLLECTOR_PLATFORMS || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const server = createBrowserResearchCollector({
    token: process.env.NOCOREACH_COLLECTOR_TOKEN,
    platforms,
    xiaohongshu: { profile: process.env.NOCOREACH_XHS_OPENCLI_PROFILE || '' },
  });
  server.listen(port, '127.0.0.1', () =>
    process.stdout.write(
      `NocoReach read-only browser collector: http://127.0.0.1:${port}\n`,
    ),
  );
}
