// Public resource selection only. Authentication and page access stay in ClientRoute.
export const startupPages = {
  'growth-overview': '/home',
  'opportunity-library': '/opportunities',
  'action-center': '/actions',
} as const;

export type MessageScope = 'workspace' | 'all';

export function pageMessageScope(name: string): MessageScope | undefined {
  // These application routes use the shell/authentication catalogs, not business copy.
  if (
    [
      'home',
      'inbox',
      'login',
      'register',
      'forgot-password',
      'reset-password',
      'device',
    ].includes(name)
  )
    return;
  return Object.hasOwn(startupPages, name) ? 'workspace' : 'all';
}

export function initialPageName(
  base: string,
  pathname: string,
): string | undefined {
  const mount = base.replace(/\/$/, '');
  if (pathname !== mount && !pathname.startsWith(mount + '/')) return;
  const path = pathname.slice(mount.length).replace(/\/$/, '') || '/';
  if (path === '/') return 'growth-overview';
  return Object.entries(startupPages).find(([, value]) => value === path)?.[0];
}
