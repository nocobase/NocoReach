import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@nocobase/app-server/router';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import type {
  AuthorizationContext,
  KeyScope,
  PermissionGrant,
} from '@nocobase/authorization/core';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import {
  ADMIN_PAGES,
  REACH_PAGES,
  TEAM_SETTINGS,
} from '../../shared/access-pages.js';
import { PermissionSetLastAssignmentError } from '@nocobase/authorization/permission-sets';

export const BUSINESS_TYPE = 'nocoreach';
export const BUSINESS_ADMIN = 'nr.admin';
export const BUSINESS_MEMBER = 'nr.member';
const UPGRADE = 'nr-migrations:access:20261016';
type Role = 'admin' | 'member' | null;
type Action = { resource: string; action: string };
type RequestAccess = {
  userId: string;
  context: AuthorizationContext;
  keyScope?: KeyScope;
  role?: Role;
  http?: Request;
  active?: boolean;
};

function denied(message: string): never {
  throw new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'NOCOREACH_ACCESS_DENIED',
    domain: 'nocoreach',
    message,
    metadata: { ns: 'nocoreach', key: 'access.denied' },
  });
}

/** The framework owns every role definition and assignment. No runtime read of nr-members remains. */
export class ReachAccess {
  private readonly request = new AsyncLocalStorage<RequestAccess>();
  private actions: readonly Action[] = [];
  private readonly requestRoles = new WeakMap<
    Request,
    { userId: string; role: Promise<Role> }
  >();

  constructor(
    readonly database: DatabaseManager,
    readonly authorization: AppAuthorization,
    readonly nextId: () => string,
    readonly retireLegacyKeys: (
      connection: DatabaseConnection,
    ) => Promise<number>,
  ) {}

  register(actions: readonly Action[]) {
    // The results dashboard is another projection of the existing result read permission.
    this.actions = actions.filter(
      (item) => !(item.resource === 'nrTaskWork' && item.action === 'board'),
    );
    this.authorization.resourceTypes.add({
      type: BUSINESS_TYPE,
      actions: [
        ...new Set(
          this.actions.map(({ resource, action }) => `${resource}.${action}`),
        ),
      ],
    });
  }

  catalogue() {
    return this.actions.filter(({ resource }) => resource !== 'nrImport');
  }

  /** Resource ids are data selections within an application role, never project memberships. */
  grants(actions: readonly Action[], id = '*'): PermissionGrant[] {
    return [
      {
        resource: { type: BUSINESS_TYPE, id },
        actions: actions.map(({ resource, action }) => ({
          action: `${resource}.${action}`,
        })),
      },
    ];
  }

  pageGrants(admin: boolean): PermissionGrant[] {
    return [
      ...REACH_PAGES.filter((page) => admin || !ADMIN_PAGES.has(page)).map(
        (id) => ({
          resource: { type: 'page', id },
          actions: [{ action: 'access' }],
        }),
      ),
      ...['runtimes', ...(admin ? ['usage', 'scheduler.schedules'] : [])].map(
        (id) => ({
          resource: { type: 'page', id },
          actions: [{ action: 'access' }],
        }),
      ),
      ...(admin
        ? TEAM_SETTINGS.map((id) => ({
            resource: { type: 'settings', id },
            actions: [{ action: 'read' }, { action: 'manage' }],
          }))
        : []),
      ...(admin
        ? [
            {
              resource: { type: 'settings', id: 'scheduler.schedules' },
              actions: [{ action: 'read' }],
            },
          ]
        : []),
    ];
  }

  async role(
    userId: string,
    boundConnection?: DatabaseConnection,
  ): Promise<Role> {
    const request = this.current();
    if (!boundConnection && request?.userId === userId && request.role)
      return request.role;
    const connection = boundConnection ?? this.database.connection();
    const user = await connection
      .repository('user')
      .findOne({ filter: { id: String(userId) } });
    if (!user || user.disabledAt != null) return null;
    if (
      user.kind === 'service' &&
      !(await connection
        .repository('nrOrganizationKeys')
        .findOne({ filter: { serviceUserId: String(userId) } }))
    )
      return null;
    const assignments = await connection
      .repository<{
        permissionSetKey: string;
        subjectType: string;
        subjectId: string;
      }>('authorizationPermissionSetAssignments')
      .findMany({
        filter: { subjectType: 'user', subjectId: String(userId) },
      });
    const keys = assignments.map((assignment) =>
      String(assignment.permissionSetKey),
    );
    if (keys.includes('root') || keys.includes(BUSINESS_ADMIN)) return 'admin';
    return keys.some((key) => key.startsWith('nr.')) ? 'member' : null;
  }

  current() {
    const scope = this.request.getStore();
    return scope?.active === false ? undefined : scope;
  }

  roleFor(http: Request, userId: string) {
    let cached = this.requestRoles.get(http);
    if (!cached || cached.userId !== userId) {
      cached = { userId, role: this.role(userId, this.database.connection()) };
      this.requestRoles.set(http, cached);
    }
    return cached.role;
  }

