import {
  getCurrentLocale,
  $t,
  $tj,
  $legacyText,
  useNocoReachLocale,
} from '#i18n';
// 关键词 详情 (2026-10-15 user choice, after Ahrefs' Keywords Explorer): one keyword in one market, a page over the 关键词
// tab it was opened from (/keywords/detail?kw=…&kwLoc=…&kwLang=…, that tab's own query kept, so the header's
// 关键词 › <keyword> trail restores it).
// 概览, 历史趋势, 上下关联, 已收录内容 and 排名历史 load on their own: the free part (Search Console, the weekly rank
// checks, the site's pages) at once, the DataForSEO part beside it, each lookup reused for 30 days by the server.
import { usePageBreadcrumb } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Bot, Bookmark, BookmarkCheck, TrendingUp } from 'lucide-react';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import { RouteChildPage } from '#components/route-child-page';
import { PageContainer, PageHeader, Section } from '#components/reach/page';
import { InlineError, LoadError } from '#components/reach/states';
import { InfoTip, WithInfo } from '#components/reach/info-tip';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { StatTile } from '#components/seo/stat-tile';
import { ScoreBadge } from '#components/seo/score-badge';
import {
  IntentBadge,
  getIntentLabels,
  toIntent,
} from '#components/seo/intent-badge';
import { useProject } from './reach-data';
import { useFreshData } from './workspace-cache';
import { safeLink } from './analytics';
import { help } from './glossary';
import { getMonths } from './keyword-research';
import { StartTrackingDialog } from './rank-tracking-tab';
import { KeywordHandOffDialog } from './keyword-hand-off';
import { HandOffNotice, type HandOffResult } from './strategy/hand-off';
import {
  DETAIL_PARAMS,
  getMarkets,
  marketLabel,
  metric,
  useOpenKeyword,
  type SiteRank,
} from './keyword-api';

type Market = { locationCode: number; language: string };
type Item = {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  competitionLevel: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  difficulty: number | null;
  intent: string | null;
  monthlySearches: { year: number; month: number; volume: number | null }[];
  trend: {
    monthly: number | null;
    quarterly: number | null;
    yearly: number | null;
  } | null;
  coreKeyword: string | null;
  serpFeatures: string[];
  resultsCount: number | null;
  referringDomains: number | null;
  backlinks: number | null;
};
type Failed = { status: 'error'; message: string };
type MarketData =
  | { connected: false }
  | {
      connected: true;
      overview: { status: 'ready'; at: string; item: Item | null } | Failed;
      related: {
        status: 'ready' | 'error';
        message: string | null;
        related: Item[];
        matching: Item[];
        questions: Item[];
      };
    };
type SerpItem = {
  position: number | null;
  title: string;
  url: string;
  domain: string;
  own: boolean;
};
type SerpData =
  | { connected: false }
  | ({ connected: true; source: 'tracking' | 'lookup' } & (
      | {
          status: 'ready';
          at: string;
          items: SerpItem[];
          questions: string[];
          related: string[];
          features: string[];
        }
      | Failed
    ));
type GscPage = {
  url: string;
  clicks: number;
  impressions: number;
  position: number | null;
};
type GscQuery = GscPage & { query: string; page: string };
type SiteData = {
  keyword: string;
  market: Market;
  dataforseo: boolean;
  saved: {
    id: string;
    source: string;
    tagIds: string[];
    savedAt: string;
  } | null;
  tracking: {
    id: string;
    addedAt: string;
    history: { at: string; position: number | null; url: string | null }[];
  } | null;
  gsc: {
    connected: boolean;
    cutoff: string | null;
    window: { start: string; end: string } | null;
    pages: GscPage[];
    queries: GscQuery[];
  };
  mentions: { url: string; title: string | null }[];
};
type TrendPoint = {
  date: string;
  clicks: number | null;
  impressions: number | null;
};
type RowDetail = { connected: boolean; trend: TrendPoint[] };

const DAY = 86400000;
const addDays = (d: string, n: number) =>
  new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const day = (v?: string | null) =>
  v ? new Date(v).toLocaleDateString(getCurrentLocale()) : '—';
const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};
const pct = (v: number | null | undefined) =>
  v == null ? null : `${v > 0 ? '+' : ''}${Math.round(v)}%`;
const position = (v: number | null | undefined) =>
  v == null || !v ? '—' : v.toFixed(1);
const monthLabel = (m: { year: number; month: number }) =>
  $t('keywordResearch.monthYear', {
    0: String(m.year).slice(2),
    1: getMonths()[m.month - 1],
  });
