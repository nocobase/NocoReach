import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { $t, $legacyText, useMessageState } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { cn } from '#lib/utils';
import { chipClass } from '#components/reach/chip';
import { Button } from '#components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { usdUpTo } from './keyword-api';

type Market = { locationCode: number; language: string };
type Estimate = {
  maxUsd: number;
  reused: number;
  monthUsd: number;
  budgetUsd: number;
};
const MAX_SEEDS = 15;
const clean = (text: string) =>
  text.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
const call = <T,>(projectId: number, action: string, body: object) =>
  api.action<T>('nrKeywordSuggest', action, {
    method: 'POST',
    body: { projectId, ...body },
    unwrap: 'data',
  });

/**
 * Edit seed words (2026-10-28, mockup ui-references/keywords-2026-10-28/manual-edit.png): the seeds as tags, × to
 * remove one (struck through, a click puts it back) and Enter to add one. Save only keeps them for the next re-find;
 * Save and find again runs one now, its most possible cost and this month's spending read from the same estimate as the
 * chat's lookup card. Only that button spends money. Choosing seeds with the AI stays in the chat.
 */
export function EditSeedsDialog({
  projectId,
  seeds,
  market,
  onClose,
  onSaveOnly,
  onFind,
}: {
  projectId: number;
  seeds: string[];
  market: Market;
  onClose: () => void;
  onSaveOnly: (seeds: string[]) => Promise<boolean>;
  onFind: (seeds: string[]) => Promise<boolean>;
}) {
  const [removed, setRemoved] = useState<string[]>([]),
    [added, setAdded] = useState<string[]>([]),
    [text, setText] = useState(''),
    [estimate, setEstimate] = useState<Estimate>(),
    [busy, setBusy] = useState<'' | 'save' | 'find'>(''),
    [error, setError] = useMessageState('');
  const next = [...seeds.filter((s) => !removed.includes(s)), ...added];
  const key = next.join('\n');
  const askedRef = useRef(0);
  useEffect(() => {
    if (!next.length) return;
    const n = ++askedRef.current;
    const timer = setTimeout(
      () =>
        void call<Estimate>(projectId, 'estimate', {
          seeds: next,
          market,
        }).then(
          (e) => {
            if (n === askedRef.current) setEstimate(e);
          },
          () => undefined,
        ),
      250,
    );
    return () => clearTimeout(timer);
  }, [key]);
  const add = () => {
    const seed = clean(text);
    setText('');
    if (seed.length < 2 || next.length >= MAX_SEEDS) return;
    if (removed.includes(seed))
      return setRemoved((r) => r.filter((x) => x !== seed));
    if (!seeds.includes(seed) && !added.includes(seed))
      setAdded((a) => [...a, seed]);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    } else if (e.key === 'Backspace' && !text && added.length) {
      setAdded((a) => a.slice(0, -1));
    }
  };
  const over = estimate
    ? estimate.monthUsd + estimate.maxUsd > estimate.budgetUsd
    : false;
  const changed = removed.length > 0 || added.length > 0;
  const run = async (mode: 'save' | 'find') => {
    setBusy(mode);
    setError('');
    try {
      if (await (mode === 'save' ? onSaveOnly(next) : onFind(next))) onClose();
    } catch (e) {
      setError(() =>
        e instanceof Error ? $legacyText(e.message) : $t('common.notSaved'),
      );
    } finally {
      setBusy('');
    }
  };
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className='sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>{$t('keywordSuggestions.editSeedsTitle')}</DialogTitle>
          <DialogDescription>
            {$t('keywordSuggestions.editSeedsDescription')}
          </DialogDescription>
        </DialogHeader>
        <div
          className='flex flex-wrap items-center gap-2 rounded-lg border p-2.5'
          data-seed-editor
        >
          {seeds.map((seed) =>
            removed.includes(seed) ? (
              <button
                key={seed}
                type='button'
                className={cn(
                  chipClass,
                  'cursor-pointer text-muted-foreground line-through',
                )}
                title={$t('keywordSuggestions.putSeedBack')}
                onClick={() => setRemoved((r) => r.filter((x) => x !== seed))}
              >
                {seed}
              </button>
            ) : (
              <span key={seed} className={chipClass}>
                {seed}
                <button
                  type='button'
                  className='text-muted-foreground hover:text-foreground'
                  aria-label={$t('keywordSuggestions.removeSeed', { 0: seed })}
                  onClick={() => setRemoved((r) => [...r, seed])}
                >
                  <X className='size-3' />
                </button>
              </span>
            ),
          )}
          {added.map((seed) => (
            <span
              key={seed}
              className={cn(
                chipClass,
                'border-primary/40 bg-primary/10 text-primary',
              )}
            >
              {seed}
              <button
                type='button'
                aria-label={$t('keywordSuggestions.removeSeed', { 0: seed })}
                onClick={() => setAdded((a) => a.filter((x) => x !== seed))}
              >
                <X className='size-3' />
              </button>
            </span>
          ))}
          <input
            value={text}
            maxLength={80}
            disabled={next.length >= MAX_SEEDS}
            placeholder={$t('keywordSuggestions.addSeedPlaceholder')}
            aria-label={$t('keywordSuggestions.addSeedPlaceholder')}
            className='min-w-40 flex-1 bg-transparent px-1 py-0.5 text-sm outline-none placeholder:text-muted-foreground'
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onBlur={() => text.trim() && add()}
          />
        </div>
        <p className='text-xs text-muted-foreground' data-seed-editor-hint>
          {changed
            ? $t('keywordSuggestions.seedsChangeHint', {
                0: removed.length,
                1: added.length,
              })
            : $t('keywordSuggestions.seedsNoChange')}
          {estimate
            ? ` ${$t('keywordSuggestions.seedsMonth', { 0: estimate.monthUsd.toFixed(2), 1: estimate.budgetUsd.toFixed(2) })}`
            : ''}
        </p>
        {over && estimate ? (
          <p className='nr-error' role='alert'>
            {$t('keywordSuggest.budgetTooLow', {
              0: Math.max(0, estimate.budgetUsd - estimate.monthUsd).toFixed(2),
              1: usdUpTo(estimate.maxUsd),
            })}
          </p>
        ) : null}
        {error ? (
          <p className='nr-error' role='alert'>
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant='outline' onClick={onClose}>
            {$t('common.cancel')}
          </Button>
          <Button
            variant='outline'
            disabled={!next.length || !changed || Boolean(busy)}
            onClick={() => void run('save')}
          >
            {$t('keywordSuggestions.saveSeedsOnly')}
          </Button>
          <Button
            disabled={!next.length || !estimate || over || Boolean(busy)}
            onClick={() => void run('find')}
          >
            {estimate
              ? $t('keywordSuggestions.saveAndFind', {
                  0: usdUpTo(estimate.maxUsd),
                })
              : $t('keywordSuggestions.saveAndFindPlain')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
