import { useEffect, useState } from 'react';
import { cn } from 'cn';
import { $t } from '#i18n';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '#components/ui/popover';

/** Keep the card compact; only overflowing instructions open the full text. */
export function InstructionsPreview({ children }: { children: string }) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);
  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() =>
      setOverflows(element.scrollHeight > element.clientHeight + 1),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, children]);
  const preview = (
    <div
      ref={setElement}
      className={cn(
        'max-h-[3lh] overflow-hidden text-left leading-relaxed break-words whitespace-pre-line text-muted-foreground',
        overflows &&
          '[mask-image:linear-gradient(to_bottom,black_55%,transparent)]',
      )}
    >
      {children}
    </div>
  );
  if (!overflows) return preview;
  return (
    <Popover>
      <PopoverTrigger className='block w-full cursor-pointer rounded-md text-left'>
        {preview}
      </PopoverTrigger>
      <PopoverContent
        align='start'
        side='left'
        className='max-h-[min(36rem,70vh)] w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto'
      >
        <PopoverHeader>
          <PopoverTitle>{$t('onlineAgent.instructions')}</PopoverTitle>
        </PopoverHeader>
        <div className='text-sm leading-relaxed break-words whitespace-pre-line'>
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