// Result-page features DataForSEO names, in words; an unknown one shows as it came.
const FEATURES: Record<string, string> = {
  ai_overview: 'keywordDetail.featureAiOverview',
  people_also_ask: 'keywordDetail.featurePeopleAlsoAsk',
  featured_snippet: 'keywordDetail.featureFeaturedSnippet',
  video: 'keywordDetail.featureVideo',
  short_videos: 'keywordDetail.featureShortVideos',
  images: 'keywordDetail.featureImages',
  top_stories: 'keywordDetail.featureTopStories',
  local_pack: 'keywordDetail.featureLocalPack',
  knowledge_graph: 'keywordDetail.featureKnowledgeGraph',
  related_searches: 'keywordDetail.featureRelatedSearches',
  people_also_search: 'keywordDetail.featurePeopleAlsoSearch',
  discussions_and_forums: 'keywordDetail.featureForums',
  perspectives: 'keywordDetail.featurePerspectives',
  twitter: 'keywordDetail.featureX',
  shopping: 'keywordDetail.featureShopping',
  popular_products: 'keywordDetail.featureShopping',
  answer_box: 'keywordDetail.featureAnswerBox',
};
const featureName = (f: string) =>
  FEATURES[f] ? $t(FEATURES[f]) : f.replace(/_/g, ' ');
const COMPETITION: Record<string, string> = {
  LOW: 'keywordDetail.competitionLow',
  MEDIUM: 'keywordDetail.competitionMedium',
  HIGH: 'keywordDetail.competitionHigh',
};
const detailRequest = <T,>(action: string, body: object) =>
  api.action<T>('nrKeywordDetail', action, {
    method: 'POST',
    body,
    unwrap: 'data',
  });

export default function KeywordDetailPage() {
  useNocoReachLocale();
  const [params] = useSearchParams();
  const { project } = useProject();
  const keyword = (params.get('kw') || '').trim();
  const fallback = getMarkets()[0];
  const market =
    getMarkets().find(
      (m) =>
        m.locationCode === Number(params.get('kwLoc')) &&
        m.language === params.get('kwLang'),
    ) ?? fallback;
  const { t } = useTranslation();
  // The trail's 关键词 goes to the tab it came from with that tab's query, without the detail's own parameters; the
  // header carries the only way back (L6), so the page has no BackButton.
  const back = useMemo(() => {
    const p = new URLSearchParams(params);
    DETAIL_PARAMS.forEach((k) => p.delete(k));
    const s = p.toString();
    return { pathname: '/keywords', search: s ? `?${s}` : '' };
  }, [params]);
  usePageBreadcrumb([
    { label: t('nocoreach.nav.keywords'), to: back },
    { label: keyword || $t('keywordDetail.noKeyword') },
  ]);
  return (
    <RouteChildPage>
      <PageContainer className='nr-data-page'>
        {keyword && project ? (
          <Detail
            key={`${project.id}:${keyword}:${market.locationCode}:${market.language}`}
            projectId={project.id}
            keyword={keyword}
            market={market}
          />
        ) : null}
        {!keyword ? (
          <LoadError
            title={$t('keywordDetail.noKeyword')}
            message={$t('keywordDetail.noKeywordHelp')}
          />
        ) : null}
      </PageContainer>
    </RouteChildPage>
  );
}

