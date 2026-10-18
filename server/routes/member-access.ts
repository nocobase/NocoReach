import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import { isApiKeySession } from '@nocobase/app-plugin-api-keys/server';
import { UserManagementError } from '@nocobase/app-plugin-users/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponses,
  apiErrorStatusFromHttp,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
} from '@nocobase/app-server/router';
import { Hono } from 'hono';
import { z } from 'zod';
import { nocoReachToken } from '../providers/nocoreach.js';
import { accessError } from '../access/management.js';
import {
  businessRoleSchema,
  memberInvitationSchema,
  memberRoleUpdateSchema,
} from '../../shared/member-access.js';

type Env = AuthorizationEnv & AuthEnv;
const id = z.object({ id: z.string().min(1).max(128) });
const invitation = z.object({
  source: z.enum(['users', 'members']),
  id: z.uuid(),
});
const describe = (operationId: string, summary: string) =>
  describeRoute({
    tags: ['NocoReach Access'],
    operationId,
    summary,
    responses: { 200: dataResponse(z.unknown()), ...apiErrorResponses },
  });

export const memberAccessRoutes = defineApiRoutes<Application>((app) => {
  const routes = new Hono<Env>();
  const runtime = () => app.container.resolve(nocoReachToken);
  const access = () => runtime().legacy.db.access!;
  routes.onError((error, context) =>
    apiErrorHandler(
      error instanceof UserManagementError
        ? new ApiError({
            status: apiErrorStatusFromHttp(error.status),
            reason: error.code,
            domain: 'users',
            message: error.message,
          })
        : error,
      context,
    ),
  );
  routes.use(
    '*',
    app.container.resolve(authenticationToken).required(),
    app.container.resolve(authorizationToken).middleware(),
  );
  routes.use('*', async (context, next) => {
    await runtime().ready;
    const session = context.get('auth');
    if (
      !session ||
      isApiKeySession(session, context.req.raw.headers) ||
      context.req.header('x-api-key')
    )
      accessError('interactiveOnly');
    context.header('Cache-Control', 'no-store');
    await next();
  });
  const actor = (context: import('hono').Context<Env>) =>
    context.get('auth')!.user.id;
  routes.get(
    '/mine',
    describe(
      'ownReachInvitations',
      'Read only the signed-in person’s invitations without membership',
    ),
    async (context) =>
      context.json({ data: await runtime().invitations!.mine(actor(context)) }),
  );
  routes.get(
    '/mine/:id',
    describe(
      'getOwnReachInvitation',
      'Read an invitation only as its invited account',
    ),
    apiValidator('param', id),
    async (context) =>
      context.json({
        data: (
          await runtime().invitations!.mine(
            actor(context),
            context.req.valid('param').id,
          )
        )[0],
      }),
  );
  routes.post(
    '/mine/:id/accept',
    describe(
      'acceptReachInvitation',
      'Actively accept an existing-account invitation',
    ),
    apiValidator('param', id),
    async (context) =>
      context.json({
        data: await runtime().invitations!.accept(
          actor(context),
          context.req.valid('param').id,
        ),
      }),
  );
  // The own-invitation routes deliberately precede the business membership gate.
  routes.use('*', async (context, next) =>
    access().run(
      {
        userId: context.get('auth')!.user.id,
        context: context.get('authz'),
        http: context.req.raw,
      },
      next,
    ),
  );
  const members = async () => {
    await access().require('nrMembers', 'list');
    const projects = await access().projectMembers();
    return {
      items: (await runtime().plugin.members.list())
        .filter((member: { role: string | null }) => member.role)
        .map((member: { id: string }) => ({
          ...member,
          projects: projects.get(member.id) ?? [],
        })),
      canManage: await access().allows('nrMembers', 'setRole'),
    };
  };
  routes.get(
    '/members',
    describe(
      'listReachMembers',
      'List application members and their multiple roles',
    ),
    async (context) => context.json({ data: await members() }),
  );
  routes.get(
    '/members/:id',
    describe('getReachMember', 'Get fresh member assignments'),
    apiValidator('param', id),
    async (context) => {
      const result = await members();
      const member = result.items.find(
        (item: { id: string }) => item.id === context.req.valid('param').id,
      );
      if (!member) accessError('missing', 'NOT_FOUND');
      return context.json({ data: member });
    },
  );
  routes.post(
    '/members/:id/roles',
    describe('assignReachRoles', 'Replace only application roles'),
    apiValidator('param', id),
    apiValidator('json', memberRoleUpdateSchema),
    async (context) => {
      const { roles, expectedRoles, projectIds, expectedProjects } =
        context.req.valid('json');
      await access().replaceRoles(
        actor(context),
        context.req.valid('param').id,
        roles,
        expectedRoles,
        projectIds && expectedProjects
          ? { projectIds, expectedProjects }
          : undefined,
      );
      return context.json({ data: null });
    },
  );
  routes.post(
    '/members/:id/remove',
    describe(
      'removeReachMember',
      'Remove application access while preserving the account',
    ),
    apiValidator('param', id),
    async (context) => {
      await access().replaceRoles(
        actor(context),
        context.req.valid('param').id,
        [],
      );
      return context.json({ data: null });
    },
  );
  routes.get(
    '/roles',
    describe('listReachRoles', 'List built-in and custom permission sets'),
    async (context) =>
      context.json({ data: await runtime().management!.listRoles() }),
  );
  routes.get(
    '/roles/:id',
    describe('getReachRole', 'Read a fresh role definition before editing'),
    apiValidator('param', id),
    async (context) => {
      const roles = await runtime().management!.listRoles();
      const role = roles.items.find(
        (item) => item.key === context.req.valid('param').id,
      );
      if (!role) accessError('missing', 'NOT_FOUND');
      return context.json({ data: role });
    },
  );
  routes.get(
    '/catalog',
    describe(
      'reachRoleCatalogue',
      'List the projects members and invitations can be assigned to',
    ),
    async (context) => {
      await access().require('nrMembers', 'list');
      return context.json({
        data: {
          projects: (await runtime().plugin.projects.list()).map(
            (project: { id: number; name: string }) => ({
              id: String(project.id),
              name: project.name,
            }),
          ),
        },
      });
    },
  );
  routes.post(
    '/roles',
    describe(
      'createReachRole',
      'Create a custom role within the actor’s grantable permissions',
    ),
    apiValidator('json', businessRoleSchema),
    async (context) =>
      context.json({
        data: await runtime().management!.saveRole(
          actor(context),
          context.req.valid('json'),
          false,
        ),
      }),
  );
  routes.put(
    '/roles/:id',
    describe(
      'updateReachRole',
      'Update a custom role with a definition revision',
    ),
    apiValidator('param', id),
    apiValidator('json', businessRoleSchema),
    async (context) => {
      const input = context.req.valid('json');
      if (input.key !== context.req.valid('param').id)
        accessError('invalidRole', 'INVALID_ARGUMENT');
      return context.json({
        data: await runtime().management!.saveRole(actor(context), input, true),
      });
    },
  );
  routes.delete(
    '/roles/:id',
    describe('deleteReachRole', 'Delete an unassigned custom role'),
    apiValidator('param', id),
    apiValidator('json', z.strictObject({ revision: z.string().min(1) })),
    async (context) => {
      await runtime().management!.deleteRole(
        actor(context),
        context.req.valid('param').id,
        context.req.valid('json').revision,
      );
      return context.json({ data: null });
    },
  );
  routes.get(
    '/invitations',
    describe(
      'listReachInvitations',
      'List new and existing-account pending invitations together',
    ),
    async (context) =>
      context.json({ data: await runtime().invitations!.list() }),
  );
  routes.post(
    '/invitations',
    describe(
      'inviteReachMembers',
      'Invite several addresses into the member role and chosen projects',
    ),
    apiValidator('json', memberInvitationSchema),
    async (context) => {
      const input = context.req.valid('json');
      return context.json({
        data: await runtime().invitations!.inviteMany(
          actor(context),
          input.emails,
          input.projectIds,
          new URL(context.req.url).origin,
        ),
      });
    },
  );
  routes.post(
    '/invitations/:source/:id/resend',
    describe(
      'resendReachInvitation',
      'Invalidate the old link and renew a seven-day invitation',
    ),
    apiValidator('param', invitation),
    apiValidator(
      'json',
      z.strictObject({ sendEmail: z.boolean().default(true) }),
    ),
    async (context) => {
      const { source, id } = context.req.valid('param');
      return context.json({
        data: await runtime().invitations!.resend(
          actor(context),
          source,
          id,
          new URL(context.req.url).origin,
          context.req.valid('json').sendEmail,
        ),
      });
    },
  );
  routes.post(
    '/invitations/:source/:id/revoke',
    describe('revokeReachInvitation', 'Revoke a pending invitation'),
    apiValidator('param', invitation),
    async (context) => {
      const { source, id } = context.req.valid('param');
      await runtime().invitations!.revoke(actor(context), source, id);
      return context.json({ data: null });
    },
  );
  const router = new Hono();
  router.route('/nocoreachAccess', routes);
  return router;
});
