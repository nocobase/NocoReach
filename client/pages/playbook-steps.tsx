import {
  FileSearchIcon,
  GitPullRequestIcon,
  SettingsIcon,
  UserCheckIcon,
} from 'lucide-react';
import { $t, $tj } from '#i18n';
import { Tag } from '#components/reach/tag';
import { cn } from '#lib/utils';
import { getStepKinds, type Step, type StepKind } from './playbook-model';
import { skillFor, type Skill } from './skill-model';

// A playbook's steps as Playbooks shows them; the task page's View steps drawer shows the same list.
export function StepIcon({ kind }: { kind: StepKind }) {
  const Icon =
    kind === 'analyze'
      ? FileSearchIcon
      : kind === 'change'
        ? GitPullRequestIcon
        : UserCheckIcon;
  return <Icon className='size-3.5' />;
}

/** The steps in order, then Live and Track impact when a step changes the repository. */
export function PlaybookSteps({
  steps,
  skills = [],
}: {
  steps: Step[];
  skills?: Skill[];
}) {
  const system = steps.some((s) => s.kind === 'change')
    ? [
        [$t('common.live'), $t('playbooks.mergePrConfirmChangeLive')],
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
            <StepIcon kind={s.kind} />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='flex flex-wrap items-center gap-2 text-sm font-medium'>
              {i + 1}.{' '}
              {s.kind === 'review'
                ? $t('common.yourAction', { 0: s.name })
                : `Agent ${s.name}`}
              {s.kind !== 'review' && (
                <Tag tone={s.kind === 'change' ? 'blue' : 'grey'}>
                  {getStepKinds()[s.kind].hint}
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
