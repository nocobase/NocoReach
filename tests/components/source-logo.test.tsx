import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { SourceLogo } from '../../client/components/reach/source-logo';
import { getCatalog } from '../../client/pages/data-sources';

// Every source the page lists, and every id Data health and the analysis rules name it by, has its own mark; the
// generic plug is only for sources added later (automatic sources, a new discovery kind).
const HEALTH_IDS = [
  'gsc',
  'ga4',
  'site',
  'github',
  'github-traffic',
  'discourse',
  'packages',
  'hackernews',
  'youtube',
  'reddit',
  'trends',
  'competitors',
  'x',
  'discord',
  'slack',
  'rank',
  'daily-analysis',
];
const RULE_SOURCES = ['ai-search', 'bilibili', 'xiaohongshu'];
const REGISTRIES = ['npm', 'pypi', 'docker'];

it.each([
  ...new Set([
    ...getCatalog().map((s) => s.id),
    ...HEALTH_IDS,
    ...RULE_SOURCES,
    ...REGISTRIES,
  ]),
])('%s has a mark of its own', (source) => {
  const { container } = render(<SourceLogo source={source} />);
  const logo = container.querySelector('[data-slot="source-logo"]')!;
  expect(logo.getAttribute('data-mark')).not.toBe('fallback');
  expect(logo).toHaveAttribute('aria-hidden', 'true');
});

it('draws black marks in the text colour and keeps brand colours otherwise', () => {
  const { container } = render(
    <>
      <SourceLogo source='github' />
      <SourceLogo source='youtube' />
    </>,
  );
  const [github, youtube] = container.querySelectorAll('svg');
  expect(github).toHaveClass('text-foreground');
  expect(youtube.getAttribute('style')).toContain('#FF0000');
});

// Content workshop v5 review: a wordmark, bare, sits on a square of its colour so it reads beside the other marks;
// an icon mark takes the colour it is given, so a row of marks can show one as active.
it('puts a bare wordmark on a square of its colour and lets an icon mark take the given colour', () => {
  const { container } = render(
    <>
      <SourceLogo source='xiaohongshu' size='xs' />
      <SourceLogo source='xiaohongshu' size='sm' />
      <SourceLogo source='community' size='xs' />
      <SourceLogo source='community' size='xs' className='text-foreground' />
    </>,
  );
  const [bare, tiled, muted, active] = container.querySelectorAll(
    '[data-slot="source-logo"]',
  );
  expect(bare).toHaveClass('rounded-[3px]');
  expect(bare.getAttribute('style')).toContain('#FF2442');
  expect(bare.querySelector('svg')).toHaveClass('text-white');
  expect(tiled).not.toHaveClass('rounded-[3px]');
  expect(muted).toHaveClass('text-muted-foreground');
  expect(active).toHaveClass('text-foreground');
  expect(active).not.toHaveClass('text-muted-foreground');
});
