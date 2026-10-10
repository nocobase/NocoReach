import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { projectId, requireAccess } from './policy.js';
import type { LegacyApp } from './legacy/app.js';
import type { legacyContext } from './legacy/context.js';
import type { OutboundNetwork } from './outbound-network.js';
import type { LegacyVariables } from './legacy/variables.js';

export const CONNECTIONS = [
  'google',
  'youtube',
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
  }, '请输入 HTTP、HTTPS、SOCKS5 或 SOCKS5H 代理地址，不要在地址中包含账号密码');
const saveSchema = z.object({
  id: z.string().uuid().optional(),
  revision: z.number().int().optional(),
  name: z.string().trim().min(1).max(80),
  url: proxyUrl,
  username: z.string().max(256).default(''),
  password: z.string().max(1024).optional(),
  clearAuth: z.boolean().optional(),
});
export interface ProxyProfile {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  revision: number;
  updatedAt: string;
}
interface Settings {
  profiles: ProxyProfile[];
  selections: Record<string, Partial<Record<Connection, string>>>;
}
const settingsSchema = z.object({
  profiles: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      url: proxyUrl,
      username: z.string(),
      password: z.string(),
      revision: z.number().int(),
      updatedAt: z.string(),
    }),
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
  constructor(
    private variables: Pick<LegacyVariables, 'all' | 'set'> &
      Partial<Pick<LegacyVariables, 'cannotRead'>>,
  ) {}
  private read(): Settings {
    if (this.variables.cannotRead?.(KEY))
      throw new ProxyConfigurationError(
        '代理配置无法解密，请恢复服务器加密密钥',
      );
    const raw = this.variables.all()[KEY];
    if (!raw) return { profiles: [], selections: {} };
    try {
      return settingsSchema.parse(JSON.parse(raw));
    } catch {
      throw new ProxyConfigurationError('代理配置无法读取，请联系管理员');
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
      invalid('代理 Profile 不存在', 404)
    );
  }
  async save(input: unknown) {
    const parsed = saveSchema.safeParse(input);
    if (!parsed.success)
      return invalid(parsed.error.issues[0]?.message || '代理配置无效');
    const v = parsed.data;
    const id = await this.change((s) => {
      const old = v.id ? s.profiles.find((p) => p.id === v.id) : undefined;
      if (v.id && !old) invalid('代理 Profile 不存在', 404);
      if (old && v.revision !== old.revision)
        invalid('配置已被修改，请重新打开后编辑', 409);
      if (!old && s.profiles.length >= 50)
        invalid('最多添加 50 个代理 Profile');
      if (s.profiles.some((p) => p.id !== v.id && p.name === v.name))
        invalid('此名称已存在，请使用其他名称', 409);
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
        invalid('使用密码时请填写用户名');
      if (
        profile.url.startsWith('socks5') &&
        [profile.username, profile.password].some(
          (value) => Buffer.byteLength(value, 'utf8') > 255,
        )
      )
        invalid('SOCKS5 用户名和密码各不能超过 255 字节');
      s.profiles = [...s.profiles.filter((p) => p.id !== profile.id), profile];
      return profile.id;
    });
    return this.get(id);
  }
  remove(id: string) {
    return this.change((s) => {
      if (!s.profiles.some((p) => p.id === id))
        invalid('代理 Profile 不存在', 404);
      if (
        Object.values(s.selections).some((choices) =>
          Object.values(choices).includes(id),
        )
      )
        invalid('此 Profile 正在被接入引用，请先更换网络出口', 409);
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
    if (!v.success) return invalid('网络出口选择无效');
    return this.change((s) => {
      const { connection, profileId } = v.data;
      if (profileId && !s.profiles.some((p) => p.id === profileId))
        invalid('代理 Profile 不存在', 404);
      const choices = (s.selections[projectId(id)] ??= {});
      if (profileId) choices[connection] = profileId;
      else delete choices[connection];
      return { ...choices };
    });
  }
  resolve(project: string, connection: Connection): ProxyProfile | undefined {
    const s = this.read(),
      id = s.selections[projectId(project)]?.[connection];
    return id
      ? (s.profiles.find((p) => p.id === id) ??
          invalid('接入引用的代理不存在，请重新选择网络出口', 409))
      : undefined;
  }
  profile(id: string) {
    return (
      this.read().profiles.find((p) => p.id === id) ??
      invalid('代理 Profile 不存在', 404)
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
        if (role !== 'admin') ctx.throw(403, '只有管理员能管理网络出口');
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
        get: wrap((v) => this.get(String(v.id))),
        save: wrap((v) => this.save(v)),
        remove: wrap((v) => this.remove(String(v.id))),
        test: wrap((v) => p.network.test(this.profile(String(v.id)), 'site')),
        selections: inProject((id) => this.selections(id)),
        select: inProject((id, v) => this.select(id, v)),
        testConnection: inProject((id, v) => {
          const c = connectionSchema.safeParse(v.connection);
          if (!c.success) invalid('接入类型无效');
          return p.network.test(this.resolve(id, c.data!), c.data!);
        }),
      },
    });
    p.app.acl.allow(
      'nrProxyProfiles',
      [
        'list',
        'get',
        'save',
        'remove',
        'test',
        'selections',
        'select',
        'testConnection',
      ],
      'loggedIn',
    );
  }
}
