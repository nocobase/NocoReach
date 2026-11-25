import { GalleryHorizontal } from 'lucide-react';
import { cn } from '#lib/utils';

/** Carousel's mark: a card between two, as a carousel swipes; it stands for every place. */
export function CarouselMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden='true'
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded border bg-background text-foreground',
        className,
      )}
    >
      <GalleryHorizontal className='size-4' />
    </span>
  );
}
