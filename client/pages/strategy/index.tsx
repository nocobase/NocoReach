import { googleLocalFreshness } from '../../../shared/google-cache.js';
import {
  useMessageState,
  getCurrentLocale,
  translateSystemError,
  $t,
  $tj,
  $legacyText,
} from '#i18n';
import { timeZoneName } from '#lib/time-zone-name';
import { rowsFor, type Row } from './board';
import { signalDisposition } from '../../../shared/strategy-pending.js';
import {
  AreaList,
  metricItems,
  type SourceCard,
  type Area,
} from './insights-view';
import {
  FoldedSituation,
  History,
  MetricTiles,
  Today,
  WaitingNote,
} from './briefing';
import { dayOf, feedOf } from './feed';
import { Composer, InsightChatProvider } from './threads';
import { useOptionalOnlineChat } from '../../online-agent/context';
import { useChatPanel } from '@nocobase/app-plugin-agents/client/chat';
import { Link, useNavigate } from 'react-router';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { InfoTip } from '#components/reach/info-tip';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { useFreshData } from '../workspace-cache';
import { RequestBlock } from './request-block';
import { AnalysisAlert } from './analysis-alert';
import { PageContainer, PageHeader } from '#components/reach/page';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '#components/ui/button';
import { RefreshButton } from '#components/reach/refresh-button';
import { taskRecords, useProject } from '../reach-data';
import { PageSkeleton } from '../workspace-cache';
import { type Work } from '../task-execution-types';
import type { StrategyState } from './model';
import { refreshNavBadges } from '#components/app-shell/nav-badges';
import { useMe } from '../me';
import { isWaitingTask } from '../task-waiting';
import {
  handOff,
  handOffResult,
  recommendedFor,
  HandOffNotice,
  type HandOffResult,
} from './hand-off';
import { OpportunityHandOffDialog } from './places';
import { placesOf } from './places-model';
import { localizeWorkSnapshots } from '../playbook-snapshot';
import {
  playbookRequest,
  localizePlaybookList,
  stageName,
  type PlaybookList,
} from '../playbook-model';
import {
  request,
  analysisRequest,
  judgeMissing,
  type AnalysisStatus,
} from './service';
import '../reach-workspace.css';
import './strategy.css';
type Task = {
  id: number;
  title: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  evidence?: { work?: Work; createdBy?: { id?: string } };
};
// Insights (SPEC §5): the key numbers, then the daily analysis as a conversation: today's summary, the decisions
// waiting and what else needs you, then the earlier days; Ask AI continues in the chat. The analysis runs on the
// server (the daily workflow or Update analysis).
export default function StrategyPage() {
  const { project, error: projectError } = useProject();
  if (!project)
    return projectError ? (
      <PageContainer className='nr-page'>
        <p role='alert'>{projectError}</p>
      </PageContainer>
    ) : (
      <PageSkeleton title={$t('strategy.insights')} />
    );
  return <ProjectInsights key={project.id} projectId={project.id} />;
}
function ProjectInsights({ projectId }: { projectId: number }) {
  const [state, setState] = useState<StrategyState>(),
    [error, setError] = useMessageState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    request<StrategyState>(projectId, 'state')
      .then((s) => {
        if (active) setState(s);
      })
      .catch(() => {
        if (active) setError(() => $t('strategy.notLoadInsightsTryAgain'));
      });
    return () => {
      active = false;
    };
  }, [projectId, attempt, setError]);
  if (!state)
    return error ? (
      <PageContainer className='nr-page'>
        <p role='alert'>{error}</p>
        <Button onClick={() => setAttempt((n) => n + 1)}>
          {$t('common.reload')}
        </Button>
      </PageContainer>
    ) : (
      <PageSkeleton title={$t('strategy.insights')} />
    );
  return <Insights projectId={projectId} state={state} setState={setState} />;
}
function Insights({
  projectId,
  state,
  setState,
}: {
  projectId: number;
  state: StrategyState;
  setState: (s: StrategyState) => void;
}) {
  const taskView = useFreshData(`insights-tasks:${projectId}`, () =>
    taskRecords<Task>(projectId),
  );
  const tasks = taskView.data ?? [];
  const [busy, setBusy] = useState(false),
    [error, setError] = useMessageState(''),
    [notice, setNotice] = useMessageState(''),
    [generating, setGenerating] = useState(false),
    [analysis, setAnalysis] = useState<AnalysisStatus>(),
    [rawPlaybooks, setRawPlaybooks] = useState<PlaybookList>(),
    [handed, setHanded] = useState<HandOffResult>(),
    [handing, setHanding] = useState<Row>(),
    navigate = useNavigate();
  const playbooks = localizePlaybookList(rawPlaybooks);
  const pendingRef = useRef(false),
    operationRef = useRef({ key: '', id: '' });
  async function mutate(action: string, body: object) {
    const key = JSON.stringify([action, state.revision, body]);
    if (operationRef.current.key !== key)
      operationRef.current = { key, id: crypto.randomUUID() };
    return request<StrategyState>(projectId, action, {
      ...body,
      revision: state.revision,
      requestId: operationRef.current.id,
    });
  }
  const followAnalysis = useCallback(async () => {
    setGenerating(true);
    for (let i = 0; i < 120; i++) {
      const st = await analysisRequest(projectId, 'status').catch(() => null);
      if (st) {
        setAnalysis(st);
        if (!st.running) {
          setGenerating(false);
          if (st.last && !st.last.ok)
            setError(() =>
              $t('strategy.analysisNotCompleteExistingOpportunities', {
                0:
                  translateSystemError(st.runs[0]?.error) ||
                  $t('errors.unknownReason'),
              }),
            );
          else {
            setState(await request<StrategyState>(projectId, 'state'));
            setNotice(() => $t('strategy.opportunitiesUpdated'));
            refreshNavBadges();
          }
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 3000));
    }
    setGenerating(false);
    setError(() => $t('strategy.analysisTakingWhileRefreshLater'));
  }, [projectId, setError, setNotice, setState]);
  async function generate() {
    setError('');
    setNotice('');
    try {
      const st = await analysisRequest(projectId, 'run');
      setAnalysis(st);
      await followAnalysis();
    } catch (e) {
      setGenerating(false);
      setError(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('strategy.notStartAnalysisTryAgain'),
      );
    }
  }
  useEffect(() => {
    void analysisRequest(projectId, 'status')
      .then((st) => {
        setAnalysis(st);
        if (st.running) void followAnalysis();
      })
      .catch(() => undefined);
  }, [projectId, followAnalysis]);
  async function act(fn: () => Promise<void>) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } finally {
      pendingRef.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    void playbookRequest<PlaybookList>('list', projectId)
      .then(setRawPlaybooks)
      .catch(() => undefined);
  }, [projectId]);
  const kindOf = (row: Row) => recommendedFor(row, playbooks?.playbooks)?.kind;
  // Hand off to agent: the task is created and its page opens. An opportunity with several places asks which ones
  // first, then opens on Opportunities with its tasks (the same dialog as there).
  const convert = (row: Row) => {
    if (placesOf(row).length) {
      setHanded(undefined);
      setHanding(row);
      return;
    }
    return act(async () => {
      setHanded(undefined);
      try {
        const r = await handOff(
          projectId,
          state,
          row,
          recommendedFor(row, playbooks?.playbooks)?.id,
        );
        setState(r.state);
        setHanded(handOffResult(row, r, kindOf(row)));
        refreshNavBadges();
        // The new task, so today's message counts the hand-off.
        taskView.reload();
      } catch {
        setError(() => $t('strategy.notHandOffOpportunityKept'));
      }
    });
  };
  const review = (id: string, change: { priority?: string; status?: string }) =>
    act(async () => {
      try {
        setState(
          await mutate('reviewOpportunity', { insightId: id, ...change }),
        );
        refreshNavBadges();
      } catch {
        setError(() => $t('strategy.notSaveRefreshTryAgain'));
      }
    });
  const { mine } = useMe();
  // Waiting for you: a step to review, or a handed-off task to start (2026-10-08) — only the tasks you own.
  const waiting = tasks
    .filter((t) => isWaitingTask(t, mine))
    .sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    );
  const waitingFor = (w?: Work) => {
    if (!w?.flow) return $t('strategy.waitingStart');
    const st = localizeWorkSnapshots(w).flow!.stages[w.stageIndex || 0];
    return st
      ? st.kind === 'publish'
        ? $t('common.confirmPublish')
        : stageName(st)
      : $t('common.needsConfirmation');
  };
  const summaryView = useFreshData<{ areas: Area[] }>(
    `insights-summary:${projectId}`,
    () =>
      api.action<{ areas: Area[] }>('nrInsights', 'summary', {
        method: 'POST',
        body: { projectId },
        unwrap: 'data',
      }),
  );
  const overview = useFreshData<{ cards: SourceCard[] }>(
    `data-view:overview:${projectId}:${JSON.stringify({ range: String(METRIC_DAYS) })}`,
    () =>
      api.action<{ cards: SourceCard[] }>('nrDataViews', 'overview', {
        method: 'POST',
        body: { projectId, range: String(METRIC_DAYS) },
        unwrap: 'data',
      }),
    googleLocalFreshness,
  );
  // When an analysis ends, the numbers, the situation and the tasks are read again with it.
  const wasGeneratingRef = useRef(generating),
    reloadAllRef = useRef(() => {});
  useEffect(() => {
    reloadAllRef.current = () => {
      overview.reload();
      summaryView.reload();
      taskView.reload();
    };
  });
  useEffect(() => {
    if (wasGeneratingRef.current && !generating) reloadAllRef.current();
    wasGeneratingRef.current = generating;
  }, [generating]);
  const { can: canSchedules } = useCan({
      resource: { type: 'page', id: 'scheduler.schedules' },
      action: 'access',
    }),
    { can: canRules } = useCan({
      resource: { type: 'page', id: 'analysis-rules' },
      action: 'access',
    });
  const rows = rowsFor(state),
    metrics = metricItems(overview.data?.cards),
    feed = feedOf(
      state,
      rows,
      new Map(
        tasks.map((t) => [
          String(t.id),
          {
            createdAt: t.createdAt,
            work: t.evidence?.work,
            status: t.status,
          },
        ]),
      ),
    ),
    analysisDay = dayOf(state.insights?.generatedAt),
    chat = useOptionalOnlineChat(),
    // With the side panel open the day's conversation is there; the page gives it the room.
    docked = useChatPanel().open && !!chat;
  // A change no analysis judged yet (an analysis from before every change got a verdict) is judged once in the
  // background, as the server does after each analysis; the state is read again afterwards.
  const unjudged = (state.insights?.evidence.signals?.items || []).filter(
      (s) => signalDisposition(s, state, tasks).next === 'judge',
    ).length,
    judgedRef = useRef(''),
    projectRef = useRef(projectId);
  projectRef.current = projectId;
  const taskDataAvailable = taskView.data !== undefined,
    analyzedAt = state.insights?.generatedAt || '';
  useEffect(() => {
    const key = `${projectId}:${analyzedAt}`;
    if (!unjudged || !taskDataAvailable || judgedRef.current === key) return;
    judgedRef.current = key;
    void judgeMissing(projectId)
      .then(() => request<StrategyState>(projectId, 'state'))
      .then((next) => {
        if (projectRef.current === projectId) setState(next);
      })
      .catch(() => undefined);
  }, [projectId, analyzedAt, unjudged, taskDataAvailable, setState]);
  const situation = (
    <RequestBlock
      quiet
      title={$t('strategy.currentSituation')}
      info={
        <InfoTip label={$t('strategy.statusExplanation')}>
          {$t('strategy.notWhatChangedHowThings')}
        </InfoTip>
      }
      request={summaryView}
      empty={!summaryView.data?.areas.some((area) => area.items.length)}
      emptyText={$t('strategy.noCurrentSituation')}
    >
      <AreaList quiet areas={summaryView.data?.areas} projectId={projectId} />
    </RequestBlock>
  );
  const attention = (summaryView.data?.areas || []).reduce(
    (n, area) =>
      n +
      area.items.filter((i) => i.tone === 'amber' || i.tone === 'red').length,
    0,
  );
  // Earlier days above today, as in a conversation; the input for today's conversation at the bottom.
  const column = (
    <div className='flex min-w-0 flex-col gap-4 lg:h-full lg:min-h-0'>
      <section
        aria-label={$t('strategy.analysisFeed')}
        className='flex flex-col gap-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-2'
      >
        <History days={feed.days} today={analysisDay} rows={rows} />
        <Today
          state={state}
          rows={rows}
          feed={feed}
          metrics={metrics}
          generating={generating}
          projectId={projectId}
          busy={busy || generating}
          onGive={(row) => void convert(row)}
          onIgnore={(row) => void review(row.card.id, { status: 'ignored' })}
          situation={
            docked ? (
              <FoldedSituation count={attention}>{situation}</FoldedSituation>
            ) : undefined
          }
          tasks={
            <RequestBlock
              compact
              title={$t('strategy.taskStatus')}
              request={taskView}
              empty={waiting.length === 0}
            >
              <WaitingNote tasks={waiting} label={waitingFor} />
            </RequestBlock>
          }
        />
      </section>
      <Composer />
    </div>
  );
  return (
    <PageContainer className='nr-page nr-insights-fill lg:flex lg:h-full lg:flex-col'>
      <PageHeader
        title={$t('strategy.insights')}
        description={
          <HowAnalyzed
            schedule={analysis?.schedule}
            rulesLink={canRules}
            schedulesLink={canSchedules}
          />
        }
        // One refresh, as on Results (2026-10-22 user decision): it runs the analysis again, and every block is read
        // again when it ends.
        actions={
          <RefreshButton
            label={
              generating
                ? $t('strategy.analyzing')
                : $t('strategy.updateAnalysis')
            }
            busy={generating}
            disabled={busy}
            onClick={() => void generate()}
          />
        }
      />
      {error && (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      )}
      {notice && (
        <p role='status' className='nr-success'>
          {notice}
        </p>
      )}
      <HandOffNotice result={handed} />
      {handing && (
        <OpportunityHandOffDialog
          projectId={projectId}
          state={state}
          row={handing}
          playbooks={playbooks?.playbooks}
          onClose={() => setHanding(undefined)}
          onDone={(r) => {
            setHanding(undefined);
            setState(r.state);
            refreshNavBadges();
            void navigate(
              `/opportunities?tab=done&item=${encodeURIComponent(handing.card.id)}`,
            );
          }}
        />
      )}
      <AnalysisAlert
        status={analysis}
        busy={busy || generating}
        onRun={() => void generate()}
      />
      {/* On wide screens the page fills the window and only the day's conversation scrolls, between the numbers and
          the input (2026-10-22 user feedback). */}
      <div className='flex flex-col gap-6 lg:min-h-0 lg:flex-1'>
        <MetricTiles metrics={metrics} overview={overview} days={METRIC_DAYS} />
        {/* The day's conversation, with the standing facts in a narrow quiet column beside it (2026-10-21 user); with the
            side panel open, the facts fold to a line under the day's date. */}
        <div
          className={
            docked
              ? 'flex flex-col lg:min-h-0 lg:flex-1'
              : 'grid items-start gap-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_16rem] lg:grid-rows-[minmax(0,1fr)] lg:items-stretch'
          }
        >
          {/* Questions asked from Insights read the chat's records, so only where the chat is mounted. */}
          {chat ? (
            <InsightChatProvider projectId={projectId} day={analysisDay}>
              {column}
            </InsightChatProvider>
          ) : (
            column
          )}
          {!docked && (
            <div className='lg:min-h-0 lg:overflow-y-auto'>{situation}</div>
          )}
        </div>
      </div>
    </PageContainer>
  );
}
// The subtitle says how the insights are made, not how fresh each source is (2026-10-22 user decision: "data through
// 10/18" beside today's analysis read as analysing stale data; freshness lives under Data sources › Data health): which
// rules, and when the daily analysis runs, each a link to where it is set for those who may open it. No period: each
// rule reads its own window (7, 14, 28 or 30 days); the 28 days belong to the metric cards, which say so.
// The metric cards: each source's last 28 days against the 28 before (nrDataViews:overview).
const METRIC_DAYS = 28;
const subtleLink = 'underline underline-offset-4 hover:text-foreground';
function HowAnalyzed({
  schedule,
  rulesLink,
  schedulesLink,
}: {
  schedule?: AnalysisStatus['schedule'];
  rulesLink: boolean;
  schedulesLink: boolean;
}) {
  const rules = rulesLink ? (
    <Link className={subtleLink} to='/rules'>
      {$t('strategy.analysisRulesLink')}
    </Link>
  ) : (
    $t('strategy.analysisRulesLink')
  );
  const toSchedules = (text: string) =>
    schedulesLink ? (
      <Link className={subtleLink} to='/schedules'>
        {text}
      </Link>
    ) : (
      text
    );
  // The daily time from the workflow's cron ("0 9 * * *"), in its time zone, named only when it is not the browser's.
  const [minute, hour] = String(schedule?.cron || '')
      .trim()
      .split(/\s+/),
    time =
      /^\d+$/.test(minute || '') && /^\d+$/.test(hour || '')
        ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
        : null,
    zone = schedule?.timezone,
    local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (schedule && !schedule.enabled)
    return $tj('strategy.howAnalyzedPaused', {
      0: rules,
      1: toSchedules($t('strategy.dailyAnalysisPaused')),
    });
  if (schedule && time)
    return $tj('strategy.howAnalyzedDaily', {
      0: rules,
      1: toSchedules(
        $t('strategy.everyDayAt', {
          0:
            zone && zone !== local
              ? $t('strategy.timeInZone', {
                  0: time,
                  1: timeZoneName(zone, getCurrentLocale()),
                })
              : time,
        }),
      ),
    });
  return $tj('strategy.howAnalyzedManual', { 0: rules });
}
