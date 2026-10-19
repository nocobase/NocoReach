import { z } from 'zod';
import { CAPABILITIES, type RoleAccess } from './access-capabilities.js';

const memberRolesSchema = z.strictObject({
  roles: z
    .array(
      z
        .string()
        .regex(/^nr\.[a-zA-Z0-9_.-]+$/)
        .max(128),
    )
    .max(30),
});
const projectIds = z.array(z.string().regex(/^[1-9]\d{0,15}$/)).max(50);
export const memberRoleUpdateSchema = memberRolesSchema
  .extend({
    expectedRoles: memberRolesSchema.shape.roles,
    projectIds: projectIds.optional(),
    expectedProjects: projectIds.optional(),
  })
  .refine(
    (input) =>
      (input.projectIds === undefined) ===
      (input.expectedProjects === undefined),
    { path: ['expectedProjects'] },
  );
export const MAX_INVITATIONS = 50;
export const memberInvitationSchema = z.strictObject({
  emails: z
    .array(
      z
        .email()
        .max(320)
        .transform((email) => email.trim().toLowerCase()),
    )
    .min(1)
    .max(MAX_INVITATIONS),
  projectIds,
});
export const businessRoleSchema = z.strictObject({
  key: z
    .string()
    .regex(/^nr\.[a-zA-Z0-9_.-]+$/)
    .max(64),
  title: z.string().trim().min(1).max(100),
  scope: z.enum(['member', 'all']),
  capabilities: z.array(z.enum(CAPABILITIES as [string, ...string[]])).max(100),
  revision: z.string().optional(),
});

export type BusinessRoleInput = z.infer<typeof businessRoleSchema>;
export type BusinessRole = RoleAccess & {
  key: string;
  title: string;
  builtIn: boolean;
  revision: string;
  assignable: boolean;
};
export type AccessMember = {
  id: string;
  name: string;
  account: string;
  roles: string[];
  projects: string[];
  locked: boolean;
};
export type MemberInvitation = {
  id: string;
  source: 'users' | 'members';
  email: string;
  roles: string[];
  projectIds: string[];
  invitedBy: string;
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
  expiresAt: string;
};
/** One address of a batch invitation: invited, added at once as an existing member, or refused with a reason. */
export type InvitationResult = {
  email: string;
  outcome: 'invited' | 'added' | 'alreadyMember' | 'failed';
  reason?: string;
  emailSent?: boolean;
  inviteUrl?: string;
};
export type AccessCatalogue = {
  projects: { id: string; name: string }[];
};

/** Split pasted addresses on lines, commas, semicolons and spaces. */
export const parseEmails = (text: string) => [
  ...new Set(
    text
      .split(/[\s,;，；]+/)
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  ),
];

export const capabilityLabelKey = (capability: string) =>
  `accessMembers.capabilities.${capability}`;
