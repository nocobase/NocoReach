import { googleLocalFreshness } from '../../../shared/google-cache.js';
import {
  useMessageState,
  getCurrentLocale,
  translateSystemError,
  $t,
  $legacyText,
} from '#i18n';
import {
  latestBatch,
  opportunityState,
  overviewPeriodDays,
  priorityRank,
  rowsFor,
  type Row,
} from './board';
import { signalDisposition } from '../../../shared/strategy-pending.js';
import { metricItems, type SourceCard, type Area } from './insights-view';
import { AskBar, History, MetricTiles, Today, WaitingNote } from './briefing';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { useFreshData } from '../workspace-cache';
import { RequestBlock } from './request-block';
import { AnalysisAlert } from './analysis-alert';
import { PageContainer, PageHeader } from '#components/reach/page';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '#components/ui/button';
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
  type Context,
  type AnalysisStatus,
} from './service';
import '../reach-workspace.css';
import './strategy.css';
type Task = {
  id: number;
  title: string;
  status: string;
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
    [context, setContext] = useState<Context>(),
    [error, setError] = useMessageState(''),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([
      request<StrategyState>(projectId, 'state'),
      request<Context>(projectId, 'context'),
    ])
      .then(([s, c]) => {
        if (active) {
          setState(s);
          setContext(c);
        }
      })
      .catch(() => {
        if (active) setError(() => $t('strategy.notLoadInsightsTryAgain'));
      });
    return () => {
      active = false;
    };
  }, [projectId, attempt, setError]);
  if (!state || !context)
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
  return (
    <Insights
      projectId={projectId}
      state={state}
      setState={setState}
      context={context}
    />
  );
}
function Insights({
  projectId,
  state,
  setState,
  context,
}: {
  projectId: number;
  state: StrategyState;
  setState: (s: StrategyState) => void;
  context: Context;
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
    [handed, setHanded] = useState<HandOffResult>();
  const playbooks = localizePlaybookList(rawPlaybooks);
  const pendingRef = useRef(false),
    operationRef = useRef({ key: '', id: '' }),
    summary = context.evidence;
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
  // 交给 Agent: the task is created and started; the page stays with a link to it (same as 机会).
  const convert = (row: Row) =>
    act(async () => {
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
      } catch {
        setError(() => $t('strategy.notHandOffOpportunityKept'));
      }
    });
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
  const batch = latestBatch(state, overviewPeriodDays),
    { mine } = useMe();
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
    `data-view:overview:${projectId}:${JSON.stringify({ range: '28' })}`,
    () =>
      api.action<{ cards: SourceCard[] }>('nrDataViews', 'overview', {
        method: 'POST',
        body: { projectId, range: '28' },
        unwrap: 'data',
      }),
    googleLocalFreshness,
  );
  const last = generating
    ? $t('strategy.analyzing')
    : batch
      ? $t('strategy.lastAnalyzed', {
          0: new Date(batch.generatedAt).toLocaleString(getCurrentLocale(), {
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
          1:
            analysis?.runs[0]?.ok && analysis.runs[0].trigger === 'workflow'
              ? $t('strategy.dailyAutomatic')
              : '',
        })
      : $t('strategy.notAnalyzedYet');
  // The decisions waiting: every opportunity still pending, ordered as on Opportunities' To do.
  const rows = rowsFor(state),
    metrics = metricItems(overview.data?.cards);
  const pending = rows
    .filter((r) => opportunityState(r, state).state === 'pending')
    .sort(
      (a, b) =>
        (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3) ||
        String(b.firstSeenAt).localeCompare(String(a.firstSeenAt)),
    );
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
  return (
    <PageContainer className='nr-page'>
      <PageHeader
        title={$t('strategy.insights')}
        description={$t('strategy.lastDaysDataThrough', {
          0: summary.periodDays,
          1: summary.availableThrough || $t('common.unknown'),
          2: last,
        })}
        actions={
          <Button
            variant='outline'
            disabled={busy || generating}
            onClick={() => void generate()}
          >
            {generating
              ? $t('strategy.analyzing')
              : $t('strategy.updateAnalysis')}
          </Button>
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
      <AnalysisAlert
        status={analysis}
        busy={busy || generating}
        onRun={() => void generate()}
      />
      <div className='flex flex-col gap-6'>
        <MetricTiles
          metrics={metrics}
          overview={overview}
          summary={summaryView}
          projectId={projectId}
        />
        <section
          aria-label={$t('strategy.analysisFeed')}
          className='flex flex-col gap-4'
        >
          <Today
            state={state}
            rows={rows}
            pending={pending}
            metrics={metrics}
            generating={generating}
            projectId={projectId}
            busy={busy || generating}
            onGive={(row) => void convert(row)}
            onIgnore={(row) => void review(row.card.id, { status: 'ignored' })}
            tasks={
              <RequestBlock
                compact
                corner
                title={$t('strategy.taskStatus')}
                request={taskView}
                empty={waiting.length === 0}
              >
                <WaitingNote tasks={waiting} label={waitingFor} />
              </RequestBlock>
            }
          />
          <History state={state} rows={rows} />
        </section>
        <AskBar
          projectId={projectId}
          day={
            state.insights
              ? new Date(state.insights.generatedAt).toLocaleDateString(
                  getCurrentLocale(),
                  { month: 'numeric', day: 'numeric' },
                )
              : ''
          }
        />
      </div>
    </PageContainer>
  );
}
