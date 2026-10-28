import { useState } from 'react';
import { Check, ChevronDown, Pencil } from 'lucide-react';
import { $t, getCurrentLocale } from '#i18n';
import { cn } from '#lib/utils';
import { chipClass, chipButtonClass } from '#components/reach/chip';
import { Button } from '#components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { PageAiEntry } from '../online-agent/page-entry';
import { getMarkets, marketLabel } from './keyword-api';

type Market = { locationCode: number; language: string };
export type SeedStat = { seed: string; found: number; picked: number };
export type SeedNote = { seed: string; from: string[]; why: string };
const SOURCES: Record<string, string> = {
  memory: 'keywordSuggestions.seedSource.memory',
  searchConsole: 'keywordSuggestions.seedSource.searchConsole',
  competitors: 'keywordSuggestions.seedSource.competitors',
  direction: 'keywordSuggestions.seedSource.direction',
  person: 'keywordSuggestions.seedSource.person',
};
const sameMarket = (a: Market, b: Market) =>
  a.locationCode === b.locationCode && a.language === b.language;

/**
 * Keywords › AI suggestions' query bar (2026-10-28 user decision, after Google Keyword Planner, Semrush and Ahrefs):
 * the seed words and the market fixed at the top like a search box, instead of a sentence of AI output. Each seed
 * shows how many of its keywords were picked, the most first, a seed with none greyed; clicking one says where it
 * came from, why, and what it found, filters the list to its keywords or removes it for the next re-find. On the
 * right: the market, Edit seed words and the one AI entry, which opens the chat on this page.
 */
