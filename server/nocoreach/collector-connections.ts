import { z } from 'zod';
import { systemMessageText } from '../../shared/i18n/messages.js';
import {
  browserCollectorSchema,
  parseBrowserCollectors,
  type BrowserCollectorConfig,
} from './browser-collector-config.js';
import { projectId, requireAccess } from './policy.js';
import type { LegacyVariables } from './legacy/variables.js';
import type { LegacyDatabase } from './legacy/database.js';
import type { LegacyApp } from './legacy/app.js';
import type { LegacyContext } from './legacy/context.js';

const platformSchema = z.enum(['xiaohongshu', 'bilibili', 'youtube']);
export type CollectorPlatform = z.infer<typeof platformSchema>;
export type CollectorResolver = Pick<CollectorConnections, 'allowed'>;
export type ResolvedCollector = BrowserCollectorConfig & {
  nameKey?: 'collectorConnection.projectSource';
};
const storedSchema = z.object({
  revision: z.number().int().positive(),
  url: browserCollectorSchema.shape.url,
  token: browserCollectorSchema.shape.token,
});
type Source = {
  isCollectorBusy(id: string): boolean;
  resetCollector(id: string, collectorId: string): Promise<void>;
};
type SourceMethod =
  'connect' | 'test' | 'search' | 'sync' | 'disconnect' | 'clear';
function fail(key: string, status = 400): never {
  throw Object.assign(new Error(`collectorConnection.${key}`), { status });
}
export function isCollectorConnectionError(
  error: unknown,
  key: 'unreadable' | 'activeRun',
) {
  return (
    error instanceof Error &&
    error.message === `collectorConnection.${key}` &&
    'status' in error &&
    error.status === (key === 'unreadable' ? 503 : 409)
  );
}

/** Project-owned credentials. Reservations fence writes against foreground and scheduled work. */
export class CollectorConnections {
  private readonly deployed: BrowserCollectorConfig[];
  private readonly saving = new Set<string>();
  private readonly readers = new Map<string, number>();
  private readonly sources = new Map<CollectorPlatform, Source>();
  constructor(
    private readonly variables: LegacyVariables,
    private readonly db: LegacyDatabase,
    deployed: unknown,
    private readonly mock = false,
  ) {
    this.deployed = parseBrowserCollectors(deployed);
  }
  private key(id: string, platform: CollectorPlatform) {
    return `NOREACH_COLLECTOR_${platform}_${projectId(id)}`;
  }
  private stored(id: string, platform: CollectorPlatform) {
    const key = this.key(id, platform);
    if (this.mock) return null;
    if (this.variables.cannotRead(key)) fail('unreadable', 503);
    const raw = this.variables.get(key);
    if (!raw) return null;
    try {
      return storedSchema.parse(JSON.parse(raw));
    } catch {
      return fail('unreadable', 503);
    }
  }
  private deployment(id: string, platform: CollectorPlatform) {
    return this.deployed.filter(
      (c) =>
        c.platforms.includes(platform) &&
        (!c.projectIds || c.projectIds.includes(id)),
    );
  }
  allowed(id: string, platform: CollectorPlatform): ResolvedCollector[] {
    const stored = this.stored(id, platform);
    return stored
      ? [
          {
            id: `project-${platform}-${id}`,
            name: systemMessageText('collectorConnection.projectSource'),
            nameKey: 'collectorConnection.projectSource',
            url: stored.url,
            token: stored.token,
            platforms: [platform],
            projectIds: [id],
          },
        ]
      : this.deployment(id, platform);
  }
  status(id: string, platform: CollectorPlatform) {
    const stored = this.stored(id, platform);
    return {
      revision: stored?.revision ?? 0,
      source: this.mock
        ? 'mock'
        : stored
          ? 'project'
          : this.deployment(id, platform).length
            ? 'deployment'
            : 'none',
      url: stored?.url ?? '',
      hasToken: Boolean(stored?.token),
    };
  }
  attach<T extends Source>(
    platform: CollectorPlatform,
    source: T,
    methods: (keyof T & SourceMethod)[],
  ) {
    this.sources.set(platform, source);
    for (const name of methods) {
      const original = source[name] as (
        id: string,
        ...args: unknown[]
      ) => Promise<unknown>;
      const wrapped = async (id: string, ...args: unknown[]) => {
        const key = this.key(id, platform);
        if (this.saving.has(key)) fail('activeRun', 409);
        this.readers.set(key, (this.readers.get(key) ?? 0) + 1);
        try {
          return await original.call(source, id, ...args);
        } finally {
          const count = (this.readers.get(key) ?? 1) - 1;
          if (count) this.readers.set(key, count);
          else this.readers.delete(key);
        }
      };
      source[name] = wrapped as T[typeof name];
    }
  }
  async save(
    id: string,
    platform: CollectorPlatform,
    values: Record<string, unknown>,
  ) {
    const key = this.key(id, platform);
    if (this.mock) fail('mockSource', 409);
    const source = this.sources.get(platform);
    if (!source) fail('saveFailed', 503);
    if (
      this.saving.has(key) ||
      this.readers.has(key) ||
      source.isCollectorBusy(id)
    )
      fail('activeRun', 409);
    // Reserve before the first await, including the transaction's connection acquisition.
    this.saving.add(key);
    try {
      await this.db.sequelize.transaction(async () => {
        const old = this.stored(id, platform);
        if (values.revision !== (old?.revision ?? 0)) fail('stale', 409);
        const url =
          typeof values.url === 'string'
            ? values.url.trim().replace(/\/$/, '')
            : '';
        if (
          !browserCollectorSchema.shape.url.safeParse(url).success ||
          url.length > 2048
        )
          fail('invalidUrl');
        if (values.token !== undefined && typeof values.token !== 'string')
          fail('invalidToken');
        const provided = typeof values.token === 'string' ? values.token : '';
        if (!provided && old?.url !== url)
          fail(old ? 'tokenForNewUrl' : 'tokenRequired');
        const token = provided || old?.token || '';
        if (!browserCollectorSchema.shape.token.safeParse(token).success)
          fail('invalidToken');
        if (old?.url === url && old.token === token) return;
        await this.variables.set(
          key,
          JSON.stringify({ revision: (old?.revision ?? 0) + 1, url, token }),
          true,
        );
        await source.resetCollector(id, `project-${platform}-${id}`);
      });
      return this.status(id, platform);
    } finally {
      this.saving.delete(key);
    }
  }
  register(p: { app: LegacyApp; project(id: string): Promise<unknown> }) {
    const wrap =
      (write: boolean) =>
      async (ctx: LegacyContext, next: () => Promise<void>) => {
        const role: unknown = await requireAccess(ctx);
        if (role !== 'admin') fail('noPermission', 403);
        if (write && ctx.method !== 'POST') fail('saveFailed', 405);
        ctx.set('Cache-Control', 'no-store');
        const values = (ctx.action.params.values ?? {}) as Record<
          string,
          unknown
        >;
        const id = projectId(values.projectId);
        const parsed = platformSchema.safeParse(values.platform);
        if (!parsed.success) fail('invalidPlatform');
        await p.project(id);
        ctx.body = write
          ? await this.save(id, parsed.data, values)
          : this.status(id, parsed.data);
        await next();
      };
    p.app.resourceManager.define({
      name: 'nrCollectors',
      actions: { status: wrap(false), save: wrap(true) },
    });
    p.app.acl.allow('nrCollectors', ['status', 'save'], 'loggedIn');
  }
}
