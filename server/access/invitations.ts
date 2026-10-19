import { randomUUID } from 'node:crypto';
import { lockUserForAdministration } from '@nocobase/app-plugin-authentication';
import type { PermissionGrant } from '@nocobase/authorization/core';
import {
  UserManagementError,
  type UserInvitation,
  type UserManagementService,
  type UserInvitationAcceptedContext,
} from '@nocobase/app-plugin-users/server';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import type { DatabaseConnection } from '@nocobase/db';
import { ApiError } from '@nocobase/app-server/router';
import type {
  InvitationResult,
  MemberInvitation,
} from '../../shared/member-access.js';
import { ReachManagement, accessError } from './management.js';
import { BUSINESS_MEMBER } from './service.js';

type Account = {
  id: string;
  email: string;
  kind: string;
  disabledAt: Date | string | null;
};
type Offer = {
  id: string;
  source: 'members' | 'users';
  userId: string | null;
  usersInvitationId: string | null;
  email: string;
  activeEmail: string | null;
  invitedBy: string;
  roles: string[];
  projectIds: string[] | null;
  ceiling: PermissionGrant[];
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};
const TTL = 7 * 24 * 60 * 60 * 1000;
const newest = {
  kind: 'sort' as const,
  version: 1 as const,
  items: [
    { kind: 'field' as const, path: ['createdAt'], direction: 'desc' as const },
  ],
};
const status = (row: Offer) =>
  row.status === 'pending' && new Date(row.expiresAt).getTime() <= Date.now()
    ? 'expired'
    : row.status;
const offerId = (data: Readonly<Record<string, unknown>>) => {
  const value = data.nocoreach;
  return value &&
    typeof value === 'object' &&
    'invitationId' in value &&
    typeof value.invitationId === 'string'
    ? value.invitationId
    : undefined;
};

/** One application offer owns membership; Users owns only a new account's invitation token. */
export class ReachInvitations {
  constructor(
    readonly management: ReachManagement,
    readonly users: UserManagementService,
    readonly site: AppIdentityConfig,
    readonly sendMail: (email: string, url: string) => Promise<boolean>,
  ) {}
  private get access() {
    return this.management.access;
  }
  private repository(connection = this.access.database.connection()) {
    return connection.repository<Offer>('nrMemberInvitations');
  }
  private link(id: string, origin?: string) {
    const start = this.site.publicOrigin || origin;
    if (!start) accessError('originRequired', 'INVALID_ARGUMENT');
    return `${start.replace(/\/+$/, '')}${(this.site.publicBasePath || '/main').replace(/\/+$/, '')}/member-invitations/${encodeURIComponent(id)}`;
  }
  private view(row: Offer): MemberInvitation {
    return {
      id: row.id,
      source: row.source,
      email: row.email,
      roles: row.roles,
      projectIds: row.projectIds ?? [],
      invitedBy: row.invitedBy,
      status: status(row),
      expiresAt: new Date(row.expiresAt).toISOString(),
    };
  }
  private async pending(
    connection: DatabaseConnection,
    id: string,
    source?: Offer['source'],
  ) {
    const row = await this.repository(connection).findOne({
      filter: { id, ...(source ? { source } : {}) },
    });
    if (!row) accessError('missing', 'NOT_FOUND');
    if (row.status !== 'pending') accessError('closed', 'ALREADY_EXISTS');
    return row;
  }
  /** Called under the management lock; the unique column also enforces this across processes. */
  private async reserveEmail(
    connection: DatabaseConnection,
    email: string,
    ownId?: string,
  ) {
    const other = await this.repository(connection).findOne({
      filter: { activeEmail: email },
    });
    if (!other || other.id === ownId) return;
    if (status(other) !== 'expired')
      accessError('alreadyPending', 'ALREADY_EXISTS');
    await this.repository(connection).updateOne({
      filter: { id: other.id },
      values: { activeEmail: null },
    });
  }
  private async existingPerson(connection: DatabaseConnection, userId: string) {
    await lockUserForAdministration(connection, userId);
    const person = await connection
      .repository<Account>('user')
      .findOne({ filter: { id: userId, kind: 'person' } });
    if (!person || person.disabledAt != null) accessError('accountUnavailable');
    if (await this.access.role(userId, connection))
      accessError('alreadyMember', 'ALREADY_EXISTS');
    return person;
  }

  async list() {
    await this.access.require('nrMembers', 'setRole');
    return (
      await this.repository().findMany({
        filter: { status: 'pending' },
        sort: newest,
      })
    ).map((row) => this.view(row));
  }

