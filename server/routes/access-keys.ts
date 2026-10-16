import { authenticationToken } from '@nocobase/app-plugin-authentication/server';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import {
  apiValidator,
  defineApiRoutes,
  describeRoute,
  dataResponse,
  apiErrorResponses,
  apiErrorHandler,
  apiErrorResponse,
} from '@nocobase/app-server/router';
import { toApiKeysApiError } from '@nocobase/app-plugin-api-keys/server';
import { Hono } from 'hono';
import { z } from 'zod';
import type { Application } from '@nocobase/app-server/application';
import { nocoReachToken } from '../providers/nocoreach.js';

const scope = z.strictObject({
  groups: z.record(
    z.string(),
    z.strictObject({
      level: z.enum(['read', 'write', 'admin']),
      objects: z
        .union([z.literal('all'), z.array(z.string().min(1))])
        .optional(),
    }),
  ),
});
const create = z.strictObject({
  name: z.string().min(1).max(100),
  type: z.enum(['personal', 'organization']),
  userId: z.string().optional(),
  roles: z.array(z.string()).optional(),
  expiresInDays: z.number().int().min(1).max(365).default(90),
  scope,
});
const target = z.strictObject({
  keyId: z.string().min(1),
  ownerId: z.string().min(1),
});
const declaration = (operationId: string, summary: string) =>
  describeRoute({
    tags: ['NocoReach Access'],
    operationId,
    summary,
    responses: {
      200: dataResponse(z.unknown()),
      ...apiErrorResponses,
      404: apiErrorResponse(404),
    },
  });

export const accessKeyRoutes = defineApiRoutes<Application>((app) => {
  const routes = new Hono<AuthorizationEnv>();
  routes.onError((error, context) =>
    apiErrorHandler(toApiKeysApiError(error), context),
  );
  routes.use(
    '*',
    app.container.resolve(authenticationToken).required(),
    app.container.resolve(authorizationToken).middleware(),
  );
  routes.use('*', async (context, next) => {
    const runtime = app.container.resolve(nocoReachToken);
    await runtime.ready;
    const session = context.get('auth' as never) as { user: { id: string } };
    await runtime.legacy.db.access!.run(
      { userId: session.user.id, context: context.get('authz') },
      next,
    );
  });
  const runtime = () => app.container.resolve(nocoReachToken);
  const actor = () => runtime().legacy.db.access!.current()!.userId;
  routes.get(
    '/inventory',
    declaration(
      'inventoryNocoReachKeys',
      'Inventory API key metadata for controlled replacement',
    ),
    async (context) =>
      context.json({ data: await runtime().keys!.inventory() }),
  );
  routes.get(
    '/events',
    declaration(
      'listNocoReachAccessEvents',
      'Read membership and key management events',
    ),
    apiValidator(
      'query',
      z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }),
    ),
    async (context) =>
      context.json({
        data: await runtime().keys!.events(context.req.valid('query').limit),
      }),
  );
  routes.post(
    '/',
    declaration(
      'createNocoReachKey',
      'Issue a scoped personal or organization API key',
    ),
    apiValidator('json', create),
    async (context) => {
      context.header('Cache-Control', 'no-store');
      return context.json({
        data: await runtime().keys!.create(actor(), context.req.valid('json')),
      });
    },
  );
  routes.post(
    '/rotate',
    declaration('rotateNocoReachKey', 'Rotate a scoped API key immediately'),
    apiValidator('json', target),
    async (context) => {
      const { keyId, ownerId } = context.req.valid('json');
      context.header('Cache-Control', 'no-store');
      return context.json({
        data: await runtime().keys!.rotate(actor(), keyId, ownerId),
      });
    },
  );
  routes.post(
    '/revoke',
    declaration('revokeNocoReachKey', 'Revoke a scoped API key'),
    apiValidator('json', target),
    async (context) => {
      const { keyId, ownerId } = context.req.valid('json');
      await runtime().keys!.revoke(actor(), keyId, ownerId);
      return context.json({ data: null });
    },
  );
  const router = new Hono();
  router.route('/nocoreachKeys', routes);
  return router;
});
