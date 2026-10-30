import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, Info, LoaderCircle, X } from 'lucide-react';
import { $t, $tj, $legacyText, getCurrentLocale, useMessageState } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import { formatDate } from '#lib/format';
import { chipClass } from '#components/reach/chip';
import { Segmented } from '#components/reach/segmented';
import { Button } from '#components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { ScoreBadge } from '#components/seo/score-badge';
import { marketLabel, metric } from './keyword-api';

type Market = { locationCode: number; language: string };
export type Selection = {
  seeds: number;
  directions: number;
  found: number;
  picked: number;
  notPicked: number;
  /** Whether any run kept why its keywords were not picked (lists made before 2026-10-28 did not). */
  recorded: boolean;
  reasons: { reason: string; count: number; examples: string[] }[];
  pick: number;
  digPick: number;
  /** How many candidates at most go to the AI. */
  shortlist: number;
};
type NotPicked = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
  intent: string | null;
  reason: string;
  duplicateOf?: string | null;
  run: string;
};
const reasonLabel = (r: string) =>
  $t(`keywordSuggestions.notPickedReason.${r}`);
/** A not-picked row's reason: a duplicate names the keyword it repeats. */
const rowReason = (c: NotPicked) =>
  c.reason === 'duplicate' && c.duplicateOf
    ? $t('keywordSuggestions.duplicateOf', { 0: c.duplicateOf })
    : reasonLabel(c.reason);
/** The limit behind a reason, said once under its tab rather than on every row. */
const reasonNote = (reason: string, s?: Selection) =>
  reason === 'weaker'
    ? $t('keywordSuggestions.notPickedNote.weaker', {
        0: s?.pick ?? 40,
        1: s?.digPick ?? 20,
      })
    : reason === 'unreviewed'
      ? $t('keywordSuggestions.notPickedNote.unreviewed', {
          0: s?.shortlist ?? 250,
        })
      : '';
const call = <T,>(projectId: number, action: string, body: object = {}) =>
  api.action<T>('nrKeywordSuggest', action, {
    method: 'POST',
    body: { projectId, ...body },
    unwrap: 'data',
  });
/**
 * A month's searches added up, as the volume column writes them below ten thousand (6,500) and compactly in the reader's
 * language above (186K in English, in ten-thousands in Chinese).
 */
