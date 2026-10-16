import {
  ScopedApiKeys,
  type ApiKeyScopes,
  type KeyScopeInput,
} from '@nocobase/app-plugin-api-keys/server';
import type {
  Auth,
  UserAdministrationService,
} from '@nocobase/app-plugin-authentication/server';
import type {
  AuthorizationContext,
  KeyScope,
} from '@nocobase/authorization/core';
import type { DatabaseConnection } from '@nocobase/db';
import { ApiError } from '@nocobase/app-server/router';
import { BUSINESS_TYPE, type ReachAccess } from './service.js';

type Input = {
  name: string;
  type: 'personal' | 'organization';
  userId?: string;
  roles?: string[];
  expiresInDays?: number;
  scope: KeyScopeInput;
};
const refuse = (message: string): never => {
  throw new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'NOCOREACH_KEY_DENIED',
    domain: 'nocoreach',
    message,
    metadata: { ns: 'nocoreach', key: 'access.keyDenied' },
  });
};

/** Scope, credential lifecycle and hashing stay in ScopedApiKeys. Only organization ownership is application data. */
export class ReachKeys {
  constructor(
    readonly access: ReachAccess,
    readonly auth: Auth,
    readonly scopes: ApiKeyScopes,
    readonly users: UserAdministrationService,
  ) {}

  private keys(connection: DatabaseConnection) {
    return new ScopedApiKeys({
      auth: this.auth.forConnection(connection),
      connection: () => connection,
      scopes: this.scopes,
      config: () => ({ maxScopedKeyDays: 365 }),
    });
  }

  private async requireScope(scope: KeyScope, context: AuthorizationContext) {
    for (const { resource, actions } of scope.permissions ?? [])
      for (const action of actions) {
        const objects = scope.objects('nocoreach.projects');
        for (const id of objects === 'all' ? ['*'] : objects) {
          if (!(await context.can({ resource: { ...resource, id }, action })))
            refuse('不能授予超出当前权限的密钥范围');
        }
      }
  }

  private async requirePersonalOwner(
    actor: AuthorizationContext,
    userId: string,
    scope: KeyScope,
  ) {
    const keys = this.keys(this.access.database.connection());
    const owner = this.access.authorization.for(await keys.identityOf(userId));
    if (
      (await owner.snapshot()).unrestricted &&
      !(await actor.snapshot()).unrestricted
    )
      refuse('只有系统管理员能为系统管理员换发密钥');
    await this.requireScope(scope, owner);
  }

  async create(actor: string, input: Input) {
    await this.access.require('nrKeys', 'manage');
    const request = this.access.current()!;
    const approvedRoles =
      input.type === 'organization'
        ? await this.access.assertGrantable(input.roles ?? [])
        : new Map<string, string>();
    const checked = await this.keys(this.access.database.connection()).check(
      { ...input, expiresInDays: input.expiresInDays ?? 90 },
      request.context.identity,
    );
    if (!checked.scope) return refuse('密钥必须指定权限范围');
    const compiled = this.scopes.compile('check', checked.scope);
    await this.requireScope(compiled, request.context);
    if (input.type === 'personal')
      await this.requirePersonalOwner(
        request.context,
        input.userId || actor,
        compiled,
      );
    return this.access.database.transaction(async (connection) => {
      const sets =
        this.access.authorization.permissionSets.withTransaction(connection);
      let userId: string;
      if (input.type === 'organization') {
        const roles = [...new Set(input.roles ?? [])];
        if (!roles.length || roles.some((key) => !key.startsWith('nr.')))
          refuse('组织密钥需要业务角色');
        for (const key of roles) {
          const role = await sets.get(key);
          if (!role) return refuse('业务角色不存在');
          if (JSON.stringify(role) !== approvedRoles.get(key))
            refuse('角色已更改，请刷新后重试');
          // Administrator-created organization identities may only carry grants represented by this business catalogue.
          if (
            role.grants.some(
              (grant) =>
                grant.resource.type !== BUSINESS_TYPE &&
                !this.access
                  .pageGrants(true)
                  .some(
                    (allowed) =>
                      allowed.resource.type === grant.resource.type &&
                      allowed.resource.id === grant.resource.id &&
                      grant.actions.every((action) =>
                        allowed.actions.some((a) => a.action === action.action),
                      ),
                  ),
            )
          )
            refuse('组织密钥角色包含非业务权限');
        }
        const account = await this.users
          .withConnection(connection)
          .createServiceAccount({
            name: input.name,
            description: 'NocoReach organization API key',
          });
        userId = account.id;
        for (const role of roles)
          await sets.assign({
            permissionSet: role,
            subject: { type: 'user', id: userId },
          });
      } else {
        userId = input.userId || actor;
        const target = await this.users.withConnection(connection).get(userId);
        if (
          !target ||
          target.kind !== 'person' ||
          !(await this.access.role(userId, connection))
        )
          refuse('密钥所有者必须是有效成员');
      }
      const created = await this.keys(connection).issueChecked(userId, checked);
      if (input.type === 'organization')
        await connection.repository('nrOrganizationKeys').createOne({
          values: {
            id: created.key.id,
            serviceUserId: userId,
            createdBy: actor,
            createdAt: new Date(),
          },
        });
      await this.access.event(connection, actor, 'key.create', created.key.id, {
        type: input.type,
        userId,
      });
      return created;
    });
  }

