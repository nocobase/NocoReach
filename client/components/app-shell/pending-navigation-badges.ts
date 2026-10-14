import type { NavigationBadges } from '../../layouts/components/navigation-menu.js';
import { useNavBadge } from './nav-badges.js';

/**
 * What waits on the viewer beside Insights, Opportunities and Tasks, as the template's navigation `badges`, keyed by
 * those routes' names (client/nocoreach-routes.ts). Counts that are loading or failed show nothing.
 */
export function usePendingNavigationBadges(): NavigationBadges {
  const insights = useNavBadge('insights').count ?? 0;
  const opportunities = useNavBadge('opportunities').count ?? 0;
  const tasks = useNavBadge('tasks').count ?? 0;
  return {
    'growth-overview': insights,
    'opportunity-library': opportunities,
    'action-center': tasks,
  };
}
