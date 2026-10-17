import { createHash, randomUUID } from 'node:crypto';
import { ApiError } from '@nocobase/app-server/router';
import type { PermissionGrant } from '@nocobase/authorization/core';
import type { PermissionSet } from '@nocobase/authorization/permission-sets';
import type { DatabaseConnection } from '@nocobase/db';
import type { BusinessRoleInput } from '../../shared/member-access.js';
import { applicationAction } from './catalog.js';
import {
  BUSINESS_ADMIN,
  BUSINESS_MEMBER,
  BUSINESS_TYPE,
  grantSubset,
  type ReachAccess,
} from './service.js';

export function accessError(
  reason: string,
  status:
    | 'PERMISSION_DENIED'
    | 'ALREADY_EXISTS'
    | 'NOT_FOUND'
    | 'INVALID_ARGUMENT' = 'PERMISSION_DENIED',
): never {
  throw new ApiError({
    status,
    reason,
    domain: 'nocoreach',
    message: reason,
    metadata: { ns: 'nocoreach', key: `accessMembers.errors.${reason}` },
  });
}
export const roleRevision = (set: PermissionSet) =>
  createHash('sha256').update(JSON.stringify(set)).digest('hex');

/** Only policyless, explicitly catalogued business grants are configurable in this surface. */
export class ReachManagement {
  constructor(readonly access: ReachAccess) {}

  validateGrants(grants: readonly PermissionGrant[]) {
    const actions = new Map(
      this.access
        .catalogue()
        .map(({ resource, action }) => [
          `${resource}.${action}`,
          applicationAction(resource, action),
        ]),
    );
    const pages = this.access.pageGrants(true);
    for (const grant of grants) {
      if (grant.resource.type === BUSINESS_TYPE) {
        if (
          !['*', '$app'].includes(grant.resource.id) &&
          !/^[1-9]\d{0,15}$/.test(grant.resource.id)
        )
          accessError('invalidScope', 'INVALID_ARGUMENT');
        for (const action of grant.actions) {
          if (!actions.has(action.action))
            accessError('invalidRole', 'INVALID_ARGUMENT');
          if (
            actions.get(action.action) &&
            !['*', '$app'].includes(grant.resource.id)
          )
            accessError('invalidScope', 'INVALID_ARGUMENT');
        }
      } else if (
        !pages.some(
          (allowed) =>
            allowed.resource.type === grant.resource.type &&
            allowed.resource.id === grant.resource.id &&
            grant.actions.every((action) =>
              allowed.actions.some((a) => a.action === action.action),
            ),
        )
      )
        accessError('invalidRole', 'INVALID_ARGUMENT');
      if (grant.actions.some((action) => action.policy))
        accessError('invalidRole', 'INVALID_ARGUMENT');
    }
  }

  async actorGrants(actorId: string, connection: DatabaseConnection) {
    const actor = await this.access
      .personGrants(actorId, connection)
      .catch((error: unknown) => {
        if (
          error instanceof ApiError &&
          error.reason === 'NOCOREACH_ACCESS_DENIED'
        )
          accessError('inviterChanged');
        throw error;
      });
    if (
      !actor.root &&
      !grantSubset(
        [
          {
            resource: { type: BUSINESS_TYPE, id: '$app' },
            actions: [{ action: 'nrMembers.setRole' }],
          },
        ],
        actor.grants,
      )
    )
      accessError('inviterChanged');
    return actor;
  }

  async grantable(
    actorId: string,
    keys: readonly string[],
    connection: DatabaseConnection,
    ceiling?: readonly PermissionGrant[],
  ) {
    const actor = await this.actorGrants(actorId, connection);
    const sets =
      this.access.authorization.permissionSets.withTransaction(connection);
    const selected: PermissionSet[] = [];
    for (const key of new Set(keys)) {
      const set = await sets.get(key);
      if (!set || !key.startsWith('nr.'))
        accessError('invalidRole', 'INVALID_ARGUMENT');
      this.validateGrants(set.grants);
      if (!actor.root && !grantSubset(set.grants, actor.grants))
        accessError('ungrantable');
      if (ceiling && !grantSubset(set.grants, ceiling))
        accessError('roleExpanded');
      selected.push(set);
    }
    return selected;
  }