  async mine(userId: string, id?: string) {
    const person = await this.access.database
      .connection()
      .repository('user')
      .findOne({ filter: { id: userId, kind: 'person' } });
    if (!person || person.disabledAt != null) accessError('accountUnavailable');
    const rows = await this.repository().findMany({
      filter: { userId, ...(id ? { id } : { status: 'pending' }) },
      sort: newest,
    });
    if (id && !rows.length) accessError('wrongAccount', 'NOT_FOUND');
    return rows.map((row) => this.view(row));
  }

  /**
   * Invite several addresses into the member role and the chosen projects. An address that already belongs to the
   * application joins the projects at once; each address reports its own outcome.
   */
  async inviteMany(
    actorId: string,
    emails: readonly string[],
    projectIds: readonly string[],
    origin?: string,
  ): Promise<InvitationResult[]> {
    await this.access.require('nrMembers', 'setRole');
    const known = new Set(
      await this.access.projectIds(this.access.database.connection()),
    );
    for (const id of new Set(projectIds)) {
      if (!known.has(id)) accessError('missingProject', 'INVALID_ARGUMENT');
      if (!(await this.access.allows('nrProjects', 'list', id)))
        accessError('ungrantable');
    }
    const results: InvitationResult[] = [];
    for (const email of new Set(
      emails.map((item) => item.trim().toLowerCase()),
    ))
      try {
        const joined = await this.joinExisting(actorId, email, projectIds);
        results.push(
          joined === undefined
            ? await this.create(
                actorId,
                email,
                [BUSINESS_MEMBER],
                origin,
                projectIds,
              )
            : { email, outcome: joined ? 'added' : 'alreadyMember' },
        );
      } catch (error) {
        if (error instanceof ApiError)
          results.push({ email, outcome: 'failed', reason: error.reason });
        else if (error instanceof UserManagementError)
          results.push({ email, outcome: 'failed', reason: error.code });
        else throw error;
      }
    return results;
  }

  /** An existing member joins the projects directly: true when any was added, undefined for a non-member. */
  private async joinExisting(
    actorId: string,
    email: string,
    projectIds: readonly string[],
  ) {
    return this.access.database.transaction(async (connection) => {
      await this.access.lockManagement(connection);
      const account = await connection
        .repository<Account>('user')
        .findOne({ filter: { email } });
      if (
        !account ||
        account.kind !== 'person' ||
        !(await this.access.role(account.id, connection))
      )
        return undefined;
      await this.management.actorGrants(actorId, connection);
      const before = await this.access.projectsOf(account.id, connection);
      const added = projectIds.filter((id) => !before.has(id));
      if (!added.length) return false;
      await this.access.setProjects(connection, account.id, [
        ...before,
        ...added,
      ]);
      await this.access.event(
        connection,
        actorId,
        'member.projects',
        account.id,
        {
          added,
        },
      );
      return true;
    });
  }

  async create(
    actorId: string,
    email: string,
    roles: string[],
    origin?: string,
    projectIds: readonly string[] = [],
  ) {
    await this.access.require('nrMembers', 'setRole');
    this.link('placeholder', origin);
    email = email.trim().toLowerCase();
    const row = await this.access.database.transaction(async (connection) => {
      await this.access.lockManagement(connection);
      if (email.endsWith('@service.invalid')) accessError('accountUnavailable');
      const selected = await this.management.grantable(
        actorId,
        roles,
        connection,
      );
      await this.reserveEmail(connection, email);
      const account = await connection
        .repository<Account>('user')
        .findOne({ filter: { email } });
      if (account) await this.existingPerson(connection, account.id);
      const now = new Date();
      const offer: Offer = {
        id: randomUUID(),
        source: account ? 'members' : 'users',
        userId: account?.id ?? null,
        usersInvitationId: null,
        email,
        activeEmail: email,
        invitedBy: actorId,
        roles: [...new Set(roles)],
        projectIds: [...new Set(projectIds)],
        ceiling: selected.flatMap((set) => [...set.grants]),
        status: 'pending',
        expiresAt: new Date(now.getTime() + TTL),
        createdAt: now,
        updatedAt: now,
      };
      await this.repository(connection).createOne({ values: offer });
      await this.access.event(
        connection,
        actorId,
        'invitation.create',
        offer.id,
        { roles: offer.roles, source: offer.source },
      );
      return offer;
    });
    return row.source === 'members'
      ? this.deliverMember(row, origin)
      : this.issue(row, origin);
  }