const total = (n: number) => {
  if (n < 10000) return metric(n);
  const locale = getCurrentLocale(),
    text = new Intl.NumberFormat(locale, {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(n);
  return locale.startsWith('zh')
    ? text.replace(/(\d)([万亿])/u, '$1 $2')
    : text;
};
const strong = (v: ReactNode) => (
  <span className='font-medium text-foreground tabular-nums'>{v}</span>
);

/**
 * The results summary above the group tabs (2026-10-28, after Semrush's "All keywords · Total volume · Average KD"):
 * how many keywords the selected tab shows, their monthly searches added up and their average difficulty, and
 * Selection rules, which says how the list was picked and why the others were not. Right: when the list was found,
 * or for an expanded group the direction it was expanded in.
 */
export function SelectionSummary({
  rows,
  selection,
  market,
  minVolume,
  product,
  right,
  seedFilter,
  onClearSeed,
  onViewNotPicked,
}: {
  rows: { metrics?: { volume: number | null; difficulty: number | null } }[];
  selection?: Selection;
  market: Market;
  minVolume: number;
  product: string;
  right: ReactNode;
  seedFilter?: string;
  onClearSeed: () => void;
  onViewNotPicked: () => void;
}) {
  const volume = rows.reduce((n, r) => n + (r.metrics?.volume ?? 0), 0),
    rated = rows.filter((r) => r.metrics?.difficulty != null),
    difficulty = rated.length
      ? Math.round(
          rated.reduce((n, r) => n + (r.metrics!.difficulty ?? 0), 0) /
            rated.length,
        )
      : null;
  const dot = <span className='text-muted-foreground/60'>·</span>;
  return (
    <div
      className='flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-1 text-sm text-muted-foreground'
      data-selection-summary
    >
      <p className='flex flex-wrap items-center gap-x-2 gap-y-1'>
        {seedFilter ? (
          <>
            <button
              type='button'
              className={cn(chipClass, 'cursor-pointer hover:bg-muted')}
              aria-label={$t('keywordSuggestions.clearSeedFilter', {
                0: seedFilter,
              })}
              onClick={onClearSeed}
            >
              {$t('keywordSuggestions.seedFilter', { 0: seedFilter })}
              <X className='size-3' />
            </button>
            {dot}
          </>
        ) : null}
        <span>
          {$tj('keywordSuggestions.summaryKeywords', {
            0: strong(rows.length),
          })}
        </span>
        {dot}
        <span>
          {$tj('keywordSuggestions.summaryVolume', {
            0: strong(total(volume)),
          })}
        </span>
        {difficulty != null ? (
          <>
            {dot}
            <span>
              {$tj('keywordSuggestions.summaryDifficulty', {
                0: strong(difficulty),
              })}
            </span>
          </>
        ) : null}
        {selection ? (
          <>
            {dot}
            <SelectionRules
              selection={selection}
              market={market}
              minVolume={minVolume}
              product={product}
              onViewNotPicked={onViewNotPicked}
            />
          </>
        ) : null}
      </p>
      <p className='text-xs'>{right}</p>
    </div>
  );
}

/** Selection rules: the three rules, the run's numbers, and why the others were not picked, with two examples each. */
function SelectionRules({
  selection: s,
  market,
  minVolume,
  product,
  onViewNotPicked,
}: {
  selection: Selection;
  market: Market;
  minVolume: number;
  product: string;
  onViewNotPicked: () => void;
}) {
  const [open, setOpen] = useState(false);
  const join = getCurrentLocale().startsWith('zh') ? '、' : ', ';
  const b = (key: string) => (
    <span className='font-medium text-foreground'>{$t(key)}</span>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type='button'
            className='nr-link inline-flex items-center gap-1'
            data-selection-rules
          />
        }
      >
        {$t('keywordSuggestions.selectionRules')}
        <Info className='size-3.5' aria-hidden='true' />
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[28rem] max-w-[calc(100vw-2rem)] gap-3 p-4 leading-relaxed'
      >
        <p className='font-medium'>{$t('keywordSuggestions.selectionRules')}</p>
        <ol className='list-decimal space-y-1 pl-5'>
          <li>
            {$tj('keywordSuggestions.ruleDemand', {
              0: b('keywordSuggestions.ruleDemandTitle'),
              1: $t(marketLabel(market)),
              2: minVolume,
            })}
          </li>
          <li>
            {$tj('keywordSuggestions.ruleRelevant', {
              0: b('keywordSuggestions.ruleRelevantTitle'),
              1: product,
              2: s.pick,
              3: s.digPick,
            })}
          </li>
          <li>
            {$tj('keywordSuggestions.ruleOrder', {
              0: b('keywordSuggestions.ruleOrderTitle'),
            })}
          </li>
        </ol>
        <div className='flex flex-col gap-2 border-t pt-3'>
          <p>
            {s.directions
              ? $t('keywordSuggestions.selectionCounts', {
                  0: s.seeds,
                  1: s.directions,
                  2: s.found,
                  3: s.picked,
                })
              : $t('keywordSuggestions.selectionCountsSeeds', {
                  0: s.seeds,
                  1: s.found,
                  2: s.picked,
                })}
            {/* No space after a CJK full stop. */}
            {s.recorded && s.notPicked
              ? `${/^(zh|ja)/.test(getCurrentLocale()) ? '' : ' '}${$t('keywordSuggestions.notPickedHead', { 0: s.notPicked })}`
              : ''}
          </p>
          {s.recorded && s.reasons.length ? (
            <ul className='grid grid-cols-[auto_auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]'>
              {s.reasons.map((r) => (
                <li key={r.reason} className='contents'>
                  <span>{reasonLabel(r.reason)}</span>
                  <span className='text-right tabular-nums'>{r.count}</span>
                  <span className='truncate text-muted-foreground'>
                    {r.examples.length
                      ? $t('keywordSuggestions.examples', {
                          0: r.examples.join(join),
                        })
                      : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {s.recorded && s.reasons.some((r) => r.reason !== 'unrecorded') ? (
            <button
              type='button'
              className='nr-link inline-flex w-fit items-center gap-1'
              onClick={() => {
                setOpen(false);
                onViewNotPicked();
              }}
            >
              {$t('keywordSuggestions.viewNotPicked', {
                0: s.reasons
                  .filter((r) => r.reason !== 'unrecorded')
                  .reduce((n, r) => n + r.count, 0),
              })}
              <ArrowRight className='size-3.5' />
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export type GroupChoice = { id: string; name: string };

/**
 * The keywords found but not picked, each with why (2026-10-28, frame ⑤ of ui-references/keywords-2026-10-28/
 * seed-bar.png): filters by reason, and Add to suggestions puts one in the group the person picks.
 */
export function NotPickedDialog({
  projectId,
  selection,
  groups,
  canAdd,
  onAdded,
  onClose,
}: {
  projectId: number;
  selection?: Selection;
  groups: GroupChoice[];
  canAdd: boolean;
  onAdded: (view: unknown) => void;
  onClose: () => void;
}) {
  const [items, setItems] = useState<NotPicked[]>(),
    [filter, setFilter] = useState('all'),
    [busy, setBusy] = useState(''),
    [error, setError] = useMessageState('');
  useEffect(() => {
    let live = true;
    call<{ items: NotPicked[] }>(projectId, 'notPicked').then(
      (r) => {
        if (live) setItems(r.items);
      },
      (e) => {
        if (live)
          setError(() =>
            e instanceof Error
              ? $legacyText(e.message)
              : $t('keywordSuggestions.notLoad'),
          );
      },
    );
    return () => {
      live = false;
    };
  }, [projectId]);
  const counts = useMemo(() => {
    const by = new Map<string, number>();
    for (const c of items ?? []) by.set(c.reason, (by.get(c.reason) ?? 0) + 1);
    return [...by].sort((a, b) => b[1] - a[1]);
  }, [items]);
  const shown = (items ?? []).filter(
    (c) => filter === 'all' || c.reason === filter,
  );
  const add = async (c: NotPicked, group: GroupChoice) => {
    setBusy(c.keyword);
    try {
      const view = await call(projectId, 'addItems', {
        keyword: c.keyword,
        group: group.id,
      });
      setItems((list) => list?.filter((x) => x.keyword !== c.keyword));
      onAdded(view);
      toast.success(() =>
        $t('keywordSuggestions.addedTo', { 0: c.keyword, 1: group.name }),
      );
    } catch (e) {
      toast.error(() =>
        e instanceof Error ? $legacyText(e.message) : $t('common.notSaved'),
      );
    } finally {
      setBusy('');
    }
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className='flex max-h-[85vh] flex-col sm:max-w-4xl'>
        <DialogHeader>
          <DialogTitle>
            {$t('keywordSuggestions.notPickedTitle', {
              0: items?.length ?? '…',
            })}
          </DialogTitle>
        </DialogHeader>
        {error ? (
          <p className='nr-error' role='alert'>
            {error}
          </p>
        ) : !items ? (
          <p
            role='status'
            className='flex items-center gap-2 py-6 text-sm text-muted-foreground'
          >
            <LoaderCircle className='size-4 animate-spin' />
            {$t('common.loading')}
          </p>
        ) : (
          <>
            <Segmented
              label={$t('keywordSuggestions.notPickedFilter')}
              value={filter}
              onChange={setFilter}
              options={[
                {
                  id: 'all',
                  label: `${$t('keywordSuggestions.allTab')} ${items.length}`,
                },
                ...counts.map(([reason, n]) => ({
                  id: reason,
                  label: `${$t(`keywordSuggestions.notPickedShort.${reason}`)} ${n}`,
                })),
              ]}
            />
            {reasonNote(filter, selection) ? (
              <p
                className='-mt-1 text-xs text-muted-foreground'
                data-not-picked-note
              >
                {reasonNote(filter, selection)}
              </p>
            ) : null}
            <div className='min-h-0 flex-1 overflow-auto rounded-lg border'>
              <table className='w-full text-sm'>
                <thead className='sticky top-0 bg-muted/60 text-left text-xs whitespace-nowrap text-muted-foreground backdrop-blur'>
                  <tr>
                    <th className='min-w-64 px-3 py-2 font-medium'>
                      {$t('common.keywords')}
                    </th>
                    <th className='px-3 py-2 text-right font-medium'>
                      {$t('common.monthlyVolume')}
                    </th>
                    <th className='px-3 py-2 text-right font-medium'>
                      {$t('common.difficulty')}
                    </th>
                    <th className='px-3 py-2 font-medium'>
                      {$t('keywordSuggestions.notPickedWhy')}
                    </th>
                    <th className='px-3 py-2' />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.keyword} className='border-t'>
                      <td className='px-3 py-2'>{c.keyword}</td>
                      <td className='px-3 py-2 text-right whitespace-nowrap tabular-nums'>
                        {metric(c.volume)}
                      </td>
                      <td className='px-3 py-2 text-right'>
                        <ScoreBadge value={c.difficulty} />
                      </td>
                      <td className='px-3 py-2 whitespace-nowrap text-muted-foreground'>
                        {rowReason(c)}
                      </td>
                      <td className='px-3 py-2 text-right'>
                        {canAdd ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              disabled={Boolean(busy)}
                              render={
                                <Button
                                  variant='link'
                                  size='xs'
                                  className='whitespace-nowrap'
                                />
                              }
                            >
                              {busy === c.keyword ? (
                                <LoaderCircle className='animate-spin' />
                              ) : null}
                              {$t('keywordSuggestions.addToSuggestions')}
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align='end'
                              className='w-auto min-w-44'
                            >
                              <DropdownMenuGroup>
                                <DropdownMenuLabel>
                                  {$t('keywordSuggestions.addToWhichGroup')}
                                </DropdownMenuLabel>
                                {groups.map((g) => (
                                  <DropdownMenuItem
                                    key={g.id}
                                    onClick={() => void add(c, g)}
                                  >
                                    {g.name}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** The summary's right side: when the list was found, or the direction a group was expanded in and when. */
export function summaryWhen(at: string, expanded?: string) {
  return expanded
    ? $t('keywordSuggestions.expandedIn', { 0: expanded, 1: formatDate(at) })
    : $t('keywordSuggestions.updatedAt', { 0: formatDate(at) });
}
