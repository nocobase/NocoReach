import type { ReactElement } from 'react';
import { ChevronRight, ServerOff } from 'lucide-react';
import { Link } from 'react-router';
import { useRunnerOptions } from '@nocobase/app-plugin-agents/client/kit';
import { $t } from '#i18n';
import { ActorAvatar } from '#components/reach/actor';
import { Tag } from '#components/reach/tag';
import { cn } from '#lib/utils';
import { useMe } from './me';
import { stepOf } from './task-list-model';
import {
  placeOf,
  taskAgentOf,
  UNASSIGNED,
  type AgentStatus,
  type Lane,
  type Placed,
} from './task-agents';
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
          {$t('workBoard.noTasks')}
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
        // Every card on the card ground; what waits on you is said by the amber tag, as on the board and the list
        // (UI review 2026-10-22: this was the only card painted amber, with the only solid tag).
        'flex w-full flex-col gap-1.5 rounded-lg border bg-card p-2.5 text-left text-card-foreground transition-colors hover:border-ring',
      )}
      onClick={() => onOpen(i.t.id)}
    >
      <Title t={i.t} />
      {ask ? (
        <span className='flex w-full min-w-0 items-center gap-1.5 text-xs'>
          <Tag tone={ask.tone === 'red' ? 'red' : 'grey'}>{ask.text}</Tag>
          {i.mine ? (
            <Tag tone='amber'>{$t('taskAgents.you')}</Tag>
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

// Above the tasks, only what the rows cannot say (2026-10-22: the counts of running, queued and failed runs repeated
// each row's status and sat tight on the table): no runtime is online, so work handed to an Agent waits. Nothing
// when a runtime is online.
export function RuntimeNotice() {
  const runners = useRunnerOptions();
  if (runners.loading || runners.online > 0) return null;
  return (
    <p
      role='status'
      className='flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-sm'
    >
      <ServerOff
        aria-hidden='true'
        className='size-4 shrink-0 text-muted-foreground'
      />
      <span className='min-w-0 flex-1'>{$t('taskAgents.noRuntimeNotice')}</span>
      <Link className='nr-link shrink-0' to='/agents/runtimes'>
        {$t('agentsPage.viewRuntimes')}
      </Link>
    </p>
  );
}
