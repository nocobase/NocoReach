import type { AuthorizationMiddleware } from '@nocobase/authorization/core';
import type { ReachAccess } from './service.js';

/** Apply application membership and project boundaries to the shared human-facing APIs. */
export function pluginBoundary(
  access: ReachAccess,
  getRun: (id: string) => Promise<{ subject: { kind: string; id: string } }>,
): AuthorizationMiddleware {
  return async (request, next) => {
    const path = request.http.req.path;
    if (
      !/\/api\/(agents|scheduler)(\/|$)/.test(path) ||
      request.principal?.type !== 'user'
    )
      return next();
    const context = access.authorization.for({
      principal: request.principal,
      subjects: request.subjects.values(),
      keyScope: request.keyScope,
    });
    return access.run(
      {
        userId: request.principal.id,
        context,
        keyScope: request.keyScope,
        http: request.http.req.raw,
      },
      async () => {
        if (/\/agents\/runs$/.test(path)) {
          const subjectKind = request.http.req.query('subjectKind');
          // The generic list cannot filter task projects; use the application's scoped task list.
          if (!subjectKind || subjectKind === 'nocoreachTask')
            await access.require('nrTaskWork', 'list');
        }
        const workspace = path.match(
          /\/agents\/workspaces\/nocoreachTask\/([^/]+)\/reset$/,
        );
        if (workspace)
          await access.require(
            'nrTaskWork',
            'execute',
            decodeURIComponent(workspace[1]).split(':')[0],
          );
        const match = path.match(/\/agents\/runs\/([^/]+)(?:\/|$)/);
        if (match) {
          let run;
          try {
            run = await getRun(decodeURIComponent(match[1]));
          } catch (error) {
            if (!(
              error instanceof Error &&
              'code' in error &&
              error.code === 'RUN_NOT_FOUND'
            ))
              throw error;
          }
          if (run?.subject.kind === 'nocoreachTask')
            await access.require(
              'nrTaskWork',
              'get',
              run.subject.id.split(':')[0],
            );
        }
        await next();
      },
    );
  };
}
