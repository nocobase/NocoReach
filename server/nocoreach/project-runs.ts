import { AsyncLocalStorage } from 'node:async_hooks';

type Job = {
  key: string;
  work: () => Promise<unknown>;
  promise: Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
};
type Run = {
  id: string;
  cancelled: boolean;
  jobs: Job[];
  current?: Job;
  promise: Promise<void>;
};

/** Project ownership is independent of the source's bounded outbound request lane. */
export class ProjectRuns {
  private readonly active = new Map<string, Run>();
  private readonly context = new AsyncLocalStorage<Run>();
  private closed = false;
  private requestTail: Promise<unknown> = Promise.resolve();

  has(id: string): boolean {
    const run = this.active.get(String(id));
    return Boolean(run && !run.cancelled);
  }

  assertActive(): void {
    if (this.closed || this.context.getStore()?.cancelled) {
      throw Object.assign(new Error('Source run cancelled'), {
        name: 'AbortError',
        status: 409,
      });
    }
  }

  /** Keep at most one upstream operation in flight per source, including connection probes. */
  request<T>(work: () => Promise<T>): Promise<T> {
    const request = this.requestTail
      .catch(() => undefined)
      .then(async () => {
        this.assertActive();
        const value = await work();
        return value;
      });
    this.requestTail = request.catch(() => undefined);
    return request;
  }

  run<T>(id: string, work: () => Promise<T>, key = 'default'): Promise<T> {
    id = String(id);
    try {
      this.assertActive();
    } catch (error) {
      return Promise.reject(
        error instanceof Error ? error : new Error(String(error)),
      );
    }
    const current = this.context.getStore();
    if (current?.id === id && this.active.get(id) === current) return work();
    let run = this.active.get(id);
    if (run?.cancelled)
      return Promise.reject(
        Object.assign(new Error('Source run cancelled'), {
          name: 'AbortError',
          status: 409,
        }),
      );
    const existing =
      run?.current?.key === key
        ? run.current
        : run?.jobs.find((job) => job.key === key);
    if (existing) return existing.promise as Promise<T>;
    const fresh = !run;
    if (!run) {
      run = { id, cancelled: false, jobs: [], promise: Promise.resolve() };
      this.active.set(id, run);
    }
    const promise = new Promise<unknown>((resolve, reject) => {
      run.jobs.push({ key, work, resolve, reject, promise: undefined! });
    });
    run.jobs.at(-1)!.promise = promise;
    if (fresh) {
      const owner = run;
      owner.promise = Promise.resolve().then(() =>
        this.context.run(owner, async () => {
          while (owner.jobs.length) {
            const job = owner.jobs.shift()!;
            owner.current = job;
            try {
              this.assertActive();
              const value = await job.work();
              this.assertActive();
              job.resolve(value);
            } catch (error) {
              job.reject(error);
            } finally {
              owner.current = undefined;
            }
          }
          this.active.delete(id);
        }),
      );
    }
    return promise as Promise<T>;
  }

  /** Keep one follow-up per operation when configuration changes during a run. */
  start(id: string, work: () => Promise<unknown>, key = 'default'): void {
    const run = this.active.get(String(id));
    const followup = run?.current?.key === key ? `${key}:followup` : key;
    void this.run(id, work, followup).catch(() => undefined);
  }

  wait(id: string): Promise<unknown> {
    return this.active.get(String(id))?.promise ?? Promise.resolve();
  }

  async cancel(id: string): Promise<void> {
    const run = this.active.get(String(id));
    if (!run) return;
    run.cancelled = true;
    await run.promise;
  }

  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([...this.active.keys()].map((id) => this.cancel(id)));
    await this.requestTail;
  }
}
