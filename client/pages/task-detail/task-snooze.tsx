import { useId, useState, type ReactElement } from 'react';
import { addDays, parseISO } from 'date-fns';
import { CalendarIcon, Clock } from 'lucide-react';
import { $t } from '#i18n';
import { formatDate } from '#lib/format';
import { Button } from '#components/ui/button';
import { Calendar } from '#components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Field, FieldLabel } from '#components/ui/field';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import { Textarea } from '#components/ui/textarea';
import { Segmented } from '#components/reach/segmented';
import { useDayPickerLocale } from '../day-picker-locale';
import { dayOf, snoozeDay, snoozeDays, snoozeWeekday } from './snooze-days';
import {
  getWorkColumns,
  workState,
  type TaskData,
} from '../task-execution-types';
import { Card } from './layout';
import { text } from './styles';

// Snooze (2026-10-28 user request, as Gmail's): a task waiting for something outside NocoReach is put aside until a
// day. It keeps its progress, leaves Needs you and Current, and comes back on that day at 9 AM, its owner reminded
// (server/nocoreach/execution/snooze.ts). The task page names it at the top of its main column; acting on the card
// ends it.

type Update = (command: string, body?: object) => Promise<TaskData | undefined>;
type Choice = 'week' | 'twoWeeks' | 'month' | 'date';

/** The dialog that puts a task aside, or changes the day of one that is. */
export function SnoozeDialog({
  open,
  onClose,
  data,
  busy,
  update,
}: {
  open: boolean;
  onClose: () => void;
  data: TaskData;
  busy: boolean;
  update: Update;
}): ReactElement {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      {/* Made anew each time it opens: what the snooze says now, or two weeks for a new one. */}
      {open && (
        <SnoozeForm data={data} busy={busy} update={update} onClose={onClose} />
      )}
    </Dialog>
  );
}

function SnoozeForm({
  onClose,
  data,
  busy,
  update,
}: {
  onClose: () => void;
  data: TaskData;
  busy: boolean;
  update: Update;
}): ReactElement {
  const id = useId(),
    w = data.work,
    current = w.snooze,
    days = snoozeDays(),
    locale = useDayPickerLocale();
  const preset = (Object.keys(days) as (keyof typeof days)[]).find(
    (k) => days[k] === current?.day,
  );
  const [reason, setReason] = useState(current?.reason || '');
  const [choice, setChoice] = useState<Choice>(
    current ? (preset ?? 'date') : 'twoWeeks',
  );
  const [picked, setPicked] = useState(current && !preset ? current.day : '');
  const [calendar, setCalendar] = useState(false);
  const day = choice === 'date' ? picked : days[choice];
  const tomorrow = addDays(new Date(), 1);
  const owner = w.humanOwnerName || $t('common.owner');
  const options: [Choice, string][] = [
    ['week', $t('taskSnooze.week')],
    ['twoWeeks', $t('taskSnooze.twoWeeks')],
    ['month', $t('taskSnooze.month')],
    ['date', $t('taskSnooze.pickDate')],
  ];
  return (
    <DialogContent className='sm:max-w-md'>
      <DialogHeader>
        <DialogTitle>
          {current ? $t('taskSnooze.changeTitle') : $t('taskSnooze.title')}
        </DialogTitle>
        <DialogDescription>
          {$t('taskSnooze.description', {
            0: getWorkColumns()[workState(w)],
          })}
        </DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor={`${id}-reason`}>
          {$t('taskSnooze.reason')}
        </FieldLabel>
        <Textarea
          id={`${id}-reason`}
          rows={3}
          maxLength={500}
          value={reason}
          placeholder={$t('taskSnooze.reasonPlaceholder')}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel id={`${id}-until`}>{$t('taskSnooze.until')}</FieldLabel>
        <Segmented
          label={$t('taskSnooze.until')}
          value={choice}
          options={options.map(([k, label]) => ({ id: k, label }))}
          onChange={(k) => {
            setChoice(k as Choice);
            if (k === 'date') setCalendar(true);
          }}
        />
        {choice === 'date' && (
          <Popover open={calendar} onOpenChange={setCalendar}>
            <PopoverTrigger
              render={
                <Button
                  variant='outline'
                  size='sm'
                  className='self-start font-normal'
                />
              }
            >
              <CalendarIcon data-icon='inline-start' />
              {picked ? snoozeDay(picked) : $t('taskSnooze.pickDate')}
            </PopoverTrigger>
            <PopoverContent align='start' className='w-auto p-0'>
              <Calendar
                mode='single'
                selected={picked ? parseISO(picked) : undefined}
                onSelect={(d) => {
                  if (d) setPicked(dayOf(d));
                  setCalendar(false);
                }}
                defaultMonth={picked ? parseISO(picked) : tomorrow}
                disabled={{ before: tomorrow }}
                showOutsideDays={false}
                locale={locale}
              />
            </PopoverContent>
          </Popover>
        )}
        <p className={text.muted} aria-live='polite'>
          {day
            ? $t('taskSnooze.backOn', {
                0: snoozeDay(day),
                1: snoozeWeekday(day),
                2: owner,
              })
            : $t('taskSnooze.chooseDay')}
        </p>
      </Field>
      <DialogFooter>
        <Button variant='outline' disabled={busy} onClick={onClose}>
          {$t('common.cancel')}
        </Button>
        <Button
          disabled={busy || !day}
          onClick={() =>
            void update('snoozeTask', { day, reason: reason.trim() }).then(
              (d) => {
                if (d) onClose();
              },
            )
          }
        >
          {current ? $t('common.save') : $t('taskSnooze.submit')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** At the top of the main column while snoozed: until when, why and by whom, with Change date and Unsnooze. */
export function SnoozedCard({
  data,
  busy,
  allowed,
  onChange,
  update,
}: {
  data: TaskData;
  busy: boolean;
  allowed: boolean;
  onChange: () => void;
  update: Update;
}): ReactElement | null {
  const s = data.work.snooze;
  if (!s) return null;
  const by = $t('taskSnooze.snoozedBy', {
    0: s.byName || $t('common.member'),
    1: formatDate(s.at),
  });
  return (
    <Card
      aria-label={$t('common.snoozed')}
      data-snoozed=''
      title={
        <>
          <Clock
            aria-hidden='true'
            className='size-4 shrink-0 text-muted-foreground'
          />
          {$t('taskSnooze.snoozedUntil', { 0: snoozeDay(s.day) })}
        </>
      }
      sub={s.reason ? `${s.reason} · ${by}` : by}
      actions={
        allowed ? (
          <>
            <Button variant='outline' disabled={busy} onClick={onChange}>
              {$t('taskSnooze.changeDate')}
            </Button>
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => void update('unsnoozeTask')}
            >
              {$t('taskSnooze.unsnooze')}
            </Button>
          </>
        ) : undefined
      }
    />
  );
}
