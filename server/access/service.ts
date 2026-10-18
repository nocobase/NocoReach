import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@nocobase/app-server/router';
import type { AppAuthorization } from '@nocobase/app-plugin-authorization/server';
import {
  grantBacked,
  type AuthorizationContext,
  type KeyScope,
  type PermissionGrant,
} from '@nocobase/authorization/core';
import type { DatabaseConnection, DatabaseManager } from '@nocobase/db';
import { PermissionSetLastAssignmentError } from '@nocobase/authorization/permission-sets';
import {
  CAPABILITIES,
  MEMBER_CAPABILITIES,
  type RoleAccess,
} from '../../shared/access-capabilities.js';
import { applicationAction } from './catalog.js';
import {
  BUSINESS_TYPE,
  MEMBER_PROJECTS,
  pageGrants,
  roleAccessOf,
  roleGrants,
} from './roles.js';

export { BUSINESS_TYPE, MEMBER_PROJECTS };
export const BUSINESS_ADMIN = 'nr.admin';
export const BUSINESS_MEMBER = 'nr.member';

/** Compare finite grants for delegation, invitation ceilings and task admission. */
export function grantSubset(
  grants: readonly PermissionGrant[],
  ceiling: readonly PermissionGrant[],
): boolean {
  return grants.every((grant) =>
    grant.actions.every(
      (action) =>
        !action.policy &&
        ceiling.some(
          (allowed) =>
            allowed.resource.type === grant.resource.type &&
            (allowed.resource.id === grant.resource.id ||
              (allowed.resource.id === '*' &&
                grant.resource.type === BUSINESS_TYPE)) &&
            allowed.actions.some(
              (candidate) =>
                candidate.action === action.action && !candidate.policy,
            ),
        ),
    ),
  );
}

