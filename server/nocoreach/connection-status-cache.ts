type Entry = {
  project: string;
  value?: unknown;
  succeededAt?: number;
  retryAt?: number;
  pending?: Promise<unknown>;
};

/** Application-local, per-identity reads. Callers must authorize before every lookup. */
export class ConnectionStatusCache {
  private readonly entries = new Map<string, Entry>();

  async read<T>(
    project: string,
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T | null> {
    let entry = this.entries.get(key);
    const now = Date.now();
    if (!entry) {
      // Bound memory even when many short-lived sessions visit the page.
      if (this.entries.size >= 5000)
        this.entries.delete(this.entries.keys().next().value!);
      entry = { project };
      this.entries.set(key, entry);
    }
    if (entry.succeededAt !== undefined && now - entry.succeededAt < 600_000)
      return entry.value as T;
    if (
      !entry.pending &&
      (entry.retryAt === undefined || now >= entry.retryAt)
    ) {
      const current = entry;
      current.pending = Promise.resolve()
        .then(fetcher)
        .then(
          (value) => {
            // A mutation can invalidate this entry while its old read is in flight.
            if (this.entries.get(key) === current) {
              current.value = value;
              current.succeededAt = Date.now();
              current.retryAt = undefined;
            }
            return value;
          },
          () => {
            current.retryAt = Date.now() + 30_000;
            return current.value ?? null;
          },
        )
        .finally(() => {
          current.pending = undefined;
        });
    }
    // Expired successful values remain available while one background read runs.
    if (entry.succeededAt !== undefined) return entry.value as T;
    return (entry.pending ? await entry.pending : null) as T | null;
  }

  invalidate(project?: string) {
    for (const [key, entry] of this.entries)
      if (!project || entry.project === project) this.entries.delete(key);
  }

  changed(resource: string, action: string, project?: string) {
    if (!CONNECTION_CHANGES[resource]?.includes(action)) return;
    // Shared credentials and deployment routing can change every project's status.
    const shared =
      (resource === 'nrGoogle' && action === 'configure') ||
      resource === 'nrKeywords' ||
      resource === 'nrProxyProfiles' ||
      resource === 'nrImport';
    this.invalidate(shared ? undefined : project);
  }
}

/** Reads never evict the cache; successful connection changes do, including OAuth and CLI changes. */
const CONNECTION_CHANGES: Record<string, readonly string[]> = {
  nrSources: ['save', 'refresh', 'disconnect'],
  nrAutomaticSources: ['ingest', 'disconnect'],
  nrDiscovery: ['connections'],
  nrGoogle: [
    'configure',
    'callback',
    'select',
    'disconnect',
    'syncNow',
    'syncControl',
  ],
  nrSiteContent: ['confirm', 'remove', 'refresh'],
  nrKeywords: ['configure', 'check', 'setBudget', 'disconnect'],
  nrGitHub: [
    'connect',
    'sync',
    'backfill',
    'setToken',
    'removeToken',
    'disconnect',
  ],
  nrCommunity: ['connect', 'sync', 'disconnect'],
  nrAgent: ['saveDefault', 'saveRepo', 'removeRepo', 'checkRepo'],
  nrPackages: ['add', 'remove', 'sync'],
  nrHackerNews: ['connect', 'sync', 'disconnect'],
  nrReddit: ['connect', 'disconnect', 'check'],
  nrTrends: [
    'connect',
    'disconnect',
    'check',
    'retry',
    'addKeyword',
    'removeKeyword',
    'pick',
  ],
  nrCompetitors: ['add', 'edit', 'remove', 'check'],
  nrX: ['connect', 'disconnect', 'check'],
  nrChat: ['connect', 'disconnect', 'sync'],
  nrXiaohongshu: ['connect', 'test', 'search', 'cancel', 'disconnect', 'clear'],
  nrBilibili: ['connect', 'test', 'sync', 'cancel', 'disconnect', 'clear'],
  nrYouTube: ['connect', 'sync', 'cancel', 'disconnect', 'clear'],
  nrArticles: ['saveTarget', 'removeTarget', 'setDefaultTarget', 'testTarget'],
  nrCollectors: ['save'],
  nrProxyProfiles: ['save', 'remove', 'saveNetwork', 'select', 'selectAll'],
  nrProjects: ['create', 'edit'],
  nrImport: ['begin', 'finish'],
};
