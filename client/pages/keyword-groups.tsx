import { useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
import { $t, useMessageState, $legacyText } from '#i18n';
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
  /** Shown on hover: a dug group's full direction when its name is short. */
  title?: string;
  /** A dug group: renamed or deleted from its ⋯ menu. */
  dig?: { id: string; name: string };
};
// A name the AI or the person gives is short; a long direction from before names was cut at a word near 20 characters.
const CUT = 20;
// A dug group's name in the tab: its short name, or its direction cut short, with the whole direction on hover.
export const digName = (d: { name?: string | null; direction: string }) => {
  if (d.name) return d.name;
  if (d.direction.length <= CUT) return d.direction;
  const head = d.direction.slice(0, CUT - 1),
    space = head.lastIndexOf(' ');
  return `${(space > CUT / 2 ? head.slice(0, space) : head).trimEnd()}…`;
};

/**
 * Keywords › AI suggestions' group tabs on one line (2026-10-28: dug groups ran three lines deep): the tabs that fit,
 * then More with the rest; the selected group is always among those shown. A dug group has a ⋯ menu on hover to rename
 * or delete it; the four built-in groups have none.
 */
export function GroupTabs({
  tabs,
  value,
  canEdit,
  onSelect,
  onRename,
  onDelete,
}: {
  tabs: GroupTab[];
  value: string;
  canEdit: boolean;
  onSelect: (value: string) => void;
  onRename: (dig: { id: string; name: string }) => void;
  onDelete: (dig: { id: string; name: string }) => void;
}) {
  const boxRef = useRef<HTMLSpanElement>(null),
    measureRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState(tabs.length);
  const key = tabs.map((t) => `${t.value}:${t.label}:${t.count}`).join('|');
  // Widths come from a hidden copy of every tab; the row's width from the card, as it changes.
  useLayoutEffect(() => {
    const box = boxRef.current?.closest('[data-slot=card]'),
      measure = measureRef.current;
    if (!box || !measure) return;
    const count = () => {
      const widths = [...measure.children].map(
        (child) => (child as HTMLElement).offsetWidth,
      );
      const more = widths.pop() ?? 0,
        room = box.clientWidth - 48;
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
      {shown.map((t) =>
        t.dig ? (
          <span key={t.value} className='group/tab inline-flex items-center'>
            <TabsTrigger
              value={t.value}
              title={t.title}
              data-dig-group={t.dig.id}
            >
              {text(t)}
            </TabsTrigger>
            {canEdit ? (
              <GroupMenu dig={t.dig} onRename={onRename} onDelete={onDelete} />
            ) : null}
          </span>
        ) : (
          <TabsTrigger key={t.value} value={t.value} title={t.title}>
            {text(t)}
          </TabsTrigger>
        ),
      )}
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
        {tabs.map((t) => (
          <span
            key={t.value}
            className='inline-flex px-1.5 text-sm font-medium'
          >
            {text(t)}
            {t.dig && canEdit ? (
              <span className='ml-1 inline-block w-6' />
            ) : null}
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

function GroupMenu({
  dig,
  onRename,
  onDelete,
}: {
  dig: { id: string; name: string };
  onRename: (dig: { id: string; name: string }) => void;
  onDelete: (dig: { id: string; name: string }) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant='ghost'
            size='icon-xs'
            aria-label={$t('keywordSuggestions.manageGroup', { 0: dig.name })}
            className='opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100 data-[popup-open]:opacity-100 [@media(hover:none)]:opacity-100'
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-auto min-w-36'>
        <DropdownMenuItem onClick={() => onRename(dig)}>
          {$t('keywordSuggestions.renameGroup')}
        </DropdownMenuItem>
        <DropdownMenuItem variant='destructive' onClick={() => onDelete(dig)}>
          {$t('keywordSuggestions.deleteGroup')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Rename a dug group: a short name, up to 24 characters, about 16 reading best in the tab. */
export function RenameGroupDialog({
  dig,
  onClose,
  onSave,
}: {
  dig: { id: string; name: string };
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(dig.name),
    [busy, setBusy] = useState(false),
    [error, setError] = useMessageState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    setBusy(true);
    setError('');
    try {
      await onSave(next);
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
      <DialogContent className='sm:max-w-sm'>
        <form onSubmit={(e) => void submit(e)} className='flex flex-col gap-4'>
          <DialogHeader>
            <DialogTitle>
              {$t('keywordSuggestions.renameGroupTitle')}
            </DialogTitle>
            <DialogDescription>
              {$t('keywordSuggestions.renameGroupHint')}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={name}
            maxLength={24}
            aria-label={$t('keywordSuggestions.groupName')}
            onChange={(e) => setName(e.target.value)}
          />
          {error ? (
            <p className='nr-error' role='alert'>
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {$t('common.cancel')}
            </Button>
            <Button type='submit' disabled={busy || !name.trim()}>
              {$t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