  async run<T>(request: RequestAccess, fn: () => Promise<T>): Promise<T> {
    const role = await (request.http
      ? this.roleFor(request.http, request.userId)
      : this.role(request.userId));
    if (!role) denied('还没有加入 NocoReach，请联系管理员');
    const scope = { ...request, role, active: true };
    return this.request.run(scope, async () => {
      try {
        return await fn();
      } finally {
        scope.active = false;
      }
    });
  }

  async allows(
    resource: string,
    action: string,
    project?: string,
  ): Promise<boolean> {
    const request = this.current();
    if (!request) return false;
    if (resource === 'nrTaskWork' && action === 'board') action = 'results';
    if (
      resource === 'nrMembers' ||
      resource === 'nrImport' ||
      resource === 'nrKeys' ||
      resource === 'nrSchedules' ||
      (resource === 'nrProjects' && action !== 'list') ||
      (resource === 'nrProxyProfiles' &&
        !['selections', 'select', 'testConnection'].includes(action))
    )
      project = undefined;
    const id = project || '$app';
    // Project listing is filtered item by item; its outer gate only requires business membership.
    if (resource === 'nrProjects' && action === 'list' && !project) return true;
    if (!project && request.keyScope && resource !== 'nrProjects') {
      if (request.keyScope.objects('nocoreach.projects') !== 'all')
        return false;
    }
    if (project && request.keyScope) {
      const selected = request.keyScope.objects('nocoreach.projects');
      if (selected !== 'all' && !selected.includes(project)) return false;
    }
    return request.context.can({
      resource: { type: BUSINESS_TYPE, id },
      action: `${resource}.${action}`,
    });
  }

  async require(resource: string, action: string, project?: string) {
    if (!(await this.allows(resource, action, project)))
      denied('没有此操作或数据范围的权限');
  }

  async requireFor(
    userId: string,
    resource: string,
    action: string,
    project?: string,
  ) {
    if (this.current()?.userId === userId)
      return this.require(resource, action, project);
    return this.as(userId, () => this.require(resource, action, project));
  }

  async freshFor(
    userId: string,
    resource: string,
    action: string,
    project?: string,
  ) {
    return this.request.exit(() =>
      this.requireFor(userId, resource, action, project),
    );
  }