  private matches(row: Offer, invitation: UserInvitation) {
    return (
      offerId(invitation.data) === row.id &&
      invitation.invitedBy.id === row.invitedBy &&
      invitation.email.toLowerCase() === row.email &&
      Object.keys(invitation.roleScopes).length === 0
    );
  }
  private async framework(row: Offer) {
    const candidates = row.usersInvitationId
      ? [await this.users.getInvitation(row.usersInvitationId)]
      : await this.users.listInvitations({ invitedBy: row.invitedBy });
    return candidates.find(
      (invitation) => invitation && this.matches(row, invitation),
    );
  }
  /** Bind only the real Users id. A late result cannot reopen a revoked/replaced offer. */
  private async bind(row: Offer, invitation: UserInvitation) {
    if (!this.matches(row, invitation))
      accessError('invalidInvitation', 'INVALID_ARGUMENT');
    return this.access.database.transaction(async (connection) => {
      await this.access.lockManagement(connection);
      const current = await this.repository(connection).findOne({
        filter: { id: row.id },
      });
      if (
        !current ||
        status(current) !== 'pending' ||
        current.source !== 'users' ||
        current.activeEmail !== current.email ||
        (current.usersInvitationId &&
          current.usersInvitationId !== invitation.id)
      )
        return undefined;
      await this.management.grantable(
        current.invitedBy,
        current.roles,
        connection,
        current.ceiling,
      );
      if (current.usersInvitationId) return current;
      const updated = await this.repository(connection).updateOne({
        filter: { id: row.id },
        values: { usersInvitationId: invitation.id, updatedAt: new Date() },
      });
      return updated.record;
    });
  }
  private async retireFramework(id: string) {
    // The application offer already denies acceptance. Token cleanup is best-effort if Users is unavailable.
    await this.users.revokeInvitation(id).catch(() => undefined);
  }
  private async issue(row: Offer, origin?: string) {
    // Users owns this transaction. Never call it while holding the application's management transaction.
    const [result] = await this.users.invite({
      emails: [row.email],
      invitedBy: row.invitedBy,
      data: { nocoreach: { invitationId: row.id } },
      summary: ['NocoReach'],
      origin,
    });
    if (result.outcome === 'existingUser') {
      // The account may have registered after our reservation but before Users checked the email.
      const converted = await this.access.database.transaction(
        async (connection) => {
          await this.access.lockManagement(connection);
          const current = await this.pending(connection, row.id, 'users');
          if (current.usersInvitationId)
            accessError('changed', 'ALREADY_EXISTS');
          const person = await this.existingPerson(connection, result.userId);
          if (person.email.toLowerCase() !== row.email)
            accessError('accountUnavailable');
          await this.management.grantable(
            current.invitedBy,
            current.roles,
            connection,
            current.ceiling,
          );
          return (
            await this.repository(connection).updateOne({
              filter: { id: row.id },
              values: {
                source: 'members',
                userId: result.userId,
                updatedAt: new Date(),
              },
            })
          ).record;
        },
      );
      return this.deliverMember(converted, origin);
    }
    const frameworkId = result.invitationId;
    const invitation = await this.users.getInvitation(frameworkId);
    if (!invitation) accessError('missing', 'NOT_FOUND');
    const bound = await this.bind(row, invitation);
    if (!bound) {
      await this.retireFramework(frameworkId);
      return this.delivery(row);
    }
    return this.delivery(bound, result);
  }
  private async delivery(
    row: Offer,
    delivered?: { inviteUrl?: string; emailSent: boolean },
  ) {
    const current = await this.repository().findOne({ filter: { id: row.id } });
    const open =
      current &&
      status(current) === 'pending' &&
      current.usersInvitationId === row.usersInvitationId;
    return {
      outcome: 'invited' as const,
      source: row.source,
      invitationId: row.id,
      email: row.email,
      emailSent: Boolean(open && delivered?.emailSent),
      ...(open && delivered?.inviteUrl
        ? { inviteUrl: delivered.inviteUrl }
        : {}),
    };
  }
  private async deliverMember(row: Offer, origin?: string, sendEmail = true) {
    const inviteUrl = this.link(row.id, origin);
    const emailSent = sendEmail && (await this.sendMail(row.email, inviteUrl));
    return this.delivery(row, { inviteUrl, emailSent });
  }

  async revoke(actorId: string, source: Offer['source'], id: string) {
    await this.access.require('nrMembers', 'setRole');
    const row = await this.access.database.transaction(async (connection) => {
      await this.access.lockManagement(connection);
      await this.management.actorGrants(actorId, connection);
      const current = await this.pending(connection, id, source);
      await this.repository(connection).updateOne({
        filter: { id },
        values: { status: 'revoked', activeEmail: null, updatedAt: new Date() },
      });
      await this.access.event(connection, actorId, 'invitation.revoke', id, {
        source,
      });
      return current;
    });
    if (row.source === 'users') {
      const invitation = await this.framework(row);
      if (invitation) await this.retireFramework(invitation.id);
    }
  }

