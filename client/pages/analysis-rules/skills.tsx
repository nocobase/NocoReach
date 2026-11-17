import { useEffect, useState, type ReactElement } from 'react';
import { Loader2, Plus, SearchIcon } from 'lucide-react';
import { Link } from 'react-router';
import { $t, $tj, $legacyText, useMessageState } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { formatCompactIn } from '#lib/format';
import { Section } from '#components/reach/page';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#components/ui/dialog';
import type { AnalysisSkill, SkillChoice, View } from './types';

// Skills in the daily analysis (2026-11-17, server/nocoreach/skill-analysis.ts): below the rules, its own block rather
// than a tab, as one Skill may find opportunities of any category. Each row says what the Skill found in the last
// analysis, or why its call failed; Add Skill lists the library's other Skills with what each adds a month. The same
// list is switched from a Skill's detail on Skills.

const whenToUse = (s: { summaryKey?: string; description: string }) =>
  s.summaryKey ? $t(s.summaryKey) : $legacyText(s.description);

function RunLine({ skill }: { skill: AnalysisSkill }): ReactElement {
  const run = skill.run;
  if (run?.status === 'error')
    return (
      <span className='text-xs text-destructive' data-skill-error={run.error}>
        {$t(`analysisSkills.failed.${run.error ?? 'call'}`)}
      </span>
    );
  return (
    <span className='text-xs text-muted-foreground tabular-nums' data-found=''>
      {run
        ? $tj('analysisRules.time', { 0: run.found })
        : $t('analysisRules.notRunYet')}
    </span>
  );
}

