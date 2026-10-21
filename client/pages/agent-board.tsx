import type { ReactElement } from 'react';
import { ChevronRight, ServerIcon } from 'lucide-react';
import { useRunnerOptions } from '@nocobase/app-plugin-agents/client/kit';
import { $t } from '#i18n';
import { ActorAvatar } from '#components/reach/actor';
import { cn } from '#lib/utils';
import { useMe } from './me';
import { stepOf } from './task-list-model';
import {
  placeOf,
  runCounts,
  taskAgentOf,
  UNASSIGNED,
  type AgentStatus,
  type Lane,
  type Placed,
} from './task-agents';
import type { Work } from './task-execution-types';
import type { WorkCard } from './work-board';

// Tasks › By Agent (2026-10-21, after Studio's Agent view): a column per Agent the project can run tasks with, then
// Unassigned. Each column has what the Agent is working on, what is next in line, and what waits for a person, with
// the tasks waiting for you first and highlighted. Finished and closed tasks are not shown.

type Item = { t: WorkCard; place: Placed; mine: boolean };
type Column = {
  key: string;
  name: string;
  online?: boolean;
  busy: number;
  items: Item[];
};

const dot: Record<Lane, string> = {
  running: 'bg-nr-ink-green',
  queued: 'bg-nr-ink-blue',
  waiting: 'bg-nr-ink-amber',
};
const owner = (t: WorkCard) => ({
  id: t.evidence?.work?.humanOwnerId ?? t.evidence?.createdBy?.id ?? null,
  name: t.evidence?.work?.humanOwnerName || t.evidence?.createdBy?.name || '',
});

export function AgentBoard({
  tasks,
  agents,
  onOpen,
}: {
  tasks: WorkCard[];
  agents?: AgentStatus;
  onOpen: (id: number) => void;
}): ReactElement {
  const { mine } = useMe();
  const defaultId = agents?.defaultAgentId ?? agents?.agentId;
  const options = [...(agents?.options || [])].sort(
    (a, b) => Number(b.id === defaultId) - Number(a.id === defaultId),
  );
  const columns: Column[] = options.map((a) => ({
    key: a.id,
    name: a.name,
    online: a.online,
    busy: a.busy || 0,
    items: [],
  }));
  const unassigned: Column = {
    key: UNASSIGNED,
    name: $t('taskAgents.unassigned'),
    busy: 0,
    items: [],
  };
  for (const t of tasks) {
    const w = t.evidence?.work,
      agent = taskAgentOf(w, agents),
      place = placeOf(w, Boolean(agent));
    if (!place) continue;
    (columns.find((c) => c.key === agent?.id) || unassigned).items.push({
      t,
      place,
      mine: mine(owner(t).id),
    });
  }
  if (unassigned.items.length || !columns.length) columns.push(unassigned);
  return (
    <div
      className='grid auto-cols-[minmax(16rem,1fr)] grid-flow-col items-start gap-3 overflow-x-auto pb-1'
      aria-label={$t('taskAgents.board')}
    >
      {columns.map((c) => (
        <AgentColumn key={c.key} column={c} onOpen={onOpen} />
      ))}
    </div>
  );
}

