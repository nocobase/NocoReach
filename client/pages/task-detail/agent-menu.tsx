import { ChevronDown, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { $t } from '#i18n';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { cn } from '#lib/utils';
import { hasTaskAgent, type TaskData } from '../task-execution-types';

function Status({ online }: { online?: boolean }) {
  return (
    <span
      aria-hidden='true'
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        online ? 'bg-nr-ink-green' : 'bg-muted-foreground/50',
      )}
    />
  );
}

/**
 * The task's Agent beside its owner in the header, changed the same way (2026-10-20 user decision): who does the work
 * and whether it is online are visible before anything fails, and the stage cards no longer carry a picker. `locked`
 * says why it cannot be changed now (queued, running, done, closed, or not the owner); the server enforces the same.
 * `bare` (the properties column, 2026-10-22) shows only the name, its row being labelled Agent already.
 */
export function AgentMenu({
  data,
  busy,
  locked,
  bare = false,
  onChange,
}: {
  data: TaskData;
  busy: boolean;
  locked?: string;
  bare?: boolean;
  onChange: (agentId: string) => Promise<boolean>;
}) {
  const navigate = useNavigate();
  const options = data.agent?.options || [];
  const chosen = hasTaskAgent(data)
    ? options.find((agent) => agent.id === data.agent?.agentId)
    : undefined;
  // With exactly one Agent available it does the work, also in place of a saved one that is gone.
  const shown = chosen || (options.length === 1 ? options[0] : undefined);
  const gone = data.work.agentId && !chosen;
  const note = shown
    ? [
        gone ? $t('taskDetail.previousAgentUnavailable') : '',
        shown.online === false
          ? $t('taskDetail.agentOfflineStartingTaskQueue')
          : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';
  const name = shown ? (
    <span className='inline-flex min-w-0 items-center gap-1.5 text-foreground'>
      <Status online={shown.online} />
      <span className='truncate'>{shown.name}</span>
      <span className='sr-only'>
        {shown.online === false
          ? $t('taskDetail.agentOffline')
          : $t('taskDetail.agentOnline')}
      </span>
    </span>
  ) : gone ? (
    <span className='inline-flex min-w-0 items-center gap-1.5 text-foreground'>
      <span className='truncate'>
        {data.work.agentName || data.work.agentId}
      </span>
      <Tag tone='red'>{$t('taskDetail.agentUnavailable')}</Tag>
    </span>
  ) : (
    <span className='text-nr-ink-red'>{$t('taskDetail.agentNotChosen')}</span>
  );
  const label = bare ? (
    name
  ) : (
    <>
      {$t('taskDetail.agent')} · {name}
    </>
  );
  const named = `${$t('taskDetail.agent')} · ${
    shown?.name ||
    (gone ? data.work.agentName || data.work.agentId : '') ||
    $t('taskDetail.agentNotChosen')
  }`;
  if (locked)
    return (
      <span
        className='inline-flex min-w-0 items-center gap-1'
        title={[locked, note].filter(Boolean).join(' ')}
        data-agent-locked=''
      >
        {label}
      </span>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size='sm'
            variant='ghost'
            className={cn(
              'h-7 px-2',
              bare
                ? '-mx-2 -my-1.5 h-8 max-w-[calc(100%+1rem)] text-sm font-normal'
                : 'max-w-72 text-muted-foreground',
            )}
            disabled={busy}
            title={note || undefined}
            aria-label={bare ? named : undefined}
          >
            {label}
            <ChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent
        align={bare ? 'start' : 'end'}
        className='w-auto min-w-56'
      >
        {options.length ? (
          <DropdownMenuRadioGroup
            value={chosen?.id || ''}
            onValueChange={(value) => {
              if (value && value !== chosen?.id) void onChange(String(value));
            }}
          >
            {options.map((agent) => (
              <DropdownMenuRadioItem key={agent.id} value={agent.id}>
                <Status online={agent.online} />
                <span className='min-w-0 flex-1 truncate'>{agent.name}</span>
                <span className='text-xs text-muted-foreground'>
                  {agent.online === false
                    ? $t('taskDetail.agentOffline')
                    : $t('taskDetail.agentOnline')}
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : (
          <p className='max-w-64 px-2 py-1.5 text-sm text-muted-foreground'>
            {$t('taskDetail.noTeamAccessibleRunnerAgents')}
          </p>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void navigate('/agents')}>
          <Settings2 />
          {$t('common.manageAgents')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
