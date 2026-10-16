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
          <div className='overflow-x-auto rounded-lg border'>
            <table className='w-full min-w-[36rem] table-fixed text-sm'>
              <colgroup>
                <col className='w-32' />
                <col />
                <col />
              </colgroup>
              <thead className='bg-muted/50 text-left text-xs text-muted-foreground'>
                <tr>
                  <th className='px-3 py-2 font-normal'>
                    <span className='sr-only'>
                      {$t('taskDetail.changedPart')}
                    </span>
                  </th>
                  <th className='px-3 py-2 font-normal'>
                    {$t('taskDetail.before')}
                  </th>
                  <th className='px-3 py-2 font-normal'>
                    {$t('taskDetail.after')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items
                  .filter((item) => item.page === page)
                  .map((item) => (
                    <tr
                      key={`${item.label}:${item.before}:${item.after}`}
                      className='border-t align-top'
                    >
                      <th
                        scope='row'
                        className='px-3 py-2 text-left font-normal text-muted-foreground'
                      >
                        {item.label}
                      </th>
                      <td className='px-3 py-2 break-words whitespace-pre-wrap text-muted-foreground'>
                        {item.before || $t('taskDetail.noneBefore')}
                      </td>
                      <td className='px-3 py-2 break-words whitespace-pre-wrap'>
                        {item.after || $t('taskDetail.removedAfter')}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
