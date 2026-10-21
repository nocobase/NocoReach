import { useId, useMemo, useState } from 'react';
import { useTranslation } from '@nocobase/i18n/client';
import { ChevronsUpDownIcon } from 'lucide-react';
import { Button } from '#components/ui/button';
import { Field, FieldLabel } from '#components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#components/ui/command';
import { useScheduleFormatting } from './format.js';

export function TimezoneSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (timezone: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { zone } = useScheduleFormatting();
  const id = useId();
  const [open, setOpen] = useState(false);
  // Include stored aliases even if the browser lists only canonical names.
  const timezones = useMemo(
    () =>
      Array.from(
        new Set(['UTC', value, ...Intl.supportedValuesOf('timeZone')]),
      ),
    [value],
  );
  return (
    <Field data-disabled={disabled}>
      <FieldLabel id={`${id}-label`} htmlFor={id}>
        {t('schedules.timezone')}
        <span aria-hidden='true' className='text-destructive'>
          *
        </span>
      </FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type='button'
              variant='outline'
              role='combobox'
              aria-labelledby={`${id}-label`}
              aria-required='true'
              disabled={disabled}
              className='w-full justify-between'
            >
              <span className='min-w-0 truncate'>
                {zone(value)}
                {zone(value) !== value ? (
                  <span className='text-muted-foreground'> · {value}</span>
                ) : null}
              </span>
              <ChevronsUpDownIcon data-icon='inline-end' />
            </Button>
          }
        />
        <PopoverContent align='start' className='w-(--anchor-width) p-0'>
          <Command>
            <CommandInput
              aria-label={t('schedules.searchTimezone')}
              placeholder={t('schedules.searchTimezone')}
            />
            <CommandList>
              <CommandEmpty>{t('schedules.noTimezone')}</CommandEmpty>
              <CommandGroup>
                {timezones.map((timezone) => (
                  <CommandItem
                    key={timezone}
                    value={timezone}
                    data-checked={timezone === value}
                    onSelect={() => {
                      onChange(timezone);
                      setOpen(false);
                    }}
                  >
                    {timezone}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
