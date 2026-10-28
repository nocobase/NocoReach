import { useMessageState, $t, $legacyText } from '#i18n';
import { useEffect, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { cn } from '#lib/utils';
import { playbookNameOf, type Playbook } from '../playbook-model';
import { TaskStandingTag } from '../task-status-tag';
import type { StrategyState } from './model';
import { oppNo, type Row } from './board';
import { request } from './service';
import {
  handOffPlaces,
  placesOf,
  progressText,
  standingOf,
  type HandOffDone,
  type OpportunityTask,
  type PlanPart,
} from './places-model';

// The dialog that hands an opportunity off one task per place, and the list of its tasks (places-model.ts).

/**
 * Hand off to agent on an opportunity with several places: one row per place with its task's title, page and playbook,
 * ticked unless a task already changes it. Unticked places get no task now and can be handed off later.
 */
export function OpportunityHandOffDialog({
  projectId,
  state,
  row,
  playbooks,
  onClose,
  onDone,
}: {
  projectId: number;
  state: StrategyState;
  row: Row;
  playbooks?: Playbook[];
  onClose: () => void;
  onDone: (r: HandOffDone) => void;
}): ReactElement {
  const [parts, setParts] = useState<PlanPart[]>(),
    [picked, setPicked] = useState(() => new Set<string>()),
    [busy, setBusy] = useState(false),
    [error, setError] = useMessageState(''),
    // One request per dialog, so a second click retries the same hand-off.
    [requestId] = useState(() => crypto.randomUUID());
  useEffect(() => {
    let live = true;
    void request<{ parts: PlanPart[] }>(projectId, 'handOffPlan', {
      insightId: row.card.id,
    })
      .then((r) => {
        if (!live) return;
        setParts(r.parts);
        setPicked(new Set(r.parts.filter((p) => !p.task).map((p) => p.key)));
      })
      .catch(() => {
        if (live) setError(() => $t('opportunityTasks.planNotLoaded'));
      });
    return () => {
      live = false;
    };
  }, [projectId, row.card.id, setError]);
  const chosen = (parts || []).filter((p) => !p.task && picked.has(p.key));
  async function create() {
    if (!chosen.length || busy) return;
    setBusy(true);
    setError('');
    try {
      onDone(
        await handOffPlaces(
          projectId,
          state,
          row,
          chosen.map((p) => p.key),
          requestId,
        ),
      );
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('strategy.notHandOffOpportunityKept'),
      );
      setBusy(false);
    }
  }
  const playbookName = (id: string) =>
    playbookNameOf(id, playbooks ? { playbooks } : undefined);
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>
            {$t('opportunityTasks.dialogTitle', {
              0: row.card.no ? `${oppNo(row.card)} ` : '',
              1: row.card.title,
            })}
          </DialogTitle>
          <DialogDescription>
            {$t('opportunityTasks.dialogDescription', {
              0: parts?.length ?? placesOf(row).length,
            })}
          </DialogDescription>
        </DialogHeader>
        {!parts ? (
          error ? null : (
            <p role='status' className='text-sm text-muted-foreground'>
              {$t('opportunityTasks.loadingPlaces')}
            </p>
          )
        ) : (
          <ul
            aria-label={$t('opportunityTasks.places')}
            className='-mx-1 m-0 flex min-h-0 list-none flex-col overflow-y-auto p-0'
          >
            {parts.map((p) => (
              <li
                key={p.key}
                data-place={p.key}
                className='border-t first:border-t-0'
              >
                <label
                  className={cn(
                    'flex items-start gap-3 px-1 py-2.5',
                    p.task ? 'text-muted-foreground' : 'cursor-pointer',
                  )}
                >
                  <Checkbox
                    className='mt-0.5'
                    checked={!p.task && picked.has(p.key)}
                    disabled={Boolean(p.task) || busy}
                    onCheckedChange={(on) =>
                      setPicked((s) => {
                        const next = new Set(s);
                        if (on) next.add(p.key);
                        else next.delete(p.key);
                        return next;
                      })
                    }
                  />
                  <span className='flex min-w-0 flex-1 flex-col gap-0.5'>
                    <span className='text-sm'>{p.title}</span>
                    {p.url && (
                      <span
                        className='truncate font-mono text-xs text-muted-foreground'
                        title={p.url}
                      >
                        {pathOf(p.url)}
                      </span>
                    )}
                  </span>
                  <span className='shrink-0 text-xs text-muted-foreground'>
                    {p.task
                      ? $t('opportunityTasks.hasTask', {
                          0: p.task.no ? `T-${p.task.no}` : '',
                        })
                      : playbookName(p.playbookId)}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role='alert' className='nr-error'>
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant='outline' disabled={busy} onClick={onClose}>
            {$t('common.cancel')}
          </Button>
          <Button
            disabled={!chosen.length || busy}
            onClick={() => void create()}
          >
            {$t('opportunityTasks.createTasks', { 0: chosen.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.host.replace(/^www\./, '') + x.pathname;
  } catch {
    return u;
  }
};

/** An opportunity's tasks, first first, with where each stands; each opens its task. */
export function OpportunityTasks({
  row,
  tasks,
}: {
  row: Row;
  tasks: Map<string, OpportunityTask>;
}): ReactElement {
  const list = row.tasks.map((t) => ({
    ...t,
    record: tasks.get(String(t.taskId)),
  }));
  return (
    <div className='flex flex-col gap-1.5' data-opportunity-tasks=''>
      <h3 className='text-xs font-medium text-muted-foreground'>
        {$t('opportunityTasks.heading')} {list.length}
      </h3>
      <p className='text-sm'>
        {progressText(list.map((t) => standingOf(t.record)))}
      </p>
      <ul className='m-0 flex list-none flex-col p-0'>
        {list.map((t) => (
          <li
            key={t.taskId}
            className='flex items-center gap-2 border-t py-1.5 text-sm'
          >
            {t.taskNo ? (
              <span className='font-mono text-xs text-muted-foreground tabular-nums'>
                T-{t.taskNo}
              </span>
            ) : null}
            <Link
              className='nr-link min-w-0 flex-1 truncate'
              to={`/actions/${t.taskId}`}
            >
              {t.record?.title || t.part?.label || '—'}
            </Link>
            <TaskStandingTag state={standingOf(t.record)} />
          </li>
        ))}
      </ul>
    </div>
  );
}