const UPGRADE = 'nr-migrations:access:20261016';
// Project membership and capability roles replace per-action custom roles.
const PROJECT_ACCESS = 'nr-migrations:access:20261018';
const PROJECT_ID = /^[1-9]\d{0,15}$/;
export const ADMIN_ROLE: RoleAccess = {
  scope: 'all',
  capabilities: CAPABILITIES,
};
export const MEMBER_ROLE: RoleAccess = {
  scope: 'member',
  capabilities: MEMBER_CAPABILITIES,
};
type Role = 'admin' | 'member' | null;
type Action = { resource: string; action: string };
type RequestAccess = {
  userId: string;
  context: AuthorizationContext;
  keyScope?: KeyScope;
  role?: Role;
  http?: Request;
  active?: boolean;
  projects?: Promise<Set<string>>;
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
    const granted = grantBacked();
    this.authorization.resourceTypes.add({
      type: BUSINESS_TYPE,
      actions: [...this.registered()],
      // A `$member` grant reaches a project once its holder belongs to it.
      authorize: async (request, context) => {
        const decision = await granted(request, context);
        const project = request.resource.id;
        if (
          decision.effect === 'permit' ||
          request.principal.type !== 'user' ||
          !PROJECT_ID.test(project)
        )
          return decision;
        const grants = await context.grants.resolve({
          principal: request.principal,
          ...(request.subjects ? { subjects: request.subjects } : {}),
          resource: { type: BUSINESS_TYPE, id: MEMBER_PROJECTS },
          action: request.action,
        });
        if (
          !grants.some((grant) => grant.policy === undefined) ||
          !(await this.projectsOf(request.principal.id)).has(project)
        )
          return decision;
        return {
          effect: 'permit',
          reasons: [
            {
              code: 'PROJECT_MEMBER',
              message: `Project ${project} member allows ${request.action}`,
            },
          ],
        };
      },
    });
  }

  registered() {
    return new Set(
      this.actions.map(({ resource, action }) => `${resource}.${action}`),
    );
  }

  /** The projects a person belongs to, read once per business request. */
  projectsOf(userId: string, connection?: DatabaseConnection) {
    const request = this.current();
    const read = async () =>
      new Set(
        (
          await (connection ?? this.database.connection())
            .repository<{ projectId: string; userId: string }>(
              'nrProjectMembers',
            )
            .findMany({ filter: { userId: String(userId) } })
        ).map((row) => String(row.projectId)),
      );
    if (connection || request?.userId !== userId) return read();
    return (request.projects ??= read());
  }

  roleGrants(role: RoleAccess) {
    return roleGrants(role, this.registered());
  }

  roleAccess(grants: readonly PermissionGrant[]) {
    return roleAccessOf(grants);
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

  /** Read current business membership and grants on the caller's connection. */
  async memberGrants(actorId: string, connection: DatabaseConnection) {
    if ((await this.role(actorId, connection)) === null)
      denied('操作账号已不再是应用成员');
    const effective = await this.authorization.permissionSets
      .withTransaction(connection)
      .getEffective({
        principal: { type: 'user', id: actorId },
        subjects: [{ type: 'authenticated', id: '*' }],
      });
    const root = effective.some(
      (set) =>
        this.authorization.permissionSets.protection(set.key)?.unrestricted,
    );
    const grants = effective.flatMap((set) => set.grants);
    return {
      root,
      grants: await this.withMemberProjects(grants, actorId, connection),
    };
  }

  /**
   * Delegation compares finite grants: a `$member` grant also covers each project its holder belongs to, or the
   * given projects of a service identity.
   */
  async withMemberProjects(
    grants: readonly PermissionGrant[],
    userId: string,
    connection: DatabaseConnection,
    projects?: readonly string[],
  ): Promise<PermissionGrant[]> {
    const member = grants.filter(
      (grant) =>
        grant.resource.type === BUSINESS_TYPE &&
        grant.resource.id === MEMBER_PROJECTS,
    );
    if (!member.length) return [...grants];
    const ids = projects ?? [...(await this.projectsOf(userId, connection))];
    return [
      ...grants,
      ...member.flatMap((grant) =>
        ids.map((id) => ({ ...grant, resource: { type: BUSINESS_TYPE, id } })),
      ),
    ];
  }

  /** Delegation additionally requires an interactive person identity. */
  async personGrants(actorId: string, connection: DatabaseConnection) {
    const grants = await this.memberGrants(actorId, connection);
    const user = await connection
      .repository('user')
      .findOne({ filter: { id: actorId, kind: 'person' } });
    if (!user || user.disabledAt != null) denied('操作账号不存在或已停用');
    return grants;
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
    if (applicationAction(resource, action)) project = undefined;
    const id = project || '$app';
    // Project listing is filtered item by item; its outer gate only requires business membership.
    if (resource === 'nrProjects' && action === 'list' && !project) return true;
    if (!project && request.keyScope) {
      if (request.keyScope.objects('nocoreach.projects') !== 'all')
        return false;
    }
    if (project && request.keyScope) {
      const selected = request.keyScope.objects('nocoreach.projects');
      if (selected !== 'all' && !selected.includes(project)) return false;
    }
    const can = (target: string) =>
      request.context.can({
        resource: { type: BUSINESS_TYPE, id: target },
        action: `${resource}.${action}`,
      });
    // A conversation without a project reads no project data: a reader in any of their projects may hold one.
    if (resource === 'nrOnline' && action === 'read' && !project) {
      if (await can(id)) return true;
      for (const member of await this.projectsOf(request.userId))
        if (await can(member)) return true;
      return false;
    }
    return can(id);
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
  async upgrade() {
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
        grants: this.roleGrants(ADMIN_ROLE),
      });
      await sets.create({
        key: BUSINESS_MEMBER,
        title: 'NocoReach member',
        grants: this.roleGrants(MEMBER_ROLE),
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
    await this.upgradeProjectAccess();
    await this.syncRoles();
    this.authorization.permissionSets.protect({
      owner: 'nocoreach',
      keys: [BUSINESS_ADMIN],
      assignableTo: ['user'],
      requireActiveAssignment: true,
    });
  }

  /**
   * Once: custom roles saved as individual actions are removed and their holders keep the member role, and every
   * current business member joins every existing project, so nobody loses the projects they could reach.
   */
  private async upgradeProjectAccess() {
    await this.database.transaction(async (connection) => {
      const snapshots = connection.repository('nrSnapshots');
      if (await snapshots.findOne({ filter: { key: PROJECT_ACCESS } })) return;
      const sets =
        this.authorization.permissionSets.withTransaction(connection);
      const builtIn = [BUSINESS_ADMIN, BUSINESS_MEMBER];
      const removed: string[] = [];
      const kept = new Set<string>();
      for (const set of await sets.list()) {
        if (!set.key.startsWith('nr.') || builtIn.includes(set.key)) continue;
        for (const assignment of await sets.listAssignments(set.key)) {
          if (assignment.subject.type === 'user')
            kept.add(assignment.subject.id);
          await sets.revoke(assignment.id);
        }
        await sets.delete(set.key);
        removed.push(set.key);
      }
      const assignments = await connection
        .repository<{
          permissionSetKey: string;
          subjectType: string;
          subjectId: string;
        }>('authorizationPermissionSetAssignments')
        .findMany({ filter: { subjectType: 'user' } });
      const held = (id: string) =>
        assignments.filter(
          (row) =>
            String(row.subjectId) === id &&
            (row.permissionSetKey === 'root' ||
              builtIn.includes(String(row.permissionSetKey))),
        ).length > 0;
      for (const id of kept)
        if (!held(id))
          await sets.assign({
            permissionSet: BUSINESS_MEMBER,
            subject: { type: 'user', id },
          });
      const members = new Set([
        ...kept,
        ...assignments
          .filter((row) => builtIn.includes(String(row.permissionSetKey)))
          .map((row) => String(row.subjectId)),
      ]);
      const projects = await this.projectIds(connection);
      const now = new Date();
      for (const projectId of projects)
        for (const userId of members)
          await connection.repository('nrProjectMembers').createOne({
            values: { id: randomUUID(), projectId, userId, createdAt: now },
          });
      await snapshots.createOne({
        values: {
          id: this.nextId(),
          key: PROJECT_ACCESS,
          payload: { version: 1, removedRoles: removed, members: members.size },
          createdAt: now,
          updatedAt: now,
        },
      });
      await this.event(connection, 'system', 'member.migrate', '20261018', {
        removedRoles: removed,
        members: members.size,
        projects: projects.length,
      });
    });
  }

  /** Built-in roles follow the current catalogue; custom roles also receive actions added to their capabilities. */
  private async syncRoles() {
    await this.database.transaction(async (connection) => {
      const sets =
        this.authorization.permissionSets.withTransaction(connection);
      for (const set of await sets.list()) {
        if (!set.key.startsWith('nr.')) continue;
        const grants = this.roleGrants(
          set.key === BUSINESS_ADMIN
            ? ADMIN_ROLE
            : set.key === BUSINESS_MEMBER
              ? MEMBER_ROLE
              : this.roleAccess(set.grants),
        );
        if (JSON.stringify(grants) !== JSON.stringify(set.grants))
          await sets.update(set.key, {
            key: set.key,
            title: set.title,
            grants,
          });
      }
    });
  }

  /** Every project id, including the original `project` record. */
  async projectIds(connection: DatabaseConnection) {
    const rows = await connection.query
      .selectFrom('nrSnapshots')
      .select(['key', 'payload'])
      .where((where) =>
        where.or([
          where('key', '=', 'project'),
          where('key', 'like', 'project:%'),
        ]),
      )
      .execute();
    return [
      ...new Set(
        rows
          .map((row) => {
            const payload =
              typeof row.payload === 'string'
                ? (JSON.parse(row.payload) as { id?: unknown })
                : (row.payload as { id?: unknown } | null);
            const id = payload?.id;
            return typeof id === 'number' || typeof id === 'string'
              ? String(id)
              : '';
          })
          .filter((id) => PROJECT_ID.test(id)),
      ),
    ];
  }

  /** The members of each project; one query for the members list. */
  async projectMembers(connection = this.database.connection()) {
    const rows = await connection
      .repository<{ projectId: string; userId: string }>('nrProjectMembers')
      .findMany({});
    const result = new Map<string, string[]>();
    for (const row of rows) {
      const userId = String(row.userId);
      if (!result.has(userId)) result.set(userId, []);
      result.get(userId)!.push(String(row.projectId));
    }
    return result;
  }

  /** Replace the projects a person belongs to, within the caller's management transaction. */
  async setProjects(
    connection: DatabaseConnection,
    userId: string,
    projectIds: readonly string[],
  ) {
    const repository = connection.repository<{
      id: string;
      projectId: string;
      userId: string;
    }>('nrProjectMembers');
    const current = await repository.findMany({ filter: { userId } });
    const next = new Set(projectIds);
    for (const row of current)
      if (!next.has(String(row.projectId)))
        await repository.deleteMany({ filter: { id: row.id } });
    await this.joinProjects(
      connection,
      userId,
      [...next].filter(
        (id) => !current.some((row) => String(row.projectId) === id),
      ),
    );
    await this.authorization.permissionSets
      .withTransaction(connection)
      .notifyAssignmentsChanged({ type: 'user', id: userId });
  }

  /** The creator of a project belongs to it. */
  async joinCreatedProject(userId: string, projectId: string) {
    await this.database.transaction(async (connection) => {
      await this.joinProjects(connection, userId, [projectId]);
      await this.authorization.permissionSets
        .withTransaction(connection)
        .notifyAssignmentsChanged({ type: 'user', id: userId });
    });
  }

  /** Add memberships that do not exist yet. */
  async joinProjects(
    connection: DatabaseConnection,
    userId: string,
    projectIds: readonly string[],
  ) {
    const repository = connection.repository('nrProjectMembers');
    const existing = await this.projectsOf(userId, connection);
    const known = new Set(await this.projectIds(connection));
    for (const projectId of new Set(projectIds)) {
      if (!known.has(projectId)) denied('项目不存在');
      if (existing.has(projectId)) continue;
      await repository.createOne({
        values: {
          id: randomUUID(),
          projectId,
          userId,
          createdAt: new Date(),
        },
      });
    }
  }

  /** Serialize role mutations and assignments across processes before reading their preconditions. */
  async lockManagement(connection: DatabaseConnection) {
    // The completed access migration supplies one application-owned row on every installation.
    // An identity UPDATE locks it until commit without changing the migration or framework tables.
    const result = await connection.query
      .updateTable('nrSnapshots')
      .set({ key: UPGRADE })
      .where('key', '=', UPGRADE)
      .execute();
    if (result.updatedCount !== 1)
      throw new Error('Business access is not initialized');
  }

  async replaceRoles(
    actorId: string,
    userId: string,
    keys: readonly string[],
    expectedRoles?: readonly string[],
    projects?: {
      projectIds: readonly string[];
      expectedProjects: readonly string[];
    },
  ): Promise<void> {
    const request = this.current();
    if (!request)
      return this.as(actorId, () =>
        this.replaceRoles(actorId, userId, keys, expectedRoles, projects),
      );
    if (request.userId !== actorId) denied('操作账号已更改');
    if (request.keyScope) denied('成员管理需要使用人员登录会话');
    await this.require('nrMembers', 'setRole');
    if (actorId === userId) denied('不能在此修改自己的角色');
    await this.database
      .transaction(async (connection) => {
        await this.lockManagement(connection);
        const actor = await this.personGrants(actorId, connection);
        if (
          !actor.root &&
          !grantSubset(
            this.grants([{ resource: 'nrMembers', action: 'setRole' }], '$app'),
            actor.grants,
          )
        )
          denied('没有此操作或数据范围的权限');
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
        if (
          expectedRoles &&
          JSON.stringify(currentKeys) !==
            JSON.stringify([...new Set(expectedRoles)].sort())
        )
          throw new ApiError({
            status: 'ALREADY_EXISTS',
            reason: 'changed',
            domain: 'nocoreach',
            message: 'Member roles changed. Refresh before saving.',
            metadata: { ns: 'nocoreach', key: 'accessMembers.errors.changed' },
          });
        const managed = (await sets.list())
          .map((set) => set.key)
          .filter((key) => key.startsWith('nr.'));
        if (keys.some((key) => !managed.includes(key)))
          denied('无效的业务角色');
        for (const key of new Set([...currentKeys, ...keys])) {
          const set = await sets.get(key);
          if (!set || this.invalidRoleGrants(set.grants))
            denied('无效的业务角色');
          if (!actor.root && !grantSubset(set.grants, actor.grants))
            denied('角色超出当前可授予权限');
        }
        await sets.replaceSubjectAssignments({
          subject: { type: 'user', id: userId },
          managedPermissionSets: managed,
          permissionSets: [...new Set(keys)],
        });
        // A removed member leaves every project; otherwise only an explicit selection changes them.
        const before = [...(await this.projectsOf(userId, connection))].sort();
        const next = !keys.length ? [] : projects?.projectIds;
        if (next) {
          if (
            projects &&
            keys.length &&
            JSON.stringify(before) !==
              JSON.stringify([...new Set(projects.expectedProjects)].sort())
          )
            throw new ApiError({
              status: 'ALREADY_EXISTS',
              reason: 'changed',
              domain: 'nocoreach',
              message: 'Member projects changed. Refresh before saving.',
              metadata: {
                ns: 'nocoreach',
                key: 'accessMembers.errors.changed',
              },
            });
          const changed = [
            ...before.filter((id) => !next.includes(id)),
            ...next.filter((id) => !before.includes(id)),
          ];
          // Removing a whole member is part of member management; a project selection stays within reach.
          if (keys.length)
            for (const id of changed)
              if (!(await this.allows('nrProjects', 'list', id)))
                denied('没有此项目的权限');
          await this.setProjects(connection, userId, next);
        }
        await this.event(connection, actorId, 'member.roles', userId, {
          roles: keys,
          ...(next ? { projects: next } : {}),
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

  /** Only policyless grants from the application catalogue can be delegated as business roles. */
  invalidRoleGrants(grants: readonly PermissionGrant[]) {
    const actions = new Map(
      this.catalogue().map(({ resource, action }) => [
        `${resource}.${action}`,
        applicationAction(resource, action),
      ]),
    );
    const pages = pageGrants(CAPABILITIES);
    for (const grant of grants) {
      if (grant.resource.type === BUSINESS_TYPE) {
        if (
          !['*', '$app', MEMBER_PROJECTS].includes(grant.resource.id) &&
          !PROJECT_ID.test(grant.resource.id)
        )
          return 'invalidScope';
        for (const action of grant.actions) {
          if (!actions.has(action.action)) return 'invalidRole';
          if (
            actions.get(action.action) &&
            !['*', '$app'].includes(grant.resource.id)
          )
            return 'invalidScope';
        }
      } else if (
        !pages.some(
          (allowed) =>
            allowed.resource.type === grant.resource.type &&
            allowed.resource.id === grant.resource.id &&
            grant.actions.every((action) =>
              allowed.actions.some(
                (candidate) => candidate.action === action.action,
              ),
            ),
        )
      )
        return 'invalidRole';
      if (grant.actions.some((action) => action.policy)) return 'invalidRole';
    }
    return undefined;
  }

  async assertGrantable(keys: readonly string[]): Promise<void> {
    const context = this.current()?.context;
    if (!context) denied('缺少当前授权上下文');
    for (const key of keys) {
      const set = await this.authorization.permissionSets.get(key);
      if (!set || !key.startsWith('nr.') || this.invalidRoleGrants(set.grants))
        denied('无效的业务角色');
      for (const grant of set.grants) {
        for (const action of grant.actions) {
          if (
            !(await context.can({
              resource: grant.resource,
              action: action.action,
            }))
          )
            denied('角色超出当前可授予权限');
        }
      }
    }
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
