import {
  FilePenLineIcon,
  FileSearchIcon,
  GitPullRequestIcon,
  SettingsIcon,
  UserCheckIcon,
} from 'lucide-react';
import { $t, $tj, getCurrentLocale } from '#i18n';
import { Tag } from '#components/reach/tag';
import { cn } from '#lib/utils';
import { getStepKinds, type Step, type StepKind } from './playbook-model';
import { skillFor, type Skill } from './skill-model';

// A playbook's steps as Playbooks shows them; the task page's View steps drawer shows the same list.

/**
 * Where a task's change goes, for the words of its change steps and Publish (2026-11-04: an article task's View steps
 * said it opens a PR): the site's repository by pull request, or an article in its publishing targets (their names,
 * the primary first; `created` for a new article). Left out where it is not known (Playbooks, the start card before
 * the article is settled), and the words cover both.
 */
export type StepPlace =
  { kind: 'repo' } | { kind: 'article'; targets: string[]; created?: boolean };

export function StepIcon({
  kind,
  place,
}: {
  kind: StepKind;
  place?: StepPlace;
}) {
  const Icon =
    kind === 'analyze'
      ? FileSearchIcon
      : kind === 'change'
        ? place?.kind === 'article'
          ? FilePenLineIcon
          : GitPullRequestIcon
        : UserCheckIcon;
  return <Icon className='size-3.5' />;
}

const stepHint = (kind: Exclude<StepKind, 'review'>, place?: StepPlace) =>
  kind === 'change' && place
    ? place.kind === 'repo'
      ? $t('playbook.changesRepositoryOpensPr')
      : $t(
          place.created
            ? 'playbook.writesNewArticleFor'
            : 'playbook.editsArticleIn',
          { 0: place.targets[0] },
        )
    : getStepKinds()[kind].hint;

const publishHint = (place?: StepPlace) =>
  !place
    ? $t('playbooks.publishSiteOrCms')
    : place.kind === 'repo'
      ? $t('playbooks.mergePrConfirmChangeLive')
      : $t('playbooks.publishToConfirmLive', {
          0: new Intl.ListFormat(getCurrentLocale(), {
            type: 'conjunction',
          }).format(place.targets),
        });

/** The steps in order, then Publish and Track impact when a step changes something. */
export function PlaybookSteps({
  steps,
  skills = [],
  place,
}: {
  steps: Step[];
  skills?: Skill[];
  place?: StepPlace;
}) {
  const system = steps.some((s) => s.kind === 'change')
    ? [
        [$t('playbook.publishStage'), publishHint(place)],
        [
          $t('playbooks.trackImpact'),
          $t('playbooks.compareDataBeforeGoingLive'),
        ],
      ]
    : [];
  return (
    <ol className='flex flex-col divide-y' aria-label={$t('common.steps')}>
      {steps.map((s, i) => (
        // Saved steps have keys; the list is read-only, so the position is stable otherwise.
        // eslint-disable-next-line @eslint-react/no-array-index-key
        <li key={s.key || i} className='flex gap-3 py-2.5'>
          <span
            className={cn(
              'inline-flex size-6 shrink-0 items-center justify-center rounded-md',
              s.kind === 'review'
                ? 'bg-nr-tint-violet text-nr-ink-violet'
                : 'bg-nr-tint-blue text-nr-ink-blue',
            )}
          >
            <StepIcon kind={s.kind} place={place} />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='flex flex-wrap items-center gap-2 text-sm font-medium'>
              {i + 1}.{' '}
              {s.kind === 'review'
                ? $t('common.yourAction', { 0: s.name })
                : `Agent ${s.name}`}
              {s.kind !== 'review' && (
                <Tag tone={s.kind === 'change' ? 'blue' : 'grey'}>
                  {stepHint(s.kind, place)}
                </Tag>
              )}
            </p>
            {s.kind === 'review' ? (
              s.checklist?.length ? (
                <p className='mt-0.5 text-xs text-muted-foreground'>
                  {$tj('playbooks.confirm', {
                    0: s.checklist.map((c) => c.label).join(' · '),
                  })}
                </p>
              ) : null
            ) : (
              <>
                <p className='mt-0.5 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground'>
                  {s.instruction}
                </p>
                <StepSkills ids={s.skills} skills={skills} />
              </>
            )}
          </div>
        </li>
      ))}
      {system.map(([n, d], i) => (
        <li key={n} className='flex gap-3 py-2.5'>
          <span className='inline-flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground'>
            <SettingsIcon className='size-3.5' />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='flex items-center gap-2 text-sm font-medium'>
              {steps.length + i + 1}. {n}
              <Tag tone='grey'>{$t('common.system')}</Tag>
            </p>
            <p className='mt-0.5 text-xs text-muted-foreground'>{d}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

// The Skills a step names, by name (Skills deleted since are left out). They always go to the Agent for this step.
function StepSkills({ ids, skills }: { ids?: string[]; skills: Skill[] }) {
  const named = (ids || [])
    .map((id) => skillFor(skills, id))
    .filter(
      (s, i, all): s is Skill =>
        Boolean(s) && all.findIndex((x) => x?.id === s!.id) === i,
    );
  return named.length ? (
    <p className='mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground'>
      {$t('playbooks.useSkills')}
      {named.map((s) => (
        <Tag key={s.id} tone='violet' className='font-mono'>
          {s.name}
        </Tag>
      ))}
    </p>
  ) : null;
}
