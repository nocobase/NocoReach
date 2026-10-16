import { z } from 'zod';

export const memberRolesSchema = z.strictObject({
  roles: z
    .array(
      z
        .string()
        .regex(/^nr\.[a-zA-Z0-9_.-]+$/)
        .max(128),
    )
    .max(30),
});
export const memberInvitationSchema = memberRolesSchema
  .extend({
    email: z
      .email()
      .max(320)
      .transform((email) => email.trim().toLowerCase()),
  })
  .refine((input) => input.roles.length > 0, {
    path: ['roles'],
    message: 'Choose at least one role.',
  });
export const businessRoleSchema = z.strictObject({
  key: z
    .string()
    .regex(/^nr\.[a-zA-Z0-9_.-]+$/)
    .max(64),
  title: z.string().trim().min(1).max(100),
  grants: z
    .array(
      z.strictObject({
        resource: z.strictObject({
          type: z.string(),
          id: z.string().min(1).max(128),
        }),
        actions: z
          .array(z.strictObject({ action: z.string().min(1).max(160) }))
          .min(1)
          .max(300),
      }),
    )
    .max(1000),
  revision: z.string().optional(),
});

export type BusinessRoleInput = z.infer<typeof businessRoleSchema>;
export type BusinessRole = BusinessRoleInput & {
  builtIn: boolean;
  revision: string;
  assignable: boolean;
};
export type AccessMember = {
  id: string;
  name: string;
  account: string;
  roles: string[];
  locked: boolean;
};
export type MemberInvitation = {
  id: string;
  source: 'users' | 'members';
  email: string;
  roles: string[];
  invitedBy: string;
  status: 'pending' | 'expired' | 'accepted' | 'revoked';
  expiresAt: string;
};
export type AccessCatalogue = {
  actions: { resource: string; action: string; application: boolean }[];
  pages: { type: string; id: string; actions: string[] }[];
  projects: { id: string; name: string }[];
};

// Translation names follow semantic camelCase; route/permission identities keep their original hyphens.
export const accessPageLabelKey = (id: string) =>
  `accessMembers.pages.${id.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())}`;
