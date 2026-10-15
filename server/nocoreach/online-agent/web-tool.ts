import { z } from 'zod';
import type { NocoReachRuntime } from '../../providers/nocoreach.js';
import {
  OnlineAgentError,
  type OnlineTool,
} from '../../online-agent/contracts.js';
import { download, plain } from '../public-sources.js';
const input = z.strictObject({
  url: z.url().max(2000),
  offset: z.number().int().min(0).default(0),
});
export const pageData = (value: unknown, offset: number) => {
  const text = JSON.stringify(value);
  return {
    text: text.slice(offset, offset + 12000),
    nextOffset: offset + 12000 < text.length ? offset + 12000 : null,
    totalCharacters: text.length,
  };
};
/** Uses the application's public-address checks, DNS pinning, redirect checks and project network policy. */
export function publicPageTool(
  plugin: NocoReachRuntime['plugin'],
  projectId: string,
  authorize: () => Promise<void>,
  signal: AbortSignal,
): OnlineTool {
  const pages = new Map<string, unknown>();
  return {
    name: 'read_page',
    description:
      'Read a public webpage as evidence. Never signs in, sends messages or changes a website. Use nextOffset to read the complete captured text.',
    inputSchema: z.toJSONSchema(input),
    async execute(args) {
      signal.throwIfAborted();
      await authorize();
      const value = input.parse(args);
      if (!/^https:\/\//.test(value.url))
        throw new OnlineAgentError('invalidUrl');
      if (!pages.has(value.url)) {
        if (pages.size >= 8) throw new OnlineAgentError('pageLimit');
        const read = () =>
          download(value.url, 0, {
            network: plugin.network,
            connection: 'site',
            signal,
          });
        const result = await plugin.network.run(projectId, read);
        signal.throwIfAborted();
        await authorize();
        const text = String(plain(result.text || ''));
        pages.set(value.url, {
          url: result.url,
          capturedAt: new Date().toISOString(),
          text: text.slice(0, 150000),
          truncated: text.length > 150000,
        });
      }
      return pageData(pages.get(value.url), value.offset);
    },
  };
}
