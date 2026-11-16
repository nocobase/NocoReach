import { useState, type ReactElement } from 'react';
import { Loader2 } from 'lucide-react';
import { $t, $legacyText, useMessageState } from '#i18n';
import { InfoTip } from '#components/reach/info-tip';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '#components/ui/dialog';
import { useBusinessAccess } from '#hooks/use-business-access';
import { MARKETS_MAX } from '../../../shared/growth-markets.js';
import { call, type GrowthSourcesView } from './growth-sources-data';
import type { Rule } from './types';

// What Analysis rules shows under the rules that read the step 2b data (2026-11-10, server/nocoreach/growth-sources.ts):
// a paid rule's monthly cost, the markets Other-language markets looks at (the AI's or the team's, changed in a dialog)
// and whether GA4 records site search for Site search with no results.

/** "Up to about $0.45 a month, counted toward the DataForSEO monthly budget." */
export function RuleCost({ rule }: { rule: Rule }): ReactElement | null {
  if (!rule.costUsd) return null;
  return (
    <span data-cost={rule.costUsd}>
      {$t('analysisRules.monthlyCost', {
        0: `$${rule.costUsd.toFixed(2)}`,
      })}
    </span>
  );
}

/** Under Other-language markets: the markets looked at, and Change for those who may edit them. */
export function MarketsLine({
  projectId,
  view,
  onSaved,
}: {
  projectId: number;
  view: GrowthSourcesView;
  onSaved: (v: GrowthSourcesView) => void;
}): ReactElement {
  const { can } = useBusinessAccess('nrGrowthSources.setMarkets', projectId);
  const [open, setOpen] = useState(false);
  const list = view.markets.list;
  return (
    <div
      className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'
      data-markets={list.join(',')}
    >
      <span className='text-muted-foreground'>
        {$t('growthSources.markets')}
      </span>
      <span className='font-medium'>
        {list.length
          ? list.map((m) => $t(`growthMarket.${m}`)).join(' · ')
          : $t('growthSources.marketsPending')}
      </span>
      {list.length ? (
        <span className='text-xs text-muted-foreground'>
          {$t(
            view.markets.by === 'person'
              ? 'growthSources.marketsByPerson'
              : 'growthSources.marketsByAi',
          )}
        </span>
      ) : null}
      {can ? (
        <Button variant='ghost' size='sm' onClick={() => setOpen(true)}>
          {$t('common.modify')}
        </Button>
      ) : null}
      {open ? (
        <MarketsDialog
          projectId={projectId}
          view={view}
          onClose={() => setOpen(false)}
          onSaved={(v) => {
            setOpen(false);
            onSaved(v);
          }}
        />
      ) : null}
    </div>
  );
}

function MarketsDialog({
  projectId,
  view,
  onClose,
  onSaved,
}: {
  projectId: number;
  view: GrowthSourcesView;
  onClose: () => void;
  onSaved: (v: GrowthSourcesView) => void;
}): ReactElement {
  const [picked, setPicked] = useState<string[]>(view.markets.list);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState('');
  const save = async (markets: string[]) => {
    setBusy(true);
    try {
      onSaved(
        await call<GrowthSourcesView>('setMarkets', projectId, { markets }),
      );
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('growthSources.notSaved'),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(o) => {
        if (!o && !busy) onClose();
      }}
    >
      <DialogContent className='flex flex-col sm:max-w-lg'>
        <DialogTitle>{$t('growthSources.marketsTitle')}</DialogTitle>
        <DialogDescription>
          {$t('growthSources.marketsHelp', { 0: MARKETS_MAX })}
        </DialogDescription>
        <div className='grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3'>
          {view.markets.options.map((m) => {
            const on = picked.includes(m);
            return (
              <label
                key={m}
                className='flex items-center gap-2 text-sm'
                data-market={m}
              >
                <Checkbox
                  checked={on}
                  disabled={busy || (!on && picked.length >= MARKETS_MAX)}
                  onCheckedChange={(next) =>
                    setPicked((list) =>
                      next
                        ? view.markets.options.filter(
                            (x) => x === m || list.includes(x),
                          )
                        : list.filter((x) => x !== m),
                    )
                  }
                />
                {$t(`growthMarket.${m}`)}
              </label>
            );
          })}
        </div>
        <p className='text-xs text-muted-foreground'>
          {$t('growthSources.marketsCount', {
            0: picked.length,
            1: MARKETS_MAX,
          })}
        </p>
        {error ? (
          <p role='alert' className='text-sm text-destructive'>
            {error}
          </p>
        ) : null}
        <div className='flex flex-wrap justify-end gap-2'>
          <Button
            variant='ghost'
            className='mr-auto'
            disabled={busy}
            onClick={() => void save([])}
          >
            {$t('growthSources.marketsLetAi')}
          </Button>
          <Button variant='outline' disabled={busy} onClick={onClose}>
            {$t('common.cancel')}
          </Button>
          <Button
            disabled={busy || !picked.length}
            onClick={() => void save(picked)}
          >
            {busy ? <Loader2 className='size-4 animate-spin' /> : null}
            {$t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Under Site search with no results: whether GA4 records site search, and how to turn it on when it does not. */
export function SiteSearchLine({
  view,
}: {
  view: GrowthSourcesView;
}): ReactElement | null {
  const s = view.siteSearch;
  if (!s) return null;
  if (s.status === 'ok')
    return (
      <p className='text-xs text-muted-foreground' data-site-search='ok'>
        {$t('growthSources.siteSearchTerms', { 0: s.terms })}
      </p>
    );
  if (s.status !== 'not-enabled') return null;
  return (
    <p
      className='flex items-center gap-1 text-xs text-muted-foreground'
      data-site-search='not-enabled'
    >
      {$t('growthSources.siteSearchOff')}
      <InfoTip label={$t('growthSources.siteSearchHowLabel')}>
        <ol className='list-decimal space-y-1 pl-4'>
          <li>{$t('growthSources.siteSearchHow1')}</li>
          <li>{$t('growthSources.siteSearchHow2')}</li>
          <li>{$t('growthSources.siteSearchHow3')}</li>
        </ol>
      </InfoTip>
    </p>
  );
}
