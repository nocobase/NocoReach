import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from '#i18n';
// Search & market › Backlinks: after every-app/open-seo db8bde1 src/client/features/backlinks/ (BacklinksPage,
// BacklinksSearchCard, BacklinksOverviewPanels, BacklinksPageCharts, BacklinksTable, ReferringDomainsTable,
// TopPagesTable; MIT). Changes: one paid query per view through NocoReach's DataForSEO layer (Look up reads the summary
// and the last 12 months; each tab is read only when asked for, its first 100 rows sorted and filtered here instead of
// one query per table page), Hide spam filters the rows already read, a site or one page (no subfolder scope), no
// search tabs, CSV export of the rows on screen. Added here: Link gap (sites linking to competitors but not to us) and
// Hand off to agent from it and from a competitor's referring domains, with the Link building playbook.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  createColumnHelper,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, History, Link2, Plus, Search, X } from 'lucide-react';
import { toast } from '#lib/toast';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { EmptyState, ListSkeleton } from '#components/reach/states';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Switch } from '#components/ui/switch';
import { Badge } from '#components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import {
  DataTable,
  makeSelectionColumn,
  useDataTable,
  useSelectionAnchor,
} from '#components/seo/data-table';
import {
  DataTableFilterGroup,
  DataTableFilterPanel,
  DataTableFilterToggle,
  DataTableTabs,
  DataTableToolbar,
} from '#components/seo/data-table-toolbar';
import { TablePagination } from '#components/seo/table-pagination';
import { SortableHeader } from '#components/seo/sortable-header';
import { StatTile } from '#components/seo/stat-tile';
import { downloadCsv, type CsvValue } from '#components/seo/csv';
import { InfoTip } from '#components/reach/info-tip';
import { PageContainer, PageHeader } from '#components/reach/page';
import { useHandOffSource } from '#components/reach/hand-off-slot';
import { usePageTab } from '#hooks/use-page-tab';
import { HandOffBar } from './hand-off-bar';
import { DraftHandOffDialog, type TaskDraft } from './keyword-hand-off';
import { HandOffNotice, type HandOffResult } from './strategy/hand-off';
import { linkProspectsDraft } from './seo-hand-off';
import { formatCount, formatDateTime } from '#lib/format';
import { useProject } from './reach-data';
import { bare } from './domain-overview';
import { GAP_COMPETITORS, SPAM_THRESHOLD } from '../../shared/backlinks.js';
import './reach-workspace.css';
import './data-views.css';
import { currentProjectId } from './current-project';
import { safeLink } from './analytics';
import {
  keywordRequest,
  metric,
  type KeywordConnectionState,
} from './keyword-api';

type View = 'overview' | 'links' | 'domains' | 'pages';
type Tab = Exclude<View, 'overview'>;
type Spec = {
  kind: 'backlinks';
  view: View | 'gap';
  target: string;
  scope: 'domain' | 'page';
  competitors?: string[];
};
type Summary = {
  rank: number | null;
  backlinks: number | null;
  referringDomains: number | null;
  referringMainDomains: number | null;
  referringPages: number | null;
  nofollowDomains: number | null;
  brokenBacklinks: number | null;
  brokenPages: number | null;
  spam: number | null;
  targetSpam: number | null;
  firstSeen: string | null;
};
type Month = {
  date: string;
  backlinks: number | null;
  referringDomains: number | null;
  rank: number | null;
  newBacklinks: number | null;
  lostBacklinks: number | null;
  newReferringDomains: number | null;
  lostReferringDomains: number | null;
};
type LinkRow = {
  id: string;
  urlFrom: string;
  domainFrom: string;
  urlTo: string;
  anchor: string;
  itemType: string;
  dofollow: boolean | null;
  rank: number | null;
  domainRank: number | null;
  spam: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  isNew: boolean;
  isLost: boolean;
  isBroken: boolean;
};
type DomainRow = {
  id: string;
  domain: string;
  backlinks: number | null;
  referringPages: number | null;
  rank: number | null;
  spam: number | null;
  firstSeen: string | null;
  brokenBacklinks: number | null;
};
type PageRow = {
  id: string;
  url: string;
  backlinks: number | null;
  referringDomains: number | null;
  rank: number | null;
  brokenBacklinks: number | null;
};
type Run<T = unknown> = {
  id: number | string;
  status: string;
  spec: Spec;
  result?: {
    items: T[];
    totalCount: number | null;
    summary?: Summary | null;
    history?: Month[];
    historyError?: string | null;
    perCompetitor?: { domain: string; total: number | null }[];
  };
  errorCode?: string | null;
  createdAt: string;
  completedAt?: string | null;
  reused?: boolean;
};
type Recent = {
  id: string;
  status: string;
  spec: Spec;
  createdAt: string;
  completedAt: string | null;
  count: number | null;
  summary: {
    rank: number | null;
    backlinks: number | null;
    referringDomains: number | null;
  } | null;
};

const call = <T,>(action: string, body: object = {}) =>
  api.action<T>('nrBacklinks', action, {
    method: 'POST',
    body: { projectId: String(currentProjectId()), ...body },
    unwrap: 'data',
  });
const requestKey = () => crypto.randomUUID().replace(/-/g, '');
const right = {
  headerClassName: 'text-right',
  cellClassName: 'text-right tabular-nums',
} as const;
const fmtTime = (v?: string | null) => formatDateTime(v);
const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search || '/';
  } catch {
    return u;
  }
};
// Rows scoring SPAM_THRESHOLD or more are hidden while Hide spam is on.
export { SPAM_THRESHOLD };
// The URL keeps the opened runs (o overview, l links, r referring domains, g top pages), so a reload reopens them
// without a new query; bt is the open tab and t the looked-up target.
const RUN_PARAMS: Record<View, string> = {
  overview: 'o',
  links: 'l',
  domains: 'r',
  pages: 'g',
};
const TABS: Tab[] = ['links', 'domains', 'pages'];
const tabText = (tab: Tab, target: string) =>
  ({
    links: {
      label: $t('backlinks.backlinks'),
      ask: $t('backlinks.askLinks', { 0: target }),
      button: $t('backlinks.lookUpLinks'),
    },
    domains: {
      label: $t('backlinks.referringDomains'),
      ask: $t('backlinks.askDomains', { 0: target }),
      button: $t('backlinks.lookUpDomains'),
    },
    pages: {
      label: $t('backlinks.topPages'),
      ask: $t('backlinks.askPages', { 0: target }),
      button: $t('backlinks.lookUpPages'),
    },
  })[tab];

/** What a failed or uncertain run's error code says, in the reader's language. */
export function backlinksError(code?: string | null): string {
  if (!code) return $t('common.notRunSameLookupAgain');
  if (code === 'backlinks_balance') return $t('backlinks.balanceIssue');
  const provider = /^provider_status_(.+)$/.exec(code);
  if (provider) return $t('backlinks.providerFailed', { 0: provider[1] });
  if (code === 'research_schema_invalid')
    return $t('backlinks.unreadableReply');
  return $legacyText(code);
}

