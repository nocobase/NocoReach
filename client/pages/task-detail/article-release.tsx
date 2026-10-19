import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { $t } from '#i18n';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Reveal } from '#components/reach/reveal';
import { ChangeView } from '../change-view';
import type { Release, TaskData } from '../task-execution-types';
import { fieldChange, fieldLabel, targetName } from './article-model';

// The article part of a release (article-flow.ts states): what each state means for the owner, in their words.
// Pull-request states are rendered by the task page as before.

export function ConflictBody({ data, r }: { data: TaskData; r: Release }) {
  const c = r.article?.conflict,
    name = targetName(data, r);
  if (!c) return null;
  if (c.reason === 'changed')
    return (
      <div className='flex flex-col gap-3'>
        {(c.fields || []).map((f) => (
          <div key={f.field} className='flex min-w-0 flex-col gap-1'>
            <span className='text-sm text-muted-foreground'>
              {$t('articleTask.currentToDraft', { 0: name })}
            </span>
            <ChangeView changes={[fieldChange(f.field, f.current, f.draft)]} />
          </div>
        ))}
        <p className='text-sm'>{$t('articleTask.conflictKept')}</p>
      </div>
    );
  if (c.reason === 'downstream')
    return (
      <div className='flex flex-col gap-3'>
        {(c.divergence || []).map((d) => (
          <div
            key={`${d.path}:${d.field}`}
            className='flex min-w-0 flex-col gap-1'
          >
            <span className='text-sm text-muted-foreground'>
              {$t('articleTask.targetToRepo', { 0: name })}
            </span>
            <ChangeView
              changes={[{ path: d.path, before: d.target, after: d.git }]}
            />
          </div>
        ))}
        <p className='text-sm'>{$t('articleTask.conflictDownstreamHint')}</p>
      </div>
    );
  return (
    <p className='text-sm'>
      {$t(
        c.reason === 'slug_taken'
          ? 'articleTask.conflictSlugHint'
          : 'articleTask.conflictMissingHint',
      )}
    </p>
  );
}

/** Accepted risk (b): an overwrite in the target after publishing is shown on the task, with a comparison. */
export function DriftNotice({
  data,
  r,
}: {
  data: TaskData;
  r?: Release;
}): ReactNode {
  const d = r?.article?.drift;
  if (!r || !d) return null;
  if (d.resolvedAt)
    return (
      <p className='text-sm text-muted-foreground'>
        {$t('articleTask.driftResolved')}
      </p>
    );
  return (
    <Alert>
      <TriangleAlert />
      <AlertTitle>
        {$t('articleTask.driftTitle', {
          0: targetName(data, r),
          1: d.fields.map((f) => fieldLabel(f.field)).join(', '),
        })}
      </AlertTitle>
      <AlertDescription className='flex flex-col gap-2'>
        {d.fields.map((f) => (
          <Reveal
            key={f.field}
            label={`${fieldLabel(f.field)} · ${$t('articleTask.compare')}`}
          >
            <span className='text-sm text-muted-foreground'>
              {$t('articleTask.publishedToCurrent')}
            </span>
            <ChangeView
              changes={[fieldChange(f.field, f.published, f.current)]}
            />
          </Reveal>
        ))}
      </AlertDescription>
    </Alert>
  );
}