  async rotate(actor: string, keyId: string, ownerId: string) {
    await this.access.require('nrKeys', 'manage');
    const before = await this.keys(this.access.database.connection()).get(
      ownerId,
      keyId,
    );
    if (!before.scope) return refuse('只能轮换受限密钥');
    await this.requireScope(
      this.scopes.compile(keyId, before.scope),
      this.access.current()!.context,
    );
    await this.requirePersonalOwner(
      this.access.current()!.context,
      ownerId,
      this.scopes.compile(keyId, before.scope),
    );
    return this.access.database.transaction(async (connection) => {
      const keys = this.keys(connection);
      const key = await keys.get(ownerId, keyId);
      if (JSON.stringify(key.scope) !== JSON.stringify(before.scope))
        refuse('密钥范围已更改，请刷新后重试');
      if (
        !key.scope ||
        !key.enabled ||
        !key.expiresAt ||
        Date.parse(key.expiresAt) <= Date.now()
      )
        refuse('只能轮换仍有效的受限密钥');
      if (!(await this.access.role(ownerId, connection)))
        refuse('密钥所有者已失去成员资格');
      const replacement = await keys.rotate(ownerId, keyId);
      await this.access.event(connection, actor, 'key.rotate', keyId, {
        ownerId,
      });
      return replacement;
    });
  }

  async revoke(actor: string, keyId: string, ownerId: string) {
    await this.access.require('nrKeys', 'manage');
    const owner = this.access.authorization.for(
      await this.keys(this.access.database.connection()).identityOf(ownerId),
    );
    if (
      (await owner.snapshot()).unrestricted &&
      !(await this.access.current()!.context.snapshot()).unrestricted
    )
      refuse('只有系统管理员能停用系统管理员的密钥');
    await this.access.database.transaction(async (connection) => {
      await this.keys(connection).revoke(ownerId, keyId);
      await this.access.event(connection, actor, 'key.revoke', keyId, {
        ownerId,
      });
    });
  }

  async inventory() {
    await this.access.require('nrKeys', 'manage');
    // Select only operational metadata. Never read hashes or client metadata into an inventory or response.
    return this.access.database
      .query()
      .selectFrom('apikey')
      .select([
        'id',
        'referenceId',
        'configId',
        'name',
        'enabled',
        'createdAt',
        'expiresAt',
        'lastRequest',
      ])
      .execute();
  }

  async events(limit: number) {
    await this.access.require('nrKeys', 'manage');
    return this.access.database
      .query()
      .selectFrom('nrAccessEvents')
      .selectAll()
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .execute();
  }
}
