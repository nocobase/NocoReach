import type { ReactElement } from 'react';
import { Sparkles, UserSearch } from 'lucide-react';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import type { TaskSource } from './task-source';

// "Found by AI" or "Found by <name>" on a task card (2026-10-22 user request): who surfaced the task, which is not
// always who owns it. Text with an icon, never a Tag, which is for status. Nothing for an older task whose person
// was not recorded.
export function FoundBy({
  source,
  className,
}: {
  source: TaskSource;
  className?: string;
}): ReactElement | null {
  if (source.by === 'ai')
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 text-xs text-agent',
          className,
        )}
        data-found-by='ai'
      >
        <Sparkles aria-hidden='true' className='size-3' />
        {$t('taskSource.foundByAi')}
      </span>
    );
  if (!source.name) return null;
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground',
        className,
      )}
      data-found-by='person'
    >
      <UserSearch aria-hidden='true' className='size-3 shrink-0' />
      <span className='truncate'>
        {$t('taskSource.foundBy', { 0: source.name })}
      </span>
    </span>
  );
}
