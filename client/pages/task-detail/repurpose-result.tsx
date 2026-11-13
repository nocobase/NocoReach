import type { ReactNode } from 'react';
import { copyText } from '@nocobase/app-client';
import { Check, Copy, TriangleAlert } from 'lucide-react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import { formatCount, joinList } from '#lib/format';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import {
  destinationName,
  parseRepurpose,
  pieceLimit,
  type Destination,
  type Piece,
  type RepurposeCheck,
  type RepurposeForm,
} from '../../../shared/repurpose.js';
import type { Artifact, TaskData } from '../task-execution-types.js';
import { text } from './styles.js';

// Content workshop results on the task page (mockup v3 frame 4): the pieces of an X, LinkedIn or community post, each
// copied on its own, with its length against the platform's limit and the source sections it comes from. The review
// card adds the checks NocoReach worked out from the text (never the Agent's word) and, for a community post, why it
// goes there (figures only) and the rules the Agent read for the place.

const copy = (value: string) =>
  void copyText(value).then((ok) =>
    ok
      ? toast.success(() => $t('workshop.copied'))
      : toast.error(() => $t('workshop.copyFailed')),
  );

const pieceLabel = (form: RepurposeForm, p: Piece) =>
  p.kind === 'post'
    ? form === 'x'
      ? $t('workshop.pieceXPost', { 0: p.index || 1 })
      : $t('workshop.piecePost')
    : p.kind === 'reply'
      ? $t('workshop.pieceReply')
      : p.kind === 'title'
        ? $t('workshop.pieceTitle')
        : $t('workshop.pieceBody');

/** A check's sentence: "All 3 posts within 280 characters", "Post 2 is over 280 characters". */
function checkText(c: RepurposeCheck): string {
  const params = { ...(c.params || {}) };
  if (c.key === 'workshop.check.xOver')
    params[0] = joinList(
      String(params[0] || '')
        .split(', ')
        .map((n) =>
          n === 'reply'
            ? $t('workshop.pieceReply')
            : $t('workshop.pieceXPost', { 0: n }),
        ),
    );
  if (c.key === 'workshop.check.linkedinWithin' || c.key === 'workshop.check.linkedinOver')
    params[1] = formatCount(Number(params[1]));
  if (typeof params[0] === 'number') params[0] = formatCount(params[0]);
  // A failed check that names what should be there reads as what is missing.
  return $t(!c.ok && MISSING.has(c.key) ? `${c.key}Missing` : c.key, params);
}
const MISSING = new Set([
  'workshop.check.bodyComplete',
  'workshop.check.identityBrand',
  'workshop.check.identity',
]);

export function RepurposeChecks({ checks }: { checks: RepurposeCheck[] }) {
  if (!checks.length) return null;
  return (
    <ul
      className='flex flex-wrap gap-x-4 gap-y-1 text-sm'
      aria-label={$t('workshop.checks')}
    >
      {checks.map((c) => (
        <li
          key={c.key}
          className={cn(
            'inline-flex items-center gap-1',
            c.ok ? 'text-nr-ink-green' : 'text-nr-ink-amber',
          )}
          data-check={c.ok ? 'ok' : 'warn'}
        >
          {c.ok ? (
            <Check aria-hidden='true' className='size-3.5' />
          ) : (
            <TriangleAlert aria-hidden='true' className='size-3.5' />
          )}
          {checkText(c)}
        </li>
      ))}
    </ul>
  );
}

/**
 * The result's pieces, or `fallback` when its text does not follow the workshop's format. `review` adds the checks and, for a community post, the side notes.
 */
