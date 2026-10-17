import { systemMessageText } from '../../shared/i18n/messages.js';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  MOCK_SCENARIOS,
  type MockProjectSettings,
} from '../../app-plugins/nocoreach-mock/server/types.js';
import {
  freezeProfile,
  type NetworkProfile,
  type MockProfile,
} from './profile-routing.js';
import { projectId, requireAccess } from './policy.js';
import type { LegacyApp } from './legacy/app.js';
import type { legacyContext } from './legacy/context.js';
import type { OutboundNetwork } from './outbound-network.js';
import type { LegacyVariables } from './legacy/variables.js';

export const CONNECTIONS = [
  'google',
  'youtube',
  'bilibili',
  'xiaohongshu',
  'dataforseo',
  'github',
  'site',
  'community',
  'packages',
  'hackernews',
  'competitors',
  'x',
  'discord',
  'slack',
] as const;
export type Connection = (typeof CONNECTIONS)[number];
const connectionSchema = z.enum(CONNECTIONS);
/** A project's choice that keeps one connection off the default proxy. */
export const DIRECT = 'direct';
/** Browser collectors use their own host's network and never take a live proxy. */
const COLLECTORS: readonly Connection[] = ['bilibili', 'xiaohongshu'];
const KEY = 'NOREACH_PROXY_PROFILES';
const invalid = (message: string, status = 400): never => {
  throw Object.assign(new Error(message), { status });
};
const proxyUrl = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => {
    try {
      const u = new URL(value);
      return (
        ['http:', 'https:', 'socks5:', 'socks5h:'].includes(u.protocol) &&
        !!u.hostname &&
        !u.username &&
        !u.password &&
        ['', '/'].includes(u.pathname) &&
        u.port !== '0' &&
        !u.search &&
        !u.hash
      );
    } catch {
      return false;
    }
  }, systemMessageText('proxyProfiles.enterHttpHttpsSocks5'));
const proxySaveSchema = z.object({
  kind: z.literal('proxy').optional(),
  id: z.string().uuid().optional(),
  revision: z.number().int().optional(),
  name: z.string().trim().min(1).max(80),
  url: proxyUrl,
  username: z.string().max(256).default(''),
  password: z.string().max(1024).optional(),
  clearAuth: z.boolean().optional(),
});
const mockSettingsSchema = z
  .object({
    scenario: z.enum(MOCK_SCENARIOS).default('normal'),
    seed: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[\p{L}\p{N}_.: -]+$/u),
    clock: z.iso.datetime({ offset: true }),
  })
  .strict();
const mockSaveSchema = z
  .object({
    kind: z.literal('mock'),
    id: z.string().uuid().optional(),
    revision: z.number().int().optional(),
    name: z.string().trim().min(1).max(80),
    mock: mockSettingsSchema,
  })
  .strict();
