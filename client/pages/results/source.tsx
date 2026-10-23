import { Link } from 'react-router';
import { Reveal } from '#components/reach/reveal';
import { $t } from '#i18n';
import type { ResultSource } from './types.js';
import { Comparison } from './comparison.js';
import { formatDateTime } from '#lib/format';
export function ResultSourcePanel({ source }: { source: ResultSource }) {
  return (
    <section className='flex flex-col gap-2 rounded-md border p-3 text-sm'>
      <h3 className='font-semibold'>{$t('results.source')}</h3>
      <div className='flex flex-wrap gap-3'>
        <Link
          className='nr-link'
          to={`/results/${source.taskId}${source.day ? `?day=${source.day}` : ''}`}
        >
          {$t('results.title')}
          {source.day ? ` · ${$t('results.day', { 0: source.day })}` : ''}
        </Link>
        <Link className='nr-link' to={`/actions/${source.taskId}`}>
          {$t('results.originalTask')}
        </Link>
      </div>
      <p className='text-xs text-muted-foreground'>
        {$t('results.sourceCaptured', {
          0: formatDateTime(source.capturedAt),
        })}
      </p>
      {source.pages.map((page) => (
        <a
          key={page}
          className='nr-link break-all'
          href={page}
          target='_blank'
          rel='noreferrer'
        >
          {page}
        </a>
      ))}
      {source.observation ? (
        // Opened like every "show more" on the site, not the browser's ▶ disclosure (UI review 2026-10-22).
        <Reveal label={$t('results.evidence')}>
          <Comparison
            result={source.observation}
            observeFrom={source.observeFrom}
          />
        </Reveal>
      ) : (
        <p>{$t('results.noSnapshot')}</p>
      )}
    </section>
  );
}
