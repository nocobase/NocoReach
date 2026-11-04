import { createHash } from 'node:crypto';

import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { isDemoMode } from '@nocobase/app-plugin-demo-mode/server';
import type {
  DemoClock,
  DemoImportContext,
} from '@nocobase/app-plugin-demo-mode/server/tokens';
import { userManagementServiceToken } from '@nocobase/app-plugin-users/server';
import type { Application } from '@nocobase/app-server/application';
import { sampleDataToken } from '@nocobase/app-server/sample-data';

import { DEMO_LANGUAGES, demoTimeZone } from './content.js';
import type { DemoHost } from './host.js';
import { generateNocoReachSamples } from './samples.js';

/** The UTC offset of `timeZone` at `date`, in minutes. */
function offsetMinutes(formatter: Intl.DateTimeFormat, date: Date): number {
  const name = formatter
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  const match = /GMT([+-])(\d{2}):?(\d{2})?/u.exec(name ?? '');
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
}

/**
 * The calendar the generator dates its records with. Demo Mode's import makes its own and does not export it; this one
 * keeps its meaning: days count in the time zone, and nothing lands after `now` unless asked for with a negative day.
 */
export function sampleClock(now: Date, timeZone: string): DemoClock {
  const offsets = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  });
  const dates = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dateAgo = (days: number) => {
    const [year, month, day] = dates.format(now).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day - days))
      .toISOString()
      .slice(0, 10);
  };
  const daysAgo = (days: number, hour = 10, minute = 0) => {
    const [year, month, day] = dateAgo(days).split('-').map(Number);
    const wall = Date.UTC(year, month - 1, day, hour, minute);
    // The offset of the instant itself, which differs from today's across a daylight saving change.
    const guess = new Date(
      wall - offsetMinutes(offsets, new Date(wall)) * 60_000,
    );
    const at = new Date(wall - offsetMinutes(offsets, guess) * 60_000);
    return days >= 0 && at.getTime() > now.getTime()
      ? new Date(now.getTime() - 60_000)
      : at;
  };
  const seed = `nocoreach:sample:${timeZone}:${dateAgo(0)}`;
  return {
    seed,
    sample: (key) =>
      createHash('sha256').update(`${seed}:${key}`).digest().readUInt32BE(0) /
      0x100000000,
    now,
    timeZone,
    daysAgo,
    dateAgo,
    isoAgo: (days, hour, minute) => daysAgo(days, hour, minute).toISOString(),
  };
}

/** The sample's language: the application's default when the demo is written in it, otherwise English. */
export function sampleLanguage(locale: unknown): string {
  return DEMO_LANGUAGES.some((language) => language === locale)
    ? (locale as string)
    : 'en-US';
}

/** The initial administrator, who owns what the generator attributes to the importing administrator. */
async function initialAdminId(app: Application): Promise<string> {
  const username = (
    app.config.get<string>('users.initialAdmin.username') ?? 'nocobase'
  ).toLowerCase();
  const { items } = await app.container
    .resolve(userManagementServiceToken)
    .list({ search: username, pageSize: 20 });
  const admin = items.find((user) => user.username?.toLowerCase() === username);
  if (!admin)
    throw new Error(`No initial administrator "${username}" to build as.`);
  return String(admin.id);
}

/** What Demo Mode's import gives the generator, without its lifecycle: no tracking and no Demo Mode state. */
function sampleContext(
  app: Application,
  actorId: string,
  language: string,
  now: Date,
): DemoImportContext {
  const users = app.container.resolve(userManagementServiceToken);
  const { permissionSets } = app.container.resolve(authorizationToken);
  const assign = async (userId: string, permissionSet: string) => {
    await permissionSets.assign({
      subject: { type: 'user', id: userId },
      permissionSet,
    });
  };
  const data: Record<string, unknown> = {};
  return {
    datasetId: 'nocoreach',
    language,
    actorId,
    clock: sampleClock(now, demoTimeZone(language)),
    data,
    setData: async (patch) => {
      Object.assign(data, patch);
    },
    track: async () => {},
    createAccount: async (spec) => {
      const { id } = await users.create({
        name: spec.name,
        username: spec.username,
        email: spec.email,
        password: spec.password ?? `${spec.username}123`,
        ...(spec.roleScopes ? { roleScopes: spec.roleScopes } : {}),
      });
      for (const permissionSet of spec.permissionSets ?? [])
        await assign(String(id), permissionSet);
      return String(id);
    },
    createPermissionSet: async ({ key, title, grants }) => {
      await permissionSets.create({ key, title, grants });
    },
    assignPermissionSet: assign,
    progress: async () => {},
  };
}

/**
 * The demo as this application's sample data, which a first installation with `APP_SAMPLE_DATA=true` loads, as a Studio
 * preview's does. A Demo Mode deployment generates the same data through its dataset instead, so it registers nothing.
 */
export function registerNocoReachSampleData(
  app: Application,
  host: () => DemoHost,
): void {
  if (isDemoMode(app.container) || !app.container.has(sampleDataToken)) return;
  app.container.resolve(sampleDataToken).register({
    name: 'nocoreach/demo',
    packageName: 'nocoreach',
    run: async () =>
      generateNocoReachSamples(
        host(),
        sampleContext(
          app,
          await initialAdminId(app),
          sampleLanguage(app.config.get('i18n.defaultLocale')),
          new Date(),
        ),
      ),
  });
}