const saveSchema = z.union([mockSaveSchema, proxySaveSchema]);
// Settings › Network: one proxy for the deployment; an empty address means direct.
const networkSchema = z.object({
  url: z.string().trim().max(2048),
  username: z.string().trim().max(256).default(''),
  password: z.string().max(1024).optional(),
  revision: z.number().int().optional(),
});
export interface ProxyProfile {
  kind?: 'proxy';
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  revision: number;
  updatedAt: string;
}
interface Settings {
  profiles: NetworkProfile[];
  mockMigrationVersion?: 1;
  /** Read-only clock provenance when all upstream routes are paused; never used to route a request. */
  pausedContexts?: Record<string, MockProjectSettings>;
  /** Read-only per-connection clocks survive a pause; never authorize upstream requests. */
  pausedClocks?: Record<string, Partial<Record<Connection, string>>>;
  /** Profile ids, or DIRECT. A connection without a choice uses the default proxy (live deployments only). */
  selections: Record<string, Partial<Record<Connection, string>>>;
  defaultProfileId?: string;
  defaultMigrationVersion?: 1;
}
const settingsSchema = z.object({
  mockMigrationVersion: z.literal(1).optional(),
  defaultProfileId: z.string().uuid().optional(),
  defaultMigrationVersion: z.literal(1).optional(),
  pausedClocks: z
    .record(
      z.string(),
      z.partialRecord(connectionSchema, mockSettingsSchema.shape.clock),
    )
    .optional(),
  pausedContexts: z
    .record(
      z.string(),
      mockSettingsSchema.extend({
        enabled: z.literal(false),
        revision: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  profiles: z.array(
    z.union([
      z.object({
        kind: z.literal('proxy').optional(),
        id: z.string().uuid(),
        name: z.string(),
        url: proxyUrl,
        username: z.string(),
        password: z.string(),
        revision: z.number().int(),
        updatedAt: z.string(),
      }),
      z
        .object({
          kind: z.literal('mock'),
          id: z.string().uuid(),
          name: z.string(),
          revision: z.number().int().positive(),
          updatedAt: z.string(),
          url: z.literal(''),
          username: z.literal(''),
          password: z.literal(''),
          mock: mockSettingsSchema,
        })
        .strict(),
    ]),
  ),
  selections: z.record(
    z.string(),
    z.partialRecord(connectionSchema, z.string()),
  ),
});

// One live proxy with its checks; a blank password keeps the saved one.
function proxyProfile(
  old: ProxyProfile | undefined,
  v: {
    name: string;
    url: string;
    username: string;
    password?: string;
    clearAuth?: boolean;
  },
): ProxyProfile {
  const profile: ProxyProfile = {
    id: old?.id ?? randomUUID(),
    name: v.name,
    // WHATWG URL.origin is "null" for SOCKS schemes.
    url: `${new URL(v.url).protocol}//${new URL(v.url).host}`,
    username: v.clearAuth ? '' : v.username,
    password: v.clearAuth ? '' : v.password || old?.password || '',
    revision: (old?.revision ?? 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  if (profile.password && !profile.username)
    invalid(systemMessageText('proxyProfiles.enterUsernameWhenUsingPassword'));
  if (
    profile.url.startsWith('socks5') &&
    [profile.username, profile.password].some(
      (value) => Buffer.byteLength(value, 'utf8') > 255,
    )
  )
    invalid(systemMessageText('proxyProfiles.socks5UsernamesPasswordsNo'));
  return profile;
}

// Collectors may probe missing URLs, but a broken local configuration must stop the probe.
export class ProxyConfigurationError extends Error {
  readonly code = 'NR_PROXY_CONFIG_UNREADABLE';
  readonly status = 503;
}
export const TEST_TARGETS: Record<Connection, string> = {
  google: 'https://www.googleapis.com/discovery/v1/apis',
  youtube: 'https://www.youtube.com/',
  bilibili: 'https://www.bilibili.com/',
  xiaohongshu: 'https://www.xiaohongshu.com/',
  dataforseo: 'https://api.dataforseo.com/',
  github: 'https://api.github.com/',
  site: 'https://example.com/',
  community: 'https://www.discourse.org/',
  packages: 'https://registry.npmjs.org/',
  hackernews: 'https://hn.algolia.com/api',
  competitors: 'https://example.com/',
  x: 'https://api.x.com/',
  discord: 'https://discord.com/api/v10/gateway',
  slack: 'https://slack.com/api/api.test',
};

/** One encrypted application-owned setting. Writes are serialized because Studio hosts one instance. */
export class ProxyProfiles {
  private writes: Promise<unknown> = Promise.resolve();
  private mockEnabled = false;
  /** Called by the owning instance's transport; never derived from client input. */
  enableMockProfiles(enabled: boolean) {
    this.mockEnabled = enabled;
  }
  capabilities() {
    return { mockEnabled: this.mockEnabled, scenarios: MOCK_SCENARIOS };
  }
  constructor(
    private variables: Pick<LegacyVariables, 'all' | 'set'> &
      Partial<Pick<LegacyVariables, 'cannotRead'>>,
  ) {}
  private read(): Settings {
    if (this.variables.cannotRead?.(KEY))
      throw new ProxyConfigurationError(
        systemMessageText('proxyProfiles.proxySettingsNotDecryptedRestore'),
      );
    const raw = this.variables.all()[KEY];
    if (!raw) return { profiles: [], selections: {} };
    try {
      return settingsSchema.parse(JSON.parse(raw));
    } catch {
      throw new ProxyConfigurationError(
        systemMessageText('proxyProfiles.proxySettingsNotReadContact'),
      );
    }
  }
  private change<T>(fn: (s: Settings) => T): Promise<T> {
    const task = this.writes.then(async () => {
      const s = this.read();
      const result = fn(s);
      await this.variables.set(KEY, JSON.stringify(s), true);
      return result;
    });
    this.writes = task.catch(() => undefined);
    return task;
  }
  list() {
    const s = this.read();
    return s.profiles.map(({ password, ...p }) => ({
      ...p,
      hasPassword: !!password,
      references: Object.values(s.selections).reduce(
        (n, choices) =>
          n + Object.values(choices).filter((id) => id === p.id).length,
        0,
      ),
      referenceDetails: Object.entries(s.selections).flatMap(
        ([projectId, choices]) =>
          CONNECTIONS.filter((connection) => choices[connection] === p.id).map(
            (connection) => ({ projectId, connection }),
          ),
      ),
    }));
  }
  get(id: string) {
    return (
      this.list().find((p) => p.id === id) ??
      invalid(systemMessageText('connectionNetwork.proxyProfileNotFound'), 404)
    );
  }
  async save(input: unknown) {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success)
      return invalid(
        parsed.error.issues[0]?.message ||
          systemMessageText('proxyProfiles.invalidProxySettings'),
      );
    const v = parsed.data;
    if (v.kind === 'mock' && !this.mockEnabled)
      return invalid('NR_MOCK_PROFILE_UNAVAILABLE', 409);
    const id = await this.change((s) => {
      const old = v.id ? s.profiles.find((p) => p.id === v.id) : undefined;
      if (v.id && !old)
        invalid(
          systemMessageText('connectionNetwork.proxyProfileNotFound'),
          404,
        );
      if (old && v.revision !== old.revision)
        invalid(
          systemMessageText('proxyProfiles.profileChangedReopenBeforeEditing'),
          409,
        );
      if (!old && s.profiles.length >= 50)
        invalid(systemMessageText('proxyProfiles.addUp50ProxyProfiles'));
      if (s.profiles.some((p) => p.id !== v.id && p.name === v.name))
        invalid(
          systemMessageText('proxyProfiles.nameAlreadyUsedChooseAnother'),
          409,
        );
      // Never turn a referenced mock profile into a live proxy (or vice versa).
      if (old && (old.kind ?? 'proxy') !== (v.kind ?? 'proxy'))
        invalid('NR_PROFILE_KIND_IMMUTABLE', 409);
      if (v.kind === 'mock') {
        const profile: MockProfile = {
          kind: 'mock',
          id: old?.id ?? randomUUID(),
          name: v.name,
          revision: (old?.revision ?? 0) + 1,
          updatedAt: new Date().toISOString(),
          url: '',
          username: '',
          password: '',
          mock: { ...v.mock, clock: new Date(v.mock.clock).toISOString() },
        };
        s.profiles = [
          ...s.profiles.filter((p) => p.id !== profile.id),
          profile,
        ];
        return profile.id;
      }
      const profile = proxyProfile(old as ProxyProfile | undefined, v);
      s.profiles = [...s.profiles.filter((p) => p.id !== profile.id), profile];
      return profile.id;
    });
    return this.get(id);
  }
  /** Settings › Network: the deployment's one proxy, or null for direct. Mock deployments manage profiles instead. */
  network() {
    const s = this.read();
    const p = s.profiles.find((x) => x.id === s.defaultProfileId);
    return {
      proxy:
        p && p.kind !== 'mock'
          ? {
              id: p.id,
              url: p.url,
              username: p.username,
              hasPassword: !!p.password,
              revision: p.revision,
            }
          : null,
    };
  }
  async saveNetwork(input: unknown) {
    if (this.mockEnabled) return invalid('NR_MOCK_PROFILE_REQUIRED', 409);
    const parsed = networkSchema.safeParse(input);
    if (!parsed.success)
      return invalid(systemMessageText('proxyProfiles.invalidProxySettings'));
    const v = parsed.data;
    if (v.url && !proxyUrl.safeParse(v.url).success)
      return invalid(systemMessageText('proxyProfiles.enterHttpHttpsSocks5'));
    await this.change((s) => {
      const old = s.profiles.find(
        (p): p is ProxyProfile =>
          p.id === s.defaultProfileId && p.kind !== 'mock',
      );
      if (old && v.revision !== old.revision)
        invalid(
          systemMessageText('proxyProfiles.profileChangedReopenBeforeEditing'),
          409,
        );
      if (!v.url) {
        delete s.defaultProfileId;
        // A proxy a project still names keeps its credentials; otherwise they go with it.
        if (
          old &&
          !Object.values(s.selections).some((c) =>
            Object.values(c).includes(old.id),
          )
        )
          s.profiles = s.profiles.filter((p) => p.id !== old.id);
        return;
      }
      if (!old && s.profiles.length >= 50)
        invalid(systemMessageText('proxyProfiles.addUp50ProxyProfiles'));
      const base = systemMessageText('proxyProfiles.defaultProxyName');
      let name = old?.name ?? base;
      for (let n = 2; !old && s.profiles.some((p) => p.name === name); n++)
        name = `${base} ${n}`;
      const profile = proxyProfile(old, {
        name,
        url: v.url,
        username: v.username,
        password: v.password,
        // No username and no password: the proxy needs no authentication.
        clearAuth: !v.username && !v.password,
      });
      s.profiles = [...s.profiles.filter((p) => p.id !== profile.id), profile];
      s.defaultProfileId = profile.id;
    });
    return this.network();
  }
  remove(id: string) {
    return this.change((s) => {
      if (!s.profiles.some((p) => p.id === id))
        invalid(
          systemMessageText('connectionNetwork.proxyProfileNotFound'),
          404,
        );
      if (
        s.defaultProfileId === id ||
        Object.values(s.selections).some((choices) =>
          Object.values(choices).includes(id),
        )
      )
        invalid(
          systemMessageText(
            'proxyProfiles.profileUseChangeConnectionsReference',
          ),
          409,
        );
      s.profiles = s.profiles.filter((p) => p.id !== id);
      return { removed: true };
    });
  }
  selections(id: string) {
    return this.read().selections[projectId(id)] ?? {};
  }
  async select(id: string, input: unknown) {
    const v = z
      .object({
        connection: connectionSchema,
        profileId: z.union([z.string().uuid(), z.literal(DIRECT)]).nullable(),
      })
      .safeParse(input);
    if (!v.success)
      return invalid(
        systemMessageText('proxyProfiles.invalidNetworkConnectionSelection'),
      );
    return this.change((s) => {
      const { connection, profileId } = v.data;
      // Mock deployments have no default proxy to turn off; an empty choice already pauses.
      if (profileId === DIRECT && this.mockEnabled)
        invalid('NR_MOCK_PROFILE_REQUIRED', 409);
      const profile =
        profileId && profileId !== DIRECT
          ? s.profiles.find((p) => p.id === profileId)
          : undefined;
      if (profileId && profileId !== DIRECT && !profile)
        invalid(
          systemMessageText('connectionNetwork.proxyProfileNotFound'),
          404,
        );
      if (profile?.kind === 'mock' && !this.mockEnabled)
        invalid('NR_MOCK_PROFILE_UNAVAILABLE', 409);
      if (profile && COLLECTORS.includes(connection) && profile.kind !== 'mock')
        invalid('NR_COLLECTOR_PROXY_UNSUPPORTED', 409);
      const choices = (s.selections[projectId(id)] ??= {});
      if (!profileId) this.rememberPausedContext(s, id);
      if (profileId) choices[connection] = profileId;
      else delete choices[connection];
      return { ...choices };
    });
  }
  /** Atomic project-wide mock selection, not a second global routing override. */
  selectAll(id: string, input: unknown) {
    const parsed = z
      .object({ profileId: z.string().uuid().nullable() })
      .safeParse(input);
    if (!parsed.success) return invalid('NR_INVALID_PROFILE_SELECTION');
    return this.change((state) => {
      if (!this.mockEnabled) return invalid('NR_MOCK_PROFILE_UNAVAILABLE', 409);
      const profile = state.profiles.find(
        (item) => item.id === parsed.data.profileId,
      );
      if (parsed.data.profileId && profile?.kind !== 'mock')
        return invalid('NR_MOCK_PROFILE_REQUIRED', 409);
      if (!parsed.data.profileId) this.rememberPausedContext(state, id);
      state.selections[projectId(id)] = parsed.data.profileId
        ? Object.fromEntries(
            CONNECTIONS.map((connection) => [
              connection,
              parsed.data.profileId!,
            ]),
          )
        : {};
      return { ...state.selections[projectId(id)] };
    });
  }
  resolve(project: string, connection: Connection): NetworkProfile | undefined {
    return this.route(this.read(), project, connection);
  }
  // The project's choice for the connection; without one, the default proxy. Mock deployments never take the
  // default (an empty choice pauses there), and collectors never take a live proxy.
  private route(s: Settings, project: string, connection: Connection) {
    const choice = s.selections[projectId(project)]?.[connection];
    const id =
      choice === DIRECT
        ? undefined
        : (choice ??
          (this.mockEnabled || COLLECTORS.includes(connection)
            ? undefined
            : s.defaultProfileId));
    return id
      ? (s.profiles.find((p) => p.id === id) ??
          invalid(
            systemMessageText('proxyProfiles.selectedProxyNoLongerExists'),
            409,
          ))
      : undefined;
  }
  /** Capture every connection in one read; no credentials are persisted in job snapshots. */
  mockStatus(
    project: string,
    legacy: MockProjectSettings,
  ): MockProjectSettings {
    const profiles = this.snapshot(project);
    const profile = CONNECTIONS.map((connection) => profiles[connection]).find(
      (value): value is MockProfile => value?.kind === 'mock',
    );
    // This is only the legacy status/business-clock view. Each request still resolves its own connection.
    return profile
      ? { enabled: true, ...profile.mock, revision: profile.revision }
      : {
          ...(this.read().pausedContexts?.[project] ?? legacy),
          enabled: false,
        };
  }
  pausedClock(project: string, connection: Connection): string | undefined {
    const state = this.read();
    return (
      state.pausedClocks?.[projectId(project)]?.[connection] ??
      state.pausedContexts?.[project]?.clock
    );
  }
  private rememberPausedContext(state: Settings, id: string) {
    const choices = state.selections[projectId(id)] ?? {};
    for (const connection of CONNECTIONS) {
      const selected = state.profiles.find(
        (item) => item.id === choices[connection],
      );
      if (selected?.kind === 'mock')
        ((state.pausedClocks ??= {})[id] ??= {})[connection] =
          selected.mock.clock;
    }
    const profile = CONNECTIONS.map((connection) =>
      state.profiles.find((item) => item.id === choices[connection]),
    ).find((value): value is MockProfile => value?.kind === 'mock');
    if (profile)
      (state.pausedContexts ??= {})[id] = {
        enabled: false,
        ...profile.mock,
        revision: profile.revision,
      };
  }
  snapshot(id: string): Readonly<Partial<Record<Connection, NetworkProfile>>> {
    const state = this.read();
    const result: Partial<Record<Connection, NetworkProfile>> = {};
    for (const connection of CONNECTIONS) {
      const profile = this.route(state, id, connection);
      if (profile) result[connection] = freezeProfile(profile);
    }
    return Object.freeze(result);
  }
  /**
   * One-time move to the default proxy, in live deployments: the most used live proxy becomes the default and
   * every connection keeps its route (one that had none is marked direct). Returns the connections that were on a
   * different proxy and now use the default.
   */
  async migrateDefaultProxy(projectIds: () => Promise<string[]>) {
    // Without saved settings there is nothing to move, and writing them would make a fresh application look used
    // (the classic import only fills an empty one).
    if (
      this.mockEnabled ||
      !this.variables.all()[KEY] ||
      this.read().defaultMigrationVersion === 1
    )
      return [];
    const live = (s: Settings) =>
      new Map(
        s.profiles
          .filter((p): p is ProxyProfile => p.kind !== 'mock')
          .map((p) => [p.id, p]),
      );
    const before = this.read();
    const used = Object.values(before.selections).some((c) =>
      Object.values(c).some((id) => live(before).has(id)),
    );
    const ids = used ? (await projectIds()).map(String) : [];
    return this.change((s) => {
      const moved: {
        projectId: string;
        connection: Connection;
        from: string;
      }[] = [];
      if (s.defaultMigrationVersion === 1) return moved;
      s.defaultMigrationVersion = 1;
      const proxies = live(s),
        uses = new Map<string, number>();
      for (const choices of Object.values(s.selections))
        for (const id of Object.values(choices))
          if (id && proxies.has(id)) uses.set(id, (uses.get(id) ?? 0) + 1);
      const best = [...uses].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!best || s.defaultProfileId) return moved;
      s.defaultProfileId = best;
      for (const project of new Set([...ids, ...Object.keys(s.selections)])) {
        const choices = (s.selections[project] ??= {});
        for (const connection of CONNECTIONS) {
          if (COLLECTORS.includes(connection)) continue;
          const id = choices[connection];
          if (!id) choices[connection] = DIRECT;
          else if (id === best) delete choices[connection];
          else if (proxies.has(id)) {
            moved.push({
              projectId: project,
              connection,
              from: proxies.get(id)!.name,
            });
            delete choices[connection];
          }
        }
      }
      return moved;
    });
  }
  /** One-time conversion after the permanent dataset guard. Existing real proxies are retained. */
  async migrateMockSettings() {
    if (!this.mockEnabled) return;
    return this.change((state) => {
      if (state.mockMigrationVersion === 1) return;
      const legacy = this.legacyMockSettings();
      for (const [id, settings] of Object.entries(legacy)) {
        if (!settings.enabled) {
          // The old disabled state blocked requests, even when a proxy was selected.
          state.selections[id] = {};
          continue;
        }
        this.addLegacyMockProfile(state, id, settings);
      }
      state.mockMigrationVersion = 1;
    });
  }
  /** Used only by the explicit application-owned demo initializer, never by request routing. */
  async initializeMockProject(id: string, defaults?: MockProfile['mock']) {
    if (!this.mockEnabled) return;
    id = projectId(id);
    return this.change((state) => {
      if (Object.prototype.hasOwnProperty.call(state.selections, id)) return;
      const settings = defaults ?? this.legacyMockSettings()[id];
      if (defaults || (settings && 'enabled' in settings && settings.enabled))
        this.addLegacyMockProfile(state, id, settings);
    });
  }
  private legacyMockSettings() {
    const key = 'NOREACH_MOCK_SETTINGS';
    if (this.variables.cannotRead?.(key))
      throw new ProxyConfigurationError('NR_MOCK_CONFIG_UNREADABLE');
    try {
      return z
        .record(
          z.string().regex(/^[1-9]\d{0,15}$/),
          mockSettingsSchema.extend({
            enabled: z.boolean(),
            revision: z.number().int().nonnegative(),
          }),
        )
        .parse(JSON.parse(this.variables.all()[key] || '{}'));
    } catch {
      throw new ProxyConfigurationError('NR_MOCK_CONFIG_UNREADABLE');
    }
  }
  private addLegacyMockProfile(
    state: Settings,
    id: string,
    settings: {
      scenario: MockProfile['mock']['scenario'];
      seed: string;
      clock: string;
    },
  ) {
    const profileId = randomUUID();
    // Migration may exceed the interactive creation cap; never drop an existing project's data.
    const profile: MockProfile = {
      kind: 'mock',
      id: profileId,
      name: `Mock ${id} (${profileId.slice(0, 8)})`,
      revision: 1,
      updatedAt: new Date().toISOString(),
      url: '',
      username: '',
      password: '',
      mock: {
        scenario: settings.scenario,
        seed: settings.seed,
        clock: settings.clock,
      },
    };
    state.profiles.push(profile);
    state.selections[id] = Object.fromEntries(
      CONNECTIONS.map((connection) => [connection, profileId]),
    );
  }
  profile(id: string) {
    return (
      this.read().profiles.find((p) => p.id === id) ??
      invalid(systemMessageText('connectionNetwork.proxyProfileNotFound'), 404)
    );
  }
  register(p: {
    app: Pick<LegacyApp, 'resourceManager' | 'acl'>;
    project: (id: string) => Promise<unknown>;
    network: OutboundNetwork;
  }) {
    const wrap =
      (fn: (v: Record<string, unknown>) => unknown) =>
      async (
        ctx: ReturnType<typeof legacyContext>,
        next: () => Promise<void>,
      ) => {
        const role: unknown = await requireAccess(ctx);
        if (!(ctx.db || ctx.app?.db)?.access && role !== 'admin')
          ctx.throw(
            403,
            systemMessageText(
              'proxyProfiles.administratorsManageNetworkConnections',
            ),
          );
        ctx.set('Cache-Control', 'no-store');
        const v = (ctx.action.params.values || {}) as Record<string, unknown>;
        ctx.body = await fn(v);
        await next();
      };
    const inProject = (
      fn: (id: string, v: Record<string, unknown>) => unknown,
    ) =>
      wrap(async (v) => {
        const id = projectId(v.projectId);
        await p.project(id);
        return fn(id, v);
      });
    p.app.resourceManager.define({
      name: 'nrProxyProfiles',
      actions: {
        list: wrap(() => this.list()),
        capabilities: wrap(() => this.capabilities()),
        get: wrap((v) => this.get(String(v.id))),
        save: wrap((v) => this.save(v)),
        remove: wrap((v) => this.remove(String(v.id))),
        test: wrap((v) => p.network.test(this.profile(String(v.id)), 'site')),
        network: wrap(() => this.network()),
        saveNetwork: wrap((v) => this.saveNetwork(v)),
        selections: inProject((id) => this.selections(id)),
        select: inProject((id, v) => this.select(id, v)),
        selectAll: inProject((id, v) => this.selectAll(id, v)),
        testConnection: inProject((id, v) => {
          const c = connectionSchema.safeParse(v.connection);
          if (!c.success) invalid('接入类型无效');
          return p.network.run(id, () =>
            p.network.test(this.resolve(id, c.data!), c.data!),
          );
        }),
      },
    });
    p.app.acl.allow(
      'nrProxyProfiles',
      [
        'list',
        'capabilities',
        'get',
        'save',
        'remove',
        'test',
        'network',
        'saveNetwork',
        'selections',
        'select',
        'selectAll',
        'testConnection',
      ],
      'loggedIn',
    );
  }
}