export function AnalysisSkills({
  view,
  projectId,
  canEdit,
  disabled,
  execute,
}: {
  view: View;
  projectId: number;
  canEdit: boolean;
  disabled: boolean;
  execute: (body: { skillId: string; on: boolean }) => Promise<boolean>;
}): ReactElement {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useMessageState('');
  const selected = view.skills?.selected ?? [],
    max = view.skills?.max ?? 5,
    full = selected.length >= max;
  const change = async (skillId: string, on: boolean) => {
    setError('');
    try {
      return await execute({ skillId, on });
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('common.notChangedTryAgain'),
      );
      return false;
    }
  };
  return (
    <Section
      aria-label={$t('analysisSkills.title')}
      data-analysis-skills=''
      title={
        <>
          {$t('analysisSkills.title')}
          <span className='text-xs font-normal text-muted-foreground tabular-nums'>
            {$t('analysisSkills.used', { 0: selected.length, 1: max })}
          </span>
        </>
      }
      description={$t('analysisSkills.info', { 0: max })}
      actions={
        canEdit ? (
          <Button
            variant='outline'
            size='sm'
            disabled={disabled || full}
            title={full ? $t('analysisSkills.limit') : undefined}
            onClick={() => setAdding(true)}
          >
            <Plus data-icon='inline-start' />
            {$t('analysisSkills.add')}
          </Button>
        ) : undefined
      }
    >
      <p className='text-sm text-muted-foreground'>
        {$t('analysisSkills.help')}
      </p>
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
      {selected.length ? (
        <ul className='divide-y rounded-lg border'>
          {selected.map((s) => (
            <li
              key={s.id}
              data-skill={s.id}
              className='flex items-start justify-between gap-3 p-4'
            >
              <div className='flex min-w-0 flex-col gap-1'>
                <Link
                  to={`/skills?skill=${encodeURIComponent(s.id)}`}
                  className='w-fit font-mono text-sm font-medium hover:underline'
                >
                  {s.name}
                </Link>
                <p className='line-clamp-2 text-sm text-muted-foreground'>
                  {whenToUse(s)}
                </p>
              </div>
              <div className='flex shrink-0 items-center gap-3'>
                <RunLine skill={s} />
                {canEdit ? (
                  <Button
                    variant='ghost'
                    size='sm'
                    disabled={disabled}
                    aria-label={$t('analysisSkills.removeValue', { 0: s.name })}
                    onClick={() => void change(s.id, false)}
                  >
                    {$t('common.remove')}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className='rounded-lg border border-dashed p-4 text-sm text-muted-foreground'>
          {$t('analysisSkills.empty')}
        </p>
      )}
      {adding ? (
        <AddSkillDialog
          projectId={projectId}
          schemeId={view.schemeId}
          left={max - selected.length}
          onClose={() => setAdding(false)}
          onAdd={async (id) => {
            if (await change(id, true)) setAdding(false);
          }}
        />
      ) : null}
    </Section>
  );
}

/** Add Skill: the library's Skills not picked yet, searchable, each with the input tokens it adds a month. */
function AddSkillDialog({
  projectId,
  schemeId,
  left,
  onClose,
  onAdd,
}: {
  projectId: number;
  schemeId?: string;
  left: number;
  onClose: () => void;
  onAdd: (skillId: string) => Promise<void>;
}): ReactElement {
  const [choices, setChoices] = useState<SkillChoice[]>();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useMessageState('');
  useEffect(() => {
    let live = true;
    api
      .action<{ skills: SkillChoice[] }>('nrAnalysisRules', 'skillChoices', {
        method: 'POST',
        body: { projectId, schemeId },
        unwrap: 'data',
      })
      .then(
        (r) => {
          if (live) setChoices(r.skills);
        },
        () => {
          if (live) setError(() => $t('analysisSkills.choicesNotLoaded'));
        },
      );
    return () => {
      live = false;
    };
  }, [projectId, schemeId, setError]);
  const term = q.trim().toLowerCase();
  const shown = (choices ?? []).filter(
    (s) =>
      !s.selected &&
      (!term ||
        `${s.name} ${whenToUse(s)} ${s.description}`
          .toLowerCase()
          .includes(term)),
  );
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden sm:max-w-xl'>
        <DialogTitle>{$t('analysisSkills.add')}</DialogTitle>
        <DialogDescription>{$t('analysisSkills.addHelp')}</DialogDescription>
        <label className='relative flex items-center'>
          <SearchIcon
            className='pointer-events-none absolute left-2.5 size-4 text-muted-foreground'
            aria-hidden='true'
          />
          <input
            aria-label={$t('skills.searchSkills')}
            placeholder={$t('skills.searchSkills')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className='w-full pl-8!'
          />
        </label>
        {error ? (
          <p role='alert' className='nr-error'>
            {error}
          </p>
        ) : null}
        <div className='min-h-0 flex-1 overflow-y-auto rounded-lg border'>
          {!choices && !error ? (
            <p className='flex items-center gap-2 p-4 text-sm text-muted-foreground'>
              <Loader2 className='size-4 animate-spin' aria-hidden='true' />
              {$t('common.loading')}
            </p>
          ) : shown.length ? (
            <ul className='divide-y'>
              {shown.map((s) => (
                <li key={s.id} data-choice={s.id}>
                  <button
                    type='button'
                    className='flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 disabled:opacity-50'
                    disabled={Boolean(busy) || left <= 0}
                    onClick={() => {
                      setBusy(s.id);
                      void onAdd(s.id).finally(() => setBusy(undefined));
                    }}
                  >
                    <span className='flex min-w-0 flex-col gap-0.5'>
                      <span className='font-mono text-sm font-medium'>
                        {s.name}
                      </span>
                      <span className='line-clamp-2 text-xs text-muted-foreground'>
                        {whenToUse(s)}
                      </span>
                    </span>
                    <span className='shrink-0 text-xs text-muted-foreground tabular-nums'>
                      {busy === s.id ? (
                        <Loader2 className='size-4 animate-spin' />
                      ) : (
                        formatCompactIn(
                          'analysisSkills.monthlyTokens',
                          s.monthlyTokens,
                        )
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : choices ? (
            <p className='p-4 text-sm text-muted-foreground'>
              {$t('skills.noMatchingSkillsMessage')}
            </p>
          ) : null}
        </div>
        <p className='text-xs text-muted-foreground'>
          {$t('analysisSkills.remaining', { 0: Math.max(0, left) })}
        </p>
      </DialogContent>
    </Dialog>
  );
}
