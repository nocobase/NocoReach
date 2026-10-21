import type { PermissionGrant } from '@nocobase/authorization/core';
import {
  BASE_ACTIONS,
  CAPABILITIES,
  CAPABILITY_ACTIONS,
  isAppCapability,
  type RoleAccess,
} from '../../shared/access-capabilities.js';
import {
  ADMIN_PAGES,
  REACH_PAGES,
  TEAM_SETTINGS,
} from '../../shared/access-pages.js';
import { applicationAction } from './catalog.js';

export const BUSINESS_TYPE = 'nocoreach';
/** The resource selector of a grant that reaches the projects its holder is a member of. */
export const MEMBER_PROJECTS = '$member';

const split = (action: string) => {
  const separator = action.indexOf('.');
  return [action.slice(0, separator), action.slice(separator + 1)] as const;
};
const isApplication = (action: string) => applicationAction(...split(action));

/** Pages and team settings follow from the capabilities; every role opens the everyday pages. */
export function pageGrants(capabilities: readonly string[]): PermissionGrant[] {
  const has = (capability: string) => capabilities.includes(capability);
  const page = (id: string) => ({
    resource: { type: 'page', id },
    actions: [{ action: 'access' }],
  });
  return [
    ...REACH_PAGES.filter(
      (id) =>
        !ADMIN_PAGES.has(id) ||
        (id === 'proxy-profiles' || id === 'demo-data'
          ? has('app.settings')
          : has('app.agents')),
    ).map(page),
    page('runtimes'),
    // The demo data plugin's own settings item, which its routes check.
    ...(has('app.settings')
      ? [
          {
            resource: { type: 'settings', id: 'demoMode.configuration' },
            actions: [{ action: 'read' }, { action: 'configure' }],
          },
          {
            resource: { type: 'settings', id: 'demoMode.data' },
            actions: [{ action: 'read' }, { action: 'manage' }],
          },
        ]
      : []),
    ...(has('app.agents')
      ? [
          page('usage'),
          page('scheduler.schedules'),
          ...TEAM_SETTINGS.map((id) => ({
            resource: { type: 'settings', id },
            actions: [{ action: 'read' }, { action: 'manage' }],
          })),
          {
            resource: { type: 'settings', id: 'scheduler.schedules' },
            actions: [{ action: 'read' }],
          },
        ]
      : []),
  ];
}

/**
 * Expand a role into permission-set grants. Application actions use `$app`; project actions use `*` for every project
 * or `$member` for the holder's projects. Only registered actions are granted.
 */
export function roleGrants(
  role: RoleAccess,
  registered: ReadonlySet<string>,
): PermissionGrant[] {
  const project = role.scope === 'all' ? '*' : MEMBER_PROJECTS;
  const byResource = new Map<string, string[]>();
  const add = (id: string, action: string) => {
    if (!registered.has(action)) return;
    if (!byResource.has(id)) byResource.set(id, []);
    byResource.get(id)!.push(action);
  };
  for (const action of BASE_ACTIONS)
    add(isApplication(action) ? '$app' : '*', action);
  const capabilities = CAPABILITIES.filter((key) =>
    role.capabilities.includes(key),
  );
  for (const capability of capabilities)
    for (const action of CAPABILITY_ACTIONS[capability])
      add(
        isApplication(action) || isAppCapability(capability) ? '$app' : project,
        action,
      );
  return [
    ...[...byResource].map(([id, actions]) => ({
      resource: { type: BUSINESS_TYPE, id },
      actions: actions.map((action) => ({ action })),
    })),
    ...pageGrants(capabilities),
  ];
}

/**
 * Read a stored role back. Capabilities cover disjoint actions, so holding any of a capability's actions means the
 * role was saved with it; resaving then also grants actions added to it later.
 */
export function roleAccessOf(grants: readonly PermissionGrant[]): RoleAccess {
  const granted = new Map<string, Set<string>>();
  for (const grant of grants) {
    if (grant.resource.type !== BUSINESS_TYPE) continue;
    for (const { action } of grant.actions) {
      if (!granted.has(action)) granted.set(action, new Set());
      granted.get(action)!.add(grant.resource.id);
    }
  }
  const capabilities = CAPABILITIES.filter((capability) =>
    CAPABILITY_ACTIONS[capability].some((action) => granted.has(action)),
  );
  const all = CAPABILITIES.filter((capability) => !isAppCapability(capability))
    .flatMap((capability) => CAPABILITY_ACTIONS[capability])
    .some((action) => !isApplication(action) && granted.get(action)?.has('*'));
  return { scope: all ? 'all' : 'member', capabilities };
}
