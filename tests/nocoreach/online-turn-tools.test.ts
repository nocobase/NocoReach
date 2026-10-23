// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { turnTools } from '../../server/nocoreach/online-agent/register.js';
import type {
  OnlineBinding,
  OnlineTool,
} from '../../server/nocoreach/online-agent/tool.js';

// One turn's tool calls share its execution's signal.
const signal = new AbortController().signal;
const binding = (turnId: string): OnlineBinding => ({
  ownerId: '1',
  projectId: null,
  turnId,
  signal,
});
const tools: OnlineTool[] = [];

describe('turnTools', () => {
  it('builds a turn’s tools once, so paging reads what the turn fetched', async () => {
    const build = vi.fn(async () => ({ tools }));
    const toolsOf = turnTools(build);
    expect(await toolsOf(binding('a'))).toBe(tools);
    await toolsOf(binding('a'));
    expect(build).toHaveBeenCalledTimes(1);
    await toolsOf(binding('b'));
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('does not keep a refusal', async () => {
    const build = vi
      .fn<() => Promise<{ tools: OnlineTool[] }>>()
      .mockRejectedValueOnce(new Error('chatDisabled'))
      .mockResolvedValue({ tools });
    const toolsOf = turnTools(build);
    await expect(toolsOf(binding('a'))).rejects.toThrow('chatDisabled');
    expect(await toolsOf(binding('a'))).toBe(tools);
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('keeps a turn while its tools are called and builds again once it has been idle', async () => {
    let now = 0;
    const build = vi.fn(async () => ({ tools }));
    const toolsOf = turnTools(build, () => now);
    await toolsOf(binding('a'));
    now = 4 * 60_000;
    await toolsOf(binding('a'));
    now = 8 * 60_000;
    await toolsOf(binding('a'));
    expect(build).toHaveBeenCalledTimes(1);
    now = 14 * 60_000;
    await toolsOf(binding('a'));
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('drops a finished turn once idle, with no later call to sweep it', async () => {
    vi.useFakeTimers();
    try {
      const build = vi.fn(async () => ({ tools }));
      const toolsOf = turnTools(build, () => 0);
      await toolsOf(binding('a'));
      vi.advanceTimersByTime(4 * 60_000);
      await toolsOf(binding('a'));
      vi.advanceTimersByTime(4 * 60_000);
      await toolsOf(binding('a'));
      expect(build).toHaveBeenCalledTimes(1);
      // The clock the sweep reads stays still: only the turn's own timer can drop it.
      vi.advanceTimersByTime(6 * 60_000);
      await toolsOf(binding('a'));
      expect(build).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops a stopped turn', async () => {
    const build = vi.fn(async () => ({ tools }));
    const toolsOf = turnTools(build);
    const abort = new AbortController();
    await toolsOf({ ...binding('a'), signal: abort.signal });
    abort.abort();
    await toolsOf(binding('a'));
    expect(build).toHaveBeenCalledTimes(2);
  });

  it('builds again for a turn resumed after an approval under a new signal, and drops it when that one stops', async () => {
    const build = vi.fn(async () => ({ tools }));
    const toolsOf = turnTools(build);
    await toolsOf(binding('a'));
    const resumed = new AbortController();
    await toolsOf({ ...binding('a'), signal: resumed.signal });
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.lastCall).toEqual([
      expect.objectContaining({ signal: resumed.signal }),
    ]);
    await toolsOf({ ...binding('a'), signal: resumed.signal });
    expect(build).toHaveBeenCalledTimes(2);
    resumed.abort();
    await toolsOf(binding('a'));
    expect(build).toHaveBeenCalledTimes(3);
  });
});