function AgentColumn({
  column: c,
  onOpen,
}: {
  column: Column;
  onOpen: (id: number) => void;
}) {
  const lane = (l: Lane) => c.items.filter((i) => i.place.lane === l);
  const running = lane('running'),
    // Next in line, oldest first: the order the Agent takes them.
    queued = lane('queued').sort((a, b) =>
      String(a.t.updatedAt).localeCompare(String(b.t.updatedAt)),
    ),
    // Waiting for you first, then the most recently changed.
    waiting = lane('waiting').sort(
      (a, b) =>
        Number(b.mine) - Number(a.mine) ||
        String(b.t.updatedAt).localeCompare(String(a.t.updatedAt)),
    );
  const none = c.key === UNASSIGNED;
  const state: [Lane | 'idle', string] =
    running.length || c.busy
      ? ['running', $t('taskAgents.statusRunning')]
      : queued.length
        ? ['queued', $t('taskAgents.statusQueued')]
        : waiting.length
          ? ['waiting', $t('taskAgents.statusWaiting')]
          : ['idle', $t('taskAgents.statusIdle')];
  return (
    <section
      aria-label={c.name}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-lg p-2',
        none ? 'border border-dashed' : 'bg-muted/50',
      )}
    >
      <header className='flex items-center gap-2 px-1 py-1'>
        <ActorAvatar type='agent' size='sm' />
        <div className='min-w-0 flex-1'>
          <h2 className='m-0 truncate text-sm font-medium' title={c.name}>
            {c.name}
          </h2>
          <p className='m-0 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground'>
            {none ? (
              <span className='truncate'>
                {$t('taskAgents.unassignedHint')}
              </span>
            ) : (
              <>
                <span
                  aria-hidden='true'
                  className={cn(
                    'size-1.5 shrink-0 rounded-full',
                    state[0] === 'idle'
                      ? 'bg-muted-foreground/50'
                      : dot[state[0]],
                  )}
                />
                <span className='shrink-0'>{state[1]}</span>
                {c.online === false && (
                  <span className='truncate text-nr-ink-red'>
                    · {$t('taskAgents.noRuntimeOnline')}
                  </span>
                )}
              </>
            )}
          </p>
        </div>
      </header>
      {!c.items.length && (
        <p className='px-1 py-4 text-center text-xs text-muted-foreground'>
          {$t('taskAgents.nothing')}
        </p>
      )}
      {running.length > 0 && (
        <Group
          lane='running'
          label={$t('taskAgents.running')}
          n={running.length}
        >
          {running.map((i) => (
            <Card key={i.t.id} item={i} onOpen={onOpen} />
          ))}
        </Group>
      )}
      {queued.length > 0 && (
        <Group lane='queued' label={$t('taskAgents.queued')} n={queued.length}>
          <ol className='m-0 flex list-none flex-col gap-1 p-0'>
            {queued.map((i, n) => (
              <li key={i.t.id} className='flex items-start gap-2'>
                <span className='mt-1.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full border bg-card text-[0.625rem] text-muted-foreground tabular-nums'>
                  {n + 1}
                </span>
                <button
                  type='button'
                  className='flex min-w-0 flex-1 flex-col items-start gap-1 rounded-md px-1.5 py-1 text-left hover:bg-muted'
                  onClick={() => onOpen(i.t.id)}
                >
                  <Title t={i.t} />
                  {c.online === false && (
                    <span className='rounded border px-1.5 text-xs text-muted-foreground'>
                      {$t('taskAgents.waitingForRuntime')}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        </Group>
      )}
      {waiting.length > 0 && (
        <Group
          lane='waiting'
          label={$t('taskAgents.waiting')}
          n={waiting.length}
        >
          {waiting.map((i) => (
            <Card key={i.t.id} item={i} onOpen={onOpen} />
          ))}
        </Group>
      )}
    </section>
  );
}

function Group({
  lane,
  label,
  n,
  children,
}: {
  lane: Lane;
  label: string;
  n: number;
  children: ReactElement | ReactElement[];
}) {
  return (
    <div className='flex flex-col gap-1.5'>
      <h3 className='m-0 flex items-center gap-1.5 px-1 text-xs font-normal text-muted-foreground'>
        <span
          aria-hidden='true'
          className={cn('size-1.5 rounded-full', dot[lane])}
        />
        {label} <span className='tabular-nums'>{n}</span>
      </h3>
      {children}
    </div>
  );
}

function Title({ t }: { t: WorkCard }) {
  return (
    <span className='flex w-full min-w-0 items-baseline gap-1.5 text-sm'>
      {t.evidence?.no ? (
        <span className='shrink-0 font-mono text-xs text-muted-foreground tabular-nums'>
          T-{t.evidence.no}
        </span>
      ) : null}
      <span className='truncate font-medium' title={t.title}>
        {t.title}
      </span>
    </span>
  );
}

// A task running or waiting: the title on one line, then what it is at (running) or what a person has to do and who.
function Card({
  item: i,
  onOpen,
}: {
  item: Item;
  onOpen: (id: number) => void;
}) {
  const ask = i.place.ask,
    who = owner(i.t).name;
  const step = i.place.step ? stepOf(i.t.evidence?.work)?.text : undefined;
  return (
    <button
      type='button'
      data-task-id={i.t.id}
      data-mine={ask && i.mine ? '' : undefined}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-lg border bg-card p-2.5 text-left text-card-foreground transition-colors hover:border-ring',
        ask && i.mine && 'border-nr-ink-amber/40 bg-nr-tint-amber',
      )}
      onClick={() => onOpen(i.t.id)}
    >
      <Title t={i.t} />
      {ask ? (
        <span className='flex w-full min-w-0 items-center gap-1.5 text-xs'>
          <span
            className={cn(
              'shrink-0 rounded border px-1.5',
              ask.tone === 'red' && 'border-nr-ink-red/40 text-nr-ink-red',
            )}
          >
            {ask.text}
          </span>
          {i.mine ? (
            <span className='shrink-0 rounded-full bg-nr-ink-amber px-1.5 font-medium text-white'>
              {$t('taskAgents.you')}
            </span>
          ) : who ? (
            <span className='truncate text-muted-foreground'>
              {$t('taskAgents.waitingFor', { 0: who })}
            </span>
          ) : null}
          <span
            className={cn(
              'ml-auto inline-flex shrink-0 items-center',
              i.mine ? 'font-medium text-primary' : 'text-muted-foreground',
            )}
          >
            {$t('taskAgents.open')}
            <ChevronRight aria-hidden='true' className='size-3.5' />
          </span>
        </span>
      ) : step ? (
        <span className='truncate text-xs text-muted-foreground'>{step}</span>
      ) : null}
    </button>
  );
}

// The line above the tasks (2026-10-21, after Studio): runs under way, waiting for an Agent and failed, and how many
// runtimes are online. What waits for you is counted on Waiting for me already, so it is not repeated here.
export function RunSummary({ works }: { works: (Work | undefined)[] }) {
  const runners = useRunnerOptions(),
    n = runCounts(works);
  const item = (cls: string, label: string, value: number) => (
    <span className='inline-flex items-center gap-1.5'>
      <span aria-hidden='true' className={cn('size-1.5 rounded-full', cls)} />
      {label}
      <b className='font-medium text-foreground tabular-nums'>{value}</b>
    </span>
  );
  return (
    <p
      className='m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground'
      aria-label={$t('taskAgents.summary')}
    >
      {item(dot.running, $t('taskAgents.statusRunning'), n.running)}
      {item(dot.queued, $t('taskAgents.statusQueued'), n.queued)}
      {n.failed > 0 &&
        item('bg-nr-ink-red', $t('taskAgents.runFailed'), n.failed)}
      {!runners.loading && (
        <span className='inline-flex items-center gap-1.5'>
          <ServerIcon aria-hidden='true' className='size-3.5' />
          {$t('taskAgents.runtimesOnline', { 0: runners.online })}
        </span>
      )}
    </p>
  );
}
