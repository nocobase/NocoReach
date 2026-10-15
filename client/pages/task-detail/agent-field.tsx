import { useId } from 'react';
import { Link } from 'react-router';
import { useMessageState, $t } from '#i18n';
import { Field, FieldDescription, FieldLabel } from '#components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { hasTaskAgent, type TaskData } from '../task-execution-types';

const PROJECT_DEFAULT = '__project_default__';

export function TaskAgentField({
  data,
  busy,
  lockedReason,
  onChange,
}: {
  data: TaskData;
  busy: boolean;
  lockedReason?: string;
  onChange: (agentId: string | null) => Promise<boolean>;
}) {
  const id = useId();
  const [notice, setNotice] = useMessageState('');
  const options = data.agent?.options || [];
  const defaultAgent = options.find(
    (agent) => agent.id === data.agent?.defaultAgentId,
  );
  const defaultLabel = defaultAgent
    ? $t('taskDetail.projectDefault', { 0: defaultAgent.name })
    : $t('taskDetail.projectDefaultNotSetUnavailable');
  const value = data.work.agentId || PROJECT_DEFAULT;
  const unavailable = Boolean(
    data.work.agentId &&
    !options.some((agent) => agent.id === data.work.agentId),
  );
  const items = [
    { value: PROJECT_DEFAULT, label: defaultLabel },
    ...options.map((agent) => ({
      value: agent.id,
      label: `${agent.name} · ${$t(agent.type === 'online' ? 'common.onlineAgent' : 'common.runnerAgent')}`,
    })),
    ...(unavailable
      ? [
          {
            value,
            label: $t('taskDetail.unavailable', {
              0: data.work.agentName || value,
            }),
          },
        ]
      : []),
  ];
  const disabled = busy || Boolean(lockedReason) || !options.length;
  const invalid = !lockedReason && !hasTaskAgent(data);
  return (
    <Field data-disabled={disabled} data-invalid={invalid} className='min-w-0'>
      <FieldLabel htmlFor={id}>{$t('taskDetail.executionAgent')}</FieldLabel>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (!next || next === value) return;
          setNotice('');
          void onChange(next === PROJECT_DEFAULT ? null : next).then(
            (saved) => {
              if (saved) setNotice(() => $t('taskDetail.executionAgentSaved'));
            },
          );
        }}
      >
        <SelectTrigger
          id={id}
          className='w-full min-w-0'
          aria-invalid={invalid}
          aria-describedby={`${id}-help`}
        >
          <SelectValue
            className='truncate'
            title={items.find((item) => item.value === value)?.label}
          />
        </SelectTrigger>
        <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                disabled={unavailable && item.value === value}
                className='[&>span:first-child]:min-w-0 [&>span:first-child]:shrink [&>span:first-child]:whitespace-normal [&>span:first-child]:break-words'
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription id={`${id}-help`}>
        {lockedReason ||
          (!options.length
            ? $t('onlineAgent.noAvailableAgents')
            : invalid
              ? $t('onlineAgent.chooseTaskAgent')
              : $t('taskDetail.appliesTaskTaskOwnerStill'))}
        {!lockedReason && (
          <>
            {' '}
            <Link to='/agents'>{$t('common.manageAgents')}</Link>
          </>
        )}
      </FieldDescription>
      {!lockedReason && hasTaskAgent(data) && !data.agent?.online && (
        <p className='text-sm text-muted-foreground'>
          {$t('taskDetail.agentOfflineStartingTaskQueue')}
        </p>
      )}
      <span role='status' className='text-sm text-muted-foreground'>
        {busy ? $t('common.saving') : notice}
      </span>
    </Field>
  );
}
