import { resolveAppBase } from '@nocobase/app-client';
import type { ComponentProps, ReactElement } from 'react';
import { Link, useInRouterContext } from 'react-router';

/** Only task details and opportunities inside this deployment use application navigation. */
function applicationPath(href: string | undefined): string | null {
  if (!href || typeof window === 'undefined') return null;
  try {
    const url = new URL(href, window.location.href);
    if (url.origin !== window.location.origin || url.username || url.password)
      return null;
    const base = resolveAppBase().replace(/\/$/, '');
    if (url.pathname !== base && !url.pathname.startsWith(`${base}/`))
      return null;
    const path = url.pathname.slice(base.length) || '/';
    if (!/^\/(actions\/[1-9]\d{0,15}|opportunities)\/?$/.test(path))
      return null;
    return `${path}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function MarkdownLink({
  href,
  children,
  ...props
}: ComponentProps<'a'>): ReactElement {
  const inRouter = useInRouterContext();
  const path = applicationPath(href);
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
