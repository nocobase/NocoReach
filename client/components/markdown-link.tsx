import { resolveAppBase } from '@nocobase/app-client';
import type { ComponentProps, ReactElement } from 'react';
import { Link, useInRouterContext } from 'react-router';

import { useLinkInMenu } from './app-shell/nav-sources.js';

/** The path inside this deployment a link points to, with its search and hash, or null for anywhere else. */
function deploymentPath(href: string | undefined): string | null {
  if (!href || typeof window === 'undefined') return null;
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || url.username || url.password)
      return null;
    const base = resolveAppBase().replace(/\/$/, '');
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`))
      return null;
    return `${url.pathname.slice(base.length) || '/'}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/** Only task details and opportunities inside this deployment use application navigation. */
function applicationPath(path: string | null): string | null {
  return path !== null &&
    /^\/(actions\/[1-9]\d{0,15}|opportunities)\/?$/.test(path.split(/[?#]/)[0])
    ? path
    : null;
}

export function MarkdownLink({
  href,
  children,
  ...props
}: ComponentProps<'a'>): ReactElement {
  const inRouter = useInRouterContext();
  const inMenu = useLinkInMenu();
  const own = deploymentPath(href);
  // A conversation does not lead to a data page the menu leaves out (2026-11-02): its source is not connected.
  if (own !== null && !inMenu(own)) return <span>{children}</span>;
  const path = applicationPath(own);
  if (path !== null && inRouter)
    return (
      <Link {...props} to={path}>
        {children}
      </Link>
    );
  return (
    <a
      {...props}
      href={href}
      target={path === null ? '_blank' : undefined}
      rel={path === null ? 'noreferrer' : undefined}
    >
      {children}
    </a>
  );
}
