import type { AppClientRegisteredRoute } from '@nocobase/app-client/plugins';
import { useEffect } from 'react';
import { useMe } from '../pages/me.js';
import { useProject } from '../pages/reach-data.js';
import { useWorkspaceCache } from '../pages/workspace-cache.js';
import {
  navigationFreshness,
  navigationQueries,
} from '../pages/workspace-queries.js';

// Mounted only for the committed, authorized route. Hover, cancelled draft
// navigation, plugin routes and denied/pending page checks never start reads.
export function NavigationData({ route }: { route: AppClientRegisteredRoute }) {
  if (
    route.source !== 'application' ||
    route.packageName !== 'nocoreach' ||
    route.auth !== 'required' ||
    !Object.hasOwn(navigationQueries, route.name)
  )
    return null;
  return <MemberData routeName={route.name} />;
}
function MemberData({ routeName }: { routeName: string }) {
  const { me } = useMe();
  return me?.role ? <ProjectData routeName={routeName} /> : null;
}
function ProjectData({ routeName }: { routeName: string }) {
  const { project, error } = useProject();
  const projectId = project?.id;
  const cache = useWorkspaceCache();
  useEffect(() => {
    if (!projectId || error) return;
    for (const query of navigationQueries[routeName](projectId)) {
      // The page owns error/retry presentation. Pending reads are shared and
      // fenced by the existing session, permission and mutation invalidations.
      void cache
        .load(
          query.key,
          query.read,
          false,
          query.freshness ?? navigationFreshness,
        )
        .catch(() => undefined);
    }
  }, [cache, routeName, projectId, error]);
  return null;
}