export function KeywordQueryBar({
  seeds,
  stats,
  notes,
  market,
  pending,
  missed,
  canEdit,
  running,
  onMarket,
  onEdit,
  onOnly,
  onRemove,
}: {
  seeds: string[];
  stats: SeedStat[];
  notes: SeedNote[];
  market: Market;
  /** The seeds were changed for the next re-find; the list still comes from the earlier ones. */
  pending: boolean;
  missed: string[];
  canEdit: boolean;
  running: boolean;
  onMarket: (market: Market) => void;
  onEdit: () => void;
  onOnly: (seed: string) => void;
  onRemove: (seed: string) => Promise<boolean>;
}) {
  const statOf = new Map(stats.map((s) => [s.seed, s]));
  // The most picked first; a seed not looked up yet (added for the next re-find) last.
  const sorted = seeds
    .map((seed, i) => ({ seed, i, stat: statOf.get(seed) }))
    .sort(
      (a, b) => (b.stat?.picked ?? -1) - (a.stat?.picked ?? -1) || a.i - b.i,
    );
  const join = getCurrentLocale().startsWith('zh') ? '、' : ', ';
  return (
    <section
      className='flex flex-col gap-2 rounded-xl border bg-card p-4 text-card-foreground'
      aria-label={$t('keywordSuggestions.seedsTitle')}
      data-query-bar
    >
      <div className='flex flex-wrap items-start gap-x-4 gap-y-3'>
        <div className='w-24 shrink-0 pt-0.5'>
          <p className='text-sm'>
            {$t('keywordSuggestions.seedsLabel', { 0: seeds.length })}
          </p>
          <p className='text-xs text-muted-foreground'>
            {$t('keywordSuggestions.seedsCountHint')}
          </p>
        </div>
        <ul className='flex min-w-0 flex-1 flex-wrap gap-1.5'>
          {sorted.map(({ seed, stat }) => (
            <li key={seed}>
              <SeedChip
                seed={seed}
                stat={stat}
                note={notes.find((n) => n.seed === seed)}
                canRemove={canEdit && !running && seeds.length > 1}
                onOnly={onOnly}
                onRemove={onRemove}
              />
            </li>
          ))}
        </ul>
        <div className='flex shrink-0 flex-wrap items-center gap-2'>
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={!canEdit || running}
              render={<Button variant='outline' size='sm' />}
            >
              {$t(marketLabel(market))}
              <ChevronDown data-icon='inline-end' />
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-auto min-w-48'>
              {getMarkets().map((m) => (
                <DropdownMenuItem
                  key={`${m.locationCode}:${m.language}`}
                  onClick={() => {
                    if (!sameMarket(m, market))
                      onMarket({
                        locationCode: m.locationCode,
                        language: m.language,
                      });
                  }}
                >
                  <span className='flex-1'>{m.label}</span>
                  {sameMarket(m, market) ? <Check className='size-4' /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {canEdit ? (
            <Button
              variant='outline'
              size='sm'
              disabled={running}
              onClick={onEdit}
            >
              <Pencil data-icon='inline-start' />
              {$t('keywordSuggestions.editSeeds')}
            </Button>
          ) : null}
          <PageAiEntry
            variant='outline'
            size='sm'
            subject={{ kind: 'page', page: 'keywords' }}
            label={$t('keywordSuggestions.findWithAi')}
            description={$t('keywordSuggestions.aiEntryDescription')}
            presets={[
              $t('keywordSuggestions.presetHowSeeds'),
              $t('keywordSuggestions.presetAddRemoveSeeds'),
              $t('keywordSuggestions.presetExpand'),
              $t('keywordSuggestions.presetWhyNotPicked'),
            ]}
          />
        </div>
      </div>
      {pending ? (
        <p className='text-xs text-muted-foreground'>
          {$t('keywordSuggestions.seedsPending')}
        </p>
      ) : null}
      {missed.length ? (
        <p className='text-xs text-muted-foreground'>
          {$t('keywordSuggestions.missedSeeds', { 0: missed.join(join) })}
        </p>
      ) : null}
    </section>
  );
}

/** One seed word and what it brought: where it came from, why, found and picked, and the two things to do with it. */
function SeedChip({
  seed,
  stat,
  note,
  canRemove,
  onOnly,
  onRemove,
}: {
  seed: string;
  stat?: SeedStat;
  note?: SeedNote;
  canRemove: boolean;
  onOnly: (seed: string) => void;
  onRemove: (seed: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false);
  const none = stat?.picked === 0;
  const from = (note?.from ?? []).filter((f) => SOURCES[f]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type='button'
            className={cn(
              chipClass,
              chipButtonClass,
              none && 'text-muted-foreground',
            )}
            data-seed={seed}
          />
        }
      >
        {seed}
        {stat ? (
          <span
            className={cn(
              'text-muted-foreground tabular-nums',
              none && 'opacity-60',
            )}
          >
            {stat.picked}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align='start' className='w-80 gap-2 p-4'>
        <p className='font-medium'>{seed}</p>
        {from.length ? (
          <p className='text-xs text-muted-foreground'>
            {$t('keywordSuggestions.seedFrom', {
              0: from.map((f) => $t(SOURCES[f])).join(' · '),
            })}
          </p>
        ) : null}
        {note?.why ? <p>{note.why}</p> : null}
        <p className='border-t pt-2'>
          {stat
            ? $t('keywordSuggestions.seedFound', {
                0: stat.found,
                1: stat.picked,
              })
            : $t('keywordSuggestions.seedNotLookedUp')}
          {stat?.picked ? (
            <>
              {' · '}
              <button
                type='button'
                className='nr-link'
                onClick={() => {
                  setOpen(false);
                  onOnly(seed);
                }}
              >
                {$t('keywordSuggestions.seedOnly', { 0: stat.picked })}
              </button>
            </>
          ) : null}
        </p>
        {canRemove ? (
          <div>
            <Button
              variant='outline'
              size='sm'
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onRemove(seed).then((ok) => {
                  setBusy(false);
                  if (ok) setOpen(false);
                });
              }}
            >
              {$t('keywordSuggestions.removeThisSeed')}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
