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
import { ListSkeleton, LoadError, EmptyState } from '#components/reach/states';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import { useProject } from './reach-data';
import { getSourceNames } from './strategy/board';
import { AdminOnlyNote, useMe } from './me';
import { RulesAssistant } from './analysis-rules/assistant';
import type { Rule, Settings, View, Proposal } from './analysis-rules/types';

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
  'x',
  'discord',
  'rank',
  'trends',
  'competitors',
  'ai-search',
];
const day = (iso: string) => new Date(iso).toLocaleString(getCurrentLocale());
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
  const { isAdmin } = useMe();
  const [view, setView] = useState<View>();
  const [error, setError] = useMessageState('');
  const [loadStatus, setLoadStatus] = useState<number>();
  const [saveError, setSaveError] = useMessageState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string>();
  const [manualRevision, setManualRevision] = useState(0);
  const aliveRef = useRef(true),
    pendingRef = useRef(false),
    epochRef = useRef(0);
  const headingRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const load = useCallback(async () => {
    const request = ++epochRef.current;
    try {
      const v = await call<View>('view', projectId);
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
  const closeEditor = () => {
    setEditing(undefined);
    setSaveError('');
    headingRef.current?.focus();
  };
  const mutate = async (action: 'save' | 'apply', body: object) => {
    if (pendingRef.current || !view) return false;
    pendingRef.current = true;
    setBusy(true);
    setSaveError('');
    try {
      const next = await call<View>(action, projectId, body);
      if (!aliveRef.current) return false;
      setView(next);
      if (action === 'save') setManualRevision((value) => value + 1);
      closeEditor();
      toast.success(() => $t('analysisRules.savedTakesEffectNextAnalysis'));
      return true;
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
      return await mutate('save', {
        ...body,
        expectedRevision: view?.revision,
      });
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
      const fresh = await call<View>('view', projectId);
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
  const propose = async (instruction: string) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    try {
      const fresh = await call<View>('view', projectId);
      if (!aliveRef.current) return;
      setView(fresh);
      const proposal = await call<Proposal>('propose', projectId, {
        instruction,
      });
      if (!aliveRef.current) return;
      return proposal;
    } finally {
      pendingRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  };
  const groups = view
    ? [...new Set(view.rules.map((r) => r.source))].sort(
        (a, b) => SOURCE_ORDER.indexOf(a) - SOURCE_ORDER.indexOf(b),
      )
    : [];
  const last = view?.last;
  return (
    <PageContainer className='nr-page'>
      <PageHeader
        title={$t('analysisRules.analysisRules')}
        description={$t('analysisRules.pageHelp')}
      />
      <AdminOnlyNote />
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
          {isAdmin ? (
            <RulesAssistant
              key={manualRevision}
              view={view}
              busy={busy || Boolean(editing)}
              propose={propose}
              apply={(p) => mutate('apply', p)}
            />
          ) : null}
          <Section
            title={$t('analysisRules.currentRules')}
            description={$t('analysisRules.rulesHelp')}
          >
            <div
              ref={headingRef}
              tabIndex={-1}
              className='flex flex-wrap justify-between gap-2 text-xs text-muted-foreground'
            >
              <span>
                {$t('analysisRules.enabledCount', {
                  0: view.rules.filter((r) => r.enabled).length,
                  1: view.rules.length,
                })}
              </span>
              <span>{$t('analysisRules.scheduleSummary')}</span>
            </div>
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
            <div className='flex flex-col gap-6'>
              {groups.map((g) => (
                <div key={g} data-source={g}>
                  <h3 className='mb-2 flex items-center gap-2 text-sm font-medium'>
                    {getSourceNames()[g] || g}
                    {last?.missing.includes(g) ? (
                      <Tag tone='grey'>{$t('analysisRules.noData')}</Tag>
                    ) : null}
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
                              {isAdmin ? (
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
                                  {p.unit ? ` ${$legacyText(p.unit)}` : ''}
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
                                : r.found !== null
                                  ? $tj('analysisRules.time', { 0: r.found })
                                  : $t('analysisRules.notRunYet')}
                            </p>
                            {isAdmin && r.params.length ? (
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
                          {editing === r.id ? (
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
          </Section>
          <Section
            title={$t('analysisRules.howAiJudges')}
            description={$t('analysisRules.judgmentHelp')}
          >
            <div className='flex flex-col gap-3 text-sm' data-verdict-rules=''>
              {[
                ['common.act', 'analysisRules.thereSpecificPageTopicChange'],
                ['common.watchRecommendation', 'analysisRules.watchPolicyHelp'],
                [
                  'common.noActionNeeded',
                  'analysisRules.goodNewsAlreadyProgressSmall',
                ],
              ].map(([label, text]) => (
                <div
                  key={label}
                  className='grid gap-1 sm:grid-cols-[minmax(8rem,auto)_1fr] sm:gap-4'
                >
                  <p className='font-medium'>{$t(label)}</p>
                  <p className='text-muted-foreground'>
                    {$tj(text, { 0: view.watchDays })}
                  </p>
                </div>
              ))}
            </div>
            <div className='rounded-lg border p-3' data-focus=''>
              <div className='flex items-center justify-between gap-3'>
                <h3 className='text-sm font-medium'>
                  {$t('analysisRules.teamFocus')}
                </h3>
                {isAdmin ? (
                  <Button
                    size='sm'
                    variant='ghost'
                    disabled={busy || Boolean(editing)}
                    onClick={() => void edit('focus')}
                  >
                    {$t('common.modify')}
                  </Button>
                ) : null}
              </div>
              <p className='whitespace-pre-wrap text-sm text-muted-foreground'>
                {view.focus ||
                  $t('analysisRules.notWrittenYetExampleQuestions')}
              </p>
              {editing === 'focus' ? (
                <SimpleEditor
                  key={view.revision}
                  value={view.focus}
                  kind='focus'
                  view={view}
                  busy={busy}
                  error={saveError}
                  onClose={closeEditor}
                  onSave={save}
                />
              ) : null}
            </div>
            <div className='rounded-lg border p-3' data-watch-days=''>
              <div className='flex items-center justify-between gap-3'>
                <p className='text-sm'>
                  {$tj('analysisRules.watchMostDays', { 0: view.watchDays })}
                </p>
                {isAdmin ? (
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
              {editing === 'days' ? (
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
              })}{' '}
              · {$tj('analysisRules.passedAi', { 0: last.passed ?? '—' })}
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
