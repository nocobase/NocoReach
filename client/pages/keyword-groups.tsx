import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDown, Trash2 } from 'lucide-react';
import { $t, $legacyText, useMessageState } from '#i18n';
import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { TabsTrigger } from '#components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';

export type GroupTab = {
  value: string;
  label: string;
  count: number;
  /** Shown on hover: the direction a dug group was dug in. */
  title?: string;
};

/**
 * Keywords › AI suggestions' group tabs on one line (2026-10-28: dug groups ran three lines deep): the tabs that fit,
 * then More with the rest; the selected group is always among those shown. Every tab reads as a name and a count, the
 * dug groups exactly like the built-in four; they are renamed and deleted in Edit groups, at the row's end.
 */
export function GroupTabs({
  tabs,
  value,
  onSelect,
}: {
  tabs: GroupTab[];
  value: string;
  onSelect: (value: string) => void;
}) {
  const boxRef = useRef<HTMLSpanElement>(null),
    measureRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(tabs.length);
  const key = tabs.map((t) => `${t.value}:${t.label}:${t.count}`).join('|');
  // Widths come from a hidden copy of every tab; the room from the card less the row's own actions, as it changes.
  useLayoutEffect(() => {
    const box = boxRef.current?.closest('[data-slot=card]'),
      measure = measureRef.current;
    if (!box || !measure) return;
    const count = () => {
      const widths = [...measure.children].map(
        (child) => (child as HTMLElement).offsetWidth,
      );
      const more = widths.pop() ?? 0,
        actions =
          box.querySelector<HTMLElement>('[data-group-actions]')?.offsetWidth ??
          0,
        // The row's padding (32) and the segments' border (2), with a little to spare.
        room = box.clientWidth - 48 - (actions ? actions + 8 : 0);
      // Not laid out (hidden, or no layout at all): show every tab.
      if (!box.clientWidth) return setFit(widths.length);
      const total = widths.reduce((a, b) => a + b, 0);
      if (total <= room) return setFit(widths.length);
      let used = more,
        n = 0;
      while (n < widths.length && used + widths[n] <= room) used += widths[n++];
      setFit(Math.max(1, n));
    };
    count();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(count);
    observer.observe(box);
    return () => observer.disconnect();
  }, [key]);
  let shown = tabs.slice(0, fit);
  const active = tabs.findIndex((t) => t.value === value);
  if (active >= fit && fit > 1)
    shown = [...tabs.slice(0, fit - 1), tabs[active]];
  const rest = tabs.filter((t) => !shown.includes(t));
  const text = (t: GroupTab) => `${t.label} ${t.count}`;
  return (
    <>
      <span ref={boxRef} className='contents' />
      {shown.map((t) => (
        <TabsTrigger key={t.value} value={t.value} title={t.title}>
          {text(t)}
        </TabsTrigger>
      ))}
      {rest.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type='button'
                className='inline-flex h-[calc(100%-1px)] items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-medium whitespace-nowrap text-foreground/60 hover:text-foreground'
              />
            }
          >
            {$t('common.more')} {rest.length}
            <ChevronDown className='size-3.5' />
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' className='w-auto min-w-48'>
            {rest.map((t) => (
              <DropdownMenuItem
                key={t.value}
                title={t.title}
                onClick={() => onSelect(t.value)}
              >
                <span className='flex-1'>{t.label}</span>
                <span className='text-muted-foreground tabular-nums'>
                  {t.count}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {/* The hidden copy the widths are read from: each tab as drawn, then More. */}
      <span
        ref={measureRef}
        aria-hidden='true'
        className='pointer-events-none invisible absolute -left-[9999px] flex whitespace-nowrap'
      >
        {/* As styles.css draws a segmented tab (12px each side, tabular figures), in the chosen tab's weight. */}
        {tabs.map((t) => (
          <span
            key={t.value}
            className='inline-flex px-3 text-sm font-medium tabular-nums'
          >
            {text(t)}
          </span>
        ))}
        <span className='inline-flex px-1.5 text-sm font-medium'>
          {$t('common.more')} 00
          <span className='ml-1 inline-block w-4' />
        </span>
      </span>
    </>
  );
}

export type EditableGroup = {
  id: string;
  name: string;
  count: number;
};
type Row = EditableGroup & { deleted: boolean };

/**
 * Edit groups (2026-10-28, mockup ui-references/keywords-2026-10-28/manual-edit.png): every group, the built-in four
 * included, renamed in place or deleted, each deletion undoable until Save. Deleting removes the group's keywords from
 * AI suggestions and keeps them out of later lookups; saved keywords are not touched. Nothing changes until Save.
 */
export function EditGroupsDialog({
  groups,
  onClose,
  onSave,
}: {
  groups: EditableGroup[];
  onClose: () => void;
  onSave: (
    changes: { id: string; name?: string; deleted?: boolean }[],
  ) => Promise<boolean>;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
      groups.map((g) => ({ ...g, deleted: false })),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useMessageState('');
  const set = (id: string, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const changes = rows.flatMap(
    (r): { id: string; name?: string; deleted?: boolean }[] => {
      const before = groups.find((g) => g.id === r.id)!;
      if (r.deleted) return [{ id: r.id, deleted: true }];
      return r.name.trim() !== before.name
        ? [{ id: r.id, name: r.name.trim() }]
        : [];
    },
  );
  const empty = rows.some((r) => !r.deleted && !r.name.trim());
  const save = async () => {
    if (!changes.length) return onClose();
    setBusy(true);
    setError('');
    try {
      if (await onSave(changes)) onClose();
    } catch (e) {
      setError(() =>
        e instanceof Error ? $legacyText(e.message) : $t('common.notSaved'),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{$t('keywordSuggestions.editGroupsTitle')}</DialogTitle>
          <DialogDescription>
            {$t('keywordSuggestions.editGroupsDescription')}
          </DialogDescription>
        </DialogHeader>
        <ul
          className='divide-y rounded-lg border'
          aria-label={$t('keywordSuggestions.editGroupsTitle')}
        >
          {rows.map((r) => (
            <li
              key={r.id}
              className='flex items-center gap-3 px-3 py-2'
              data-group-row={r.id}
            >
              <Input
                value={r.name}
                maxLength={24}
                disabled={r.deleted}
                aria-label={$t('keywordSuggestions.groupName')}
                className={cn(
                  'h-8 flex-1',
                  r.deleted && 'text-muted-foreground line-through',
                )}
                onChange={(e) => set(r.id, { name: e.target.value })}
              />
              <span className='w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums'>
                {$t('keywordSuggestions.groupCount', { 0: r.count })}
              </span>
              {r.deleted ? (
                <Button
                  variant='link'
                  size='xs'
                  className='w-12 shrink-0'
                  onClick={() => set(r.id, { deleted: false })}
                >
                  {$t('keywordSuggestions.undoDelete')}
                </Button>
              ) : (
                <Button
                  variant='ghost'
                  size='icon-xs'
                  className='mx-3 shrink-0'
                  aria-label={$t('keywordSuggestions.deleteNamedGroup', {
                    0: r.name || groups.find((g) => g.id === r.id)!.name,
                  })}
                  onClick={() => set(r.id, { deleted: true })}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
        {error ? (
          <p className='nr-error' role='alert'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {$t('common.cancel')}
          </Button>
          <Button disabled={busy || empty} onClick={() => void save()}>
            {$t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
