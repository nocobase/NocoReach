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
  selections: Record<string, Partial<Record<Connection, string>>>;
}
const settingsSchema = z.object({
  mockMigrationVersion: z.literal(1).optional(),
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
        invalid(
          systemMessageText('proxyProfiles.enterUsernameWhenUsingPassword'),
        );
      if (
        profile.url.startsWith('socks5') &&
        [profile.username, profile.password].some(
          (value) => Buffer.byteLength(value, 'utf8') > 255,
        )
      )
        invalid(systemMessageText('proxyProfiles.socks5UsernamesPasswordsNo'));
      s.profiles = [...s.profiles.filter((p) => p.id !== profile.id), profile];
      return profile.id;
    });
    return this.get(id);
  }
  remove(id: string) {
    return this.change((s) => {
      if (!s.profiles.some((p) => p.id === id))
        invalid(
          systemMessageText('connectionNetwork.proxyProfileNotFound'),
          404,
        );
      if (
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
        profileId: z.string().uuid().nullable(),
      })
      .safeParse(input);
    if (!v.success)
      return invalid(
        systemMessageText('proxyProfiles.invalidNetworkConnectionSelection'),
      );
    return this.change((s) => {
      const { connection, profileId } = v.data;
      if (profileId && !s.profiles.some((p) => p.id === profileId))
        invalid(
          systemMessageText('connectionNetwork.proxyProfileNotFound'),
          404,
        );
      if (
        profileId &&
        s.profiles.find((p) => p.id === profileId)?.kind === 'mock' &&
        !this.mockEnabled
      )
        invalid('NR_MOCK_PROFILE_UNAVAILABLE', 409);
      if (
        profileId &&
        ['bilibili', 'xiaohongshu'].includes(connection) &&
        s.profiles.find((profile) => profile.id === profileId)?.kind !== 'mock'
      )
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
    const s = this.read(),
      id = s.selections[projectId(project)]?.[connection];
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
  private rememberPausedContext(state: Settings, id: string) {
    const choices = state.selections[projectId(id)] ?? {};
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
    const choices = state.selections[projectId(id)] ?? {};
    const result: Partial<Record<Connection, NetworkProfile>> = {};
    for (const connection of CONNECTIONS) {
      const profileId = choices[connection];
      if (!profileId) continue;
      const profile = state.profiles.find((item) => item.id === profileId);
      if (!profile)
        invalid(
          systemMessageText('proxyProfiles.selectedProxyNoLongerExists'),
          409,
        );
      result[connection] = freezeProfile(profile!);
    }
    return Object.freeze(result);
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
        if (role !== 'admin')
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
        'selections',
        'select',
        'selectAll',
        'testConnection',
      ],
      'loggedIn',
    );
  }
}
