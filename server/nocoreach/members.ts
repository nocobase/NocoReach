// @ts-nocheck
import { systemMessageText } from '../../shared/i18n/messages.js';
import { requireAccess, roleOf, NOCOBASE_ADMIN } from './policy.js';

const nameOf = (user) =>
  String(user.nickname || user.username || user.email || user.id);

class Members {
  constructor(plugin) {
    this.p = plugin;
  }
  async users() {
    const rows = [];
    for (let offset = 0; ; offset += 200) {
      const page = await this.p.db
        .getRepository('users')
        .find({ sort: 'id', limit: 200, offset });
      rows.push(...page.map((row) => (row.toJSON ? row.toJSON() : row)));
      if (page.length < 200) return rows;
    }
  }
  async list() {
    const order = { admin: 0, member: 1 };
    return (await this.users())
      .filter((user) => !user.disabledAt && user.kind !== 'service')
      .map((user) => {
        const keys = (user.roles || []).map((role) => role.name);
        const locked = keys.some((key) => NOCOBASE_ADMIN.includes(key));
        const roles = keys.filter((key) => key.startsWith('nr.'));
        return {
          id: String(user.id),
          name: nameOf(user),
          account: String(user.username || user.email || ''),
          role:
            locked || roles.includes('nr.admin')
              ? 'admin'
              : roles.length
                ? 'member'
                : null,
          roles,
          locked,
        };
      })
      .sort(
        (a, b) =>
          (order[a.role] ?? 2) - (order[b.role] ?? 2) ||
          a.name.localeCompare(b.name),
      );
  }
  async joined() {
    return (await this.list()).filter((user) => user.role);
  }
  async setRole(actor, values) {
    const roles =
      values.role === 'admin'
        ? ['nr.admin']
        : values.role === 'member'
          ? ['nr.member']
          : values.role == null || values.role === ''
            ? []
            : null;
    if (!roles || values.roles !== undefined)
      throw Object.assign(
        new Error(systemMessageText('members.roleAdminMemberNotJoined')),
        { status: 400 },
      );
    if (!this.p.db.access)
      throw new Error('Business access is not initialized');
    await this.p.db.access.replaceRoles(
      String(actor),
      String(values.userId || ''),
      roles,
    );
    return this.list();
  }
  register() {
    const wrap = (fn) => async (ctx, next) => {
      await requireAccess(ctx);
      ctx.body = await fn(ctx.action.params.values || {}, ctx);
      await next();
    };
    const me = async (ctx, next) => {
      if (!ctx.auth?.user?.id)
        ctx.throw(401, systemMessageText('classicImport.signFirst'));
      const user = ctx.auth.user;
      ctx.body = {
        id: String(user.id),
        name: nameOf(user),
        role: await roleOf(
          ctx.db || ctx.app?.db,
          user.id,
          ctx.state?.currentRoles || [],
        ),
      };
      await next();
    };
    const actions = {
      me,
      list: wrap(() => this.list()),
      setRole: wrap((values, ctx) => this.setRole(ctx.auth.user.id, values)),
    };
    this.p.app.resourceManager.define({ name: 'nrMembers', actions });
    this.p.app.acl.allow('nrMembers', Object.keys(actions), 'loggedIn');
  }
}
export { Members };
