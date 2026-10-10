import { useId, useState } from 'react';
import { Link } from 'react-router';
import { $t } from '#i18n';
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
  const [notice, setNotice] = useState('');
  const options = data.agent?.options || [];
  const defaultAgent = options.find(
    (agent) => agent.id === data.agent?.defaultAgentId,
  );
  const defaultLabel = defaultAgent
    ? $t('项目默认：{0}', { 0: defaultAgent.name })
    : $t('项目默认（未设置或不可用）');
  const value = data.work.agentId || PROJECT_DEFAULT;
  const unavailable = Boolean(
    data.work.agentId &&
    !options.some((agent) => agent.id === data.work.agentId),
  );
  const items = [
    { value: PROJECT_DEFAULT, label: defaultLabel },
    ...options.map((agent) => ({ value: agent.id, label: agent.name })),
    ...(unavailable
      ? [
          {
            value,
            label: $t('不可用：{0}', { 0: data.work.agentName || value }),
          },
        ]
      : []),
  ];
  const disabled = busy || Boolean(lockedReason) || !options.length;
  const invalid = !lockedReason && !hasTaskAgent(data);
  return (
    <Field data-disabled={disabled} data-invalid={invalid} className='min-w-0'>
      <FieldLabel htmlFor={id}>{$t('执行 Agent')}</FieldLabel>
      <Select
        items={items}
        value={value}
        disabled={disabled}
        onValueChange={(next) => {
          if (!next || next === value) return;
          setNotice('');
          void onChange(next === PROJECT_DEFAULT ? null : next).then(
            (saved) => {
              if (saved) setNotice($t('执行 Agent 已保存'));
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
        <SelectContent className='max-w-[calc(100vw-2rem)]'>
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
            ? $t('暂无团队可调用的 Runner Agent，请先创建或联系管理员。')
            : invalid
              ? $t('请为这个任务选择一个可用的 Runner Agent。')
              : $t('仅影响这个任务；负责人仍负责审核。'))}
        {!lockedReason && (
          <>
            {' '}
            <Link to='/agents'>{$t('管理 Agent')}</Link>
          </>
        )}
      </FieldDescription>
      {!lockedReason && hasTaskAgent(data) && !data.agent?.online && (
        <p className='text-sm text-muted-foreground'>
          {$t('Agent 暂时离线，开始后将等待可用的 Runner。')}
        </p>
      )}
      <span role='status' className='text-sm text-muted-foreground'>
        {busy ? $t('正在保存…') : notice}
      </span>
    </Field>
  );
}
