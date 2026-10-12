import { resolveAssetUrl } from '@nocobase/app-client';
import type { ComponentPropsWithoutRef, ReactElement } from 'react';
import { cn } from 'cn';

/** The application mark stays still while the template's orbit indicates progress. */
export function BrandLoadingMark({
  className,
  ...props
}: ComponentPropsWithoutRef<'svg'>): ReactElement {
  return (
    <svg
      aria-hidden='true'
      focusable='false'
      viewBox='0 0 64 64'
      className={cn('size-12 shrink-0 text-primary', className)}
      fill='none'
      {...props}
    >
      <circle
        cx='32'
        cy='32'
        r='28'
        stroke='currentColor'
        strokeWidth='2'
        opacity='.12'
      />
      <g className='nocobase-loading-orbit'>
        <path
          d='M32 4a28 28 0 0 1 28 28'
          stroke='currentColor'
          strokeWidth='3'
          strokeLinecap='round'
        />
      </g>
      <image
        href={resolveAssetUrl('/assets/nocoreach-mark.svg')}
        x='14'
        y='14'
        width='36'
        height='36'
      />
    </svg>
  );
}