/** Rows left after the filters: Hide spam, Dofollow only, and words a row must or must not contain. */
export function filterRows<
  T extends { spam?: number | null; dofollow?: boolean | null },
>(
  rows: T[],
  f: {
    hideSpam: boolean;
    dofollow?: boolean;
    include?: string;
    exclude?: string;
  },
  text: (r: T) => string,
): T[] {
  const terms = (s = '') =>
    s
      .split(/[,，]/)
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  const inc = terms(f.include),
    exc = terms(f.exclude);
  return rows.filter((r) => {
    if (f.hideSpam && (r.spam ?? 0) >= SPAM_THRESHOLD) return false;
    if (f.dofollow && r.dofollow !== true) return false;
    const t = text(r).toLowerCase();
    return inc.every((x) => t.includes(x)) && !exc.some((x) => t.includes(x));
  });
}

const PAGE_TABS = ['profile', 'gap'] as const;
type PageTab = (typeof PAGE_TABS)[number];
/** Search & market › Backlinks: a site's or page's link profile, and the link gap against competitors. */
export default function BacklinksPage() {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const tab: PageTab = params.get('view') === 'gap' ? 'gap' : 'profile';
  usePageTab($t(tab === 'gap' ? 'backlinks.gapTab' : 'backlinks.profileTab'));
  // Each tab keeps its own parameters; switching drops the other tab's.
  const choose = (v: string) =>
    setParams(
      v === 'gap'
        ? new URLSearchParams({ view: 'gap' })
        : new URLSearchParams(),
      {
        replace: true,
      },
    );
  return (
    <PageContainer className='nr-data-page'>
      <PageHeader
        title={$t('backlinks.pageTitle')}
        description={$t('backlinks.pageSummary')}
      />
      <Tabs value={tab} onValueChange={(v) => choose(String(v))}>
        <TabsList variant='line' className='h-auto! justify-start'>
          {PAGE_TABS.map((v) => (
            <TabsTrigger key={v} value={v}>
              {$t(v === 'gap' ? 'backlinks.gapTab' : 'backlinks.profileTab')}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {tab === 'gap' ? <LinkGap /> : <Backlinks />}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

export function Backlinks() {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  const own = (project?.domains ?? []).map(bare);
  const [connection, setConnection] = useState<KeywordConnectionState>();
  const [recent, setRecent] = useState<Recent[]>();
  const [runs, setRuns] = useState<Partial<Record<View, Run>>>({});
  const [busy, setBusy] = useState<'' | View>('');
  const [error, setError] = useMessageState('');
  const [target, setTarget] = useState(params.get('t') ?? '');
  const tab: Tab = TABS.includes(params.get('bt') as Tab)
    ? (params.get('bt') as Tab)
    : 'links';
  useEffect(() => {
    if (!target && own[0]) setTarget(own[0]);
  }, [own[0]]);
  const loadRecent = () =>
    call<Recent[]>('list')
      .then(setRecent)
      .catch(() => setRecent([]));
  useEffect(() => {
    void keywordRequest<KeywordConnectionState>('status')
      .then(setConnection)
      .catch(() =>
        setConnection({
          configured: false,
          verifiedAt: null,
          monthlyBudgetUsd: 5,
        }),
      );
    void loadRecent();
  }, []);
  useEffect(() => {
    for (const view of Object.keys(RUN_PARAMS) as View[]) {
      const id = params.get(RUN_PARAMS[view]);
      if (id && String(runs[view]?.id) !== id)
        void call<Run>('getRun', { runId: id })
          .then((r) => setRuns((s) => ({ ...s, [view]: r })))
          .catch(() => undefined);
      if (!id && runs[view]) setRuns((s) => ({ ...s, [view]: undefined }));
    }
  }, [params.get('o'), params.get('l'), params.get('r'), params.get('g')]);
  // Arriving with a target but no run (Domain lookup's View backlinks): the latest saved overview of that target opens
  // on its own; a new lookup, which is charged, waits for Look up.
  useEffect(() => {
    const t = params.get('t');
    if (!t || params.get('o') || !recent) return;
    const same = (r: Recent) =>
      r.status === 'completed' &&
      bare(r.spec.target) === bare(t) &&
      r.spec.scope === 'domain';
    const overview = recent.find((r) => r.spec.view === 'overview' && same(r));
    if (!overview) return;
    const p = new URLSearchParams(params);
    p.set('o', overview.id);
    for (const view of TABS) {
      const r = recent.find(
        (x) =>
          x.spec.view === view &&
          x.spec.target === overview.spec.target &&
          x.status === 'completed',
      );
      if (r) p.set(RUN_PARAMS[view], r.id);
    }
    setParams(p, { replace: true });
  }, [params.get('t'), recent]);
  const query = async (view: View, t = target, forceRefresh = false) => {
    setBusy(view);
    setError('');
    try {
      const r = await call<Run>('run', {
        view,
        target: t,
        requestKey: requestKey(),
        ...(forceRefresh ? { forceRefresh: true } : {}),
      });
      // Another target's overview drops the tabs opened for the last one; the same target's (Query again) keeps them,
      // as their saved lookups still hold and dropping them would offer to pay for them again.
      const sameTarget =
        view === 'overview' && runs.overview?.spec.target === r.spec.target;
      setRuns((s) =>
        view === 'overview'
          ? sameTarget
            ? { ...s, overview: r }
            : { overview: r }
          : { ...s, [view]: r },
      );
      const p = new URLSearchParams(params);
      p.set('t', r.spec.target);
      p.set(RUN_PARAMS[view], String(r.id));
      if (view === 'overview') {
        if (!sameTarget) for (const v of TABS) p.delete(RUN_PARAMS[v]);
      } else p.set('bt', view);
      setParams(p, { replace: true });
      void loadRecent();
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('common.lookupNotCompleteTryAgain'),
      );
    } finally {
      setBusy('');
    }
  };
  const shown = runs.overview as Run<never> | undefined;
  const isOwn = Boolean(shown && own.includes(bare(shown.spec.target)));
  const setTab = (v: string) => {
    const p = new URLSearchParams(params);
    p.set('bt', v);
    setParams(p, { replace: true });
  };
  const tabRun = shown ? runs[tab] : undefined;
  const sameTarget = Boolean(
    tabRun && shown && tabRun.spec.target === shown.spec.target,
  );
  const visible = sameTarget ? tabRun : shown;
  const reset = () => setParams(new URLSearchParams(), { replace: true });
  return (
    <>
      {shown ? (
        <div className='flex justify-end'>
          <Button variant='outline' size='sm' onClick={reset}>
            <History data-icon='inline-start' />
            {$t('domainOverview.recentLookups')}
          </Button>
        </div>
      ) : null}
      {connection && !connection.verifiedAt ? (
        <EmptyState
          icon={<Link2 />}
          title={$t('common.connectDataforseoFirst')}
          description={$t('backlinks.usesDataforseo')}
        />
      ) : (
        <Card className='px-4'>
          <form
            className='flex flex-col gap-2 lg:flex-row lg:items-center'
            onSubmit={(e) => {
              e.preventDefault();
              void query('overview');
            }}
          >
            <div className='relative min-w-0 flex-1 lg:max-w-md'>
              <Search className='pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                className='pl-8'
                aria-label={$t('backlinks.target')}
                placeholder={$t('backlinks.targetPlaceholder')}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </div>
            <Button
              type='submit'
              disabled={Boolean(busy) || !target.trim()}
              className='lg:px-6'
            >
              {busy === 'overview' ? $t('common.querying') : $t('common.query')}
            </Button>
            <InfoTip label={$t('common.info')}>
              <p>{$t('backlinks.targetHelp')}</p>
              <p>{$t('backlinks.billing')}</p>
            </InfoTip>
          </form>
          {error ? (
            <p role='alert' className='nr-error'>
              {error}
            </p>
          ) : null}
        </Card>
      )}
      {shown ? (
        shown.status !== 'completed' ? (
          <EmptyState
            icon={<Link2 />}
            title={$t('common.lookupNotComplete')}
            description={backlinksError(shown.errorCode)}
          />
        ) : (
          <>
            {visible?.reused && visible.status === 'completed' ? (
              <p
                className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'
                data-backlinks-reused=''
              >
                {$tj('keywordResearch.resultNoNewCharge', {
                  0: fmtTime(visible.completedAt || visible.createdAt),
                })}
                <InfoTip>{$t('backlinks.sameLookup30Days')}</InfoTip>
                <Button
                  variant='link'
                  size='sm'
                  className='h-auto p-0'
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void query(
                      visible.spec.view as View,
                      visible.spec.target,
                      true,
                    )
                  }
                >
                  {$t('common.queryAgain')}
                </Button>
              </p>
            ) : null}
            <Overview run={shown} own={isOwn} />
            <Card className='gap-0 py-0'>
              <DataTableTabs value={tab} onValueChange={setTab}>
                {TABS.map((v) => (
                  <TabsTrigger
                    key={v}
                    value={v}
                    disabled={v === 'pages' && shown.spec.scope === 'page'}
                  >
                    {tabText(v, shown.spec.target).label}
                    {runs[v]?.result &&
                    runs[v]!.spec.target === shown.spec.target
                      ? ` ${runs[v]!.result!.items.length}`
                      : ''}
                  </TabsTrigger>
                ))}
              </DataTableTabs>
              {tabRun && sameTarget ? (
                tabRun.status !== 'completed' ? (
                  <EmptyState
                    icon={<Link2 />}
                    title={$t('common.lookupNotComplete')}
                    description={backlinksError(tabRun.errorCode)}
                  />
                ) : tab === 'links' ? (
                  <LinksTable run={tabRun as Run<LinkRow>} own={isOwn} />
                ) : tab === 'domains' ? (
                  <DomainsTable run={tabRun as Run<DomainRow>} own={isOwn} />
                ) : (
                  <PagesTable run={tabRun as Run<PageRow>} />
                )
              ) : (
                <div className='space-y-2 p-6 text-sm'>
                  <p className='text-muted-foreground'>
                    {tabText(tab, shown.spec.target).ask}
                  </p>
                  <Button
                    variant='outline'
                    disabled={Boolean(busy)}
                    onClick={() => void query(tab, shown.spec.target)}
                  >
                    {busy === tab
                      ? $t('common.querying')
                      : tabText(tab, shown.spec.target).button}
                  </Button>
                </div>
              )}
            </Card>
          </>
        )
      ) : connection?.verifiedAt ? (
        <RecentList
          recent={recent}
          onOpen={(r) => {
            // A target's row reopens its overview and whichever of its tabs were looked up.
            const p = new URLSearchParams();
            p.set('t', r.spec.target);
            p.set('o', r.id);
            for (const view of TABS) {
              const x = recent?.find(
                (y) =>
                  y.spec.view === view &&
                  y.spec.target === r.spec.target &&
                  y.status === 'completed',
              );
              if (x) p.set(RUN_PARAMS[view], x.id);
            }
            setTarget(r.spec.target);
            setParams(p, { replace: true });
          }}
        />
      ) : null}
    </>
  );
}

const count = (v: number | null | undefined) =>
  v == null ? '—' : formatCount(Math.round(v));
function Overview({ run, own }: { run: Run<never>; own: boolean }) {
  const s = run.result?.summary;
  const history = run.result?.history ?? [];
  const last = history[history.length - 1];
  const tiles: [string, string, string, ('success' | 'destructive')?][] = [
    [$t('backlinks.rank'), count(s?.rank), $t('backlinks.rankHelp')],
    [
      $t('backlinks.backlinks'),
      count(s?.backlinks),
      $t('backlinks.backlinksHelp'),
    ],
    [
      $t('backlinks.referringDomains'),
      count(s?.referringDomains),
      $t('backlinks.referringDomainsHelp'),
    ],
    [
      $t('backlinks.referringPages'),
      count(s?.referringPages),
      $t('backlinks.referringPagesHelp'),
    ],
    [
      $t('backlinks.spamScore'),
      count(s?.spam),
      $t('backlinks.spamScoreHelp'),
      (s?.spam ?? 0) >= SPAM_THRESHOLD ? 'destructive' : undefined,
    ],
    [
      $t('backlinks.brokenBacklinks'),
      count(s?.brokenBacklinks),
      own
        ? $t('backlinks.brokenBacklinksOwnHelp')
        : $t('backlinks.brokenBacklinksHelp'),
    ],
  ];
  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6'>
        {tiles.map(([label, value, help, tone]) => (
          <Card key={label} className='gap-0 p-4' data-metric={label}>
            <StatTile label={label} value={value} help={help} tone={tone} />
          </Card>
        ))}
      </div>
      <p className='nr-footnote'>
        {run.spec.target}
        {run.spec.scope === 'page'
          ? ` · ${$t('backlinks.onePage')}`
          : ''} · {fmtTime(run.completedAt || run.createdAt)}
        {last
          ? ` · ${$t('backlinks.lastMonthChange', { 0: count(last.newBacklinks), 1: count(last.lostBacklinks) })}`
          : ''}
      </p>
      {history.length > 1 ? (
        <div className='grid gap-3 lg:grid-cols-2'>
          <ChartCard
            title={$t('backlinks.growth')}
            help={$t('backlinks.growthHelp')}
          >
            <GrowthChart history={history} />
          </ChartCard>
          <ChartCard
            title={$t('backlinks.newLost')}
            help={$t('backlinks.newLostHelp')}
          >
            <NewLostChart history={history} />
          </ChartCard>
        </div>
      ) : run.spec.scope === 'page' ? (
        <p className='text-xs text-muted-foreground'>
          {$t('backlinks.noTrendForPage')}
        </p>
      ) : run.result?.historyError ? (
        <p
          className='text-xs text-muted-foreground'
          data-backlinks-no-history=''
        >
          {$t('backlinks.noHistory', {
            0: backlinksError(run.result.historyError),
          })}
        </p>
      ) : null}
    </div>
  );
}

function ChartCard({
  title,
  help,
  children,
}: {
  title: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <Card className='gap-3 px-4'>
      <h3 className='flex items-center gap-1 text-sm font-semibold'>
        {title}
        <InfoTip label={$t('common.info')}>{help}</InfoTip>
      </h3>
      <div className='nr-chart-box'>{children}</div>
    </Card>
  );
}
const month = (d: string) => d.slice(0, 7);
const tick = (v: number) =>
  v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v);
const tip = (v: unknown) => Number(v).toLocaleString(getCurrentLocale());
function GrowthChart({ history }: { history: Month[] }) {
  return (
    <ResponsiveContainer width='100%' height={220}>
      <ComposedChart
        data={history}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        role='img'
        aria-label={$t('backlinks.growth')}
      >
        <CartesianGrid strokeDasharray='3 3' vertical={false} />
        <XAxis
          dataKey='date'
          tickFormatter={month}
          fontSize={11}
          minTickGap={16}
        />
        <YAxis yAxisId='links' fontSize={11} width={44} tickFormatter={tick} />
        <YAxis
          yAxisId='domains'
          orientation='right'
          fontSize={11}
          width={44}
          tickFormatter={tick}
        />
        <Tooltip labelFormatter={(d) => month(String(d))} formatter={tip} />
        <Legend
          verticalAlign='top'
          height={24}
          iconSize={10}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Line
          yAxisId='links'
          isAnimationActive={false}
          type='monotone'
          dataKey='backlinks'
          name={$t('backlinks.backlinks')}
          stroke='var(--chart-1)'
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          yAxisId='domains'
          isAnimationActive={false}
          type='monotone'
          dataKey='referringDomains'
          name={$t('backlinks.referringDomains')}
          stroke='var(--chart-3)'
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
function NewLostChart({ history }: { history: Month[] }) {
  return (
    <ResponsiveContainer width='100%' height={220}>
      <BarChart
        data={history}
        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        role='img'
        aria-label={$t('backlinks.newLost')}
      >
        <CartesianGrid strokeDasharray='3 3' vertical={false} />
        <XAxis
          dataKey='date'
          tickFormatter={month}
          fontSize={11}
          minTickGap={16}
        />
        <YAxis fontSize={11} width={44} tickFormatter={tick} />
        <Tooltip labelFormatter={(d) => month(String(d))} formatter={tip} />
        <Legend
          verticalAlign='top'
          height={24}
          iconSize={10}
          wrapperStyle={{ fontSize: 12 }}
        />
        <Bar
          isAnimationActive={false}
          dataKey='newBacklinks'
          name={$t('backlinks.newBacklinks')}
          fill='var(--success)'
        />
        <Bar
          isAnimationActive={false}
          dataKey='lostBacklinks'
          name={$t('backlinks.lostBacklinks')}
          fill='var(--destructive)'
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

const link = (url: string, label = url, width = 'max-w-64') =>
  safeLink(url) ? (
    <a
      className={`block ${width} truncate text-primary hover:underline`}
      href={safeLink(url)}
      target='_blank'
      rel='noreferrer'
      title={url}
    >
      {label}
    </a>
  ) : (
    <span className={`block ${width} truncate`} title={url}>
      {label}
    </span>
  );
const date = (v: string | null) => (v ? v : '—');
const spamCell = (v: number | null) =>
  v == null ? (
    '—'
  ) : (
    <span
      className={
        v >= SPAM_THRESHOLD ? 'font-medium text-destructive' : undefined
      }
    >
      {v}
    </span>
  );
const PAGE_SIZES = [50, 100] as const;

/** The toolbar's filters, the Hide spam switch and the export shared by the three tables. */
function useTable<
  T extends { id: string; spam?: number | null; dofollow?: boolean | null },
>(
  items: T[],
  columns: ColumnDef<T>[],
  text: (r: T) => string,
  sort: string,
  options: {
    spam?: boolean;
    dofollow?: boolean;
    select?: boolean;
    /** The run on screen: ticked rows are its positions, so a new run (Query again) starts with none ticked. */
    run?: string | number;
  } = {},
) {
  const [rowSelection, setRowSelection] = useState({});
  useEffect(() => setRowSelection({}), [options.run]);
  const [filter, setFilter] = useState({
    include: '',
    exclude: '',
    dofollow: false,
  });
  const [hideSpam, setHideSpam] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { id: sort, desc: true },
  ]);
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 50 });
  const rows = useMemo(
    () =>
      filterRows(
        items,
        { ...filter, hideSpam: Boolean(options.spam) && hideSpam },
        text,
      ),
    [items, filter, hideSpam],
  );
  const hidden =
    options.spam && hideSpam
      ? items.filter((r) => (r.spam ?? 0) >= SPAM_THRESHOLD).length
      : 0;
  useEffect(
    () => setPagination((p) => ({ ...p, pageIndex: 0 })),
    [filter, hideSpam],
  );
  const table = useDataTable({
    data: rows,
    columns,
    withSorting: true,
    withPagination: true,
    state: { pagination, sorting, rowSelection },
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    enableRowSelection: Boolean(options.select),
    onRowSelectionChange: setRowSelection,
    getRowId: (r) => r.id,
  });
  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const active =
    Number(Boolean(filter.include)) +
    Number(Boolean(filter.exclude)) +
    Number(filter.dofollow);
  const clear = () => setFilter({ include: '', exclude: '', dofollow: false });
  const toolbar = (exportRows: () => void, note: ReactNode) => (
    <>
      <DataTableToolbar
        actions={
          <Button variant='outline' size='sm' onClick={exportRows}>
            <Download data-icon='inline-start' />
            {$t('common.exportCsv')}
          </Button>
        }
      >
        <DataTableFilterToggle
          open={showFilters}
          activeCount={active}
          onToggle={() => setShowFilters((v) => !v)}
        />
        {options.spam ? (
          <label className='flex items-center gap-1.5 text-xs'>
            <Switch
              size='sm'
              checked={hideSpam}
              onCheckedChange={(v) => setHideSpam(Boolean(v))}
            />
            {$t('backlinks.hideSpam')}
            <InfoTip label={$t('common.info')}>
              {$t('backlinks.hideSpamHelp', { 0: SPAM_THRESHOLD })}
            </InfoTip>
          </label>
        ) : null}
        <span className='text-xs text-muted-foreground'>
          {note}
          {hidden ? ` · ${$t('backlinks.spamHidden', { 0: hidden })}` : ''}
        </span>
      </DataTableToolbar>
      {showFilters ? (
        <DataTableFilterPanel activeCount={active} onReset={clear}>
          <div className='grid gap-2 sm:grid-cols-3'>
            <DataTableFilterGroup label={$t('common.include')}>
              <Input
                aria-label={$t('common.include')}
                className='h-7'
                placeholder={$t('common.containCommaSeparated')}
                value={filter.include}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, include: e.target.value }))
                }
              />
            </DataTableFilterGroup>
            <DataTableFilterGroup label={$t('common.exclude')}>
              <Input
                aria-label={$t('common.exclude')}
                className='h-7'
                placeholder={$t('common.excludeAny')}
                value={filter.exclude}
                onChange={(e) =>
                  setFilter((f) => ({ ...f, exclude: e.target.value }))
                }
              />
            </DataTableFilterGroup>
            {options.dofollow ? (
              <DataTableFilterGroup label={$t('backlinks.linkType')}>
                <label className='flex h-7 items-center gap-1.5 text-xs'>
                  <Switch
                    size='sm'
                    checked={filter.dofollow}
                    onCheckedChange={(v) =>
                      setFilter((f) => ({ ...f, dofollow: Boolean(v) }))
                    }
                  />
                  {$t('backlinks.dofollowOnly')}
                </label>
              </DataTableFilterGroup>
            ) : null}
          </div>
        </DataTableFilterPanel>
      ) : null}
    </>
  );
  const footer =
    rows.length > 0 ? (
      <TablePagination
        page={pagination.pageIndex + 1}
        pageSize={pagination.pageSize}
        pageSizes={PAGE_SIZES}
        totalCount={rows.length}
        onPageChange={(p) => setPagination((s) => ({ ...s, pageIndex: p - 1 }))}
        onPageSizeChange={(size) =>
          setPagination({ pageIndex: 0, pageSize: size })
        }
      />
    ) : null;
  return {
    table,
    rows,
    selected,
    clearSelection: () => setRowSelection({}),
    toolbar,
    footer,
    filtered: active > 0 || hidden > 0,
    clear: () => {
      clear();
      setHideSpam(false);
    },
  };
}
const listed = (run: Run) =>
  run.result?.totalCount && run.result.totalCount > run.result.items.length
    ? $t('backlinks.listedOfTotal', {
        0: run.result.totalCount.toLocaleString(getCurrentLocale()),
        1: run.result.items.length,
      })
    : $t('common.total', { 0: run.result?.items.length ?? 0 });
