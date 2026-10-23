import type { CSSProperties, ReactElement } from 'react';
import {
  Binoculars,
  CalendarClock,
  FolderGit2,
  Globe,
  Newspaper,
  Plug,
  Search,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '#lib/utils';
import { BRAND_LOGOS, type BrandLogoKey } from './brand-logos';

// One mark per data source, wherever a source is named in a list (Settings › Data sources cards and drawers, Data
// health, the discovery results, Settings › Analysis rules). Sources are named by several ids — the catalog's, Data
// health's, the analysis rules' and the discovered packages' registries — and all of them resolve here. A source
// without a brand mark of its own takes a matching icon in the same tile, so a column of sources stays aligned.
const BRAND: Record<string, BrandLogoKey> = {
  gsc: 'googlesearchconsole',
  ga4: 'googleanalytics',
  trends: 'google',
  github: 'github',
  'github-traffic': 'github',
  'github-discussions': 'github',
  packages: 'npm',
  npm: 'npm',
  pypi: 'pypi',
  docker: 'docker',
  discourse: 'discourse',
  mentions: 'ycombinator',
  hackernews: 'ycombinator',
  reddit: 'reddit',
  social: 'x',
  x: 'x',
  bilibili: 'bilibili',
  xiaohongshu: 'xiaohongshu',
  youtube: 'youtube',
  discord: 'discord',
  slack: 'slack',
};
const ICON: Record<string, LucideIcon> = {
  site: Globe,
  repo: FolderGit2,
  articles: Newspaper,
  keywords: Search,
  'ai-visibility': Sparkles,
  'ai-search': Sparkles,
  competitors: Binoculars,
  rank: TrendingUp,
  'daily-analysis': CalendarClock,
};
// `xs` is the bare mark, for a source named inside a button.
const SIZE = {
  md: { tile: 'size-8 rounded-md border bg-background', mark: 'size-5' },
  sm: { tile: 'size-6 rounded border bg-background', mark: 'size-4' },
  xs: { tile: 'size-3.5', mark: 'size-3.5' },
} as const;

/** The source's mark on a small tile; decorative, since the source's name always sits beside it. */
export function SourceLogo({
  source,
  size = 'md',
  mono = false,
  className,
}: {
  source: string;
  size?: keyof typeof SIZE;
  /**
   * One colour for every mark, brand or icon: it takes the text colour around it, so a column of marks reads as one
   * set (Insights' Current situation, 2026-10-23 user feedback: brand colours beside grey icons looked cluttered).
   */
  mono?: boolean;
  className?: string;
}): ReactElement {
  const brand = BRAND[source] ? BRAND_LOGOS[BRAND[source]] : null;
  const Icon = ICON[source] ?? Plug;
  return (
    <span
      aria-hidden='true'
      data-slot='source-logo'
      data-source={source}
      data-mark={brand ? 'brand' : ICON[source] ? 'icon' : 'fallback'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        SIZE[size].tile,
        className,
      )}
    >
      {brand ? (
        <svg
          viewBox='0 0 24 24'
          fill='currentColor'
          className={cn(
            SIZE[size].mark,
            !mono && (brand.color ? 'text-(--brand-color)' : 'text-foreground'),
            !mono &&
              'darkText' in brand &&
              brand.darkText &&
              'dark:text-foreground',
          )}
          style={
            !mono && brand.color
              ? ({ '--brand-color': brand.color } as CSSProperties)
              : undefined
          }
        >
          <path d={brand.path} />
        </svg>
      ) : (
        <Icon
          className={cn(SIZE[size].mark, !mono && 'text-muted-foreground')}
          strokeWidth={mono ? 1.75 : undefined}
        />
      )}
    </span>
  );
}
