import { createHash, randomUUID } from 'node:crypto';
import { lockUserForAdministration } from '@nocobase/app-plugin-authentication/server';
import type { PermissionGrant } from '@nocobase/authorization/core';
import type {
  UserManagementService,
  UserInvitationAcceptedContext,
} from '@nocobase/app-plugin-users/server';
import type { AppIdentityConfig } from '@nocobase/app-server/config';
import type { MemberInvitation } from '../../shared/member-access.js';
import { ReachManagement, accessError } from './management.js';

type Proposal = {
  invitedBy: string;
  roles: string[];
  ceiling: PermissionGrant[];
};
type InvitationEvent = {
  actorId: string;
  targetId: string;
  action: string;
  changes: { proposalDigest?: string };
};
type ExistingInvitation = Proposal & {
  id: string;
  userId: string;
  email: string;
  status: 'pending' | 'accepted' | 'revoked';
  expiresAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};
const TTL = 7 * 24 * 60 * 60 * 1000;
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
const proposalDigest = (proposal: Proposal) =>
  createHash('sha256')
    .update(JSON.stringify(canonical(proposal)))
    .digest('hex');
const newest = {
  kind: 'sort' as const,
  version: 1 as const,
  items: [
    { kind: 'field' as const, path: ['createdAt'], direction: 'desc' as const },
  ],
};
const status = (row: ExistingInvitation) =>
  row.status === 'pending' && new Date(row.expiresAt).getTime() <= Date.now()
    ? 'expired'
    : row.status;

