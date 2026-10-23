import { useState, type ComponentProps, type ReactNode } from 'react';
import { $t } from '#i18n';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { Reveal } from '#components/reach/reveal';
import { Tag, type Tone } from '#components/reach/tag';
import { formatDateTime } from '#lib/format';
import { ChangeView } from '../change-view';
import { Notice } from './layout';
import { text } from './styles';
import type {
  Release,
  ReleaseArticle,
  TaskData,
} from '../task-execution-types';
import {
  failedLegs,
  failureText,
  fieldChange,
  fieldLabel,
  legRelease,
  nameOf,
  releaseLegs,
  targetName,
} from './article-model';

// The article part of a release (article-flow.ts states): what each state means for the owner, in their words.
// Pull-request states are rendered by the task page as before. A release to several targets lists each target with
// its own state; the card's title, subtitle and single action follow the aggregate.

const LEG_TONE: Record<string, Tone> = {
  publishing: 'blue',
  exporting: 'blue',
  published: 'green',
  exported: 'green',
  publish_failed: 'red',
  publish_conflict: 'red',
};
const LEG_KEY: Record<string, string> = {
  publishing: 'publishing',
  published: 'published',
  exporting: 'exporting',
  exported: 'exported',
  publish_failed: 'publishFailed',
  publish_conflict: 'publishConflict',
};
/** Each target with its state, and a conflict's details; only when the release has several targets. */
export function TargetRows({ data, r }: { data: TaskData; r?: Release }) {
  if (!r?.also?.length) return null;
  return (
    <ul className='flex flex-col gap-2'>
      {releaseLegs(r).map(({ a, state }, i) => (
        <li key={a.targetId} className='flex min-w-0 flex-col gap-1'>
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            <span className={text.body}>{nameOf(data, a.targetId)}</span>
            <Tag tone={LEG_TONE[state] || 'grey'}>
              {$t(`articleTask.targetState.${LEG_KEY[state] || 'published'}`)}
            </Tag>
            {state === 'publish_conflict' && a.conflict && (
              <span className='text-sm text-muted-foreground'>
                {$t(
                  `articleTask.rowReason.${a.conflict.reason === 'slug_taken' ? 'slugTaken' : a.conflict.reason}`,
                )}
              </span>
            )}
            {state === 'publish_failed' && (
              <span className='text-sm text-muted-foreground'>
                {failureText(a.error)}
              </span>
            )}
          </div>
          {state === 'publish_conflict' && a.conflict && (
            <Reveal label={$t('articleTask.details')}>
              <ConflictBody data={data} r={legRelease(r, a)} other={i > 0} />
            </Reveal>
          )}
        </li>
      ))}
    </ul>
  );
}

const STEP_KEY: Record<NonNullable<ReleaseArticle['errorStep']>, string> = {
  read: 'articleTask.failedStepRead',
  downstream: 'articleTask.failedStepDownstream',
  write: 'articleTask.failedStepWrite',
  verify: 'articleTask.failedStepVerify',
};
/**
 * For Technical details: each target whose publishing did not complete, with the step it stopped at, the error code
 * and what the target or the error said (article-flow.ts `record`). The card itself keeps to the plain-words reason.
 */
export function PublishFailureDetails({
  data,
  r,
}: {
  data: TaskData;
  r?: Release;
}) {
  const failed = failedLegs(r);
  if (!failed.length) return null;
  return failed.map(({ a }) => (
    <section key={a.targetId} className='flex flex-col gap-2'>
      <h3 className='text-sm font-medium'>
        {$t('articleTask.failedTo', { 0: nameOf(data, a.targetId) })}
      </h3>
      <dl className='grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[6rem_1fr]'>
        {a.errorStep && STEP_KEY[a.errorStep] ? (
          <>
            <dt className='text-muted-foreground'>
              {$t('articleTask.failedStep')}
            </dt>
            <dd>{$t(STEP_KEY[a.errorStep])}</dd>
          </>
        ) : null}
        <dt className='text-muted-foreground'>
          {$t('articleTask.failureCode')}
        </dt>
        <dd>
          <code>{a.error}</code>
        </dd>
        {a.errorAt ? (
          <>
            <dt className='text-muted-foreground'>
              {$t('articleTask.failedAt')}
            </dt>
            <dd>{formatDateTime(a.errorAt)}</dd>
          </>
        ) : null}
      </dl>
      {a.errorDetail ? (
        <Alert variant='destructive'>
          <AlertDescription className='whitespace-pre-wrap break-words'>
            {a.errorDetail}
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  ));
}

/** A card action that shows its own progress while the command runs. */
export function PendingButton({
  onClick,
  disabled,
  children,
  ...props
}: Omit<ComponentProps<typeof Button>, 'onClick'> & {
  onClick: () => Promise<unknown>;
}) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      {...props}
      disabled={disabled || pending}
      onClick={() => {
        setPending(true);
        void onClick().finally(() => setPending(false));
      }}
    >
      {pending && <Spinner data-icon='inline-start' />}
      {children}
    </Button>
  );
}

export function ConflictBody({
  data,
  r,
  other = false,
}: {
  data: TaskData;
  r: Release;
  /** Another target than the primary: reviewing again updates the article holding the slug, or recreates a missing one. */
  other?: boolean;
}) {
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
          ? other
            ? 'articleTask.otherSlugHint'
            : 'articleTask.conflictSlugHint'
          : other
            ? 'articleTask.otherMissingHint'
            : 'articleTask.conflictMissingHint',
      )}
    </p>
  );
}

/** Accepted risk (b): an overwrite in a target after publishing is shown on the task, with a comparison. */
export function DriftNotice({
  data,
  r,
}: {
  data: TaskData;
  r?: Release;
}): ReactNode {
  if (!r) return null;
  return releaseLegs(r).map(({ a }) => (
    <LegDrift key={a.targetId} data={data} r={legRelease(r, a)} />
  ));
}
function LegDrift({ data, r }: { data: TaskData; r: Release }): ReactNode {
  const d = r.article?.drift;
  if (!r || !d) return null;
  if (d.resolvedAt)
    return (
      <p className='text-sm text-muted-foreground'>
        {$t('articleTask.driftResolved')}
      </p>
    );
  return (
    <Notice
      title={$t('articleTask.driftTitle', {
        0: targetName(data, r),
        1: d.fields.map((f) => fieldLabel(f.field)).join(', '),
      })}
    >
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
    </Notice>
  );
}
