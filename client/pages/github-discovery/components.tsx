import { useEffect, useRef, useState, type ReactNode } from 'react';
import { $t, $legacyText } from '#i18n';
import { Badge } from '#components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import { InlineError } from '#components/reach/states';
import { InfoTip } from '#components/reach/info-tip';
import { formatDateTime, formatCount } from '#lib/format';
import type { DiscoveryStatus } from './api.js';

export function DiscoverySelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <Select
      value={value}
      items={options}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      disabled={disabled}
    >
      <SelectTrigger aria-label={label} className='w-full sm:w-auto'>
        <SelectValue />
      </SelectTrigger>
      <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
        <SelectGroup>
          {options.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
export function DetectionBadge({ status }: { status: string }) {
  return <Badge variant='secondary'>{$t(`githubDiscovery.${status}`)}</Badge>;
}
export function DiscoveryState({ data }: { data: DiscoveryStatus }) {
  return (
    <div className='flex flex-col gap-2'>
      <div className='flex flex-wrap items-center gap-2 text-sm text-muted-foreground'>
        <span>
          {$t('githubDiscovery.savedCount', {
            0: formatCount(data.savedCount),
          })}
        </span>
        <span>
          {data.running
            ? $t('githubDiscovery.scanning')
            : data.lastRun
              ? $t('githubDiscovery.updated', {
                  0: formatDateTime(data.lastRun.finishedAt),
                })
              : $t('githubDiscovery.notScanned')}
        </span>
        <InfoTip>{$t('githubDiscovery.coverage')}</InfoTip>
      </div>
      {data.lastRun?.errors.map((error) => (
        <InlineError key={error}>{$legacyText(error)}</InlineError>
      ))}
      {data.lastRun?.partial || data.lastRun?.capped || data.capped ? (
        <p className='text-sm text-muted-foreground'>
          {$t('githubDiscovery.partial')}
        </p>
      ) : null}
    </div>
  );
}
export function OverflowText({
  text,
  children,
}: {
  text: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null),
    [overflows, setOverflows] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => setOverflows(el.scrollWidth > el.clientWidth);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);
  const content = (
    <span ref={ref} className='block max-w-64 truncate'>
      {children || text}
    </span>
  );
  return overflows ? (
    <Tooltip>
      <TooltipTrigger render={content} />
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  ) : (
    content
  );
}
