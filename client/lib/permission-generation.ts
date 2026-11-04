// The authorization plugin's realtime topics (its `shared.js`, which the package does not export);
// tests/components/permission-generation.test.tsx checks them against the installed plugin.
export const PERMISSION_TOPICS = [
  'authorization:permissions-changed',
  'authorization:permissions-changed:global',
] as const;

export interface PermissionSnapshots {
  snapshot(): Promise<unknown>;
  onInvalidated(listener: () => void): () => void;
}

export interface PermissionRealtime {
  readonly ready: boolean;
  watch(topic: string, options: { onEvent: () => void }): { close(): void };
  onReady(listener: () => void): () => void;
  onStateChange(listener: (state: string) => void): () => void;
}

/**
 * Which permissions the session's page state was built on. The authorization plugin invalidates its snapshot whenever
 * the realtime connection opens and whenever its permission topics become ready, not only when permissions change;
 * keying the shell on that revision rebuilt it, and sent every one of its requests again, two or three times on each
 * full page load. This value moves only when permissions may have changed:
 *
 * - a permission-changed event arrives;
 * - the connection is ready again after it dropped, as events sent while it was down are lost;
 * - a snapshot read after any other invalidation differs from the one before it, or cannot be read.
 *
 * Read checks (`can`) still follow every invalidation; only the state that is thrown away waits for a change.
 */
export class PermissionGeneration {
  private value = 0;
  private fingerprint: string | undefined;
  private reads = 0;
  private ready = false;
  private dropped = false;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly snapshots: PermissionSnapshots,
    private readonly realtime: PermissionRealtime,
  ) {}

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly current = (): number => this.value;

  start(): () => void {
    this.ready = this.realtime.ready;
    const stops = [
      this.snapshots.onInvalidated(() => void this.read()),
      ...PERMISSION_TOPICS.map((topic) => {
        const watch = this.realtime.watch(topic, {
          onEvent: () => this.change(),
        });
        return () => watch.close();
      }),
      this.realtime.onStateChange((state) => {
        if (this.ready && (state === 'reconnecting' || state === 'closed'))
          this.dropped = true;
      }),
      this.realtime.onReady(() => {
        this.ready = true;
        if (!this.dropped) return;
        this.dropped = false;
        this.change();
      }),
    ];
    void this.read();
    return () => {
      for (const stop of stops) stop();
    };
  }

  private change(): void {
    // The next read only records the snapshot the new state is built on.
    this.fingerprint = undefined;
    this.advance();
    void this.read();
  }

  private advance(): void {
    this.value += 1;
    for (const listener of [...this.listeners]) listener();
  }

  private async read(): Promise<void> {
    const read = ++this.reads;
    let fingerprint: string | null;
    try {
      fingerprint = JSON.stringify(await this.snapshots.snapshot());
    } catch {
      fingerprint = null;
    }
    // A later invalidation's read decides.
    if (read !== this.reads) return;
    const previous = this.fingerprint;
    this.fingerprint = fingerprint ?? undefined;
    // An unreadable snapshot can no longer vouch for state built on a known one.
    if (previous !== undefined && previous !== fingerprint) this.advance();
  }
}
