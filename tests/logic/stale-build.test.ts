import { describe, expect, it, vi } from 'vitest';

import { reloadOnStaleBuild } from '../../client/lib/stale-build';

function fakeWindow(storageAvailable = true) {
  const target = new EventTarget();
  const values = new Map<string, string>();
  const sessionStorage = !storageAvailable
    ? new Proxy({} as Storage, {
        get() {
          throw new DOMException('denied', 'SecurityError');
        },
      })
    : ({
        getItem: (k: string) => values.get(k) ?? null,
        setItem: (k: string, v: string) => void values.set(k, v),
      } as unknown as Storage);
  const reload = vi.fn();
  return {
    win: {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      sessionStorage,
      location: { reload },
    } as unknown as Parameters<typeof reloadOnStaleBuild>[0],
    fire: () => {
      const event = new Event('vite:preloadError', { cancelable: true });
      target.dispatchEvent(event);
      return event;
    },
    reload,
  };
}

describe('reload on a stale build', () => {
  it('reloads once when a page file of the previous build is gone, and not again within a minute', () => {
    let clock = 1_000_000;
    const { win, fire, reload } = fakeWindow();
    reloadOnStaleBuild(win, () => clock);

    const first = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);

    clock += 30_000;
    const again = fire();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(again.defaultPrevented).toBe(false);

    clock += 31_000;
    fire();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('leaves the error to the page when session storage is unavailable', () => {
    const { win, fire, reload } = fakeWindow(false);
    reloadOnStaleBuild(win);
    expect(fire().defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('stops listening when disconnected', () => {
    const { win, fire, reload } = fakeWindow();
    reloadOnStaleBuild(win)();
    fire();
    expect(reload).not.toHaveBeenCalled();
  });
});
