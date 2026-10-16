type Lane = {
  active: number;
  limit: number;
  waiting: { weight: number; start: () => void }[];
};

// Instance-owned: duplicate report reads share work, but never across projects
// or network scopes. Quota lanes are shared by property, as Google's limits are.
export class Ga4Requests {
  private pending = new Map<string, Promise<unknown>>();
  private lanes = new Map<string, Lane>();

  share<T>(identity: unknown[], operation: () => Promise<T>): Promise<T> {
    const key = JSON.stringify(['report', ...identity]);
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<T>;
    const request = Promise.resolve()
      .then(operation)
      .finally(() => {
        this.pending.delete(key);
      });
    this.pending.set(key, request);
    return request;
  }

  run<T>(
    identity: unknown[],
    property: string,
    method: string,
    body: { requests?: unknown[] },
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = JSON.stringify([...identity, property, method, body]);
    const pending = this.pending.get(key);
    if (pending) return pending as Promise<T>;
    const realtime = method === 'runRealtimeReport';
    const laneKey = JSON.stringify([property, realtime]);
    const lane = this.lanes.get(laneKey) ?? {
      active: 0,
      limit: realtime ? 4 : 5,
      waiting: [],
    };
    this.lanes.set(laneKey, lane);
    // Batch reports each consume concurrency; keep a full batch within five slots.
    const weight = Math.max(
      1,
      Math.min(lane.limit, body.requests?.length ?? 1),
    );
    const ready = new Promise<void>((start) => {
      lane.waiting.push({ weight, start });
    });
    // Register operation in the caller's async context, so queued requests keep
    // their original project transport and simulated-data snapshot.
    const request = ready.then(operation).finally(() => {
      this.pending.delete(key);
      lane.active -= weight;
      this.drain(laneKey, lane);
    });
    this.pending.set(key, request);
    this.drain(laneKey, lane);
    return request;
  }

  private drain(key: string, lane: Lane) {
    while (lane.waiting.length) {
      const next = lane.waiting[0];
      if (lane.active + next.weight > lane.limit) break;
      lane.waiting.shift();
      lane.active += next.weight;
      next.start();
    }
    if (!lane.active && !lane.waiting.length) this.lanes.delete(key);
  }
}
