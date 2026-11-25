import type { CSSProperties, ReactElement } from 'react';
import {
  Binoculars,
  CalendarClock,
  FolderGit2,
  Globe,
  MessagesSquare,
  Newspaper,
  Plug,
  Search,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '#lib/utils';
import { BRAND_LOGOS, type BrandLogo, type BrandLogoKey } from './brand-logos';

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
  wechat: 'wechat',
  youtube: 'youtube',
  linkedin: 'linkedin',
  instagram: 'instagram',
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
  topics: MessagesSquare,
  'daily-analysis': CalendarClock,
  // A community of the project's own (Content workshop's brand kit), whatever software it runs on.
  community: MessagesSquare,
};
// `xs` is the bare mark, for a source named inside a button or a row of marks. Bare, a wordmark (Xiaohongshu's
// lettering) sits on a square of its colour, as its app icon does, so it reads at the size of the other marks.
const SIZE = {
  md: { tile: 'size-8 rounded-md border bg-background', mark: 'size-5' },
  sm: { tile: 'size-6 rounded border bg-background', mark: 'size-4' },
  xs: { tile: 'size-3.5', mark: 'size-3.5' },
} as const;

/**
 * The source's mark on a small tile; decorative, since the source's name always sits beside it. An icon mark takes
 * the text colour of `className` (muted by default), so a row of marks can show one as active.
 */
export function SourceLogo({
  source,
  size = 'md',
  className,
}: {
  source: string;
  size?: keyof typeof SIZE;
  className?: string;
}): ReactElement {
  const brand: BrandLogo | null = BRAND[source]
    ? BRAND_LOGOS[BRAND[source]]
    : null;
  const Icon = ICON[source] ?? Plug;
  if (brand?.wordmark && brand.color && size === 'xs')
    return (
      <span
        aria-hidden='true'
        data-slot='source-logo'
        data-source={source}
        data-mark='brand'
        className={cn(
          'inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] bg-(--brand-color)',
          className,
        )}
        style={{ '--brand-color': brand.color } as CSSProperties}
      >
        <svg
          viewBox='0 0 24 24'
          fill='currentColor'
          className='size-3 text-white'
        >
          <path d={brand.path} />
        </svg>
      </span>
    );
  return (
    <span
      aria-hidden='true'
      data-slot='source-logo'
      data-source={source}
      data-mark={brand ? 'brand' : ICON[source] ? 'icon' : 'fallback'}
      className={cn(
        'inline-flex shrink-0 items-center justify-center text-muted-foreground',
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
            brand.color ? 'text-(--brand-color)' : 'text-foreground',
            'darkText' in brand && brand.darkText && 'dark:text-foreground',
          )}
          style={
            brand.color
              ? ({ '--brand-color': brand.color } as CSSProperties)
              : undefined
          }
        >
          <path d={brand.path} />
        </svg>
      ) : (
        <Icon className={SIZE[size].mark} />
      )}
    </span>
  );
}