function Detail({
  projectId,
  keyword,
  market,
}: {
  projectId: number;
  keyword: string;
  market: Market;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const body = {
    projectId: String(projectId),
    keyword,
    locationCode: market.locationCode,
    language: market.language,
  };
  const k = JSON.stringify(body);
  const site = useFreshData<SiteData>(`keyword-detail:site:${k}`, () =>
    detailRequest<SiteData>('site', body),
  );
  const data = useFreshData<MarketData>(`keyword-detail:market:${k}`, () =>
    detailRequest<MarketData>('market', body),
  );
  const serp = useFreshData<SerpData>(`keyword-detail:serp:${k}`, () =>
    detailRequest<SerpData>('serp', body),
  );
  const [dialog, setDialog] = useState<'handoff' | 'track'>();
  const [handed, setHanded] = useState<HandOffResult>();
  const [saving, setSaving] = useState(false);
  // Tracking just started: the first check runs in the background, so look again until it is in.
  const waiting = Boolean(
    site.data?.tracking && !site.data.tracking.history.length,
  );
  const { reload: reloadSite } = site,
    { reload: reloadSerp } = serp;
  useEffect(() => {
    if (!waiting) return;
    const t = setTimeout(() => {
      reloadSite();
      reloadSerp();
    }, 8000);
    return () => clearTimeout(t);
  }, [waiting, site.data, reloadSite, reloadSerp]);
  const overview =
    data.data?.connected && data.data.overview.status === 'ready'
      ? data.data.overview.item
      : null;
  const gsc = site.data?.gsc;
  // The site's figures for the keyword over its pages, as 交给 Agent and 本站排名 take them.
  const rank = useMemo<SiteRank | undefined>(() => {
    const pages = gsc?.pages ?? [];
    const impressions = pages.reduce((n, p) => n + p.impressions, 0);
    if (!impressions) return undefined;
    const best = [...pages].sort(
      (a, b) => (a.position ?? 999) - (b.position ?? 999),
    )[0];
    return {
      position:
        pages.reduce((n, p) => n + (p.position ?? 0) * p.impressions, 0) /
        impressions,
      clicks: pages.reduce((n, p) => n + p.clicks, 0),
      impressions,
      page: best.url,
    };
  }, [gsc]);
  const setMarket = (v: string) => {
    const m = getMarkets().find((x) => `${x.locationCode}:${x.language}` === v);
    if (!m) return;
    const p = new URLSearchParams(params);
    p.set('kwLoc', String(m.locationCode));
    p.set('kwLang', m.language);
    void navigate({ search: `?${p}` }, { replace: true });
  };
  const save = async () => {
    setSaving(true);
    try {
      const r = await detailRequest<{ saved: number; skipped: number }>(
        'save',
        body,
      );
      toast.success(() =>
        r.saved
          ? $t('keywordDetail.savedKeyword', { 0: keyword })
          : $t('keywordDetail.alreadySaved'),
      );
      site.reload();
    } catch (e) {
      toast.error(() =>
        e instanceof Error ? $legacyText(e.message) : $t('common.saveFailed'),
      );
    } finally {
      setSaving(false);
    }
  };
  const actions = (
    <>
      <Select
        value={`${market.locationCode}:${market.language}`}
        onValueChange={(v) => setMarket(String(v))}
      >
        <SelectTrigger
          size='sm'
          className='w-auto'
          aria-label={$t('common.market')}
        >
          <SelectValue>
            {(v: string) =>
              getMarkets().find((x) => `${x.locationCode}:${x.language}` === v)
                ?.label ?? ''
            }
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align='end'
          className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'
        >
          {getMarkets().map((m) => (
            <SelectItem
              key={`${m.locationCode}:${m.language}`}
              value={`${m.locationCode}:${m.language}`}
            >
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {site.data?.saved ? (
        <Tag tone='green' icon={<BookmarkCheck />}>
          {$t('keywordDetail.saved')}
        </Tag>
      ) : (
        <Button
          variant='outline'
          size='sm'
          disabled={!site.data || saving}
          onClick={() => void save()}
        >
          <Bookmark data-icon='inline-start' />
          {saving ? $t('common.saving') : $t('common.save')}
        </Button>
      )}
      {site.data?.tracking ? (
        <Tag tone='blue' icon={<TrendingUp />}>
          {$t('keywordDetail.tracked')}
        </Tag>
      ) : (
        <Button
          variant='outline'
          size='sm'
          disabled={!site.data}
          onClick={() => setDialog('track')}
        >
          <TrendingUp data-icon='inline-start' />
          {$t('common.startTracking')}
        </Button>
      )}
      <Button size='sm' onClick={() => setDialog('handoff')}>
        <Bot data-icon='inline-start' />
        {$t('common.handOffAgent')}
      </Button>
    </>
  );
  return (
    <>
      <PageHeader
        title={keyword}
        description={$tj('keywordDetail.description', {
          0: marketLabel(market),
        })}
        actions={actions}
      />
      <HandOffNotice result={handed} />
      {site.error ? (
        <LoadError
          title={$t('keywordDetail.notLoad')}
          message={
            site.error instanceof Error
              ? $legacyText(site.error.message)
              : undefined
          }
          onRetry={site.reload}
        />
      ) : null}
      <OverviewCards
        data={data.data}
        error={data.error}
        onRetry={data.reload}
      />
      <TrendSection
        projectId={projectId}
        keyword={keyword}
        item={overview}
        data={data.data}
        gsc={gsc}
      />
      <RelatedSection
        data={data.data}
        error={data.error}
        serp={serp.data}
        gscQueries={gsc?.queries}
        gscConnected={gsc?.connected}
        market={market}
      />
      <ContentSection
        site={site.data}
        serp={serp.data}
        serpError={serp.error}
        onRetrySerp={serp.reload}
      />
      {site.data?.tracking ? (
        <RankHistory tracking={site.data.tracking} />
      ) : null}
      {dialog === 'track' ? (
        <StartTrackingDialog
          keywords={[{ keyword, market }]}
          onClose={() => setDialog(undefined)}
          onDone={() => {
            setDialog(undefined);
            site.reload();
            serp.reload();
          }}
        />
      ) : null}
      {dialog === 'handoff' ? (
        <KeywordHandOffDialog
          projectId={projectId}
          rows={[
            {
              keyword,
              market,
              volume: overview?.volume ?? null,
              difficulty: overview?.difficulty ?? null,
              intent: overview?.intent ?? null,
              rank,
            },
          ]}
          onClose={() => setDialog(undefined)}
          onDone={(r) => {
            setDialog(undefined);
            setHanded({ ok: true, text: r.title, taskId: r.taskId });
          }}
        />
      ) : null}
    </>
  );
}

// Why a DataForSEO part is empty: not connected (where to connect), or the lookup failed (its reason).
function NotConnected() {
  const navigate = useNavigate();
  return (
    <p className='text-sm text-muted-foreground'>
      {$t('keywordDetail.connectDataforseo')}{' '}
      <button
        type='button'
        className='nr-link'
        onClick={() => void navigate('/connections?source=keywords')}
      >
        {$t('common.openConnections')}
      </button>
    </p>
  );
}
const errorText = (e: unknown) =>
  e instanceof Error ? $legacyText(e.message) : $t('keywordDetail.notLoad');

function OverviewCards({
  data,
  error,
  onRetry,
}: {
  data?: MarketData;
  error?: unknown;
  onRetry: () => void;
}) {
  if (error)
    return (
      <InlineError
        action={
          <Button variant='outline' size='sm' onClick={onRetry}>
            {$t('common.retry')}
          </Button>
        }
      >
        {errorText(error)}
      </InlineError>
    );
  if (!data)
    return (
      <div
        role='status'
        aria-label={$t('common.loading')}
        className='grid grid-cols-2 gap-3 lg:grid-cols-5'
      >
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className='h-24 rounded-xl' />
        ))}
      </div>
    );
  if (!data.connected)
    return (
      <Card className='p-4'>
        <NotConnected />
      </Card>
    );
  if (data.overview.status === 'error')
    return <InlineError>{$legacyText(data.overview.message)}</InlineError>;
  const item = data.overview.item;
  if (!item)
    return (
      <Card className='p-4'>
        <p className='text-sm text-muted-foreground'>
          {$t('keywordDetail.noMarketData')}
        </p>
      </Card>
    );
  const growth = [
    pct(item.trend?.yearly) &&
      $t('keywordDetail.yearly', { 0: pct(item.trend?.yearly)! }),
    pct(item.trend?.quarterly) &&
      $t('keywordDetail.quarterly', { 0: pct(item.trend?.quarterly)! }),
  ]
    .filter(Boolean)
    .join(' · ');
  const tiles: { key: string; label: string; value: string; hint?: string }[] =
    [
      {
        key: 'volume',
        label: $t('common.monthlyVolume'),
        value: metric(item.volume),
        hint: growth || undefined,
      },
      {
        key: 'difficulty',
        label: $t('common.difficulty'),
        value: item.difficulty == null ? '—' : String(item.difficulty),
        hint:
          item.referringDomains != null
            ? $t('keywordDetail.topTenDomains', {
                0: Math.round(item.referringDomains).toLocaleString(
                  getCurrentLocale(),
                ),
              })
            : undefined,
      },
      {
        key: 'cpc',
        label: 'CPC',
        value: item.cpc == null ? '—' : `$${item.cpc.toFixed(2)}`,
        hint: item.competitionLevel
          ? $t('keywordDetail.adCompetition', {
              0: $t(COMPETITION[item.competitionLevel]),
            })
          : undefined,
      },
      {
        key: 'intent',
        label: $t('common.intent'),
        value: item.intent ? getIntentLabels()[toIntent(item.intent)] : '—',
        hint:
          item.coreKeyword &&
          item.coreKeyword.toLowerCase() !== item.keyword.toLowerCase()
            ? $t('keywordDetail.parentTopic', { 0: item.coreKeyword })
            : undefined,
      },
    ];
  return (
    <section className='space-y-2' aria-label={$t('keywordDetail.overview')}>
      <div
        className='grid grid-cols-2 gap-3 lg:grid-cols-5'
        data-keyword-overview=''
      >
        {tiles.map((t) => (
          <Card key={t.key} className='gap-0 p-4'>
            <StatTile
              label={t.label}
              value={t.value}
              hint={t.hint}
              help={help(t.label)}
            />
          </Card>
        ))}
        <Card className='gap-2 p-4'>
          <p className='text-xs font-medium tracking-wide text-muted-foreground'>
            <WithInfo help={$t('keywordDetail.featuresHelp')}>
              {$t('keywordDetail.features')}
            </WithInfo>
          </p>
          {item.serpFeatures.length ? (
            <div className='flex flex-wrap gap-1'>
              {item.serpFeatures.map((f) => (
                <Tag key={f} tone='slate'>
                  {featureName(f)}
                </Tag>
              ))}
            </div>
          ) : (
            <p className='text-sm text-muted-foreground'>
              {$t('keywordDetail.organicOnly')}
            </p>
          )}
          {item.resultsCount != null ? (
            <p className='text-xs text-muted-foreground'>
              {$t('keywordDetail.results', {
                0: item.resultsCount.toLocaleString(getCurrentLocale()),
              })}
            </p>
          ) : null}
        </Card>
      </div>
      <p className='flex items-center gap-1 text-xs text-muted-foreground'>
        {$tj('keywordDetail.marketDataAt', { 0: day(data.overview.at) })}
        <InfoTip label={$t('keywordDetail.aboutMarketData')}>
          {$t('keywordDetail.marketDataHelp')}
        </InfoTip>
      </p>
    </section>
  );
}

function TrendSection({
  projectId,
  keyword,
  item,
  data,
  gsc,
}: {
  projectId: number;
  keyword: string;
  item: Item | null;
  data?: MarketData;
  gsc?: SiteData['gsc'];
}) {
  const months = (item?.monthlySearches ?? []).map((m) => ({
    month: monthLabel(m),
    value: m.volume,
  }));
  // The site's own days for the keyword: the 90 Search Console days up to the last synced one (Search Console, live).
  const cutoff = gsc?.cutoff;
  const body = cutoff
    ? {
        projectId: String(projectId),
        type: 'web',
        start: addDays(cutoff, -89),
        end: cutoff,
        previousStart: addDays(cutoff, -179),
        previousEnd: addDays(cutoff, -90),
        dimension: 'query',
        key: keyword.toLowerCase(),
      }
    : null;
  const row = useFreshData<RowDetail>(
    body ? `keyword-detail:gsc:${JSON.stringify(body)}` : null,
    () =>
      api.action<RowDetail>('nrDataViews', 'searchRow', {
        method: 'POST',
        body: body!,
        unwrap: 'data',
      }),
  );
  const days = (row.data?.trend ?? []).map((p) => ({
    date: p.date,
    impressions: p.impressions,
    clicks: p.clicks,
  }));
  const shown = days.some((d) => d.impressions);
  return (
    <Section
      title={$t('keywordDetail.trend')}
      description={$t('keywordDetail.trendDescription')}
    >
      <div className='grid gap-6 lg:grid-cols-2'>
        <div className='min-w-0 space-y-2' data-keyword-months=''>
          <h3 className='text-sm font-medium'>
            {$t('keywordDetail.monthlySearches')}
          </h3>
          {!data ? (
            <Skeleton className='h-48' />
          ) : !data.connected ? (
            <NotConnected />
          ) : months.length < 2 ? (
            <p className='text-sm text-muted-foreground'>
              {$t('keywordResearch.noMonthlySearchVolume')}
            </p>
          ) : (
            <div
              className='nr-chart-box'
              role='img'
              aria-label={$t('keywordResearch.value12MonthSearchVolumeTrend')}
            >
              <ResponsiveContainer width='100%' height={200}>
                <BarChart
                  data={months}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray='3 3' vertical={false} />
                  <XAxis dataKey='month' fontSize={11} minTickGap={8} />
                  <YAxis
                    fontSize={11}
                    width={44}
                    allowDecimals={false}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 100) / 10}K` : String(v)
                    }
                  />
                  <Tooltip
                    formatter={(v) => [
                      Number(v).toLocaleString(getCurrentLocale()),
                      $t('common.monthlyVolume'),
                    ]}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey='value'
                    name={$t('common.monthlyVolume')}
                    fill='var(--chart-3)'
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className='min-w-0 space-y-2' data-keyword-days=''>
          <h3 className='flex items-center gap-1 text-sm font-medium'>
            {$t('keywordDetail.siteDays')}
            <InfoTip label={$t('keywordDetail.aboutSiteDays')}>
              {$t('keywordDetail.siteDaysHelp')}
            </InfoTip>
          </h3>
          {!gsc ? (
            <Skeleton className='h-48' />
          ) : !gsc.connected || !cutoff ? (
            <p className='text-sm text-muted-foreground'>
              {$t('keywordDetail.connectSearchConsole')}
            </p>
          ) : row.error ? (
            <InlineError>{errorText(row.error)}</InlineError>
          ) : !row.data ? (
            <Skeleton className='h-48' />
          ) : !shown ? (
            <p className='text-sm text-muted-foreground'>
              {$t('keywordDetail.noSiteDays')}
            </p>
          ) : (
            <div className='nr-chart-box'>
              <ResponsiveContainer width='100%' height={200}>
                <LineChart
                  data={days}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray='3 3' vertical={false} />
                  <XAxis
                    dataKey='date'
                    tickFormatter={(d: string) => d.slice(5)}
                    minTickGap={28}
                    fontSize={11}
                  />
                  <YAxis
                    yAxisId='i'
                    fontSize={11}
                    width={44}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId='c'
                    orientation='right'
                    fontSize={11}
                    width={32}
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId='i'
                    isAnimationActive={false}
                    type='linear'
                    dataKey='impressions'
                    name={$t('common.impressions')}
                    stroke='var(--chart-3)'
                    dot={false}
                  />
                  <Line
                    yAxisId='c'
                    isAnimationActive={false}
                    type='linear'
                    dataKey='clicks'
                    name={$t('common.clicks')}
                    stroke='var(--chart-1)'
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

// A keyword's 12 months as a small line, for the lists of related keywords.
function Spark({ months }: { months: Item['monthlySearches'] }) {
  const pts = months.map((m) => m.volume ?? 0);
  if (pts.length < 2 || !pts.some(Boolean))
    return <span className='text-xs text-muted-foreground'>—</span>;
  const w = 64,
    h = 18,
    max = Math.max(...pts),
    min = Math.min(...pts),
    span = max - min || 1;
  const d = pts
    .map(
      (p, i) =>
        `${(i / (pts.length - 1)) * w},${h - 2 - ((p - min) / span) * (h - 4)}`,
    )
    .join(' ');
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className='h-4 w-16'
      role='img'
      aria-label={$t('keywordDetail.twelveMonthTrend')}
    >
      <polyline
        points={d}
        fill='none'
        stroke='var(--chart-3)'
        strokeWidth='1.5'
        vectorEffect='non-scaling-stroke'
      />
    </svg>
  );
}

const LIMIT = 10;
function KeywordTable({ items, market }: { items: Item[]; market: Market }) {
  const open = useOpenKeyword();
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LIMIT);
  return (
    <div className='space-y-2'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{$t('common.keywords')}</TableHead>
            <TableHead className='text-right'>
              {$t('common.monthlyVolume')}
            </TableHead>
            <TableHead className='text-right'>
              {$t('common.difficulty')}
            </TableHead>
            <TableHead>{$t('keywordDetail.trendShort')}</TableHead>
            <TableHead>{$t('common.intent')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((i) => (
            <TableRow key={i.keyword}>
              <TableCell className='max-w-sm'>
                <button
                  type='button'
                  className='block max-w-full truncate text-left text-primary underline-offset-4 hover:underline'
                  title={i.keyword}
                  onClick={() => open(i.keyword, market)}
                >
                  {i.keyword}
                </button>
              </TableCell>
              <TableCell className='text-right tabular-nums'>
                {metric(i.volume)}
              </TableCell>
              <TableCell className='text-right'>
                <ScoreBadge value={i.difficulty} />
              </TableCell>
              <TableCell>
                <Spark months={i.monthlySearches} />
              </TableCell>
              <TableCell>
                {i.intent ? <IntentBadge intent={i.intent} /> : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {items.length > LIMIT ? (
        <Button variant='ghost' size='sm' onClick={() => setAll((v) => !v)}>
          {all
            ? $t('common.collapse')
            : $t('keywordDetail.showAll', { 0: items.length })}
        </Button>
      ) : null}
    </div>
  );
}

function RelatedSection({
  data,
  error,
  serp,
  gscQueries,
  gscConnected,
  market,
}: {
  data?: MarketData;
  error?: unknown;
  serp?: SerpData;
  gscQueries?: GscQuery[];
  gscConnected?: boolean;
  market: Market;
}) {
  const related = data?.connected ? data.related : null;
  const asked =
    serp?.connected && serp.status === 'ready' ? serp.questions : [];
  const tabs = [
    {
      key: 'related',
      label: $t('keyword.relatedSearches'),
      count: related?.related.length ?? 0,
    },
    {
      key: 'matching',
      label: $t('keyword.containsTerm'),
      count: related?.matching.length ?? 0,
    },
    {
      key: 'questions',
      label: $t('keywordDetail.questions'),
      count: (related?.questions.length ?? 0) + asked.length,
    },
    {
      key: 'site',
      label: $t('keywordDetail.siteQueries'),
      count: gscQueries?.length ?? 0,
    },
  ];
  const [picked, setPicked] = useState<string>();
  const tab = picked ?? tabs.find((t) => t.count)?.key ?? 'related';
  const body = (() => {
    if (tab === 'site') {
      if (!gscQueries) return <Skeleton className='h-32' />;
      if (!gscConnected)
        return (
          <p className='text-sm text-muted-foreground'>
            {$t('keywordDetail.connectSearchConsole')}
          </p>
        );
      if (!gscQueries.length)
        return (
          <p className='text-sm text-muted-foreground'>
            {$t('keywordDetail.noSiteQueries')}
          </p>
        );
      return <SiteQueries rows={gscQueries} market={market} />;
    }
    if (error) return <InlineError>{errorText(error)}</InlineError>;
    if (!data) return <Skeleton className='h-32' />;
    if (!data.connected) return <NotConnected />;
    if (data.related.status === 'error')
      return (
        <InlineError>{$legacyText(data.related.message || '')}</InlineError>
      );
    const items =
      tab === 'matching'
        ? data.related.matching
        : tab === 'questions'
          ? data.related.questions
          : data.related.related;
    return (
      <div className='space-y-4'>
        {items.length ? (
          <KeywordTable items={items} market={market} />
        ) : !(tab === 'questions' && asked.length) ? (
          <p className='text-sm text-muted-foreground'>
            {$t('keywordDetail.noRelated')}
          </p>
        ) : null}
        {tab === 'questions' && asked.length ? (
          <div className='space-y-1' data-people-also-ask=''>
            <h3 className='text-sm font-medium'>
              {$t('keywordDetail.peopleAlsoAsk')}
            </h3>
            <ul className='list-disc space-y-0.5 pl-5 text-sm'>
              {asked.map((q) => (
                <li key={q}>{q}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  })();
  return (
    <Section
      title={$t('keywordDetail.related')}
      description={$t('keywordDetail.relatedDescription')}
    >
      <Tabs value={tab} onValueChange={(v) => setPicked(String(v))}>
        <TabsList variant='line' className='h-auto! flex-wrap justify-start'>
          {tabs.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label} ({t.count})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {body}
    </Section>
  );
}

function SiteQueries({ rows, market }: { rows: GscQuery[]; market: Market }) {
  const open = useOpenKeyword();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{$t('common.query')}</TableHead>
          <TableHead className='text-right'>{$t('common.clicks')}</TableHead>
          <TableHead className='text-right'>
            {$t('common.impressions')}
          </TableHead>
          <TableHead className='text-right'>
            {$t('common.averagePosition')}
          </TableHead>
          <TableHead>{$t('keywordDetail.bestPage')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.query}>
            <TableCell className='max-w-sm'>
              <button
                type='button'
                className='block max-w-full truncate text-left text-primary underline-offset-4 hover:underline'
                title={r.query}
                onClick={() => open(r.query, market)}
              >
                {r.query}
              </button>
            </TableCell>
            <TableCell className='text-right tabular-nums'>
              {metric(r.clicks)}
            </TableCell>
            <TableCell className='text-right tabular-nums'>
              {metric(r.impressions)}
            </TableCell>
            <TableCell className='text-right tabular-nums'>
              {position(r.position)}
            </TableCell>
            <TableCell className='max-w-56'>
              <PageLink url={r.page} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function PageLink({ url, label }: { url: string; label?: string }) {
  const href = safeLink(url);
  return href ? (
    <a
      className='block max-w-full truncate text-primary hover:underline'
      href={href}
      target='_blank'
      rel='noreferrer'
      title={url}
    >
      {label || pathOf(url)}
    </a>
  ) : (
    <span className='block max-w-full truncate' title={url}>
      {label || url}
    </span>
  );
}

function ContentSection({
  site,
  serp,
  serpError,
  onRetrySerp,
}: {
  site?: SiteData;
  serp?: SerpData;
  serpError?: unknown;
  onRetrySerp: () => void;
}) {
  const gsc = site?.gsc;
  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      <Section
        className='min-w-0'
        title={$t('keywordDetail.siteContent')}
        description={
          gsc?.window
            ? $t('keywordDetail.siteContentDescription', {
                0: gsc.window.start,
                1: gsc.window.end,
              })
            : $t('keywordDetail.siteContentShort')
        }
      >
        {!site ? (
          <Skeleton className='h-32' />
        ) : !gsc?.connected || !gsc.cutoff ? (
          <p className='text-sm text-muted-foreground'>
            {$t('keywordDetail.connectSearchConsole')}
          </p>
        ) : gsc.pages.length ? (
          <Table data-site-pages=''>
            <TableHeader>
              <TableRow>
                <TableHead>{$t('common.page')}</TableHead>
                <TableHead className='text-right'>
                  {$t('common.clicks')}
                </TableHead>
                <TableHead className='text-right'>
                  {$t('common.impressions')}
                </TableHead>
                <TableHead className='text-right'>
                  {$t('common.averagePosition')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {gsc.pages.map((p) => (
                <TableRow key={p.url}>
                  <TableCell className='max-w-64'>
                    <PageLink url={p.url} />
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {metric(p.clicks)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {metric(p.impressions)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    {position(p.position)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {$t('keywordDetail.noSitePages')}
          </p>
        )}
        {site?.mentions.length ? (
          <div className='space-y-1 border-t pt-3' data-site-mentions=''>
            <h3 className='flex items-center gap-1 text-sm font-medium'>
              {$t('keywordDetail.mentions')}
              <InfoTip label={$t('keywordDetail.aboutMentions')}>
                {$t('keywordDetail.mentionsHelp')}
              </InfoTip>
            </h3>
            <ul className='space-y-1 text-sm'>
              {site.mentions.map((m) => (
                <li key={m.url} className='min-w-0'>
                  <PageLink url={m.url} label={m.title || undefined} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Section>
      <Section
        className='min-w-0'
        title={$t('keywordDetail.topTen')}
        description={
          serp?.connected && serp.status === 'ready'
            ? serp.source === 'tracking'
              ? $t('keywordDetail.topTenFromTracking', { 0: day(serp.at) })
              : $t('keywordDetail.topTenFromLookup', { 0: day(serp.at) })
            : $t('keywordDetail.topTenShort')
        }
      >
        {serpError ? (
          <InlineError
            action={
              <Button variant='outline' size='sm' onClick={onRetrySerp}>
                {$t('common.retry')}
              </Button>
            }
          >
            {errorText(serpError)}
          </InlineError>
        ) : !serp ? (
          <Skeleton className='h-32' />
        ) : !serp.connected ? (
          <NotConnected />
        ) : serp.status === 'error' ? (
          <InlineError>{$legacyText(serp.message)}</InlineError>
        ) : serp.items.length ? (
          <ol className='space-y-2 text-sm' data-top-ten=''>
            {serp.items.map((r, i) => (
              <li
                key={`${r.position}-${r.url}`}
                className={cn(
                  'flex gap-2 rounded-md px-2 py-1',
                  r.own && 'bg-muted',
                )}
              >
                <span className='w-5 shrink-0 text-right text-muted-foreground tabular-nums'>
                  {r.position ?? i + 1}
                </span>
                <span className='min-w-0 flex-1'>
                  <PageLink url={r.url} label={r.title || r.url} />
                  <span className='flex items-center gap-1.5 truncate text-xs text-muted-foreground'>
                    {r.domain}
                    {r.own ? (
                      <Tag tone='blue'>{$t('keywordDetail.ownSite')}</Tag>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className='text-sm text-muted-foreground'>
            {$t('keywordResearch.noOrganicSearchResults')}
          </p>
        )}
      </Section>
    </div>
  );
}

function RankHistory({
  tracking,
}: {
  tracking: NonNullable<SiteData['tracking']>;
}) {
  const history = tracking.history;
  const last = history.at(-1);
  return (
    <Section
      title={$t('keywordDetail.rankHistory')}
      description={$tj('keywordDetail.rankHistoryDescription', {
        0: day(tracking.addedAt),
      })}
    >
      {history.length > 1 ? (
        <div className='nr-chart-box'>
          <ResponsiveContainer width='100%' height={200}>
            <LineChart
              data={history.map((c) => ({
                date: c.at.slice(5, 10),
                position: c.position,
              }))}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray='3 3' vertical={false} />
              <XAxis dataKey='date' fontSize={11} />
              <YAxis
                reversed
                domain={[1, 'dataMax']}
                allowDecimals={false}
                fontSize={11}
                width={32}
              />
              <Tooltip />
              <Line
                isAnimationActive={false}
                type='linear'
                dataKey='position'
                name={$t('keywordDetail.googlePosition')}
                stroke='var(--chart-3)'
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {$t('rankTracking.trendShowsAfterTwoChecks')}
        </p>
      )}
      {last ? (
        <div className='space-y-1 text-sm'>
          <p>
            {last.position
              ? $t('keywordDetail.lastCheck', {
                  0: day(last.at),
                  1: last.position,
                })
              : $t('keywordDetail.lastCheckBeyond', { 0: day(last.at) })}
          </p>
          {last.url ? <PageLink url={last.url} /> : null}
        </div>
      ) : (
        <p className='text-sm text-muted-foreground'>
          {$t('rankTracking.waitingFirstCheck')}
        </p>
      )}
    </Section>
  );
}
