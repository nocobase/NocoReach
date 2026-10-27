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
  PermissionGrant,
} from '@nocobase/authorization/core';
import type { DatabaseConnection } from '@nocobase/db';
import { ApiError } from '@nocobase/app-server/router';
import { PermissionSetLastAssignmentError } from '@nocobase/authorization/permission-sets';
import {
  BUSINESS_ADMIN,
  BUSINESS_TYPE,
  grantSubset,
  type ReachAccess,
} from './service.js';
import { accessError } from './management.js';
import { applicationAction } from './catalog.js';

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
    const issued = await connection.repository('nrAccessEvents').findMany({
      filter: (filter) =>
        filter.and([
          filter.string('action').eq('key.create'),
          filter.json('changes').path(['type']).eq(type),
          ...(type === 'personal'
            ? [filter.json('changes').path(['userId']).eq(actor)]
            : []),
        ]),
      select: (select) => select.fields('id'),
    });
    if (!issued.length) return [];
    const rows: Record<string, unknown>[] = [];
    // Bound the query parameters when an owner has accumulated many retired keys.
    for (let offset = 0; offset < issued.length; offset += 500)
      rows.push(
        ...(await connection.query
          .selectFrom('nrAccessEvents as issued')
          .leftJoin('apikey as credential', 'credential.id', 'issued.targetId')
          .select(['issued.targetId', 'issued.changes', 'issued.createdAt'])
          .select((query) => [
            query
              .selectFrom('nrAccessEvents as rotated')
              .select('rotated.changes')
              .whereRef('rotated.targetId', '=', 'issued.targetId')
              .where('rotated.action', '=', 'key.rotate')
              .orderBy('rotated.createdAt', 'desc')
              .orderBy('rotated.id', 'desc')
              .limit(1)
              .as('rotation'),
            query
              .selectFrom('nrAccessEvents as revoked')
              .select('revoked.id')
              .whereRef('revoked.targetId', '=', 'issued.targetId')
              .where('revoked.action', '=', 'key.revoke')
              .limit(1)
              .as('revocation'),
          ])
          .where(
            'issued.id',
            'in',
            issued.slice(offset, offset + 500).map((event) => event.id),
          )
          .where('credential.id', 'is', null)
          .execute()),
      );
    return rows.map((row) => {
      const changes = (
        typeof row.changes === 'string' ? JSON.parse(row.changes) : row.changes
      ) as {
        userId: string;
        name: string;
        expiresAt: string;
      };
      const rotation = (
        typeof row.rotation === 'string'
          ? JSON.parse(row.rotation)
          : row.rotation
      ) as { expiresAt: string } | null;
      return {
        id: String(row.targetId),
        ownerId: changes.userId,
        type,
        revoked: type === 'personal' || row.revocation != null,
        name: changes.name,
        description: null,
        start: null,
        enabled: false,
        createdAt: new Date(row.createdAt as string).toISOString(),
        expiresAt: rotation?.expiresAt ?? changes.expiresAt,
        lastUsedAt: null,
        scope: null,
      };
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
      .orderBy('id', 'desc')
      .limit(100)
      .execute();
  }

  private scopeGrants(scope: KeyScope): PermissionGrant[] {
    return (scope.permissions ?? []).flatMap(({ resource, actions }) => {
      if (resource.type !== BUSINESS_TYPE)
        return [{ resource, actions: actions.map((action) => ({ action })) }];
      const objects = scope.objects('nocoreach.projects');
      const projects = objects === 'all' ? ['*'] : objects;
      const targets = new Map<string, { action: string }[]>();
      for (const action of actions) {
        const separator = action.indexOf('.');
        const ids = applicationAction(
          action.slice(0, separator),
          action.slice(separator + 1),
        )
          ? ['$app']
          : projects;
        for (const id of ids) {
          if (!targets.has(id)) targets.set(id, []);
          targets.get(id)!.push({ action });
        }
      }
      return [...targets].map(([id, actions]) => ({
        resource: { ...resource, id },
        actions,
      }));
    });
  }

  private async requireScope(scope: KeyScope, context: AuthorizationContext) {
    for (const { resource, actions } of this.scopeGrants(scope))
      for (const action of actions) {
        if (!(await context.can({ resource, action: action.action })))
          refuse('不能授予超出当前权限的密钥范围');
      }
  }

  private async mutationActor(
    connection: DatabaseConnection,
    actor: string,
    delegated: boolean,
    scope?: KeyScope,
  ) {
    await this.access.lockManagement(connection);
    const current = await this.access.personGrants(actor, connection);
    const required = [
      ...(delegated
        ? this.access.grants([{ resource: 'nrKeys', action: 'manage' }], '$app')
        : []),
      ...(scope ? this.scopeGrants(scope) : []),
    ];
    if (!current.root && !grantSubset(required, current.grants))
      refuse('权限已更改，请刷新后重试');
    return current;
  }

  private async requireOwner(
    connection: DatabaseConnection,
    actorRoot: boolean,
    userId: string,
    scope?: KeyScope,
  ) {
    const sets = this.access.authorization.permissionSets;
    const roles = await sets.withTransaction(connection).getEffective({
      principal: { type: 'user', id: userId },
      subjects: [{ type: 'authenticated', id: '*' }],
    });
    const root = roles.some((role) => sets.protection(role.key)?.unrestricted);
    if (root && !actorRoot) refuse('只有系统管理员能管理系统管理员的密钥');
    if (
      scope &&
      !root &&
      !grantSubset(
        this.scopeGrants(scope),
        await this.access.withMemberProjects(
          roles.flatMap((role) => role.grants),
          userId,
          connection,
        ),
      )
    )
      refuse('不能授予超出密钥所有者当前权限的范围');
  }

  async create(actor: string, input: Input) {
    await this.person(actor);
    if (
      input.type === 'organization' ||
      (input.userId && input.userId !== actor)
    )
      await this.access.require('nrKeys', 'manage');
    const checked = await this.keys(this.access.database.connection()).check(
      { ...input, expiresInDays: input.expiresInDays ?? 90 },
      this.access.current()!.context.identity,
    );
    if (!checked.scope) return refuse('密钥必须指定权限范围');
    const compiled = this.scopes.compile('check', checked.scope);
    return this.access.database.transaction(async (connection) => {
      const currentActor = await this.mutationActor(
        connection,
        actor,
        input.type === 'organization' || (input.userId || actor) !== actor,
        compiled,
      );
      const sets =
        this.access.authorization.permissionSets.withTransaction(connection);
      let userId: string;
      if (input.type === 'organization') {
        const roles = [...new Set(input.roles ?? [])];
        if (!roles.length) refuse('组织密钥需要业务角色');
        const grants: PermissionGrant[] = [];
        for (const key of roles) {
          const role = await sets.get(key);
          if (
            !role ||
            !key.startsWith('nr.') ||
            this.access.invalidRoleGrants(role.grants)
          )
            return refuse('无效的业务角色');
          grants.push(...role.grants);
        }
        // The service identity belongs to the projects its key selects, which project-member roles then reach.
        const selected = compiled.objects('nocoreach.projects');
        const projects = selected === 'all' ? [] : [...selected];
        if (
          !grantSubset(
            this.scopeGrants(compiled),
            await this.access.withMemberProjects(
              grants,
              '',
              connection,
              projects,
            ),
          )
        )
          accessError('scopeExceedsRoles');
        if (!currentActor.root && !grantSubset(grants, currentActor.grants))
          refuse('权限已更改，请刷新后重试');
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
        await this.access.joinProjects(connection, userId, projects);
      } else {
        userId = input.userId || actor;
        const target = await this.users.withConnection(connection).get(userId);
        if (
          !target ||
          target.kind !== 'person' ||
          !(await this.access.role(userId, connection))
        )
          refuse('密钥所有者必须是有效成员');
        await this.requireOwner(
          connection,
          currentActor.root,
          userId,
          compiled,
        );
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
    return this.access.database.transaction(async (connection) => {
      const currentActor = await this.mutationActor(
        connection,
        actor,
        actor !== ownerId,
      );
      const keys = this.keys(connection);
      const key = await keys.get(ownerId, keyId);
      if (
        !key.scope ||
        !key.enabled ||
        !key.expiresAt ||
        Date.parse(key.expiresAt) <= Date.now()
      )
        return refuse('只能轮换仍有效的受限密钥');
      const compiled = this.scopes.compile(keyId, key.scope);
      if (
        !currentActor.root &&
        !grantSubset(this.scopeGrants(compiled), currentActor.grants)
      )
        refuse('不能授予超出当前权限的密钥范围');
      if (!(await this.access.role(ownerId, connection)))
        refuse('密钥所有者已失去成员资格');
      await this.requireOwner(connection, currentActor.root, ownerId, compiled);
      const replacement = await keys.rotate(ownerId, keyId);
      await this.access.event(connection, actor, 'key.rotate', keyId, {
        ownerId,
        expiresAt: replacement.key.expiresAt,
      });
      return replacement;
    });
  }

  async revoke(actor: string, keyId: string, ownerId: string) {
    await this.authorizeOwner(actor, ownerId);
    await this.access.database.transaction(async (connection) => {
      const currentActor = await this.mutationActor(
        connection,
        actor,
        actor !== ownerId,
      );
      await this.requireOwner(connection, currentActor.root, ownerId);
      const organization = await connection
        .repository('nrOrganizationKeys')
        .findOne({ filter: { id: keyId, serviceUserId: ownerId } });
      try {
        await this.keys(connection).revoke(ownerId, keyId);
      } catch (error) {
        if (
          !organization ||
          !(error instanceof ApiKeyRequestError) ||
          error.code !== 'KEY_NOT_FOUND'
        )
          throw error;
        if (
          await connection.repository('nrAccessEvents').findOne({
            filter: { targetId: keyId, action: 'key.revoke' },
          })
        )
          return;
        // Pruning an expired credential does not retire its trusted organization identity.
      }
      const retainedRoles: string[] = [];
      if (organization) {
        const sets =
          this.access.authorization.permissionSets.withTransaction(connection);
        const assignments = await connection
          .repository<{
            id: string;
            permissionSetKey: string;
            subjectType: string;
            subjectId: string;
          }>('authorizationPermissionSetAssignments')
          .findMany({ filter: { subjectType: 'user', subjectId: ownerId } });
        for (const assignment of assignments) {
          if (!assignment.permissionSetKey.startsWith('nr.')) continue;
          try {
            await sets.revoke(assignment.id);
          } catch (error) {
            // A service identity is not an active administrator. Keep the framework's
            // protection when it refuses its sole built-in assignment, and retire the account.
            if (
              !(error instanceof PermissionSetLastAssignmentError) ||
              error.key !== BUSINESS_ADMIN
            )
              throw error;
            retainedRoles.push(error.key);
          }
        }
        await this.users.withConnection(connection).disable(ownerId);
      }
      await this.access.event(connection, actor, 'key.revoke', keyId, {
        ownerId,
        ...(retainedRoles.length ? { retainedRoles } : {}),
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
      .orderBy('id', 'desc')
      .limit(limit)
      .execute();
  }
}