const fileName = (run: Run, part: string) =>
  `backlinks-${bare(run.spec.target)}-${part}`;

const lHelper = createColumnHelper<LinkRow>();
function LinksTable({ run, own }: { run: Run<LinkRow>; own: boolean }) {
  const items = run.result?.items ?? [];
  const columns = useMemo<ColumnDef<LinkRow>[]>(
    () => [
      lHelper.accessor('urlFrom', {
        enableSorting: false,
        header: () => $t('backlinks.source'),
        cell: ({ row }) => (
          <div className='min-w-0'>
            <span className='block max-w-64 truncate text-xs text-muted-foreground'>
              {row.original.domainFrom}
            </span>
            {link(row.original.urlFrom, pathOf(row.original.urlFrom))}
          </div>
        ),
      }) as ColumnDef<LinkRow>,
      lHelper.accessor('anchor', {
        enableSorting: false,
        header: () => $t('backlinks.anchor'),
        cell: ({ getValue }) => (
          <span className='block max-w-48 truncate' title={getValue()}>
            {getValue() || '—'}
          </span>
        ),
      }) as ColumnDef<LinkRow>,
      lHelper.accessor('urlTo', {
        enableSorting: false,
        header: () => $t('backlinks.linksTo'),
        cell: ({ getValue }) =>
          link(getValue(), pathOf(getValue()), 'max-w-48'),
      }) as ColumnDef<LinkRow>,
      lHelper.accessor('dofollow', {
        enableSorting: false,
        header: () => $t('backlinks.linkType'),
        cell: ({ row }) => (
          <span className='flex flex-wrap gap-1'>
            <Badge
              variant={
                row.original.dofollow === false ? 'outline' : 'secondary'
              }
            >
              {row.original.dofollow === false ? 'nofollow' : 'dofollow'}
            </Badge>
            {row.original.isLost ? (
              <Badge variant='destructive'>{$t('backlinks.lost')}</Badge>
            ) : row.original.isNew ? (
              <Badge variant='outline'>{$t('backlinks.new')}</Badge>
            ) : null}
            {row.original.isBroken ? (
              <Badge variant='destructive'>{$t('backlinks.broken')}</Badge>
            ) : null}
          </span>
        ),
      }) as ColumnDef<LinkRow>,
      lHelper.accessor('domainRank', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.domainRank')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<LinkRow>,
      lHelper.accessor('spam', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.spamScore')}
            align='right'
          />
        ),
        cell: ({ getValue }) => spamCell(getValue()),
        meta: right,
      }) as ColumnDef<LinkRow>,
      lHelper.accessor('firstSeen', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.firstSeen')}
            align='right'
          />
        ),
        cell: ({ getValue }) => date(getValue()),
        meta: right,
      }) as ColumnDef<LinkRow>,
    ],
    [],
  );
  const t = useTable(
    items,
    columns,
    (r) => `${r.domainFrom} ${r.urlFrom} ${r.anchor} ${r.urlTo}`,
    'domainRank',
    { spam: true, dofollow: true },
  );
  const exportRows = () =>
    downloadCsv(
      fileName(run, 'links'),
      [
        $t('backlinks.source'),
        $t('backlinks.anchor'),
        $t('backlinks.linksTo'),
        $t('backlinks.linkType'),
        $t('backlinks.domainRank'),
        $t('backlinks.spamScore'),
        $t('backlinks.firstSeen'),
        $t('backlinks.lost'),
      ],
      t.rows.map((r): CsvValue[] => [
        r.urlFrom,
        r.anchor,
        r.urlTo,
        r.dofollow === false ? 'nofollow' : 'dofollow',
        r.domainRank,
        r.spam,
        r.firstSeen,
        r.isLost ? (r.lastSeen ?? 'yes') : '',
      ]),
    ) || toast.error(() => $t('backlinks.nothingToExport'));
  return (
    <>
      <DataTable
        table={t.table}
        isFiltered={t.filtered}
        onClearFilters={t.clear}
        empty={{
          title: $t('backlinks.noLinks'),
          description: own ? $t('backlinks.noLinksOwn') : undefined,
        }}
        toolbar={t.toolbar(
          exportRows,
          <>
            {listed(run)} · {$t('backlinks.onePerDomain')}
          </>,
        )}
        footer={t.footer}
      />
    </>
  );
}