export function RepurposeResult({
  data,
  out,
  review = false,
  fallback,
}: {
  data: TaskData;
  out: Artifact;
  review?: boolean;
  /** Shown instead when the text does not follow the format. */
  fallback: ReactNode;
}): ReactNode {
  const r = data.work.repurpose;
  const parsed = r ? parseRepurpose(r.form, out.content) : null;
  if (!r || !parsed) return fallback;
  const checks = review ? data.repurpose?.checks[out.id] || [] : [];
  const pieces = (
    <div className='flex min-w-0 flex-col gap-4'>
      {parsed.pieces.map((p, i) => (
        <PieceBlock
          key={`${p.kind}-${p.index || i}`}
          form={r.form}
          piece={p}
          destination={r.destination}
        />
      ))}
    </div>
  );
  return (
    <div className='flex flex-col gap-4' data-repurpose={r.form}>
      <RepurposeChecks checks={checks} />
      {r.form === 'community' && review && r.destination ? (
        <div className='grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]'>
          {pieces}
          <aside className='flex flex-col gap-4'>
            <Side title={$t('workshop.whyHere')}>
              <p className={text.muted}>{whyHere(r.destination)}</p>
              <a
                className='nr-link text-sm'
                href={placeUrl(r.destination)}
                target='_blank'
                rel='noreferrer'
              >
                {$t('workshop.openPlace', { 0: destinationName(r.destination) })}
              </a>
            </Side>
            <Side title={$t('workshop.placeRules')}>
              {parsed.rules.length ? (
                <ol className='list-decimal space-y-1 pl-4 text-sm text-muted-foreground'>
                  {parsed.rules.map((rule, i) => (
                    <li key={i}>{rule}</li>
                  ))}
                </ol>
              ) : (
                <p className={text.muted}>{$t('workshop.noRules')}</p>
              )}
            </Side>
          </aside>
        </div>
      ) : (
        pieces
      )}
    </div>
  );
}

function Side({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className='flex flex-col gap-1.5' aria-label={title}>
      <h4 className='text-xs font-medium text-muted-foreground'>{title}</h4>
      {children}
    </section>
  );
}

// Why the post goes to this place, in figures or plain facts only.
function whyHere(d: Destination): string {
  if (d.kind === 'reddit')
    return d.discussions
      ? $t('workshop.redditDiscussions', { 0: d.discussions, 1: d.weeks || 4 })
      : $t('workshop.whyChosen');
  if (d.kind === 'hn') return $t('workshop.hnNote');
  return $t('workshop.whyOwn', { 0: d.section });
}

const placeUrl = (d: Destination) =>
  d.kind === 'reddit'
    ? `https://www.reddit.com/r/${d.subreddit}/`
    : d.kind === 'hn'
      ? 'https://news.ycombinator.com/submit'
      : d.url;

function PieceBlock({
  form,
  piece,
  destination,
}: {
  form: RepurposeForm;
  piece: Piece;
  destination?: Destination;
}) {
  const limit = pieceLimit(form, piece, destination);
  const over = limit ? limit.length > limit.max : false;
  return (
    <div className='flex flex-col gap-1.5' data-piece={piece.kind}>
      <div className='flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground'>
        <span className='font-medium'>{pieceLabel(form, piece)}</span>
        <span className='flex items-center gap-3'>
          {piece.sections ? (
            <span>{$t('workshop.fromSections', { 0: piece.sections })}</span>
          ) : null}
          {limit ? (
            <span
              className={cn('tabular-nums', over && 'text-nr-ink-amber')}
              data-over={over || undefined}
            >
              {$t('workshop.lengthOf', {
                0: formatCount(limit.length),
                1: formatCount(limit.max),
              })}
            </span>
          ) : null}
          <Button
            size='xs'
            variant='ghost'
            onClick={() => copy(piece.text)}
            aria-label={$t('workshop.copyPiece', { 0: pieceLabel(form, piece) })}
          >
            <Copy />
            {$t('workshop.copy')}
          </Button>
        </span>
      </div>
      <div
        className={cn(
          'rounded-md border bg-background px-3 py-2 text-sm leading-7 break-words whitespace-pre-wrap',
          piece.kind === 'reply' && 'text-muted-foreground',
        )}
      >
        {piece.text}
      </div>
    </div>
  );
}
