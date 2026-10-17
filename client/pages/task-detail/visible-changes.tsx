import { ExternalLink } from 'lucide-react';
import { $t } from '#i18n';
import type { VisibleChange } from '../task-execution-types.js';

const pathOf = (page: string) => {
  try {
    const url = new URL(page);
    return url.pathname + url.search;
  } catch {
    return page;
  }
};

/**
 * What a visitor or a search result shows before and after a page change, grouped by page, in the Agent's plain
 * words. The code diff stays in Technical details: the owner reviewing here does not read code.
 */
export function VisibleChanges({ items }: { items: VisibleChange[] }) {
  const pages = [...new Set(items.map((item) => item.page))];
  return (
    <div className='flex flex-col gap-4'>
      {pages.map((page) => (
        <section
          key={page || '-'}
          className='flex flex-col gap-2'
          aria-label={page || $t('taskDetail.visibleChanges')}
        >
          {page ? (
            /^https?:\/\//.test(page) ? (
              <a
                className='nr-link inline-flex items-center gap-1 self-start text-sm font-medium'
                href={page}
                target='_blank'
                rel='noreferrer'
              >
                {pathOf(page)}
                <ExternalLink className='size-3' aria-hidden='true' />
              </a>
            ) : (
              <p className='text-sm font-medium'>{page}</p>
            )
          ) : null}
          {/* A table from sm up; on a phone each change stacks with its own Before and After labels. */}
          <div className='rounded-lg border text-sm'>
            <div
              className='hidden grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-b bg-muted/50 px-3 py-2 text-xs text-muted-foreground sm:grid'
              aria-hidden='true'
            >
              <span />
              <span>{$t('taskDetail.before')}</span>
              <span>{$t('taskDetail.after')}</span>
            </div>
            <div className='divide-y'>
              {items
                .filter((item) => item.page === page)
                .map((item) => (
                  <div
                    key={`${item.label}:${item.before}:${item.after}`}
                    className='grid gap-1 px-3 py-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3'
                  >
                    <span className='font-medium sm:font-normal sm:text-muted-foreground'>
                      {item.label}
                    </span>
                    <span className='break-words whitespace-pre-wrap text-muted-foreground'>
                      <span className='sm:sr-only'>
                        {$t('taskDetail.before')} ·{' '}
                      </span>
                      {item.before || $t('taskDetail.noneBefore')}
                    </span>
                    <span className='break-words whitespace-pre-wrap'>
                      <span className='text-muted-foreground sm:sr-only'>
                        {$t('taskDetail.after')} ·{' '}
                      </span>
                      {item.after || $t('taskDetail.removedAfter')}
                    </span>
                  </div>
                ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