const dHelper = createColumnHelper<DomainRow>();
function DomainsTable({ run, own }: { run: Run<DomainRow>; own: boolean }) {
  const items = run.result?.items ?? [];
  const anchorRef = useSelectionAnchor();
  // A competitor's referring domains are outreach prospects: they can be handed to the agent (Link building).
  const columns = useMemo<ColumnDef<DomainRow>[]>(
    () => [
      ...(own ? [] : [makeSelectionColumn<DomainRow>(anchorRef)]),
      dHelper.accessor('domain', {
        enableSorting: false,
        header: () => $t('backlinks.domain'),
        cell: ({ getValue }) => link(`https://${getValue()}`, getValue()),
      }) as ColumnDef<DomainRow>,
      dHelper.accessor('rank', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.rank')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<DomainRow>,
      dHelper.accessor('backlinks', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.backlinks')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<DomainRow>,
      dHelper.accessor('referringPages', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.referringPages')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<DomainRow>,
      dHelper.accessor('spam', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.spamScore')}
            align='right'
          />
        ),
        cell: ({ getValue }) => spamCell(getValue()),
        meta: right,
      }) as ColumnDef<DomainRow>,
      dHelper.accessor('firstSeen', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.firstSeen')}
            align='right'
          />
        ),
        cell: ({ getValue }) => date(getValue()),
        meta: right,
      }) as ColumnDef<DomainRow>,
    ],
    [anchorRef, own],
  );
  const t = useTable(items, columns, (r) => r.domain, 'backlinks', {
    spam: true,
    select: !own,
    run: run.id,
  });
  // A competitor's referring domains were not checked against our links, and the brief says so.
  const handOff = useLinkHandOff({
    source: 'backlinks-domains',
    rows: t.selected.map((r) => ({
      domain: r.domain,
      rank: r.rank,
      spam: r.spam,
      competitors: [bare(run.spec.target)],
    })),
    competitors: [bare(run.spec.target)],
    at: run.completedAt || run.createdAt,
    clear: t.clearSelection,
    enabled: !own,
    checked: false,
  });
  const exportRows = () =>
    downloadCsv(
      fileName(run, 'domains'),
      [
        $t('backlinks.domain'),
        $t('backlinks.rank'),
        $t('backlinks.backlinks'),
        $t('backlinks.referringPages'),
        $t('backlinks.spamScore'),
        $t('backlinks.firstSeen'),
      ],
      t.rows.map((r): CsvValue[] => [
        r.domain,
        r.rank,
        r.backlinks,
        r.referringPages,
        r.spam,
        r.firstSeen,
      ]),
    ) || toast.error(() => $t('backlinks.nothingToExport'));
  return (
    <DataTable
      table={t.table}
      isFiltered={t.filtered}
      onClearFilters={t.clear}
      empty={{
        title: $t('backlinks.noDomains'),
        description: own ? $t('backlinks.noLinksOwn') : undefined,
      }}
      toolbar={t.toolbar(exportRows, listed(run))}
      footer={
        <>
          {t.footer}
          {handOff}
        </>
      }
    />
  );
}