/** Existing people use an identity-bound pending record. New people remain entirely in Users' invitation store. */
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
  private repository() {
    return this.access.database
      .connection()
      .repository<ExistingInvitation>('nrMemberInvitations');
  }

  private link(id: string, origin?: string) {
    const start = this.site.publicOrigin || origin;
    if (!start) accessError('originRequired', 'INVALID_ARGUMENT');
    return `${start.replace(/\/+$/, '')}${(this.site.publicBasePath || '/main').replace(/\/+$/, '')}/member-invitations/${encodeURIComponent(id)}`;
  }
  private view(row: ExistingInvitation): MemberInvitation {
    return {
      id: row.id,
      source: 'members',
      email: row.email,
      roles: row.roles,
      invitedBy: row.invitedBy,
      status: status(row),
      expiresAt: new Date(row.expiresAt).toISOString(),
    };
  }

  async list() {
    await this.access.require('nrMembers', 'setRole');
    const existing = await this.repository().findMany({
      filter: { status: 'pending' },
      sort: newest,
    });
    const candidates = (await this.users.listInvitations()).filter(
      (row) => !!row.data.nocoreach,
    );
    const issued = candidates.length
      ? await this.access.database
          .connection()
          .repository<InvitationEvent>('nrAccessEvents')
          .findMany({
            filter: (filter) =>
              filter.and([
                filter.string('action').eq('invitation.create'),
                filter.or(
                  candidates.map((row) => filter.string('targetId').eq(row.id)),
                ),
              ]),
          })
      : [];
    const framework = candidates.filter((row) =>
      issued.some(
        (event) =>
          event.targetId === row.id &&
          event.actorId === row.invitedBy.id &&
          event.changes.proposalDigest ===
            proposalDigest(row.data.nocoreach as Proposal),
      ),
    );
    return [
      ...existing.map((row) => this.view(row)),
      ...framework.map((row): MemberInvitation => ({
        id: row.id,
        source: 'users',
        email: row.email,
        roles: (row.data.nocoreach as Proposal).roles,
        invitedBy: row.invitedBy.id,
        status: row.status,
        expiresAt: row.expiresAt,
      })),
    ].sort((a, b) => b.expiresAt.localeCompare(a.expiresAt));
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

  async create(
    actorId: string,
    email: string,
    roles: string[],
    origin?: string,
  ) {
    await this.access.require('nrMembers', 'setRole');
    this.link('placeholder', origin); // Validate origin before any committed invitation.
    const account = await this.access.database
      .connection()
      .repository('user')
      .findOne({ filter: { email } });
    if (
      email.endsWith('@service.invalid') ||
      (account && (account.kind !== 'person' || account.disabledAt != null))
    )
      accessError('accountUnavailable');
    const selected = await this.management.grantable(
      actorId,
      roles,
      this.access.database.connection(),
    );
    const proposal: Proposal = {
      invitedBy: actorId,
      roles: [...new Set(roles)],
      ceiling: selected.flatMap((set) => [...set.grants]),
    };
    const pending = await this.list();
    if (pending.some((row) => row.email.toLowerCase() === email))
      accessError('alreadyPending', 'ALREADY_EXISTS');
    const [result] = await this.users.invite({
      emails: [email],
      invitedBy: actorId,
      data: { nocoreach: proposal },
      summary: ['NocoReach'],
      origin,
    });
    if (result.outcome === 'invited') {
      try {
        await this.access.event(
          this.access.database.connection(),
          actorId,
          'invitation.create',
          result.invitationId,
          {
            roles: proposal.roles,
            source: 'users',
            proposalDigest: proposalDigest(proposal),
          },
        );
      } catch (error) {
        // Users owns the creation transaction. Compensate when issuance attestation cannot be recorded;
        // without attestation the acceptance callback rejects the invitation in any event.
        await this.users.revokeInvitation(result.invitationId);
        throw error;
      }
      return { ...result, source: 'users' };
    }
    const row = await this.access.database.transaction(async (connection) => {
      // Share the account lifecycle lock before checking and creating its pending invitation.
      await lockUserForAdministration(connection, result.userId);
      const user = await connection
        .repository('user')
        .findOne({ filter: { id: result.userId, kind: 'person' } });
      if (!user || user.disabledAt != null) accessError('accountUnavailable');
      if (await this.access.role(result.userId, connection))
        accessError('alreadyMember', 'ALREADY_EXISTS');
      if (
        await connection.repository('nrMemberInvitations').exists({
          filter: { userId: result.userId, status: 'pending' },
        })
      )
        accessError('alreadyPending', 'ALREADY_EXISTS');
      await this.management.grantable(
        actorId,
        proposal.roles,
        connection,
        proposal.ceiling,
      );
      const now = new Date();
      const invitation: ExistingInvitation = {
        ...proposal,
        id: randomUUID(),
        userId: result.userId,
        email,
        status: 'pending',
        expiresAt: new Date(now.getTime() + TTL),
        createdAt: now,
        updatedAt: now,
      };
      await connection
        .repository('nrMemberInvitations')
        .createOne({ values: invitation });
      await this.access.event(
        connection,
        actorId,
        'invitation.create',
        invitation.id,
        { roles: proposal.roles, source: 'members' },
      );
      return invitation;
    });
    const inviteUrl = this.link(row.id, origin);
    const emailSent = await this.sendMail(email, inviteUrl);
    return {
      outcome: 'invited',
      source: 'members',
      invitationId: row.id,
      email,
      inviteUrl,
      emailSent,
    };
  }

  async revoke(actorId: string, source: 'users' | 'members', id: string) {
    // Revocation removes an offer, so management permission is sufficient even if its roles
    // were deleted or now exceed the manager's grants. Resend and acceptance still check grants.
    await this.access.require('nrMembers', 'setRole');
    if (source === 'users') {
      await this.framework(id);
      await this.users.revokeInvitation(id);
      await this.access.event(
        this.access.database.connection(),
        actorId,
        'invitation.revoke',
        id,
        { source },
      );
      return;
    }
    await this.access.database.transaction(async (connection) => {
      const row = await connection
        .repository<ExistingInvitation>('nrMemberInvitations')
        .findOne({ filter: { id } });
      if (!row) accessError('missing', 'NOT_FOUND');
      if (row.status !== 'pending') accessError('closed', 'ALREADY_EXISTS');
      await connection.repository('nrMemberInvitations').updateOne({
        filter: { id, status: 'pending' },
        values: { status: 'revoked', updatedAt: new Date() },
      });
      await this.access.event(connection, actorId, 'invitation.revoke', id, {
        source,
      });
    });
  }

  private async framework(id: string) {
    const row = await this.users.getInvitation(id);
    if (!row || !row.data.nocoreach) accessError('missing', 'NOT_FOUND');
    const issued = await this.access.database
      .connection()
      .repository<InvitationEvent>('nrAccessEvents')
      .findOne({ filter: { targetId: id, action: 'invitation.create' } });
    if (
      !issued ||
      issued.actorId !== row.invitedBy.id ||
      issued.changes.proposalDigest !==
        proposalDigest(row.data.nocoreach as Proposal)
    )
      accessError('missing', 'NOT_FOUND');
    return row;
  }

  async resend(
    actorId: string,
    source: 'users' | 'members',
    id: string,
    origin?: string,
    sendEmail = true,
  ) {
    await this.access.require('nrMembers', 'setRole');
    if (source === 'users') {
      const row = await this.framework(id);
      if (row.invitedBy.id !== actorId) accessError('originalInviter');
      const proposal = row.data.nocoreach as Proposal;
      await this.management.grantable(
        actorId,
        proposal.roles,
        this.access.database.connection(),
        proposal.ceiling,
      );
      const result = await this.users.resendInvitation(id, {
        origin,
        sendEmail,
      });
      await this.access.event(
        this.access.database.connection(),
        actorId,
        'invitation.resend',
        id,
        { source },
      );
      return { ...result, source };
    }
    this.link('placeholder', origin);
    const row = await this.access.database.transaction(async (connection) => {
      const before = await connection
        .repository<ExistingInvitation>('nrMemberInvitations')
        .findOne({ filter: { id } });
      if (!before) accessError('missing', 'NOT_FOUND');
      if (before.status !== 'pending') accessError('closed', 'ALREADY_EXISTS');
      await this.management.grantable(
        actorId,
        before.roles,
        connection,
        before.ceiling,
      );
      const now = new Date();
      const replacement = {
        ...before,
        id: randomUUID(),
        invitedBy: actorId,
        expiresAt: new Date(now.getTime() + TTL),
        createdAt: now,
        updatedAt: now,
      };
      await connection.repository('nrMemberInvitations').updateOne({
        filter: { id, status: 'pending' },
        values: { status: 'revoked', updatedAt: now },
      });
      await connection
        .repository('nrMemberInvitations')
        .createOne({ values: replacement });
      await this.access.event(
        connection,
        actorId,
        'invitation.resend',
        replacement.id,
        { previousId: id, source },
      );
      return replacement;
    });
    const inviteUrl = this.link(row.id, origin);
    const emailSent = sendEmail && (await this.sendMail(row.email, inviteUrl));
    return {
      outcome: 'invited',
      source,
      invitationId: row.id,
      email: row.email,
      inviteUrl,
      emailSent,
    };
  }

  async accept(userId: string, id: string) {
    await this.access.database.transaction(async (connection) => {
      const row = await connection
        .repository<ExistingInvitation>('nrMemberInvitations')
        .findOne({ filter: { id, userId } });
      if (!row) accessError('wrongAccount', 'NOT_FOUND');
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
      if (status(row) === 'expired') accessError('expired', 'ALREADY_EXISTS');
      const consumed = await connection
        .repository('nrMemberInvitations')
        .updateMany({
          filter: (f) =>
            f.and([
              f.string('id').eq(id),
              f.string('status').eq('pending'),
              f.date('expiresAt').after(new Date()),
            ]),
          values: { status: 'accepted', updatedAt: new Date() },
        });
      if (!consumed.updatedCount) accessError('closed', 'ALREADY_EXISTS');
    });
    return { accepted: true };
  }

  async onFrameworkAccepted(context: UserInvitationAcceptedContext) {
    const raw = context.data.nocoreach;
    if (!raw) return;
    if (
      typeof raw !== 'object' ||
      !('roles' in raw) ||
      !('ceiling' in raw) ||
      !('invitedBy' in raw)
    )
      accessError('invalidInvitation', 'INVALID_ARGUMENT');
    const proposal = raw as Proposal;
    if (
      !Array.isArray(proposal.roles) ||
      !proposal.roles.length ||
      proposal.roles.some((key) => typeof key !== 'string') ||
      !Array.isArray(proposal.ceiling) ||
      typeof proposal.invitedBy !== 'string'
    )
      accessError('invalidInvitation', 'INVALID_ARGUMENT');
    this.management.validateGrants(proposal.ceiling);
    // Users' generic create endpoint accepts caller metadata. Only an application-created invitation may grant
    // membership: bind its actual framework id, inviter and immutable proposal to the server's management event.
    const issued = await context.connection
      .repository<InvitationEvent>('nrAccessEvents')
      .findOne({
        filter: { targetId: context.invitationId, action: 'invitation.create' },
      });
    if (
      !issued ||
      issued.actorId !== proposal.invitedBy ||
      issued.changes.proposalDigest !== proposalDigest(proposal)
    )
      accessError('invalidInvitation', 'INVALID_ARGUMENT');
    await this.management.addInvitationRoles(
      context.connection,
      proposal.invitedBy,
      context.userId,
      proposal.roles,
      proposal.ceiling,
    );
  }
}
