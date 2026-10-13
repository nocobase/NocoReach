import {
  useMessageState,
  getCurrentLocale,
  translateSystemError,
  $t,
  $legacyText,
} from '#i18n';
import {
  todaySuggestions,
  latestBatch,
  overviewPeriodDays,
  type Row,
} from './board';
import {
  KpiCards,
  AreaList,
  TodayChanges,
  Effects,
  WaitingStrip,
  type SourceCard,
  type Area,
} from './insights-view';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { useFreshData } from '../workspace-cache';
import { RequestBlock } from './request-block';
import { AnalysisAlert } from './analysis-alert';
import { PageContainer, PageHeader } from '#components/reach/page';
import { HealthAlert } from '../data-health';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '#components/ui/button';
import { taskRecords, useProject } from '../reach-data';
import { PageSkeleton } from '../workspace-cache';
import { isClosed, type Work } from '../task-execution-types';
import type { StrategyState } from './model';
import { refreshNavBadges } from '#components/app-shell/nav-badges';
import { useMe } from '../me';
import { isWaitingTask } from '../task-waiting';
import {
  handOff,
  handOffLabel,
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
// 洞察 (SPEC §5): numbers and changes first — what needs you, the key metrics, the latest changes, today's opportunities
// and the effect of recent changes; one line each.
// Analysis runs on the server (the daily workflow or “更新机会”); this page has no AI conversation of its own.
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
  const taskDataAvailable = taskView.data !== undefined;
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
    suggestions = todaySuggestions(state, 50),
    { mine } = useMe();
  // Waiting for you: a step to review, or a handed-off task to start (2026-10-08) — only the tasks you own.
  const waiting = tasks
    .filter((t) => isWaitingTask(t, mine))
    .sort((a, b) =>
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
    );
  // Changes that went live in the last 60 days and what their observation says so far.
  const effects = tasks
    .filter(
      (t) =>
        !isClosed(t.evidence?.work) &&
        t.evidence?.work?.observeFrom &&
        Date.now() - Date.parse(t.evidence.work.observeFrom) < 60 * 86400000,
    )
    .sort((a, b) =>
      String(b.evidence!.work!.observeFrom).localeCompare(
        String(a.evidence!.work!.observeFrom),
      ),
    )
    .slice(0, 5);
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
      <HealthAlert projectId={projectId} />
      <AnalysisAlert
        status={analysis}
        busy={busy || generating}
        onRun={() => void generate()}
      />
      <RequestBlock
        title={$t('strategy.taskStatus')}
        request={taskView}
        empty={waiting.length === 0}
        emptyText={$t('strategy.noWaitingTasks')}
      >
        <WaitingStrip tasks={waiting} label={waitingFor} />
      </RequestBlock>
      <RequestBlock title={$t('strategy.keyMetrics')} request={overview}>
        <KpiCards cards={overview.data?.cards} />
      </RequestBlock>
      {/* 今天的变化 in the main column; the effect of recent changes and the per-area numbers beside it (2026-10-08). */}
      <div className='grid items-start gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        {taskDataAvailable && (
          <TodayChanges
            state={state}
            tasks={tasks}
            rows={suggestions}
            projectId={projectId}
            busy={busy || generating}
            labelOf={(row) => handOffLabel(kindOf(row))}
            convert={(row) => void convert(row)}
            ignore={(row) => void review(row.card.id, { status: 'ignored' })}
            empty={
              generating
                ? $t('strategy.analyzingLatestData')
                : batch
                  ? $t('strategy.todayAnalysisFoundNothingAct')
                  : $t('strategy.noAnalysisYetClickUpdate')
            }
            onHandOff={(r) => {
              setHanded(r);
              void request<StrategyState>(projectId, 'state')
                .then(setState)
                .catch(() => undefined);
            }}
            onState={() =>
              void request<StrategyState>(projectId, 'state')
                .then(setState)
                .catch(() => undefined)
            }
          />
        )}
        <div className='flex flex-col gap-6'>
          <RequestBlock
            title={$t('strategy.currentSituation')}
            request={summaryView}
            empty={!summaryView.data?.areas.some((area) => area.items.length)}
            emptyText={$t('strategy.noCurrentSituation')}
          >
            <AreaList areas={summaryView.data?.areas} projectId={projectId} />
          </RequestBlock>
          {taskDataAvailable && <Effects tasks={effects} />}
        </div>
      </div>
    </PageContainer>
  );
}
