import { Link } from 'react-router';
import { $t, getCurrentLocale } from '#i18n';
import type { ResultSource } from './types.js';
import { Comparison } from './comparison.js';
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
          0: new Date(source.capturedAt).toLocaleString(getCurrentLocale()),
        })}
      </p>
      {source.observation ? (
        <details>
          <summary className='cursor-pointer'>{$t('results.evidence')}</summary>
          <Comparison result={source.observation} />
        </details>
      ) : (
        <p>{$t('results.noSnapshot')}</p>
      )}
    </section>
  );
}
