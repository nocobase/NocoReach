import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from '#i18n';
// Keywords › AI suggestions › Market trends (2026-10-16): the hot topics of the product's category, each with keywords
// worth writing for and why they are hot, in numbers the server fills in from DataForSEO, Google Trends and GitHub
// (server/nocoreach/keyword-trends.ts). Saving, tracking, handing to the Agent and opening a keyword work as they do
// for the suggestions from the website.
import { useHandOffSource } from '#components/reach/hand-off-slot';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
import { createColumnHelper, type ColumnDef } from '@tanstack/react-table';
import {
  Bookmark,
  LineChart,
  LoaderCircle,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { toast } from '#lib/toast';
import { EmptyState, InlineError, LoadError } from '#components/reach/states';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import { TabsTrigger } from '#components/ui/tabs';
import {
  DataTable,
  makeSelectionColumn,
  useDataTable,
  useSelectionAnchor,
} from '#components/seo/data-table';
import { DataTableTabs } from '#components/seo/data-table-toolbar';
import { TableBulkActionButton } from '#components/seo/table-bulk-action-bar';
import { SortableHeader } from '#components/seo/sortable-header';
import { ScoreBadge } from '#components/seo/score-badge';
import { InfoTip } from '#components/reach/info-tip';
import { cn } from '#lib/utils';
import { useProject } from './reach-data';
import { getMarkets, metric, useOpenKeyword } from './keyword-api';
import { KeywordHandOffDialog } from './keyword-hand-off';
import { StartTrackingDialog } from './rank-tracking-tab';
import { HandOffNotice, type HandOffResult } from './strategy/hand-off';
import {
  MAX_SEEDS,
  fromTo,
  growthLabel,
  parseSeeds,
  percent,
  riseLabel,
  trendsRequest as call,
  whyHot,
  type TrendItem,
  type TrendsView,
} from './keyword-trends-model';

const pathOf = (u: string) => {
  try {
    return new URL(u).pathname || '/';
  } catch {
    return u;
  }
};
const right = {
  headerClassName: 'text-right',
  cellClassName: 'text-right tabular-nums',
} as const;
const helper = createColumnHelper<TrendItem>();

export function KeywordTrends({
  switcher,
  onSaved,
}: {
  switcher: ReactNode;
  onSaved: () => void;
}) {
  const { project } = useProject();
  // A project of its own starts from nothing (keyed), so no state is carried over from the last one.
  return project ? (
    <TrendsBody
      key={project.id}
      projectId={project.id}
      switcher={switcher}
      onSaved={onSaved}
    />
  ) : null;
}

function TrendsBody({
  projectId,
  switcher,
  onSaved,
}: {
  projectId: number;
  switcher: ReactNode;
  onSaved: () => void;
}) {
  const navigate = useNavigate();
  const openKeyword = useOpenKeyword();
  const [view, setView] = useState<TrendsView>();
  const [error, setError] = useMessageState('');
  const [busy, setBusy] = useState<'' | 'find' | 'save'>('');
  const [picked, setPicked] = useState('all');
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [dialog, setDialog] = useState<'handoff' | 'track' | 'seeds'>();
  const [handOff, setHandOff] = useState<HandOffResult>();
  const anchorRef = useSelectionAnchor();
  // A topic that is gone after finding again falls back to all.
  const topic =
    picked !== 'all' && view?.topics.some((t) => t.id === picked)
      ? picked
      : 'all';
  const run = useCallback(
    async (body: object = {}) => {
      setBusy('find');
      setError('');
      try {
        setView(await call<TrendsView>(projectId, 'find', body));
        setRowSelection({});
      } catch (e) {
        setError(() =>
          e instanceof Error
            ? $legacyText(e.message)
            : $t('keywordTrends.notComplete'),
        );
      } finally {
        setBusy('');
      }
    },
    [projectId, setError],
  );
  // The first time: nothing found yet, so look right away when DataForSEO is connected.
  useEffect(() => {
    void call<TrendsView>(projectId, 'view')
      .then((v) => {
        setView(v);
        if (!v.items.length && v.dataforseo) void run();
      })
      .catch((e: unknown) =>
        setError(() =>
          e instanceof Error
            ? $legacyText(e.message)
            : $t('keywordSuggestions.notLoad'),
        ),
      );
  }, [projectId, run, setError]);
  const topicName = useMemo(
    () => new Map((view?.topics ?? []).map((t) => [t.id, t.name])),
    [view],
  );
  const rows = useMemo(
    () =>
      (view?.items ?? []).filter((i) => topic === 'all' || i.topicId === topic),
    [view, topic],
  );
  const columns = useMemo<ColumnDef<TrendItem>[]>(
    () => [
      makeSelectionColumn<TrendItem>(anchorRef),
      helper.accessor('keyword', {
        header: ({ column }) => (
          <SortableHeader column={column} label={$t('common.keywords')} />
        ),
        cell: ({ row }) => (
          <div className='max-w-sm min-w-0'>
            <span
              className='block truncate font-medium'
              title={row.original.keyword}
            >
              {row.original.keyword}
            </span>
            <span
              className='block truncate text-xs text-muted-foreground'
              title={row.original.reason}
            >
              {topic === 'all'
                ? [topicName.get(row.original.topicId), row.original.reason]
                    .filter(Boolean)
                    .join(' · ')
                : row.original.reason}
            </span>
          </div>
        ),
      }) as ColumnDef<TrendItem>,
      helper.accessor((i) => i.growth?.pct ?? i.trends?.rise ?? undefined, {
        id: 'growth',
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('keywordTrends.growth')}
            help={$t('keywordTrends.growthHelp')}
          />
        ),
        cell: ({ row }) => {
          const { growth, trends } = row.original;
          const rise = trends?.rise != null ? riseLabel(trends.rise) : '';
          if (!growth && !rise)
            return <span className='text-muted-foreground'>—</span>;
          return (
            <div className='whitespace-nowrap'>
              <span className='flex items-center gap-1 font-medium'>
                <TrendingUp className='size-3.5 shrink-0' aria-hidden />
                {growth ? growthLabel(growth) : rise}
              </span>
              <span className='block text-xs text-muted-foreground'>
                {growth ? fromTo(growth) || rise : ''}
                {growth && fromTo(growth) && rise ? ` · ${rise}` : ''}
              </span>
            </div>
          );
        },
      }) as ColumnDef<TrendItem>,
      helper.accessor((i) => i.metrics?.volume ?? undefined, {
        id: 'volume',
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('common.monthlyVolume')}
            align='right'
          />
        ),
        cell: ({ row }) => metric(row.original.metrics?.volume),
        meta: right,
      }) as ColumnDef<TrendItem>,
      helper.accessor((i) => i.metrics?.difficulty ?? undefined, {
        id: 'difficulty',
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('common.difficulty')}
            align='right'
          />
        ),
        cell: ({ row }) => (
          <ScoreBadge value={row.original.metrics?.difficulty ?? null} />
        ),
        meta: right,
      }) as ColumnDef<TrendItem>,
      helper.display({
        id: 'site',
        header: () => $t('keywordTrends.onSite'),
        cell: ({ row }) => {
          const { site, page } = row.original;
          if (site)
            return (
              <div
                className='max-w-48 min-w-0 text-xs'
                title={$t('keywordSuggestions.clicksImpressions', {
                  0: site.clicks,
                  1: site.impressions,
                })}
              >
                <span className='block text-sm tabular-nums'>
                  {$t('keywordTrends.rank', { 0: site.position.toFixed(1) })}
                </span>
                <span
                  className='block truncate text-muted-foreground'
                  title={site.page}
                >
                  {pathOf(site.page)}
                </span>
              </div>
            );
          if (page)
            return (
              <div className='max-w-48 min-w-0 text-xs'>
                <span className='block text-sm'>
                  {$t('keywordTrends.relatedPage')}
                </span>
                <span
                  className='block truncate text-muted-foreground'
                  title={page}
                >
                  {pathOf(page)}
                </span>
              </div>
            );
          return (
            <span className='text-xs text-muted-foreground'>
              {$t('keywordTrends.noPageYet')}
            </span>
          );
        },
      }),
    ],
    [anchorRef, topic, topicName],
  );
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    enableRowSelection: true,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (i) => i.id,
  });
  const selected = (view?.items ?? []).filter((i) => rowSelection[i.id]);
  const save = async () => {
    if (!selected.length) return;
    setBusy('save');
    try {
      const r = await call<{ saved: number; skipped: number }>(
        projectId,
        'save',
        { ids: selected.map((i) => i.id) },
      );
      toast.success(() =>
        $t('keywordSuggestions.saved', {
          0: r.saved,
          1: r.skipped
            ? $t('keywordSuggestions.alreadyThere', { 0: r.skipped })
            : '',
        }),
      );
      setRowSelection({});
      onSaved();
    } catch (e) {
      toast.error(() =>
        e instanceof Error ? $legacyText(e.message) : $t('common.notSaved'),
      );
    } finally {
      setBusy('');
    }
  };
  useHandOffSource(
    'keyword-trends',
    view?.items.length
      ? {
          count: selected.length,
          open: () => setDialog('handoff'),
          noun: $t('common.keywordsSelected'),
          actions: (
            <>
              <TableBulkActionButton
                icon={<Bookmark className='size-3.5' />}
                onClick={() => void save()}
              >
                {busy === 'save' ? $t('common.saving') : $t('common.save')}
              </TableBulkActionButton>
              <TableBulkActionButton
                icon={<LineChart className='size-3.5' />}
                onClick={() => setDialog('track')}
              >
                {$t('keywordTrends.trackRank')}
              </TableBulkActionButton>
            </>
          ),
          clear: () => setRowSelection({}),
        }
      : null,
  );
  const toolbar = (controls?: ReactNode) => (
    <div className='flex flex-wrap items-center justify-between gap-2'>
      {switcher}
      {controls}
    </div>
  );
  if (view && !view.dataforseo && !view.items.length)
    return (
      <>
        {toolbar()}
        <EmptyState
          icon={<TrendingUp />}
          title={$t('keywordTrends.needsDataforseo')}
          description={$t('keywordTrends.needsDataforseoDescription')}
          action={
            <Button
              onClick={() => void navigate('/connections?source=keywords')}
            >
              {$t('common.openConnections')}
            </Button>
          }
        />
      </>
    );
  if (error && !view?.items.length)
    return (
      <>
        {toolbar()}
        <LoadError
          title={$t('keywordTrends.notComplete')}
          message={error}
          onRetry={
            view?.dataforseo ? () => void run({ force: true }) : undefined
          }
        />
      </>
    );
  if (!view || (busy === 'find' && !view.items.length))
    return (
      <>
        {toolbar()}
        <Card className='px-4'>
          <p
            role='status'
            className='flex items-center gap-2 py-6 text-sm text-muted-foreground'
          >
            <LoaderCircle className='size-4 animate-spin' />
            {$t('keywordTrends.finding')}
          </p>
        </Card>
      </>
    );
  const b = view.basis;
  const sources = [
    b?.rising ? $t('keywordTrends.basisTrends', { 0: b.rising }) : '',
    b?.github ? $t('keywordTrends.basisGithub', { 0: b.github }) : '',
  ].filter(Boolean);
  return (
    <>
      {toolbar(
        <div className='flex flex-wrap items-center gap-2'>
          <select
            aria-label={$t('keywordSuggestions.targetMarket')}
            className='h-8 rounded-md border bg-background px-2 text-sm'
            value={`${view.market.locationCode}|${view.market.language}`}
            disabled={Boolean(busy)}
            onChange={(e) => {
              const [loc, lang] = e.target.value.split('|');
              void run({
                market: { locationCode: Number(loc), language: lang },
              });
            }}
          >
            {getMarkets().map((m) => (
              <option
                key={`${m.locationCode}|${m.language}`}
                value={`${m.locationCode}|${m.language}`}
              >
                {$t(m.label)}
              </option>
            ))}
          </select>
          <Button
            size='sm'
            variant='outline'
            disabled={Boolean(busy)}
            onClick={() => void run({ force: true })}
          >
            <RefreshCw
              data-icon='inline-start'
              className={cn(busy === 'find' && 'animate-spin')}
            />
            {busy === 'find'
              ? $t('keywordTrends.findingAgain')
              : $t('keywordTrends.findAgain')}
          </Button>
        </div>,
      )}
      <HandOffNotice result={handOff} />
      <p
        className='nr-footnote flex flex-wrap items-center gap-x-1'
        data-trends-basis
      >
        <span>
          {$t('keywordTrends.basis', { 0: view.seeds.join(' · ') })}
          {sources.length
            ? $t('keywordTrends.basisAlso', {
                0: sources.join($t('keywordTrends.listSeparator')),
              })
            : ''}
          {view.at
            ? ` · ${new Date(view.at).toLocaleDateString(getCurrentLocale())}`
            : ''}
        </span>
        <InfoTip label={$t('keywordTrends.howItWorks')}>
          {$t('keywordTrends.howItWorksBody')}
        </InfoTip>
        <button
          type='button'
          className='nr-link'
          disabled={Boolean(busy)}
          onClick={() => setDialog('seeds')}
        >
          {$t('keywordTrends.editSeeds')}
        </button>
      </p>
      {error ? (
        <InlineError>{error}</InlineError>
      ) : view.partial ? (
        <InlineError>
          {$t('keywordTrends.partial', { 0: $legacyText(view.partial) })}
        </InlineError>
      ) : null}
      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-3' data-topics>
        {view.topics.map((t) => (
          <button
            key={t.id}
            type='button'
            aria-pressed={topic === t.id}
            onClick={() => {
              setPicked(topic === t.id ? 'all' : t.id);
              setRowSelection({});
            }}
            className='flex flex-col gap-1.5 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:border-primary'
          >
            <span className='flex items-baseline justify-between gap-2'>
              <span className='font-medium'>{t.name}</span>
              <span className='shrink-0 text-xs text-muted-foreground'>
                {$t('keywordTrends.keywordCount', { 0: t.count })}
              </span>
            </span>
            {t.why ? (
              <span className='text-sm text-muted-foreground'>{t.why}</span>
            ) : null}
            <span className='flex flex-wrap gap-1'>
              {t.fastest != null ? (
                <Badge variant='outline'>
                  {$t('keywordTrends.fastest', { 0: percent(t.fastest) })}
                </Badge>
              ) : null}
              {t.volume ? (
                <Badge variant='outline'>
                  {$t('keywordTrends.combinedVolume', { 0: metric(t.volume) })}
                </Badge>
              ) : null}
              {t.rise != null ? (
                <Badge variant='outline'>{riseLabel(t.rise)}</Badge>
              ) : null}
              {t.github ? (
                <Badge
                  variant='outline'
                  title={$t('keywordTrends.githubDetail', {
                    0: t.github.topic,
                    1: metric(t.github.lastWeek),
                    2: metric(t.github.priorAverage),
                  })}
                >
                  {$t('keywordTrends.githubTopic', {
                    0: t.github.topic,
                    1: t.github.priorAverage
                      ? `${(t.github.lastWeek / t.github.priorAverage).toFixed(1)}×`
                      : metric(t.github.lastWeek),
                  })}
                </Badge>
              ) : null}
            </span>
          </button>
        ))}
      </div>
      <Card className='gap-0 py-0'>
        <DataTableTabs
          value={topic}
          onValueChange={(v) => {
            setPicked(v);
            setRowSelection({});
          }}
        >
          <TabsTrigger value='all'>
            {$tj('common.allCount', { 0: view.items.length })}
          </TabsTrigger>
          {view.topics.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.name} ({t.count})
            </TabsTrigger>
          ))}
        </DataTableTabs>
        <DataTable
          table={table}
          empty={{ title: $t('keywordSuggestions.noSuggestionsGroup') }}
          onRowClick={(row, e) => {
            if ((e.target as HTMLElement).closest('button,[role=checkbox],a'))
              return;
            openKeyword(row.original.keyword, view.market);
          }}
        />
      </Card>
      {dialog === 'seeds' ? (
        <SeedsDialog
          seeds={view.seeds}
          onClose={() => setDialog(undefined)}
          onSubmit={(seeds) => {
            setDialog(undefined);
            void run({ seeds });
          }}
        />
      ) : null}
      {dialog === 'track' && selected.length ? (
        <StartTrackingDialog
          keywords={selected.map((i) => ({
            keyword: i.keyword,
            market: view.market,
          }))}
          onClose={() => setDialog(undefined)}
          onDone={() => {
            setDialog(undefined);
            setRowSelection({});
          }}
        />
      ) : null}
      {dialog === 'handoff' && selected.length ? (
        <KeywordHandOffDialog
          projectId={projectId}
          rows={selected.map((i) => ({
            keyword: i.keyword,
            market: view.market,
            volume: i.metrics?.volume ?? null,
            difficulty: i.metrics?.difficulty ?? null,
            intent: i.metrics?.intent ?? null,
            why: whyHot(i, topicName.get(i.topicId)),
            ...(i.site ? { rank: i.site } : {}),
          }))}
          onClose={() => setDialog(undefined)}
          onDone={(r) => {
            setDialog(undefined);
            setRowSelection({});
            setHandOff({ ok: true, text: r.title, taskId: r.taskId });
          }}
        />
      ) : null}
    </>
  );
}