  async listRoles() {
    await this.access.require('nrMembers', 'list');
    const manage = await this.access.allows('nrMembers', 'setRole');
    const result = [];
    for (const set of await this.access.authorization.permissionSets.list()) {
      if (!set.key.startsWith('nr.')) continue;
      let assignable = false;
      if (manage) {
        try {
          await this.access.assertGrantable([set.key]);
          assignable = true;
        } catch {
          /* A narrower manager sees the definition without an assignment action. */
        }
      }
      result.push({
        ...set,
        title: typeof set.title === 'string' ? set.title : set.key,
        revision: roleRevision(set),
        builtIn: [BUSINESS_ADMIN, BUSINESS_MEMBER].includes(set.key),
        assignable,
      });
    }
    return { items: result, canManage: manage };
  }

  async saveRole(actorId: string, input: BusinessRoleInput, update: boolean) {
    await this.access.require('nrMembers', 'setRole');
    if ([BUSINESS_ADMIN, BUSINESS_MEMBER].includes(input.key))
      accessError('builtIn');
    this.validateGrants(input.grants);
    return this.access.database.transaction(async (connection) => {
      await this.access.lockManagement(connection);
      const sets =
        this.access.authorization.permissionSets.withTransaction(connection);
      const before = await sets.get(input.key);
      if (update && !before) accessError('missing', 'NOT_FOUND');
      if (!update && before) accessError('roleExists', 'ALREADY_EXISTS');
      if (before && roleRevision(before) !== input.revision)
        accessError('changed', 'ALREADY_EXISTS');
      const actor = await this.actorGrants(actorId, connection);
      if (
        !actor.root &&
        (!grantSubset(input.grants, actor.grants) ||
          (before && !grantSubset(before.grants, actor.grants)))
      )
        accessError('ungrantable');
      const definition = {
        key: input.key,
        title: input.title,
        grants: input.grants,
      };
      const saved = update
        ? await sets.update(input.key, definition)
        : await sets.create(definition);
      await this.access.event(
        connection,
        actorId,
        update ? 'role.update' : 'role.create',
        input.key,
        { title: input.title },
      );
      return {
        ...saved,
        revision: roleRevision(saved),
        builtIn: false,
        assignable: true,
      };
    });
  }

  async deleteRole(actorId: string, key: string, revision: string) {
    await this.access.require('nrMembers', 'setRole');
    if ([BUSINESS_ADMIN, BUSINESS_MEMBER].includes(key)) accessError('builtIn');
    await this.access.database.transaction(async (connection) => {
      await this.access.lockManagement(connection);
      const [before] = await this.grantable(actorId, [key], connection);
      if (roleRevision(before) !== revision)
        accessError('changed', 'ALREADY_EXISTS');
      const sets =
        this.access.authorization.permissionSets.withTransaction(connection);
      if ((await sets.listAssignments(key)).length)
        accessError('roleAssigned', 'ALREADY_EXISTS');
      await sets.delete(key);
      await this.access.event(connection, actorId, 'role.delete', key, {});
    });
  }

  /** The invitation owner holds the management lock on this transaction. */
  async addInvitationRoles(
    connection: DatabaseConnection,
    actorId: string,
    userId: string,
    roles: readonly string[],
    ceiling: readonly PermissionGrant[],
  ) {
    await this.grantable(actorId, roles, connection, ceiling);
    const target = await connection
      .repository('user')
      .findOne({ filter: { id: userId, kind: 'person' } });
    if (!target || target.disabledAt != null) accessError('accountUnavailable');
    const sets =
      this.access.authorization.permissionSets.withTransaction(connection);
    const current = await sets.getEffective({
      principal: { type: 'user', id: userId },
    });
    const assigned = new Set(current.map((set) => set.key));
    if (assigned.has('root')) accessError('systemAccount');
    for (const permissionSet of new Set(roles))
      if (!assigned.has(permissionSet))
        await sets.assign({
          id: randomUUID(),
          subject: { type: 'user', id: userId },
          permissionSet,
        });
    await this.access.event(connection, userId, 'invitation.accept', userId, {
      invitedBy: actorId,
      roles,
    });
  }
}