  async as<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const principal = { type: 'user', id: userId };
    const subjects = [
      { type: 'authenticated', id: '*' },
      ...(await this.authorization.subjects.resolveFor(principal)),
    ];
    return this.run(
      { userId, context: this.authorization.for({ principal, subjects }) },
      fn,
    );
  }

  /** Runs before readiness; the legacy snapshot is retained solely as a rollback artifact. */
  async upgrade(isAdminOnly: (resource: string, action: string) => boolean) {
    await this.database.transaction(async (connection) => {
      if (
        await connection
          .repository('nrSnapshots')
          .findOne({ filter: { key: UPGRADE } })
      )
        return;
      const sets =
        this.authorization.permissionSets.withTransaction(connection);
      for (const key of [BUSINESS_ADMIN, BUSINESS_MEMBER]) {
        if (await sets.get(key))
          throw new Error(
            `Permission set ${key} already exists before access migration`,
          );
      }
      const legacy = await connection
        .repository('nrSnapshots')
        .findOne({ filter: { key: 'nr-members' } });
      const users =
        (legacy?.payload as { users?: Record<string, unknown> } | null)
          ?.users ?? {};
      await sets.create({
        key: BUSINESS_ADMIN,
        title: 'NocoReach administrator',
        grants: [
          ...this.grants(
            this.actions.filter((action) => action.resource !== 'nrImport'),
          ),
          ...this.pageGrants(true),
        ],
      });
      await sets.create({
        key: BUSINESS_MEMBER,
        title: 'NocoReach member',
        grants: [
          ...this.grants(
            this.actions.filter(
              ({ resource, action }) =>
                !isAdminOnly(resource, action) && resource !== 'nrImport',
            ),
          ),
          ...this.pageGrants(false),
        ],
      });
      for (const [id, role] of Object.entries(users)) {
        if (role !== 'admin' && role !== 'member')
          throw new Error(`Unknown legacy membership for ${id}`);
        const user = await connection
          .repository('user')
          .findOne({ filter: { id } });
        if (!user || user.kind !== 'person')
          throw new Error(`Legacy member ${id} is not a person`);
        await sets.assign({
          permissionSet: role === 'admin' ? BUSINESS_ADMIN : BUSINESS_MEMBER,
          subject: { type: 'user', id },
        });
      }
      const retiredKeys = await this.retireLegacyKeys(connection);
      await connection.repository('nrSnapshots').createOne({
        values: {
          id: this.nextId(),
          key: UPGRADE,
          payload: {
            version: 1,
            migratedUsers: Object.keys(users).length,
            retiredKeys,
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      await this.event(connection, 'system', 'member.migrate', '20261016', {
        count: Object.keys(users).length,
        retiredKeys,
      });
    });
    this.authorization.permissionSets.protect({
      owner: 'nocoreach',
      keys: [BUSINESS_ADMIN],
      assignableTo: ['user'],
      requireActiveAssignment: true,
    });
  }

  async replaceRoles(
    actorId: string,
    userId: string,
    keys: readonly string[],
  ): Promise<void> {
    if (!this.current())
      return this.as(actorId, () => this.replaceRoles(actorId, userId, keys));
    if (this.current()!.userId !== actorId) denied('操作账号已更改');
    await this.require('nrMembers', 'setRole');
    if (actorId === userId) denied('不能在此修改自己的角色');
    const checked = await this.assertGrantable(keys);
    const previous = await this.database
      .connection()
      .repository<{
        permissionSetKey: string;
        subjectId: string;
        subjectType: string;
      }>('authorizationPermissionSetAssignments')
      .findMany({ filter: { subjectType: 'user', subjectId: userId } });
    const previousKeys = previous
      .map((row) => row.permissionSetKey)
      .filter((key) => key.startsWith('nr.'))
      .sort();
    const previousDefinitions = await this.assertGrantable(previousKeys);
    await this.database
      .transaction(async (connection) => {
        const target = await connection
          .repository('user')
          .findOne({ filter: { id: userId, kind: 'person' } });
        if (!target || target.disabledAt != null) denied('成员不存在或已停用');
        const sets =
          this.authorization.permissionSets.withTransaction(connection);
        const root = await connection
          .repository<{
            permissionSetKey: string;
            subjectId: string;
            subjectType: string;
          }>('authorizationPermissionSetAssignments')
          .findMany({
            filter: {
              subjectType: 'user',
              subjectId: userId,
            },
          });
        if (root.some((assignment) => assignment.permissionSetKey === 'root'))
          denied('不能在此修改系统管理员');
        const currentKeys = root
          .map((assignment) => String(assignment.permissionSetKey))
          .filter((key) => key.startsWith('nr.'))
          .sort();
        if (JSON.stringify(currentKeys) !== JSON.stringify(previousKeys))
          denied('成员角色已更改，请刷新后重试');
        for (const key of currentKeys)
          if (
            JSON.stringify(await sets.get(key)) !== previousDefinitions.get(key)
          )
            denied('角色已更改，请刷新后重试');
        const managed = (await sets.list())
          .map((set) => set.key)
          .filter((key) => key.startsWith('nr.'));
        if (keys.some((key) => !managed.includes(key)))
          denied('无效的业务角色');
        for (const key of keys)
          if (JSON.stringify(await sets.get(key)) !== checked.get(key))
            denied('角色已更改，请刷新后重试');
        await sets.replaceSubjectAssignments({
          subject: { type: 'user', id: userId },
          managedPermissionSets: managed,
          permissionSets: [...new Set(keys)],
        });
        await this.event(connection, actorId, 'member.roles', userId, {
          roles: keys,
        });
      })
      .catch((error: unknown) => {
        if (error instanceof PermissionSetLastAssignmentError)
          throw new ApiError({
            status: 'ALREADY_EXISTS',
            reason: 'LAST_BUSINESS_ADMIN',
            domain: 'nocoreach',
            message: 'Cannot remove the last active business administrator.',
          });
        throw error;
      });
  }

  async assertGrantable(keys: readonly string[]) {
    const checked = new Map<string, string>();
    const context = this.current()?.context;
    if (!context) denied('缺少当前授权上下文');
    for (const key of keys) {
      const set = await this.authorization.permissionSets.get(key);
      if (!set || !key.startsWith('nr.')) denied('无效的业务角色');
      for (const grant of set.grants) {
        if (
          grant.resource.type !== BUSINESS_TYPE &&
          !this.pageGrants(true).some(
            (allowed) =>
              allowed.resource.type === grant.resource.type &&
              allowed.resource.id === grant.resource.id &&
              grant.actions.every((action) =>
                allowed.actions.some((a) => a.action === action.action),
              ),
          )
        )
          denied('业务角色不能授予系统权限');
        for (const action of grant.actions) {
          if (
            action.policy ||
            !(await context.can({
              resource: grant.resource,
              action: action.action,
            }))
          )
            denied('角色超出当前可授予权限');
        }
      }
      checked.set(key, JSON.stringify(set));
    }
    return checked;
  }

  async event(
    connection: DatabaseConnection,
    actorId: string,
    action: string,
    targetId: string,
    changes: Record<string, unknown>,
  ) {
    await connection.repository('nrAccessEvents').createOne({
      values: {
        id: randomUUID(),
        actorId,
        action,
        targetId,
        changes,
        createdAt: new Date(),
      },
    });
  }
}