  async resend(
    actorId: string,
    source: Offer['source'],
    id: string,
    origin?: string,
    sendEmail = true,
  ) {
    await this.access.require('nrMembers', 'setRole');
    this.link('placeholder', origin);
    const row = await this.access.database.transaction(async (connection) => {
      await this.access.lockManagement(connection);
      const before = await this.pending(connection, id, source);
      if (source === 'users' && before.invitedBy !== actorId)
        accessError('originalInviter');
      await this.management.grantable(
        actorId,
        before.roles,
        connection,
        before.ceiling,
      );
      await this.reserveEmail(connection, before.email, before.id);
      const now = new Date();
      const renewed: Offer = {
        ...before,
        activeEmail: before.email,
        expiresAt: new Date(now.getTime() + TTL),
        updatedAt: now,
      };
      if (source === 'members') {
        await this.repository(connection).updateOne({
          filter: { id },
          values: { status: 'revoked', activeEmail: null, updatedAt: now },
        });
        renewed.id = randomUUID();
        renewed.invitedBy = actorId;
        renewed.createdAt = now;
        await this.repository(connection).createOne({ values: renewed });
      } else {
        await this.repository(connection).updateOne({
          filter: { id },
          values: {
            activeEmail: renewed.activeEmail,
            expiresAt: renewed.expiresAt,
            updatedAt: now,
          },
        });
      }
      await this.access.event(
        connection,
        actorId,
        'invitation.resend',
        renewed.id,
        { previousId: id, source },
      );
      return renewed;
    });
    if (row.source === 'members')
      return this.deliverMember(row, origin, sendEmail);
    const invitation = await this.framework(row);
    if (!invitation) {
      // An interrupted first issuance is visible and recoverable. Copy never causes an unsolicited initial email.
      if (row.usersInvitationId) accessError('missing', 'NOT_FOUND');
      return sendEmail ? this.issue(row, origin) : this.delivery(row);
    }
    const bound = await this.bind(row, invitation);
    if (!bound) return this.delivery(row);
    const result = await this.users.resendInvitation(invitation.id, {
      origin,
      sendEmail,
    });
    return this.delivery(
      bound,
      result.outcome === 'invited' ? result : undefined,
    );
  }

  private async consume(
    connection: DatabaseConnection,
    row: Offer,
    userId: string,
  ) {
    if (row.status !== 'pending')
      accessError(
        row.status === 'accepted' ? 'accepted' : 'revoked',
        'ALREADY_EXISTS',
      );
    if (status(row) === 'expired') accessError('expired', 'ALREADY_EXISTS');
    await this.management.addInvitationRoles(
      connection,
      row.invitedBy,
      userId,
      row.roles,
      row.ceiling,
    );
    // Projects deleted since the invitation are skipped.
    const known = new Set(await this.access.projectIds(connection));
    const projects = (row.projectIds ?? []).filter((id) => known.has(id));
    if (projects.length) {
      const before = await this.access.projectsOf(userId, connection);
      await this.access.setProjects(connection, userId, [
        ...before,
        ...projects,
      ]);
    }
    const consumed = await this.repository(connection).updateMany({
      filter: (f) =>
        f.and([
          f.string('id').eq(row.id),
          f.string('status').eq('pending'),
          f.date('expiresAt').after(new Date()),
        ]),
      values: {
        status: 'accepted',
        userId,
        activeEmail: null,
        updatedAt: new Date(),
      },
    });
    if (!consumed.updatedCount) accessError('closed', 'ALREADY_EXISTS');
  }
  async accept(userId: string, id: string) {
    await this.access.database.transaction(async (connection) => {
      await this.access.lockManagement(connection);
      const row = await this.repository(connection).findOne({
        filter: { id, userId, source: 'members' },
      });
      if (!row) accessError('wrongAccount', 'NOT_FOUND');
      await this.consume(connection, row, userId);
    });
    return { accepted: true };
  }
  async onFrameworkAccepted(context: UserInvitationAcceptedContext) {
    if (!context.data.nocoreach) return;
    const id = offerId(context.data);
    if (!id) accessError('invalidInvitation', 'INVALID_ARGUMENT');
    await this.access.lockManagement(context.connection);
    const row = await this.repository(context.connection).findOne({
      filter: { id, source: 'users', usersInvitationId: context.invitationId },
    });
    if (!row || row.email !== context.email.toLowerCase())
      accessError('invalidInvitation', 'INVALID_ARGUMENT');
    await this.consume(context.connection, row, context.userId);
  }
}