// The category terms the lookups start from; finding again with them reuses the month's lookups.
function SeedsDialog({
  seeds,
  onClose,
  onSubmit,
}: {
  seeds: string[];
  onClose: () => void;
  onSubmit: (seeds: string[]) => void;
}) {
  const [text, setText] = useState(seeds.join(', '));
  const [tried, setTried] = useState(false);
  const parsed = parseSeeds(text);
  const invalid = tried && !parsed;
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className='sm:max-w-md'>
        <form
          className='flex flex-col gap-4'
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (parsed) onSubmit(parsed);
            else document.getElementById('kt-seeds')?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>{$t('keywordTrends.editSeedsTitle')}</DialogTitle>
            <DialogDescription>
              {$t('keywordTrends.editSeedsDescription')}
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={invalid}>
            <FieldLabel htmlFor='kt-seeds'>
              {$t('keywordTrends.seeds')}
            </FieldLabel>
            <Input
              id='kt-seeds'
              value={text}
              aria-invalid={invalid}
              aria-describedby='kt-seeds-help kt-seeds-error'
              placeholder='no code, ai agent, internal tool'
              onChange={(e) => setText(e.target.value)}
            />
            <FieldDescription id='kt-seeds-help'>
              {$t('keywordTrends.seedsHelp', { 0: MAX_SEEDS })}
            </FieldDescription>
            <FieldError
              id='kt-seeds-error'
              errors={
                invalid
                  ? [
                      {
                        message: $t('keywordTrends.seedsInvalid', {
                          0: MAX_SEEDS,
                        }),
                      },
                    ]
                  : []
              }
            />
          </Field>
          <DialogFooter>
            <Button type='button' variant='outline' onClick={onClose}>
              {$t('common.cancel')}
            </Button>
            <Button type='submit'>{$t('keywordTrends.findAgain')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
