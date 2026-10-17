import {
  ScopedApiKeys,
  type ApiKeyScopes,
  type KeyScopeInput,
  ApiKeyRequestError,
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

  private async person(actor: string) {
    if (this.access.current()?.userId !== actor) refuse('操作账号已更改');
    const user = await this.users.get(actor);
    if (
      !user ||
      user.kind !== 'person' ||
      user.disabledAt != null ||
      !(await this.access.role(actor))
    )
      refuse('密钥管理需要有效人员成员');
  }

  private async authorizeOwner(actor: string, ownerId: string) {
    await this.person(actor);
    if (actor !== ownerId) await this.access.require('nrKeys', 'manage');
  }

  async list(actor: string, type: 'personal' | 'organization') {
    await this.person(actor);
    const canManage = await this.access.allows('nrKeys', 'manage');
    const keys = this.keys(this.access.database.connection());
    if (type === 'personal')
      return {
        canManage,
        items: [
          ...(await keys.list(actor)).map((key) => ({
            ...key,
            ownerId: actor,
            type,
          })),
          ...(await this.retired(actor, type)),
        ],
      };
    await this.access.require('nrKeys', 'manage');
    // Filter retired credentials before calling the public scoped-key projection.
    const links = await this.access.database
      .query()
      .selectFrom('nrOrganizationKeys as organization')
      .innerJoin('apikey as credential', 'credential.id', 'organization.id')
      .select(['organization.id', 'organization.serviceUserId'])
      .execute();
    const items = await Promise.all(
      links.map(async (link) => ({
        ...(await keys.get(String(link.serviceUserId), String(link.id))),
        ownerId: String(link.serviceUserId),
        type,
      })),
    );
    return {
      canManage,
      items: [...items, ...(await this.retired(actor, type))],
    };
  }

  private async retired(actor: string, type: 'personal' | 'organization') {
    const connection = this.access.database.connection();
    const rows = await connection.query
      .selectFrom('nrAccessEvents as issued')
      .leftJoin('apikey as credential', 'credential.id', 'issued.targetId')
      .select(['issued.targetId', 'issued.changes', 'issued.createdAt'])
      .where('issued.action', '=', 'key.create')
      .where('credential.id', 'is', null)
      .execute();
    return rows.flatMap((row) => {
      const changes = (
        typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
      ) as {
        type?: string;
        userId?: string;
        name?: string;
        expiresAt?: string;
      };
      if (
        changes.type !== type ||
        !changes.userId ||
        (type === 'personal' && changes.userId !== actor)
      )
        return [];
      return [
        {
          id: String(row.targetId),
          ownerId: changes.userId,
          type,
          revoked: true,
          name: changes.name || String(row.targetId),
          description: null,
          start: null,
          enabled: false,
          createdAt: new Date(row.createdAt as string).toISOString(),
          expiresAt: changes.expiresAt || null,
          lastUsedAt: null,
          scope: null,
        },
      ];
    });
  }

  async options(actor: string) {
    await this.person(actor);
    const keys = this.keys(this.access.database.connection());
    const identity = this.access.current()!.context.identity;
    const projects = await keys.scopeObjects('nocoreach.business', identity);
    const levels = ['read', 'write', 'admin'] as const;
    const allowed = async (objects: 'all' | string[]) => {
      const result: string[] = [];
      for (const level of levels) {
        try {
          await this.requireScope(
            this.scopes.compile('options', {
              groups: { 'nocoreach.business': { level, objects } },
            }),
            this.access.current()!.context,
          );
          result.push(level);
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
        }
      }
      return result;
    };
    const roles = [];
    if (await this.access.allows('nrKeys', 'manage')) {
      for (const role of await this.access.authorization.permissionSets.list()) {
        if (!role.key.startsWith('nr.')) continue;
        try {
          await this.access.assertGrantable([role.key]);
          roles.push({ key: role.key, title: role.title, assignable: true });
        } catch (error) {
          if (!(error instanceof ApiError)) throw error;
        }
      }
    }
    return {
      levels: await allowed('all'),
      projects: await Promise.all(
        projects.map(async (project) => ({
          id: project.id,
          name: project.title,
          levels: await allowed([project.id]),
        })),
      ),
      roles,
    };
  }

  async history(actor: string, keyId: string, ownerId: string) {
    await this.authorizeOwner(actor, ownerId);
    const connection = this.access.database.connection();
    const organization = await connection
      .repository<{ id: string; serviceUserId: string }>('nrOrganizationKeys')
      .findOne({ filter: { id: keyId } });
    if (organization) {
      await this.access.require('nrKeys', 'manage');
      if (String(organization.serviceUserId) !== ownerId)
        throw new ApiKeyRequestError(
          404,
          'API_KEY_NOT_FOUND',
          'Key not found.',
        );
    } else {
      // Creation provenance retains ownership after revocation deletes the credential.
      const issued = await connection
        .repository<{
          action: string;
          targetId: string;
          changes: { userId?: string };
        }>('nrAccessEvents')
        .findOne({
          filter: { action: 'key.create', targetId: keyId },
        });
      if (issued?.changes.userId !== ownerId)
        throw new ApiKeyRequestError(
          404,
          'API_KEY_NOT_FOUND',
          'Key not found.',
        );
    }
    return connection.query
      .selectFrom('nrAccessEvents')
      .select(['id', 'actorId', 'action', 'createdAt'])
      .where('targetId', '=', keyId)
      .where('action', 'in', ['key.create', 'key.rotate', 'key.revoke'])
      .orderBy('createdAt', 'desc')
      .limit(100)
      .execute();
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
    await this.person(actor);
    if (
      input.type === 'organization' ||
      (input.userId && input.userId !== actor)
    )
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
        name: input.name,
        expiresAt: created.key.expiresAt,
      });
      return created;
    });
  }

  async rotate(actor: string, keyId: string, ownerId: string) {
    await this.authorizeOwner(actor, ownerId);
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
    await this.authorizeOwner(actor, ownerId);
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
