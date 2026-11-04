import { describe, expect, it, vi } from 'vitest';

import {
  PERMISSION_TOPICS,
  PermissionGeneration,
} from '../../client/lib/permission-generation.ts';

type Snapshot = { unrestricted: boolean; permissions: unknown[] };

function fixture() {
  const invalidated = new Set<() => void>();
  const readies = new Set<() => void>();
  const states = new Set<(state: string) => void>();
  const events = new Map<string, () => void>();
  let current: Snapshot = { unrestricted: false, permissions: [] };
  let failing = false;
  const reads = vi.fn();
  const generation = new PermissionGeneration(
    {
      snapshot: async () => {
        reads();
        if (failing) throw new Error('offline');
        return structuredClone(current);
      },
      onInvalidated: (listener) => {
        invalidated.add(listener);
        return () => invalidated.delete(listener);
      },
    },
    {
      ready: false,
      watch: (topic, { onEvent }) => {
        events.set(topic, onEvent);
        return { close: () => events.delete(topic) };
      },
      onReady: (listener) => {
        readies.add(listener);
        return () => readies.delete(listener);
      },
      onStateChange: (listener) => {
        states.add(listener);
        return () => states.delete(listener);
      },
    },
  );
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return {
    generation,
    events,
    reads,
    settle,
    invalidate: () => [...invalidated].forEach((listener) => listener()),
    ready: () => [...readies].forEach((listener) => listener()),
    state: (state: string) =>
      [...states].forEach((listener) => listener(state)),
    set: (snapshot: Snapshot) => {
      current = snapshot;
    },
    fail: (value: boolean) => {
      failing = value;
    },
  };
}

const admin: Snapshot = { unrestricted: true, permissions: [] };

describe('permission generation', () => {
  it('stays put through the invalidations a new connection and its topics send when nothing changed', async () => {
    const f = fixture();
    f.generation.start();
    await f.settle();
    f.invalidate();
    f.ready();
    f.invalidate();
    f.invalidate();
    await f.settle();
    expect(f.generation.current()).toBe(0);
    // Each invalidation still reads the snapshot: page checks follow it.
    expect(f.reads).toHaveBeenCalledTimes(4);
  });

  it('moves once when the snapshot read after an invalidation differs', async () => {
    const f = fixture();
    const listener = vi.fn();
    f.generation.subscribe(listener);
    f.generation.start();
    await f.settle();
    f.set(admin);
    f.invalidate();
    await f.settle();
    expect(f.generation.current()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
    f.invalidate();
    await f.settle();
    expect(f.generation.current()).toBe(1);
  });

  it('only lets the latest read decide', async () => {
    const f = fixture();
    f.generation.start();
    await f.settle();
    f.set(admin);
    f.invalidate();
    f.set({ unrestricted: false, permissions: [] });
    f.invalidate();
    await f.settle();
    expect(f.generation.current()).toBe(0);
  });

  it('moves on a permission-changed event even when the snapshot reads the same', async () => {
    const f = fixture();
    f.generation.start();
    await f.settle();
    expect([...f.events.keys()]).toEqual([...PERMISSION_TOPICS]);
    for (const topic of PERMISSION_TOPICS) {
      f.events.get(topic)!();
      f.invalidate();
    }
    await f.settle();
    expect(f.generation.current()).toBe(2);
  });

  it('moves when the connection is ready again after a drop, not after the first or a requested connection', async () => {
    const f = fixture();
    f.generation.start();
    await f.settle();
    f.state('connecting');
    f.state('open');
    f.ready();
    f.state('connecting');
    f.state('open');
    f.ready();
    await f.settle();
    expect(f.generation.current()).toBe(0);
    f.state('reconnecting');
    f.state('connecting');
    f.state('open');
    f.ready();
    await f.settle();
    expect(f.generation.current()).toBe(1);
    f.ready();
    await f.settle();
    expect(f.generation.current()).toBe(1);
  });

  it('moves when a snapshot after a known one cannot be read, not when the first read fails', async () => {
    const f = fixture();
    f.fail(true);
    f.generation.start();
    await f.settle();
    expect(f.generation.current()).toBe(0);
    f.fail(false);
    f.invalidate();
    await f.settle();
    expect(f.generation.current()).toBe(0);
    f.fail(true);
    f.invalidate();
    await f.settle();
    expect(f.generation.current()).toBe(1);
  });

  it('stops listening once stopped', async () => {
    const f = fixture();
    const stop = f.generation.start();
    await f.settle();
    stop();
    expect(f.events.size).toBe(0);
    f.set(admin);
    f.invalidate();
    f.state('reconnecting');
    f.ready();
    await f.settle();
    expect(f.generation.current()).toBe(0);
  });

  it("names the authorization plugin's own permission topics", async () => {
    const shared =
      await import('../../node_modules/@nocobase/app-plugin-authorization/dist/shared.js');
    expect(PERMISSION_TOPICS).toEqual([
      shared.AUTHORIZATION_PERMISSIONS_CHANGED_TOPIC,
      shared.AUTHORIZATION_GLOBAL_PERMISSIONS_CHANGED_TOPIC,
    ]);
  });
});