/**
 * Hand off to agent for link prospects: the selected sites become one Link building task (created, not started),
 * whose brief lists each site with its authority, spam score and the competitors it links to. `own` is the domain the
 * sites were checked against (a gap's), our first domain otherwise; `checked` says whether they were.
 */
function useLinkHandOff({
  source,
  rows,
  competitors,
  at,
  clear,
  enabled = true,
  own: checkedAgainst,
  checked,
}: {
  source: string;
  rows: Parameters<typeof linkProspectsDraft>[2];
  competitors: string[];
  at: string;
  clear: () => void;
  enabled?: boolean;
  own?: string;
  checked: boolean;
}) {
  const { project } = useProject();
  const [handing, setHanding] = useState<TaskDraft>();
  const [handed, setHanded] = useState<HandOffResult>();
  const own =
    checkedAgainst || bare(project?.domains?.[0]) || $t('backlinks.ourSite');
  useHandOffSource(
    source,
    project && enabled
      ? {
          count: rows.length,
          open: () =>
            setHanding(linkProspectsDraft(own, competitors, rows, at, checked)),
          noun: $t('backlinks.sitesSelected'),
          clear,
        }
      : null,
  );
  return (
    <>
      <HandOffNotice result={handed} />
      {handing && project ? (
        <DraftHandOffDialog
          projectId={project.id}
          draft={handing}
          playbookId='link-building'
          description={$t('backlinks.handOffDescription', { 0: rows.length })}
          onClose={() => setHanding(undefined)}
          onDone={(r) => {
            setHanding(undefined);
            clear();
            setHanded(r);
          }}
        />
      ) : null}
    </>
  );
}

