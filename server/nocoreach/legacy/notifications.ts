// The classic notification surface NocoReach's notifications (server/nocoreach/notifications.ts) call — the
// `notification-manager` plugin's `send({ channelName, message, receivers })` and its `notificationChannels` table —
// rebuilt on NocoBase 3's Notification plugin (`notificationServiceToken`).
//
// What differs from the classic plugin: channels are declared in config.yml (`notification.channels`), not created at
// run time. NocoReach's own in-app channel ("nocoreach") becomes the configured `in-app` channel, whose messages land in
// the inbox the application header already has (no bell of NocoReach's own); an email channel is any enabled `smtp` or
// `resend` channel there. NocoBase 3 does not turn users into email addresses, so this layer reads them from the users.
// Links: the classic portal lived at /x/main; an in-app message now carries a route of this application, and an email
// the application's address.
import { randomUUID } from 'node:crypto';

import type { NotificationChannelConfig, NotificationService } from '@nocobase/app-plugin-notification/server';

import { legacyRecord, type LegacyRecord, type LegacyRepository } from './database.js';

type Values = Record<string, unknown>;
const messageText = (value: unknown): string => typeof value === 'string' || typeof value === 'number' ? String(value) : '';

/** The classic in-app channel NocoReach made for itself, and where the classic portal was mounted. */
export const CLASSIC_IN_APP = 'nocoreach';
const CLASSIC_PORTAL = '/x/main';
const EMAIL_PROVIDERS = new Set(['smtp', 'resend']);

export interface LegacyNotificationLinks {
  /** The application's base path, such as `/main`. */
  readonly basePath: string;
  /** The public origin, such as `https://reach.example.com`, when it is configured; emails then carry full links. */
  readonly origin?: string;
}

interface ClassicMessage {
  readonly channelName: string;
  readonly triggerFrom?: string;
  readonly message: Values;
  readonly receivers?: { readonly type?: string; readonly value?: unknown };
}

export class LegacyNotifications {
  /** What `pm.get('notification-manager')` answers. */
  readonly plugin: { send(message: ClassicMessage): Promise<void> };

  constructor(
    private readonly service: () => NotificationService,
    private readonly channels: () => Readonly<Record<string, NotificationChannelConfig>>,
    private readonly users: LegacyRepository,
    private readonly links: LegacyNotificationLinks,
  ) {
    this.plugin = { send: (message) => this.send(message) };
  }

  private enabled(test: (provider: string) => boolean): string | undefined {
    return Object.entries(this.channels() || {}).find(([, c]) => c && c.enabled !== false && test(c.provider))?.[0];
  }

  /** The configured in-app channel (`inbox` in the template's config.yml). */
  inAppChannel(): string | undefined {
    return this.enabled((p) => p === 'in-app');
  }

  /** The first enabled email channel, if an administrator configured one. */
  emailChannel(): string | undefined {
    return this.enabled((p) => EMAIL_PROVIDERS.has(p));
  }

  /** `db.getRepository('notificationChannels')`: the configured channels under their classic shape, read-only. */
  repository(): LegacyRepository {
    const rows = (): LegacyRecord[] => {
      const out: LegacyRecord[] = [];
      if (this.inAppChannel()) out.push(legacyRecord({ name: CLASSIC_IN_APP, title: 'NocoReach', notificationType: 'in-app-message' }));
      const email = this.emailChannel();
      if (email) out.push(legacyRecord({ name: email, notificationType: 'email' }));
      return out;
    };
    const matches = (options: Values = {}) =>
      rows().filter((r) => Object.entries((options.filter as Values) || {}).every(([k, v]) => r[k] === v));
    return {
      find: async (options) => matches(options),
      findOne: async (options) => matches(options)[0] ?? null,
      count: async (options) => matches(options).length,
      // The classic service made its in-app channel once; on NocoBase 3 it is configured, so there is nothing to make.
      create: async (options) => legacyRecord({ ...((options?.values as Values) || {}) }),
      update: async () => [],
      destroy: async () => 0,
    };
  }

  /** A classic path (`/x/main/actions/12`) as a route of this application (`/actions/12`). */
  private route(url: unknown): string | undefined {
    if (typeof url !== 'string' || !url) return undefined;
    const path = url.startsWith(CLASSIC_PORTAL) ? url.slice(CLASSIC_PORTAL.length) || '/' : url;
    return path.startsWith('/') ? path : undefined;
  }

  private async send({ channelName, triggerFrom, message, receivers }: ClassicMessage): Promise<void> {
    const ids = receivers?.type === 'userId' ? [...new Set([receivers.value].flat().filter((x) => x != null && x !== '').map(String))] : [];
    if (!ids.length) return;
    const source = { type: triggerFrom || 'nocoreach' };
    const idempotencyKey = `nocoreach:${randomUUID()}`;
    const provider = this.channels()?.[channelName]?.provider;
    if (provider && EMAIL_PROVIDERS.has(provider)) {
      const to = (await Promise.all(ids.map((id) => this.users.findOne({ filterByTk: id }).catch(() => null))))
        .map((u) => (u ? messageText(u.get('email')) : ''))
        .filter((e) => /^[^\s@]+@[^\s@]+$/.test(e));
      if (!to.length) return;
      const base = `${this.links.origin || ''}${this.links.basePath}`;
      const text = messageText(message.text).split(CLASSIC_PORTAL).join(base);
      await this.service().send({ idempotencyKey, source, messages: { [channelName]: { to: [...new Set(to)], subject: messageText(message.subject).slice(0, 200), text } } });
      return;
    }
    const channel = channelName === CLASSIC_IN_APP ? this.inAppChannel() : provider === 'in-app' ? channelName : undefined;
    if (!channel) throw new Error(`No enabled in-app notification channel for ${channelName} in config.yml`);
    const title = messageText(message.title).trim().slice(0, 200);
    const body = messageText(message.content).trim().slice(0, 2000) || title;
    const path = this.route((message.options as Values | undefined)?.url);
    await this.service().send({
      idempotencyKey,
      source,
      messages: { [channel]: { to: ids, title, body, ...(path ? { target: { type: 'route', path } } : {}) } },
    });
  }
}
