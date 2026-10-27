import {
  useEffect,
  useCallback,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { Loader2, ListFilter } from 'lucide-react';
import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { PageContainer, PageHeader, Section } from '#components/reach/page';
import { RefreshButton } from '#components/reach/refresh-button';
import { ListSkeleton, LoadError, EmptyState } from '#components/reach/states';
import { Tag } from '#components/reach/tag';
import {
  segmentedItemClass,
  segmentedListClass,
} from '#components/reach/segmented';
import { SourceLogo } from '#components/reach/source-logo';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import { useProject } from './reach-data';
import { ruleUnitLabel } from './analysis-rules/labels';
import { getSourceNames } from './strategy/board';
import { analysisRequest, type AnalysisStatus } from './strategy/service';
import { dailyAnalysisTime } from './strategy/schedule-time';
import { useBusinessAccess } from '#hooks/use-business-access';
import { SchemeManager, AddRule } from './analysis-rules/schemes';
import type { Rule, Settings, View } from './analysis-rules/types';
import { PageAiEntry } from '../online-agent/page-entry';
import { usePageChange } from '../online-agent/page-changes';
import { formatDateTime } from '#lib/format';

const call = <T,>(action: string, projectId: number, body: object = {}) =>
  api.action<T>('nrAnalysisRules', action, {
    method: 'POST',
    body: { ...body, projectId },
    unwrap: 'data',
  });
function settingsOf(rules: Rule[], change: Rule): Settings['rules'] {
  return Object.fromEntries(
    rules
      .map((r) => (r.id === change.id ? change : r))
      .map((r) => [
        r.id,
        {
          ...(r.enabled ? {} : { enabled: false }),
          values: Object.fromEntries(
            r.params
              .filter((x) => x.value !== x.default)
              .map((x) => [x.key, x.value]),
          ),
        },
      ]),
  );
}
// Sources by the area the rules summary names; the rule list is tabbed by these areas.
const COVERAGE_AREAS = [
  ['search', ['gsc', 'rank', 'trends', 'ai-search']],
  ['traffic', ['ga4', 'github-traffic']],
  ['content', ['site', 'youtube', 'bilibili', 'xiaohongshu']],
  ['community', ['discourse', 'reddit', 'hackernews', 'discord', 'slack', 'x']],
  ['product', ['github', 'packages']],
  ['competitors', ['competitors']],
] as const;
const areaOf = (source: string): string =>
  COVERAGE_AREAS.find(([, sources]) =>
    (sources as readonly string[]).includes(source),
  )?.[0] ?? 'other';
const SOURCE_ORDER = [
  'gsc',
  'ga4',
  'site',
  'github',
  'github-traffic',
  'discourse',
  'packages',
  'hackernews',
  'reddit',
  'youtube',
  'bilibili',
  'xiaohongshu',
  'x',
  'discord',
  'rank',
  'trends',
  'competitors',
  'ai-search',
];
const day = (iso: string) => formatDateTime(iso);
const statusOf = (e: unknown) =>
  e && typeof e === 'object' && 'status' in e ? Number(e.status) : undefined;
const errorText = (e: unknown, fallback: string) =>
  e instanceof Error ? $legacyText(e.message) : fallback;

export default function AnalysisRules(): ReactElement {
  const { project } = useProject();
  return project ? (
    <RulesPage key={project.id} projectId={project.id} />
  ) : (
    <ListSkeleton rows={5} />
  );
}
function RulesPage({ projectId }: { projectId: number }): ReactElement {
  const { can: canSave } = useBusinessAccess('nrAnalysisRules.save', projectId);
  const { can: canAddRule } = useBusinessAccess(
    'nrAnalysisRules.addRule',
    projectId,
  );
  const { can: canUpdateRule } = useBusinessAccess(
    'nrAnalysisRules.updateRule',
    projectId,
  );
  const [view, setView] = useState<View>();
  const [error, setError] = useMessageState('');
  const [loadStatus, setLoadStatus] = useState<number>();
  const [saveError, setSaveError] = useMessageState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [openArea, setOpenArea] = useState<string>();
  const selectedSchemeRef = useRef<string | undefined>(undefined);
  const aliveRef = useRef(true),
    pendingRef = useRef(false),
    epochRef = useRef(0);
  const headingRef = useRef<HTMLElement>(null);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    const request = ++epochRef.current;
    try {
      const v = await call<View>('view', projectId, {
        schemeId: selectedSchemeRef.current,
      });
      if (aliveRef.current && request === epochRef.current) {
        setView(v);
        setError('');
        setLoadStatus(undefined);
      }
    } catch (e) {
      if (aliveRef.current && request === epochRef.current) {
        setError(() =>
          errorText(e, $t('analysisRules.analysisRulesNotLoaded')),
        );
        setLoadStatus(statusOf(e));
      }
    }
  }, [projectId, setError]);
  useEffect(() => {
    void load();
  }, [load]);
  // The daily analysis workflow's schedule, for the time the rules run; without it the note leaves the time out.
  const [schedule, setSchedule] = useState<AnalysisStatus['schedule']>(null);
  useEffect(() => {
    let live = true;
    analysisRequest(projectId, 'status').then(
      (status) => {
        if (live) setSchedule(status?.schedule ?? null);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [projectId]);
  const scheduleTime = dailyAnalysisTime(schedule);
  // A change confirmed in the chat panel shows here at once.
  usePageChange('analysisRules', projectId, () => void load());
  const closeEditor = () => {
    setEditing(undefined);
    setSaveError('');
    headingRef.current?.focus();
  };
  const mutate = async (
    action:
      'save' | 'rename' | 'create' | 'activate' | 'addRule' | 'updateRule',
    body: object,
  ) => {
    if (pendingRef.current || !view) return false;
    pendingRef.current = true;
    setBusy(true);
    setSaveError('');
    try {
      const next = await call<View>(action, projectId, {
        schemeId: view.schemeId,
        ...body,
      });
      if (!aliveRef.current) return false;
      selectedSchemeRef.current = next.schemeId;
      setView(next);
      const added = next.rules.find((r) => r.id === next.addedRuleId);
      if (added) setOpenArea(areaOf(added.source));
      closeEditor();
      toast.success(() =>
        $t(
          action === 'rename'
            ? 'analysisSchemes.renamed'
            : 'analysisRules.savedTakesEffectNextAnalysis',
        ),
      );
      return next;
    } catch (e) {
      if (!aliveRef.current) return false;
      if (statusOf(e) === 409) {
        setEditing(undefined);
        await load();
      }
      if (action === 'save')
        setSaveError(() => errorText(e, $t('common.saveFailed')));
      throw e;
    } finally {
      pendingRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  };
  const save = async (body: Settings) => {
    try {
      return Boolean(
        await mutate('save', {
          ...body,
          expectedRevision: view?.revision,
        }),
      );
    } catch {
      return false;
    }
  };
  const edit = async (id: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setSaveError('');
    try {
      const fresh = await call<View>('view', projectId, {
        schemeId: selectedSchemeRef.current,
      });
      if (aliveRef.current) {
        setView(fresh);
        setEditing(id);
      }
    } catch (e) {
      if (aliveRef.current)
        setSaveError(() => errorText(e, $t('common.saveFailed')));
    } finally {
      pendingRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  };
  const groups: string[] = view
    ? [...new Set(view.rules.map((r) => r.source))].sort(
        (a, b) =>
          (SOURCE_ORDER.includes(a)
            ? SOURCE_ORDER.indexOf(a)
            : SOURCE_ORDER.length) -
          (SOURCE_ORDER.includes(b)
            ? SOURCE_ORDER.indexOf(b)
            : SOURCE_ORDER.length),
      )
    : [];
  const sourceName = (source: string) =>
    view?.rules.find((rule) => rule.source === source)?.sourceName ||
    getSourceNames()[source] ||
    source.replace(
      /(^|[-_ ])([a-z])/g,
      (_match, separator, letter: string) =>
        `${separator ? ' ' : ''}${letter.toUpperCase()}`,
    );
  const coverageAreas = COVERAGE_AREAS;
  const areas = [
    ...coverageAreas.map(([area]) => area as string),
    'other',
  ].filter((area) => groups.some((g) => areaOf(g) === area));
  const area = openArea && areas.includes(openArea) ? openArea : areas[0];
  const editingArea = editing
    ? areaOf(view?.rules.find((r) => r.id === editing)?.source ?? '')
    : undefined;
  const areaName = (key: string) => {
    const label = $t(`analysisRules.scope.${key}`);
    return label.charAt(0).toUpperCase() + label.slice(1);
  };
  const enabledSources = groups.filter((g) =>
    view?.rules.some((r) => r.source === g && r.enabled),
  );
  const coverage = [
    ...coverageAreas
      .filter(([, sources]) =>
        enabledSources.some((source) =>
          (sources as readonly string[]).includes(source),
        ),
      )
      .map(([area]) => $t(`analysisRules.scope.${area}`)),
    ...(enabledSources.some(
      (source) =>
        !coverageAreas.some(([, sources]) =>
          (sources as readonly string[]).includes(source),
        ),
    )
      ? [$t('analysisRules.scope.other')]
      : []),
  ].join(getCurrentLocale().startsWith('zh') ? '、' : ', ');
  const last = view?.last;
  return (
    <PageContainer className='nr-page'>
      <PageHeader
        title={$t('analysisRules.analysisRules')}
        description={$t('analysisRules.pageHelp')}
        actions={
          <>
            {view ? (
              <PageAiEntry
                subject={{
                  kind: 'page',
                  page: 'analysisRules',
                  item: view.schemeId,
                }}
                label={$t('analysisRules.aiEntry')}
                description={$t('analysisRules.aiEntryHelp')}
                presets={[
                  $t('analysisRules.presetFewerSmall'),
                  $t('analysisRules.presetCompetitorRelease'),
                  $t('analysisRules.presetWhyFired'),
                  $t('analysisRules.presetNotFired'),
                ]}
              />
            ) : null}
            <RefreshButton
              busy={busy}
              disabled={Boolean(editing)}
              onClick={() => {
                setBusy(true);
                void load().finally(() => {
                  if (aliveRef.current) setBusy(false);
                });
              }}
            />
          </>
        }
      />
      {error ? (
        <LoadError
          title={$t('analysisRules.analysisRulesNotLoaded')}
          message={error}
          {...(![401, 403, 404].includes(loadStatus || 0)
            ? { onRetry: () => void load() }
            : {})}
        />
      ) : null}
      {!view && !error ? <ListSkeleton rows={5} /> : null}
      {view && !error ? (
        <>
          <SchemeManager
            view={view}
            projectId={projectId}
            disabled={busy || Boolean(editing)}
            select={(id) => {
              selectedSchemeRef.current = id;
              setBusy(true);
              void load().finally(() => {
                if (aliveRef.current) setBusy(false);
              });
            }}
            execute={async (action, body) => {
              const result = await mutate(action, body);
              return result || undefined;
            }}
          />
          {/* What the rules cover, how many are on and when they run sit in the title's ⓘ rather than as grey lines
              under it (2026-10-22 decision D5); the time is the daily analysis workflow's, as Insights says it. */}
          <Section
            ref={headingRef}
            tabIndex={-1}
            className='outline-none'
            title={$t('analysisRules.rulesSectionTitle')}
            description={
              <>
                <p data-rules-summary=''>
                  {$t(
                    coverage
                      ? 'analysisRules.conciseSummary'
                      : 'analysisRules.conciseEmpty',
                    {
                      0: coverage,
                    },
                  )}
                </p>
                <p>
                  {$t('analysisRules.enabledCount', {
                    0: view.rules.filter((r) => r.enabled).length,
                    1: view.rules.length,
                  })}
                </p>
                <p data-rules-schedule=''>
                  {schedule && !schedule.enabled
                    ? $t('analysisRules.schedulePaused')
                    : scheduleTime
                      ? $t('analysisRules.scheduleDaily', { 0: scheduleTime })
                      : $t('analysisRules.changesApplyNext')}
                </p>
              </>
            }
            actions={
              canAddRule && view.schemes ? (
                <AddRule
                  key={view.schemeId}
                  view={view}
                  disabled={busy || Boolean(editing)}
                  execute={async (action, body) => {
                    const result = await mutate(action, body);
                    return result || undefined;
                  }}
                />
              ) : undefined
            }
          >
            {view.schemeId && view.schemeId !== view.activeSchemeId ? (
              <p className='text-sm text-muted-foreground'>
                {$t('analysisSchemes.editInactive')}
              </p>
            ) : null}
            {!view.rules.length ? (
              <EmptyState
                icon={<ListFilter />}
                title={$t('analysisRules.currentRules')}
                description={$t('analysisRules.emptyRules')}
              />
            ) : null}
            {saveError && !editing ? (
              <p role='alert' className='nr-error'>
                {saveError}
              </p>
            ) : null}
            {/* Rules by area, each source a heading with its rules shown, instead of fold-out groups (UI review A10);
                the areas are chosen like a table's row filters, a segmented control (2026-10-22 decision D1). The
                area with an open editor cannot be left until it is saved or cancelled. */}
            {areas.length ? (
              <div
                role='tablist'
                aria-label={$t('analysisRules.ruleGroups')}
                className={segmentedListClass}
              >
                {areas.map((key) => (
                  <button
                    key={key}
                    type='button'
                    role='tab'
                    id={`rules-tab-${key}`}
                    aria-selected={key === area}
                    aria-controls='rules-panel'
                    className={segmentedItemClass}
                    disabled={Boolean(editingArea && editingArea !== key)}
                    onClick={() => setOpenArea(key)}
                  >
                    {areaName(key)}
                  </button>
                ))}
              </div>
            ) : null}
            <div
              id='rules-panel'
              role='tabpanel'
              aria-labelledby={area ? `rules-tab-${area}` : undefined}
              className='flex flex-col gap-5'
            >
              {groups.map((g) => (
                <div
                  key={g}
                  data-source={g}
                  hidden={areaOf(g) !== area}
                  className='flex flex-col gap-2'
                >
                  <h3 className='flex items-center gap-2 text-sm font-medium'>
                    <SourceLogo source={g} size='sm' />
                    {sourceName(g)}
                    <span className='text-xs font-normal text-muted-foreground tabular-nums'>
                      {$t('analysisRules.groupEnabled', {
                        0: view.rules.filter((r) => r.source === g && r.enabled)
                          .length,
                        1: view.rules.filter((r) => r.source === g).length,
                      })}
                    </span>
                  </h3>
                  <ul className='divide-y rounded-lg border'>
                    {view.rules
                      .filter((r) => r.source === g)
                      .map((r) => (
                        <li
                          key={r.id}
                          data-rule={r.id}
                          className='flex flex-col gap-2 p-4'
                        >
                          <div className='flex items-start justify-between gap-3'>
                            <div className='flex min-w-0 flex-wrap items-center gap-2'>
                              <h4 className='break-words text-sm font-medium'>
                                {$legacyText(r.label)}
                              </h4>
                              {r.params.some((p) => p.value !== p.default) ? (
                                <Tag tone='blue'>
                                  {$t('analysisRules.changed')}
                                </Tag>
                              ) : null}
                            </div>
                            <label className='flex shrink-0 items-center gap-2 text-xs text-muted-foreground'>
                              <span>
                                {$t(
                                  r.enabled
                                    ? 'analysisRules.enabled'
                                    : 'analysisRules.disabled',
                                )}
                              </span>
                              {canSave ? (
                                <Switch
                                  checked={r.enabled}
                                  disabled={busy || Boolean(editing)}
                                  aria-label={$t('analysisRules.turn', {
                                    0: $legacyText(r.label),
                                  })}
                                  onCheckedChange={(on) =>
                                    void save({
                                      rules: settingsOf(view.rules, {
                                        ...r,
                                        enabled: Boolean(on),
                                      }),
                                    })
                                  }
                                />
                              ) : null}
                            </label>
                          </div>
                          <p className='text-sm text-muted-foreground'>
                            {$legacyText(r.description)}
                          </p>
                          <div
                            className='flex flex-wrap items-center gap-x-5 gap-y-2'
                            data-numbers=''
                          >
                            {r.params.map((p) => (
                              <span key={p.key} className='text-sm'>
                                <span className='text-muted-foreground'>
                                  {$legacyText(p.label)}{' '}
                                </span>
                                <span className='font-medium tabular-nums'>
                                  {p.value}
                                  {/* "2%" not "2 %"; word units such as days keep their space. */}
                                  {p.unit
                                    ? `${p.unit === '%' ? '' : ' '}${ruleUnitLabel(p.unit, p.value)}`
                                    : ''}
                                </span>
                              </span>
                            ))}
                          </div>
                          <div className='flex flex-wrap items-center justify-between gap-2'>
                            <p
                              className='text-xs text-muted-foreground'
                              data-found=''
                            >
                              {!r.enabled
                                ? $t('analysisRules.disabledHelp')
                                : r.run &&
                                    ['insufficient', 'error'].includes(
                                      r.run.status,
                                    )
                                  ? $t(`analysisSchemes.run.${r.run.status}`)
                                  : r.found !== null
                                    ? $tj('analysisRules.time', { 0: r.found })
                                    : $t('analysisRules.notRunYet')}
                            </p>
                            {canUpdateRule && r.custom ? (
                              <AddRule
                                key={`${view.schemeId}:${r.id}`}
                                rule={r}
                                view={view}
                                disabled={busy || Boolean(editing)}
                                execute={async (action, body) =>
                                  (await mutate(action, body)) || undefined
                                }
                              />
                            ) : null}
                            {canSave && r.params.length ? (
                              <Button
                                variant='ghost'
                                size='sm'
                                disabled={
                                  busy || Boolean(editing && editing !== r.id)
                                }
                                onClick={() => void edit(r.id)}
                              >
                                {$t('analysisRules.editParameters')}
                              </Button>
                            ) : null}
                          </div>
                          {canSave && editing === r.id ? (
                            <RuleEditor
                              key={`${r.id}:${view.revision}`}
                              rule={r}
                              busy={busy}
                              error={saveError}
                              onClose={closeEditor}
                              onSave={(next) =>
                                save({ rules: settingsOf(view.rules, next) })
                              }
                            />
                          ) : null}
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
            <div
              className='rounded-lg border bg-muted/30 p-4'
              data-watch-days=''
              id='analysis-observation-period'
            >
              <div className='flex items-center justify-between gap-3'>
                <p className='text-sm'>
                  {$t('analysisRules.observationPeriod', {
                    0: view.watchDays,
                  })}
                </p>
                {canSave ? (
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={busy || Boolean(editing)}
                    onClick={() => void edit('days')}
                  >
                    {$t('common.modify')}
                  </Button>
                ) : null}
              </div>
              <p className='mt-1 text-sm text-muted-foreground'>
                {$t('analysisRules.observationPeriodHelp')}
              </p>
              {canSave && editing === 'days' ? (
                <SimpleEditor
                  key={view.revision}
                  value={String(view.watchDays)}
                  kind='days'
                  view={view}
                  busy={busy}
                  error={saveError}
                  onClose={closeEditor}
                  onSave={save}
                />
              ) : null}
            </div>
          </Section>
          {last ? (
            <p className='text-xs text-muted-foreground'>
              {$tj('analysisRules.lastAnalyzed', {
                0: day(last.analyzedAt || last.computedAt),
              })}{' '}
              ·{' '}
              {$tj('analysisRules.rulesFoundChangesData', {
                0: last.found ?? '—',
              })}
              {/* Without a count the clause is left out rather than reading "— passed to the AI" (UI review E7). */}
              {last.passed != null ? (
                <> · {$tj('analysisRules.passedAi', { 0: last.passed })}</>
              ) : null}
              {last.analyzedAt ? (
                <>
                  {' '}
                  ·{' '}
                  {$tj('analysisRules.actWatchNoActionNeeded', {
                    0: last.verdicts.do,
                    1: last.verdicts.watch,
                    2: last.verdicts.skip,
                  })}
                </>
              ) : null}
            </p>
          ) : null}
        </>
      ) : null}
    </PageContainer>
  );
}
function EditorActions({
  busy,
  onClose,
}: {
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <div className='flex justify-end gap-2'>
      <Button type='button' variant='outline' disabled={busy} onClick={onClose}>
        {$t('common.cancel')}
      </Button>
      <Button type='submit' disabled={busy}>
        {busy ? (
          <Loader2 className='animate-spin' data-icon='inline-start' />
        ) : null}
        {$t('common.save')}
      </Button>
    </div>
  );
}
function RuleEditor({
  rule,
  busy,
  error,
  onClose,
  onSave,
}: {
  rule: Rule;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (r: Rule) => Promise<boolean>;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(rule.params.map((p) => [p.key, String(p.value)])),
  );
  const [submitted, setSubmitted] = useState(false);
  const bad = rule.params.find(
    (p) =>
      !values[p.key]?.trim() ||
      !Number.isFinite(Number(values[p.key])) ||
      Number(values[p.key]) < p.min ||
      Number(values[p.key]) > p.max,
  );
  const rankBad =
    rule.id === 'gsc-near-first' &&
    Number(values.posFrom) > Number(values.posTo);
  return (
    <form
      className='mt-2 flex flex-col gap-3 rounded-lg bg-muted/40 p-4'
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (bad || rankBad) {
          const index = bad ? rule.params.indexOf(bad) : 0;
          e.currentTarget
            .querySelectorAll<HTMLInputElement>('input')
            [index]?.focus();
        }
        if (!bad && !rankBad)
          void onSave({
            ...rule,
            params: rule.params.map((p) => ({
              ...p,
              value: Number(values[p.key]),
            })),
          });
      }}
      noValidate
    >
      <div className='grid gap-3 sm:grid-cols-2'>
        {rule.params.map((p, i) => (
          <label key={p.key} className='flex flex-col gap-1 text-sm'>
            <span>
              {$legacyText(p.label)} {p.unit ? $legacyText(p.unit) : ''}{' '}
              <span aria-hidden='true'>*</span>
            </span>
            <Input
              aria-label={`${$legacyText(p.label)} ${p.unit ? $legacyText(p.unit) : ''}`.trim()}
              required
              autoFocus={i === 0}
              type='number'
              step='any'
              min={p.min}
              max={p.max}
              value={values[p.key]}
              disabled={busy}
              aria-invalid={submitted && bad?.key === p.key}
              onChange={(e) =>
                setValues((v) => ({ ...v, [p.key]: e.target.value }))
              }
            />
            <span className='text-xs text-muted-foreground'>
              {$tj('analysisRules.defaultAllowed', {
                0: p.default,
                1: p.min,
                2: p.max,
              })}
            </span>
          </label>
        ))}
      </div>
      {submitted && bad ? (
        <p role='alert' className='nr-error'>
          {$tj('analysisRules.between', {
            0: $legacyText(bad.label),
            1: bad.min,
            2: bad.max,
          })}
        </p>
      ) : submitted && rankBad ? (
        <p role='alert' className='nr-error'>
          {$t('analysisRules.rankRangeInvalid')}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <Button
          type='button'
          variant='ghost'
          disabled={busy}
          onClick={() =>
            setValues(
              Object.fromEntries(
                rule.params.map((p) => [p.key, String(p.default)]),
              ),
            )
          }
        >
          {$t('common.restoreDefault')}
        </Button>
        <EditorActions busy={busy} onClose={onClose} />
      </div>
    </form>
  );
}
function SimpleEditor({
  value,
  kind,
  view,
  busy,
  error,
  onClose,
  onSave,
}: {
  value: string;
  kind: 'focus' | 'days';
  view: View;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (s: Settings) => Promise<boolean>;
}) {
  const [text, setText] = useState(value),
    [submitted, setSubmitted] = useState(false);
  const bad =
    kind === 'days' &&
    (!text.trim() ||
      !Number.isInteger(Number(text)) ||
      Number(text) < view.watchLimits.min ||
      Number(text) > view.watchLimits.max);
  return (
    <form
      className='mt-3 flex flex-col gap-3'
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (bad)
          e.currentTarget.querySelector<HTMLInputElement>('input')?.focus();
        if (!bad)
          void onSave(
            kind === 'focus'
              ? { focus: text.trim() }
              : { watchDays: Number(text) },
          );
      }}
      noValidate
    >
      {kind === 'focus' ? (
        <Textarea
          autoFocus
          aria-label={$t('analysisRules.teamFocus')}
          value={text}
          maxLength={1000}
          rows={4}
          disabled={busy}
          onChange={(e) => setText(e.target.value)}
        />
      ) : (
        <label className='flex flex-col gap-1 text-sm'>
          <span>
            {$t('analysisRules.longestWatchDays')}{' '}
            <span aria-hidden='true'>*</span>
          </span>
          <Input
            autoFocus
            required
            aria-invalid={submitted && bad}
            aria-label={$t('analysisRules.longestWatchDays')}
            type='number'
            value={text}
            min={view.watchLimits.min}
            max={view.watchLimits.max}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
      )}
      {submitted && bad ? (
        <p role='alert' className='nr-error'>
          {$tj('analysisRules.enterWholeNumber', {
            0: view.watchLimits.min,
            1: view.watchLimits.max,
          })}
        </p>
      ) : null}
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
      <EditorActions busy={busy} onClose={onClose} />
    </form>
  );
}