const pHelper = createColumnHelper<PageRow>();
function PagesTable({ run }: { run: Run<PageRow> }) {
  const items = run.result?.items ?? [];
  const columns = useMemo<ColumnDef<PageRow>[]>(
    () => [
      pHelper.accessor('url', {
        enableSorting: false,
        header: () => $t('common.page'),
        cell: ({ getValue }) => link(getValue(), getValue(), 'max-w-xl'),
      }) as ColumnDef<PageRow>,
      pHelper.accessor('backlinks', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.backlinks')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<PageRow>,
      pHelper.accessor('referringDomains', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.referringDomains')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<PageRow>,
      pHelper.accessor('rank', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.rank')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<PageRow>,
      pHelper.accessor('brokenBacklinks', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.brokenBacklinks')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<PageRow>,
    ],
    [],
  );
  const t = useTable(items, columns, (r) => r.url, 'backlinks');
  const exportRows = () =>
    downloadCsv(
      fileName(run, 'pages'),
      [
        $t('common.page'),
        $t('backlinks.backlinks'),
        $t('backlinks.referringDomains'),
        $t('backlinks.rank'),
        $t('backlinks.brokenBacklinks'),
      ],
      t.rows.map((r): CsvValue[] => [
        r.url,
        r.backlinks,
        r.referringDomains,
        r.rank,
        r.brokenBacklinks,
      ]),
    ) || toast.error(() => $t('backlinks.nothingToExport'));
  return (
    <DataTable
      table={t.table}
      isFiltered={t.filtered}
      onClearFilters={t.clear}
      empty={{ title: $t('backlinks.noPages') }}
      toolbar={t.toolbar(exportRows, listed(run))}
      footer={t.footer}
    />
  );
}

function RecentList({
  recent,
  onOpen,
}: {
  recent?: Recent[];
  onOpen: (r: Recent) => void;
}) {
  if (!recent) return <ListSkeleton rows={4} />;
  const list = recent.filter((r) => r.spec.view === 'overview');
  if (!list.length)
    return (
      <EmptyState
        icon={<Link2 />}
        title={$t('backlinks.noneYet')}
        description={$t('backlinks.noneYetHelp')}
      />
    );
  return (
    <section className='space-y-2'>
      <h2 className='text-sm font-semibold'>
        {$t('domainOverview.recentLookups')}
      </h2>
      <Card className='gap-0 py-0'>
        {list.map((r) => (
          <button
            key={r.id}
            type='button'
            className='flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 text-left text-sm last:border-0 hover:bg-muted/50'
            onClick={() => onOpen(r)}
          >
            <span className='min-w-0 flex-1 truncate font-medium'>
              {r.spec.target}
            </span>
            <span className='text-xs text-muted-foreground'>
              {r.status === 'completed' && r.summary
                ? $t('backlinks.recentSummary', {
                    0: count(r.summary.backlinks),
                    1: count(r.summary.referringDomains),
                    2: count(r.summary.rank),
                  })
                : $t('common.notComplete')}
            </span>
            <span className='w-24 text-right text-xs text-muted-foreground tabular-nums'>
              {fmtTime(r.completedAt || r.createdAt)}
            </span>
          </button>
        ))}
      </Card>
    </section>
  );
}

type GapRow = {
  id: string;
  domain: string;
  competitors: string[];
  rank: number | null;
  backlinks: number | null;
  spam: number | null;
  firstSeen: string | null;
};
type Sites = { own: string[]; competitors: { name: string; domain: string }[] };

/**
 * Link gap: the sites that link to up to three competitors but not to us, each with the competitors it links to.
 * Starts from our site and the competitors listed on Competitors; one lookup per competitor, charged and reused for
 * 30 days like the other lookups. The URL keeps the opened lookup (gap), so a reload reopens it without a new query.
 */
function LinkGap() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [connection, setConnection] = useState<KeywordConnectionState>();
  const [sites, setSites] = useState<Sites>();
  const [recent, setRecent] = useState<Recent[]>();
  const [run, setRun] = useState<Run<GapRow>>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState('');
  const [own, setOwn] = useState('');
  const [rivals, setRivals] = useState<string[]>([]);
  const loadRecent = () =>
    call<Recent[]>('list')
      .then(setRecent)
      .catch(() => setRecent([]));
  useEffect(() => {
    void keywordRequest<KeywordConnectionState>('status')
      .then(setConnection)
      .catch(() =>
        setConnection({
          configured: false,
          verifiedAt: null,
          monthlyBudgetUsd: 5,
        }),
      );
    void call<Sites>('sites')
      .then(setSites)
      .catch(() => setSites({ own: [], competitors: [] }));
    void loadRecent();
  }, []);
  // Our site and the listed competitors fill the form until a lookup is opened.
  useEffect(() => {
    if (!sites || params.get('gap')) return;
    setOwn((o) => o || sites.own[0] || '');
    setRivals((r) =>
      r.length
        ? r
        : sites.competitors.slice(0, GAP_COMPETITORS).map((c) => c.domain),
    );
  }, [sites]);
  const gapId = params.get('gap');
  useEffect(() => {
    if (!gapId) {
      setRun(undefined);
      return;
    }
    if (String(run?.id) === gapId) return;
    void call<Run<GapRow>>('getRun', { runId: gapId })
      .then((r) => {
        setRun(r);
        setOwn(r.spec.target);
        setRivals(r.spec.competitors ?? []);
      })
      .catch(() => undefined);
  }, [gapId]);
  const chosen = [...new Set(rivals.map((r) => bare(r)).filter(Boolean))];
  // Find the gap asks for what the form holds; Query again (`shown`) refreshes the lookup on screen, whatever the form
  // has been edited to since.
  const query = async (
    forceRefresh = false,
    shown?: { target: string; competitors?: string[] },
  ) => {
    setBusy(true);
    setError('');
    try {
      const r = await call<Run<GapRow>>('run', {
        view: 'gap',
        target: shown ? shown.target : own,
        competitors: shown ? (shown.competitors ?? []) : chosen,
        requestKey: requestKey(),
        ...(forceRefresh ? { forceRefresh: true } : {}),
      });
      setRun(r);
      setParams(new URLSearchParams({ view: 'gap', gap: String(r.id) }), {
        replace: true,
      });
      void loadRecent();
    } catch (e) {
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('common.lookupNotCompleteTryAgain'),
      );
    } finally {
      setBusy(false);
    }
  };
  const reset = () =>
    setParams(new URLSearchParams({ view: 'gap' }), { replace: true });
  if (connection && !connection.verifiedAt)
    return (
      <EmptyState
        icon={<Link2 />}
        title={$t('common.connectDataforseoFirst')}
        description={$t('backlinks.usesDataforseo')}
      />
    );
  return (
    <>
      {run ? (
        <div className='flex justify-end'>
          <Button variant='outline' size='sm' onClick={reset}>
            <History data-icon='inline-start' />
            {$t('domainOverview.recentLookups')}
          </Button>
        </div>
      ) : null}
      <Card className='gap-3 px-4'>
        <form
          className='flex flex-col gap-3'
          onSubmit={(e) => {
            e.preventDefault();
            void query();
          }}
        >
          <div className='grid gap-2 lg:grid-cols-[minmax(0,16rem)_1fr]'>
            <label className='flex flex-col gap-1 text-xs font-medium text-muted-foreground'>
              {$t('backlinks.ourDomain')}
              <Input
                aria-label={$t('backlinks.ourDomain')}
                placeholder={$t('domainOverview.exampleCom')}
                value={own}
                onChange={(e) => setOwn(e.target.value)}
              />
            </label>
            <div className='flex flex-col gap-1 text-xs font-medium text-muted-foreground'>
              {$t('backlinks.competitorDomains', { 0: GAP_COMPETITORS })}
              <div className='flex flex-wrap items-center gap-2'>
                {rivals.map((r, i) => (
                  <div key={i} className='relative w-full sm:w-48'>
                    <Input
                      className='pr-8'
                      aria-label={$t('backlinks.competitorN', { 0: i + 1 })}
                      placeholder='competitor.com'
                      value={r}
                      onChange={(e) =>
                        setRivals((list) =>
                          list.map((x, j) => (j === i ? e.target.value : x)),
                        )
                      }
                    />
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='absolute top-1/2 right-0.5 size-7 -translate-y-1/2'
                      aria-label={$t('backlinks.removeCompetitor', {
                        0: r || i + 1,
                      })}
                      onClick={() =>
                        setRivals((list) => list.filter((_, j) => j !== i))
                      }
                    >
                      <X className='size-3.5' />
                    </Button>
                  </div>
                ))}
                {rivals.length < GAP_COMPETITORS ? (
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    onClick={() => setRivals((list) => [...list, ''])}
                  >
                    <Plus data-icon='inline-start' />
                    {$t('backlinks.addCompetitor')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='submit'
              disabled={busy || !own.trim() || !chosen.length}
              className='lg:px-6'
            >
              {busy ? $t('common.querying') : $t('backlinks.findGap')}
            </Button>
            <InfoTip label={$t('common.info')}>
              <p>{$t('backlinks.gapHelp')}</p>
              <p>{$t('backlinks.gapBilling')}</p>
            </InfoTip>
            {sites && !sites.competitors.length ? (
              <span className='text-xs text-muted-foreground'>
                {$t('backlinks.noListedCompetitors')}{' '}
                <Button
                  type='button'
                  variant='link'
                  size='sm'
                  className='h-auto p-0 text-xs'
                  onClick={() => navigate('/research/domain?view=watch')}
                >
                  {$t('backlinks.manageCompetitors')}
                </Button>
              </span>
            ) : null}
          </div>
          {error ? (
            <p role='alert' className='nr-error'>
              {error}
            </p>
          ) : null}
        </form>
      </Card>
      {run ? (
        run.status !== 'completed' ? (
          <EmptyState
            icon={<Link2 />}
            title={$t('common.lookupNotComplete')}
            description={backlinksError(run.errorCode)}
          />
        ) : (
          <>
            {run.reused ? (
              <p
                className='flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'
                data-backlinks-reused=''
              >
                {$tj('keywordResearch.resultNoNewCharge', {
                  0: fmtTime(run.completedAt || run.createdAt),
                })}
                <InfoTip>{$t('backlinks.sameLookup30Days')}</InfoTip>
                <Button
                  variant='link'
                  size='sm'
                  className='h-auto p-0'
                  disabled={busy}
                  onClick={() => void query(true, run.spec)}
                >
                  {$t('common.queryAgain')}
                </Button>
              </p>
            ) : null}
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
              {(run.result?.perCompetitor ?? []).map((c) => (
                <Card
                  key={c.domain}
                  className='gap-0 p-4'
                  data-gap-competitor={c.domain}
                >
                  <StatTile
                    label={c.domain}
                    value={count(c.total)}
                    help={$t('backlinks.gapPerCompetitorHelp', {
                      0: c.domain,
                      1: run.spec.target,
                    })}
                  />
                </Card>
              ))}
            </div>
            <p className='nr-footnote'>
              {$t('backlinks.gapFootnote', {
                0: run.spec.target,
                1: fmtTime(run.completedAt || run.createdAt),
              })}
            </p>
            <Card className='gap-0 py-0'>
              <GapTable run={run} />
            </Card>
          </>
        )
      ) : connection?.verifiedAt ? (
        <RecentGaps
          recent={recent}
          onOpen={(r) =>
            setParams(new URLSearchParams({ view: 'gap', gap: r.id }), {
              replace: true,
            })
          }
        />
      ) : null}
    </>
  );
}

const gHelper = createColumnHelper<GapRow>();
function GapTable({ run }: { run: Run<GapRow> }) {
  const items = run.result?.items ?? [];
  const anchorRef = useSelectionAnchor();
  const columns = useMemo<ColumnDef<GapRow>[]>(
    () => [
      makeSelectionColumn<GapRow>(anchorRef),
      gHelper.accessor('domain', {
        enableSorting: false,
        header: () => $t('backlinks.linkingSite'),
        cell: ({ getValue }) => link(`https://${getValue()}`, getValue()),
      }) as ColumnDef<GapRow>,
      gHelper.accessor((r) => r.competitors.length, {
        id: 'linksTo',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.linksToCompetitors')}
          />
        ),
        cell: ({ row }) => (
          <span className='flex flex-wrap gap-1'>
            {row.original.competitors.map((c) => (
              <Badge key={c} variant='secondary'>
                {c}
              </Badge>
            ))}
          </span>
        ),
      }) as ColumnDef<GapRow>,
      gHelper.accessor('rank', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.rank')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<GapRow>,
      gHelper.accessor('backlinks', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.linksToThem')}
            align='right'
          />
        ),
        cell: ({ getValue }) => metric(getValue()),
        meta: right,
      }) as ColumnDef<GapRow>,
      gHelper.accessor('spam', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.spamScore')}
            align='right'
          />
        ),
        cell: ({ getValue }) => spamCell(getValue()),
        meta: right,
      }) as ColumnDef<GapRow>,
      gHelper.accessor('firstSeen', {
        sortUndefined: 'last',
        header: ({ column }) => (
          <SortableHeader
            column={column}
            label={$t('backlinks.firstSeen')}
            align='right'
          />
        ),
        cell: ({ getValue }) => date(getValue()),
        meta: right,
      }) as ColumnDef<GapRow>,
    ],
    [anchorRef],
  );
  const t = useTable(
    items,
    columns,
    (r) => `${r.domain} ${r.competitors.join(' ')}`,
    'linksTo',
    { spam: true, select: true, run: run.id },
  );
  // The gap excluded the domain it was looked up for, which the brief names as ours.
  const handOff = useLinkHandOff({
    source: 'backlinks-gap',
    rows: t.selected.map((r) => ({
      domain: r.domain,
      rank: r.rank,
      spam: r.spam,
      competitors: r.competitors,
    })),
    competitors: run.spec.competitors ?? [],
    at: run.completedAt || run.createdAt,
    clear: t.clearSelection,
    own: run.spec.target,
    checked: true,
  });
  const exportRows = () =>
    downloadCsv(
      fileName(run, 'gap'),
      [
        $t('backlinks.linkingSite'),
        $t('backlinks.linksToCompetitors'),
        $t('backlinks.rank'),
        $t('backlinks.linksToThem'),
        $t('backlinks.spamScore'),
        $t('backlinks.firstSeen'),
      ],
      t.rows.map((r): CsvValue[] => [
        r.domain,
        r.competitors.join(' '),
        r.rank,
        r.backlinks,
        r.spam,
        r.firstSeen,
      ]),
    ) || toast.error(() => $t('backlinks.nothingToExport'));
  return (
    <DataTable
      table={t.table}
      isFiltered={t.filtered}
      onClearFilters={t.clear}
      empty={{
        title: $t('backlinks.noGap'),
        description: $t('backlinks.noGapHelp'),
      }}
      toolbar={t.toolbar(exportRows, $t('common.total', { 0: items.length }))}
      footer={
        <>
          {t.footer}
          {handOff}
        </>
      }
    />
  );
}

function RecentGaps({
  recent,
  onOpen,
}: {
  recent?: Recent[];
  onOpen: (r: Recent) => void;
}) {
  if (!recent) return <ListSkeleton rows={3} />;
  const list = recent.filter((r) => r.spec.view === 'gap');
  if (!list.length)
    return (
      <EmptyState
        icon={<Link2 />}
        title={$t('backlinks.noGapYet')}
        description={$t('backlinks.noGapYetHelp')}
      />
    );
  return (
    <section className='space-y-2'>
      <h2 className='text-sm font-semibold'>
        {$t('domainOverview.recentLookups')}
      </h2>
      <Card className='gap-0 py-0'>
        {list.map((r) => (
          <button
            key={r.id}
            type='button'
            className='flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4 py-2.5 text-left text-sm last:border-0 hover:bg-muted/50'
            onClick={() => onOpen(r)}
          >
            <span className='min-w-0 flex-1 truncate font-medium'>
              {$t('backlinks.gapRecentTitle', {
                0: r.spec.target,
                1: (r.spec.competitors ?? []).join(', '),
              })}
            </span>
            <span className='text-xs text-muted-foreground'>
              {r.status === 'completed'
                ? $t('backlinks.gapRecentCount', { 0: r.count ?? 0 })
                : $t('common.notComplete')}
            </span>
            <span className='w-24 text-right text-xs text-muted-foreground tabular-nums'>
              {fmtTime(r.completedAt || r.createdAt)}
            </span>
          </button>
        ))}
      </Card>
    </section>
  );
}
