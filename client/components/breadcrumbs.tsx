import { usePageBreadcrumbLevels } from '@nocobase/app-client';
import type { PageBreadcrumbLevel } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronLeftIcon } from 'lucide-react';
import {
  Fragment,
  useEffect,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { Link, useLocation } from 'react-router';

import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '#components/ui/breadcrumb';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { usePageTabLabel } from '#hooks/use-page-tab';
import { cn } from 'cn';

import {
  useRouteTrail,
  type RouteTrailEntry,
} from '../routing/route-context.js';
import { routeKey } from '../routing/route-navigation.js';

export interface BreadcrumbsProps {
  readonly className?: string;
  /** Route keys the viewer may not open (`useRouteNavigation`): the trail names none of them. */
  readonly denied?: ReadonlySet<string>;
  /**
   * The element the page scrolls in. With it, a top-level page's trail waits until the page's heading has scrolled
   * out from under the header.
   */
  readonly scroller?: RefObject<HTMLElement | null>;
}

/**
 * The trail of destinations leading to the current page, which the layout renders in its header after the sidebar
 * toggle, behind a divider. Pages do not place it.
 *
 * By default it is the route trail: a route earns a level by declaring `breadcrumb`, or by being a menu page
 * (`navigation` with a component), and structure that only owns a path segment — a tab, an overlay, a group with
 * neither — is skipped. A page whose trail names records, or does not follow its URL, declares the whole trail with
 * `usePageBreadcrumb` from `@nocobase/app-client`. Earlier levels link where a page sits behind them; the last is the
 * current page.
 *
 * NocoReach departs from the template in two ways. The template shows the trail on every page, but on a top-level
 * page the trail is only the page's own title, which its `PageHeader` repeats in large type right below: the trail
 * stays hidden there until that heading scrolls out of view, then fades in, as iOS large titles and Linear do. And
 * below `md`, where the sidebar becomes a sheet, the header is compact and shows no trail at all: the layout puts the
 * brand there, or `BreadcrumbParentLink` on a page below another one. From `md` to `lg` a trail of three or more
 * levels keeps its first and last and folds the middle into a menu.
 *
 * A top-level page with tabs names the selected one after itself once it shows (`usePageTab`): "GitHub › GitHub hot
 * topics". The page's own level then links to the page's default tab, scrolled to the top.
 */
export function Breadcrumbs({
  className,
  denied,
  scroller,
}: BreadcrumbsProps = {}): ReactElement | null {
  const trailLevels = useBreadcrumbLevels(denied);
  const { t } = useTranslation();
  const ownTitleOnly = scroller !== undefined && trailLevels.length === 1;
  const headingAway = useHeadingScrolledAway(scroller, ownTitleOnly);
  const tab = usePageTabLabel();

  if (trailLevels.length === 0) return null;
  // The tab is the page itself, not a level below it, so it joins only a top-level page's trail. The page's level then
  // leads to its default tab from the top: the content keeps its scroll position across navigation, and clicking the
  // page you are on (already on the default tab) would otherwise do nothing visible.
  const shownLevels: readonly (PageBreadcrumbLevel & { toTop?: boolean })[] =
    ownTitleOnly && tab
      ? [{ ...trailLevels[0], toTop: true }, { label: tab }]
      : trailLevels;
  const scrollToTop = (): void => scroller?.current?.scrollTo({ top: 0 });
  // A level is told apart by its depth and label; two levels may share either alone.
  const levels = shownLevels.map((level, depth) => ({
    ...level,
    key: `${depth}:${level.label}`,
  }));
  const last = levels.length - 1;
  const folded = levels.slice(1, last);
  const waiting = ownTitleOnly && !headingAway;

  return (
    <div
      aria-hidden={waiting || undefined}
      className={cn(
        // Fades in rising 6px; with reduced motion it only fades.
        'hidden min-w-0 items-center gap-3 transition duration-[180ms] ease-out motion-reduce:translate-y-0 md:flex',
        waiting ? 'translate-y-1.5 opacity-0' : 'translate-y-0 opacity-100',
        className,
      )}
    >
      <div className='h-5 w-px shrink-0 bg-border' />
      <Breadcrumb
        aria-label={t('navigation.breadcrumb', { defaultValue: 'Breadcrumb' })}
        className='min-w-0'
      >
        <BreadcrumbList className='flex-nowrap'>
          {levels.map((level, index) => (
            <Fragment key={level.key}>
              {index === 1 && folded.length > 0 ? (
                <>
                  <BreadcrumbItem className='lg:hidden'>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={t('navigation.breadcrumbMore', {
                          defaultValue: 'Show the levels in between',
                        })}
                        className='rounded-sm transition-colors hover:text-foreground'
                      >
                        <BreadcrumbEllipsis />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align='start'>
                        {folded.map((middle) =>
                          middle.to ? (
                            <DropdownMenuItem
                              key={middle.key}
                              render={<Link to={middle.to} />}
                            >
                              {middle.label}
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem key={middle.key} disabled>
                              {middle.label}
                            </DropdownMenuItem>
                          ),
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className='lg:hidden' />
                </>
              ) : null}
              <BreadcrumbItem
                className={cn(
                  'min-w-0',
                  index === last
                    ? undefined
                    : index === 0
                      ? 'shrink-0'
                      : 'hidden shrink-0 lg:inline-flex',
                )}
              >
                {index === last ? (
                  <BreadcrumbPage className='truncate font-medium'>
                    {level.label}
                  </BreadcrumbPage>
                ) : level.to ? (
                  <BreadcrumbLink
                    className='max-w-48 truncate'
                    render={
                      <Link
                        to={level.to}
                        onClick={level.toTop ? scrollToTop : undefined}
                      />
                    }
                  >
                    {level.label}
                  </BreadcrumbLink>
                ) : (
                  <span className='max-w-48 truncate'>{level.label}</span>
                )}
              </BreadcrumbItem>
              {index < last ? (
                <BreadcrumbSeparator
                  className={index === 0 ? undefined : 'hidden lg:block'}
                />
              ) : null}
            </Fragment>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

/**
 * The current page's trail: the one it declares with `usePageBreadcrumb`, else the route trail without the levels
 * the viewer may not open.
 */
function useBreadcrumbLevels(
  denied?: ReadonlySet<string>,
): readonly PageBreadcrumbLevel[] {
  const trail = useRouteTrail();
  const declared = usePageBreadcrumbLevels();
  const { t } = useTranslation();
  return (
    declared ??
    trail.flatMap((entry): PageBreadcrumbLevel[] => {
      const title = routeLevelTitle(entry);
      if (title === undefined || denied?.has(routeKey(entry.route))) return [];
      return [
        {
          label: t(title, {
            ns: entry.route.packageName,
            defaultValue: title,
          }),
          ...(entry.route.componentLoader ? { to: entry.pathname } : {}),
        },
      ];
    })
  );
}

/**
 * The level a page below another one leads back to: the nearest level before the current page that links, or
 * `undefined` on a top-level page.
 */
function useBreadcrumbParent(
  denied?: ReadonlySet<string>,
): PageBreadcrumbLevel | undefined {
  const levels = useBreadcrumbLevels(denied);
  return levels
    .slice(0, -1)
    .reverse()
    .find((level) => level.to !== undefined);
}

export interface BreadcrumbParentLinkProps {
  readonly className?: string;
  /** Route keys the viewer may not open, as for `Breadcrumbs`. */
  readonly denied?: ReadonlySet<string>;
  /** What a top-level page shows in its place: the compact header's brand. */
  readonly fallback?: ReactNode;
}

/**
 * NocoReach: the compact header's way back from a page below another one, "‹ Keywords", where the brand would be.
 * The full trail does not fit beside the header's actions on a phone, and the page has no `BackButton` of its own once
 * its trail leads back (guideline L6), so without this a phone would have no way back but the browser's.
 */
export function BreadcrumbParentLink({
  className,
  denied,
  fallback,
}: BreadcrumbParentLinkProps): ReactElement | null {
  const parent = useBreadcrumbParent(denied);
  const { t } = useTranslation();
  if (parent?.to === undefined) {
    return fallback ? <div className={className}>{fallback}</div> : null;
  }
  return (
    <Link
      aria-label={t('navigation.backTo', {
        label: parent.label,
        defaultValue: 'Back to {{label}}',
      })}
      className={cn(
        'inline-flex min-w-0 items-center gap-0.5 rounded-sm text-sm text-muted-foreground transition-colors hover:text-foreground',
        className,
      )}
      to={parent.to}
    >
      <ChevronLeftIcon className='size-4 shrink-0' />
      <span className='truncate'>{parent.label}</span>
    </Link>
  );
}

/**
 * Whether the first heading in `scroller` has scrolled out from under the header (the scroller's top edge). Measured
 * on scrolling, including a page's own scrolling container (capture), and when the page's content changes, such as a
 * lazily loaded page arriving at a scroll position the previous page left. A page without a rendered heading never
 * counts as scrolled away, so its trail stays hidden rather than flashing in while it loads.
 */
function useHeadingScrolledAway(
  scroller: RefObject<HTMLElement | null> | undefined,
  enabled: boolean,
): boolean {
  const [away, setAway] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const root = scroller?.current;
    if (!enabled || !root) return;
    let frame = 0;
    const measure = (): void => {
      frame = 0;
      // A heading that takes no space (not rendered) has not scrolled anywhere.
      const heading = root.querySelector('h1')?.getBoundingClientRect();
      setAway(
        heading !== undefined &&
          heading.height > 0 &&
          heading.bottom < root.getBoundingClientRect().top,
      );
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(measure);
    };
    schedule();
    root.addEventListener('scroll', schedule, { capture: true, passive: true });
    const changes = new MutationObserver(schedule);
    changes.observe(root, { childList: true, subtree: true });
    return () => {
      root.removeEventListener('scroll', schedule, { capture: true });
      changes.disconnect();
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [scroller, enabled, pathname]);

  return enabled && away;
}

/** A route's level title: its `breadcrumb`, else the menu title of a page; `undefined` for structure. */
function routeLevelTitle(entry: RouteTrailEntry): string | undefined {
  const { route } = entry;
  if (route.breadcrumb) return route.breadcrumb.title;
  if (route.navigation && route.componentLoader) return route.navigation.title;
  return undefined;
}

Breadcrumbs.displayName = 'Breadcrumbs';
