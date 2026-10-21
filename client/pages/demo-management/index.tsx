import { useApiClient, useNavigationGuard } from '@nocobase/app-client';
import { nextDemoReset } from '@nocobase/app-plugin-demo-mode/client/demo-configuration';
import type {
  DemoConfigurationView,
  DemoDailySchedule,
  DemoWriteRule,
} from '@nocobase/app-plugin-demo-mode/client/demo-configuration';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Link } from 'react-router';
import { DatabaseZap, LoaderCircle, RefreshCw } from 'lucide-react';
import { $t, useNocoReachLocale } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import { confirmAction } from '#components/reach/confirm';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Checkbox } from '#components/ui/checkbox';
import { Label } from '#components/ui/label';
import { Input } from '#components/ui/input';
import { Skeleton } from '#components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '#components/ui/empty';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '#components/ui/alert-dialog';
import { toast } from '#lib/toast';
import DemoDataPage from '../demo-data.js';
import { useDemoAccess } from './access.js';

const t = (key: string) => $t(`demoConfig.${key}`);
/** Registered capabilities and adapters, by id; one the page does not know shows the title it registered with. */
const TITLES: Record<string, string> = {
  'nocoreach.tasks': 'capabilityTasks',
  'nocoreach.taskWork': 'capabilityTaskWorkflow',
  'nocoreach.keywordCandidates': 'capabilityKeywordCandidates',
  'nocoreach.knowledge': 'capabilityKnowledge',
  'nocoreach.taskCreation': 'taskCreation',
  'nocoreach.opportunities': 'opportunityHandoff',
  'nocoreach.onlineConversations': 'capabilityOnlineConversations',
  'dataset.model': 'adapterModel',
  'nocoreach.sources': 'adapterSources',
  'nocoreach.runner': 'adapterRunner',
};
const title = (item: { readonly id: string; readonly title: string }) =>
  TITLES[item.id] ? t(TITLES[item.id]) : item.title;
function preview(schedule: DemoDailySchedule): string | null {
  try {
    return nextDemoReset(schedule);
  } catch {
    return null;
  }
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
type Section = 'rules' | 'mocks' | 'schedule';
type Values = {
  rules: DemoWriteRule[];
  mocks: Record<string, boolean>;
  schedule: DemoDailySchedule;
};
const defaultSchedule: DemoDailySchedule = {
  enabled: false,
  hour: 3,
  minute: 0,
  timezone: 'Asia/Shanghai',
  language: 'en-US',
};
const contentClass =
  'w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal';
function Choice({
  value,
  values,
  label,
  disabled,
  onChange,
}: {
  value: string;
  values: readonly [string, string][];
  label: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
    >
      <SelectTrigger aria-label={label} className='w-full'>
        <SelectValue>
          {values.find(([id]) => id === value)?.[1] ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClass}>
        {values.map(([id, title]) => (
          <SelectItem key={id} value={id}>
            {title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
function Missing() {
  return (
    <Empty className='min-h-40 border border-dashed'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <DatabaseZap />
        </EmptyMedia>
        <EmptyTitle>{t('empty')}</EmptyTitle>
        <EmptyDescription>{t('emptyHelp')}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
function Failure({ error, retry }: { error: unknown; retry?: () => void }) {
  const status = (error as { status?: number })?.status;
  const reason = (error as { reason?: string })?.reason;
  const text =
    reason === 'DEMO_CONFIGURATION_CONFLICT'
      ? t('conflict')
      : reason === 'DEMO_DATA_BUSY'
        ? t('busy')
        : status === 401
          ? $t('common.sessionExpiredSignAgain')
          : status === 403
            ? t('denied')
            : status === 404
              ? t('unavailable')
              : t('failed');
  return (
    <Alert variant='destructive'>
      <AlertTitle>{text}</AlertTitle>
      <AlertDescription>
        {status === 401 ? (
          <Link to='/login'>{$t('common.signAgain')}</Link>
        ) : retry && ![403, 404].includes(status ?? 0) ? (
          <Button type='button' variant='outline' onClick={retry}>
            {reason === 'DEMO_CONFIGURATION_CONFLICT'
              ? t('reload')
              : $t('common.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function Editor<S extends Section>({
  section,
  view,
  canEdit,
  saving,
  setSaving,
  onSaved,
  onReload,
  onDirty,
  children,
}: {
  section: S;
  view: DemoConfigurationView;
  canEdit: boolean;
  saving: boolean;
  setSaving: (value: boolean) => void;
  onSaved: (value: DemoConfigurationView) => void;
  onReload: () => Promise<void>;
  onDirty: (section: Section, value: boolean) => void;
  children: (
    value: Values[S],
    change: (value: Values[S]) => void,
    disabled: boolean,
    fieldError?: string,
  ) => ReactNode;
}) {
  const api = useApiClient();
  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const actual = (view[section] ?? defaultSchedule) as Values[S];
  const [baseline, setBaseline] = useState({
    value: actual,
    revision: view.revision,
  });
  const [value, setValue] = useState(actual);
  const [error, setError] = useState<unknown>();
  const [fieldError, setFieldError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const dirty = !same(value, baseline.value);
  const changes =
    section === 'rules'
      ? [
          ...(value as DemoWriteRule[])
            .filter(
              (rule) =>
                !(baseline.value as DemoWriteRule[]).some((old) =>
                  same(old, rule),
                ),
            )
            .map((rule) => ({ rule, added: true })),
          ...(baseline.value as DemoWriteRule[])
            .filter(
              (rule) =>
                !(value as DemoWriteRule[]).some((next) => same(next, rule)),
            )
            .map((rule) => ({ rule, added: false })),
        ].map(
          ({ rule, added }) =>
            `${t(added ? 'allow' : 'revoke')}: ${title(view.capabilities.find((item) => item.id === rule.capability) ?? { id: rule.capability, title: rule.capability })} · ${t(rule.operation)} · ${t(rule.scope === 'all' ? 'allRecords' : 'demoProjects')}`,
        )
      : section === 'mocks'
        ? view.adapters
            .filter(
              (adapter) =>
                (value as Values['mocks'])[adapter.id] !==
                (baseline.value as Values['mocks'])[adapter.id],
            )
            .map(
              (adapter) =>
                `${title(adapter)}: ${t((value as Values['mocks'])[adapter.id] ? 'enable' : 'disable')}`,
            )
        : [
            (value as DemoDailySchedule).enabled
              ? `${String((value as DemoDailySchedule).hour).padStart(2, '0')}:${String((value as DemoDailySchedule).minute).padStart(2, '0')} · ${(value as DemoDailySchedule).timezone} · ${(value as DemoDailySchedule).language}`
              : t('notScheduled'),
          ];
  const destructive =
    section === 'schedule' ||
    (section === 'mocks'
      ? view.adapters.some(
          (adapter) =>
            (baseline.value as Values['mocks'])[adapter.id] &&
            !(value as Values['mocks'])[adapter.id],
        )
      : (baseline.value as DemoWriteRule[]).some(
          (rule) =>
            !(value as DemoWriteRule[]).some((next) => same(rule, next)),
        ));
  const conflict = !same(actual, baseline.value) && dirty;
  const [seenRevision, setSeenRevision] = useState(view.revision);
  if (seenRevision !== view.revision) {
    setSeenRevision(view.revision);
    if (!dirty) {
      setBaseline({ value: actual, revision: view.revision });
      setValue(actual);
    } else if (same(actual, baseline.value))
      setBaseline({ ...baseline, revision: view.revision });
  }
  useEffect(() => {
    onDirty(section, dirty);
    return () => onDirty(section, false);
  }, [dirty, onDirty, section]);
  const reset = () => {
    setValue(actual);
    setBaseline({ value: actual, revision: view.revision });
    setError(undefined);
  };
  async function reload() {
    setConfirming(false);
    await onReload();
  }
  async function save() {
    setSaving(true);
    setError(undefined);
    try {
      const path = section === 'rules' ? 'writeRules' : section;
      const { data } = await api.request<{ data: DemoConfigurationView }>({
        path: `/demoMode/configuration/${path}`,
        method: 'PUT',
        json: {
          expectedRevision: baseline.revision,
          value,
        },
      });
      if (!mountedRef.current) return;
      setBaseline({
        value: (data[section] ?? defaultSchedule) as Values[S],
        revision: data.revision,
      });
      setValue((data[section] ?? defaultSchedule) as Values[S]);
      setConfirming(false);
      onSaved(data);
      toast.success(() => t('saved'));
    } catch (cause) {
      if (mountedRef.current) setError(cause);
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(section)}</CardTitle>
        <CardDescription>{t(`${section}Help`)}</CardDescription>
      </CardHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (section === 'schedule' && (value as DemoDailySchedule).enabled) {
            try {
              new Intl.DateTimeFormat('en', {
                timeZone: (value as DemoDailySchedule).timezone,
              }).format();
            } catch {
              setFieldError(t('invalidTimezone'));
              (
                event.currentTarget.elements.namedItem(
                  'demoTimezone',
                ) as HTMLInputElement
              )?.focus();
              return;
            }
          }
          setFieldError(undefined);
          if (!conflict) setConfirming(true);
        }}
      >
        <CardContent className='flex flex-col gap-4'>
          {view.busy ? (
            <Alert>
              <AlertTitle>{t('busy')}</AlertTitle>
            </Alert>
          ) : null}
          {error && !confirming ? (
            <Failure error={error} retry={() => void reload()} />
          ) : null}
          {conflict ? (
            <Alert variant='destructive'>
              <AlertTitle>{t('conflict')}</AlertTitle>
              <AlertDescription>
                <Button type='button' variant='outline' onClick={reset}>
                  {t('discardReload')}
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {children(
            value,
            (next) => {
              setValue(next);
              if (fieldError && section === 'schedule') {
                try {
                  new Intl.DateTimeFormat('en', {
                    timeZone: (next as DemoDailySchedule).timezone,
                  }).format();
                  setFieldError(undefined);
                } catch {
                  setFieldError(t('invalidTimezone'));
                }
              }
            },
            !canEdit || saving || view.busy,
            fieldError,
          )}
        </CardContent>
        {canEdit ? (
          <CardFooter className='mt-4 justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              disabled={!dirty || saving}
              onClick={reset}
            >
              {$t('common.cancel')}
            </Button>
            <Button
              type='submit'
              disabled={!dirty || saving || conflict || view.busy}
            >
              {saving ? <LoaderCircle className='animate-spin' /> : null}
              {$t('common.save')}
            </Button>
          </CardFooter>
        ) : null}
      </form>
      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!saving) setConfirming(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t(`${section}Confirm`)}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(`${section}Consequence`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className='grid list-disc gap-1 pl-5 text-sm'>
            {changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          {error ? <Failure error={error} retry={() => void reload()} /> : null}
          <AlertDialogFooter>
            <Button
              variant='outline'
              disabled={saving}
              onClick={() => setConfirming(false)}
            >
              {$t('common.cancel')}
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={saving || view.busy}
              onClick={() => void save()}
            >
              {saving ? <LoaderCircle className='animate-spin' /> : null}
              {t('applyChanges')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default function DemoManagementPage() {
  useNocoReachLocale();
  const access = useDemoAccess();
  const api = useApiClient();
  const [view, setView] = useState<DemoConfigurationView>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dataBusy, setDataBusy] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');
  const [dirtySections, setDirtySections] = useState<ReadonlySet<Section>>(
    () => new Set(),
  );
  const onDirty = useCallback((section: Section, value: boolean) => {
    setDirtySections((old) => {
      if (old.has(section) === value) return old;
      const next = new Set(old);
      if (value) next.add(section);
      else next.delete(section);
      return next;
    });
  }, []);
  const [seenIdentity, setSeenIdentity] = useState(access.revision);
  if (seenIdentity !== access.revision) {
    setSeenIdentity(access.revision);
    setView(undefined);
    setDirtySections(new Set());
    setLoading(true);
    setSaving(false);
    setError(undefined);
  }
  const sequenceRef = useRef({ value: 0 });
  const load = useCallback(async () => {
    const id = ++sequenceRef.current.value;
    try {
      const response = await api.request<{ data: DemoConfigurationView }>({
        path: '/demoMode/configuration',
      });
      if (id === sequenceRef.current.value) {
        setView(response.data);
        setError(undefined);
      }
    } catch (cause) {
      if (id === sequenceRef.current.value) setError(cause);
    } finally {
      if (id === sequenceRef.current.value) setLoading(false);
    }
  }, [api]);
  useEffect(() => {
    const requests = sequenceRef.current;
    let active = true;
    queueMicrotask(() => {
      if (active && access.readConfiguration) void load();
    });
    const timer = setInterval(() => {
      if (active && access.readConfiguration) void load();
    }, 5000);
    return () => {
      clearInterval(timer);
      active = false;
      requests.value++;
    };
  }, [access.readConfiguration, access.revision, load]);
  const discard = useCallback(
    async () =>
      !dirtySections.size ||
      (await confirmAction({
        title: () => t('discardTitle'),
        description: () => t('discardHelp'),
        action: () => t('discard'),
      })),
    [dirtySections],
  );
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirtySections.size) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => {
      window.removeEventListener('beforeunload', unload);
    };
  }, [dirtySections, discard]);
  useNavigationGuard(async () => !saving && (await discard()));
  const refresh = async () => {
    if (!(await discard())) return;
    setDirtySections(new Set());
    if (access.readConfiguration) {
      setLoading(true);
      await load();
    }
    setRefreshKey((key) => key + 1);
  };
  if (access.pending)
    return (
      <PageContainer>
        <Skeleton className='h-40 w-full' aria-label={$t('common.loading')} />
      </PageContainer>
    );
  if (!access.visible)
    return (
      <PageContainer>
        <Alert>
          <AlertTitle>
            {access.enabled ? t('denied') : t('unavailable')}
          </AlertTitle>
        </Alert>
      </PageContainer>
    );
  const common = view
    ? {
        view: { ...view, busy: view.busy || dataBusy },
        canEdit: Boolean(access.configure),
        saving,
        setSaving,
        onSaved: setView,
        onReload: load,
        onDirty,
      }
    : undefined;
  const capabilities =
    view?.capabilities.filter((item) =>
      `${title(item)} ${item.table}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ) ?? [];
  return (
    <PageContainer className='[&>header]:flex-row [&>header]:items-start'>
      <PageHeader
        title={t('title')}
        description={access.mode === 'observe' ? t('observe') : t('readonly')}
        actions={
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant='outline'
                  size='icon'
                  aria-label={$t('common.refresh')}
                  disabled={
                    (access.readConfiguration && loading) ||
                    dataLoading ||
                    saving ||
                    dataBusy
                  }
                  onClick={() => void refresh()}
                />
              }
            >
              <RefreshCw
                className={
                  (access.readConfiguration && loading) || dataLoading
                    ? 'animate-spin'
                    : ''
                }
              />
            </TooltipTrigger>
            <TooltipContent>{$t('common.refresh')}</TooltipContent>
          </Tooltip>
        }
      />
      <p className='text-sm text-muted-foreground'>
        {t('permissionsHelp')}{' '}
        {access.manageRoles ? (
          <Link className='underline' to='/members?tab=roles'>
            {t('roles')}
          </Link>
        ) : null}
      </p>
      <div className='flex max-w-3xl flex-col gap-4' key={access.revision}>
        {access.readData ? (
          <DemoDataPage
            embedded
            canManage={Boolean(access.manageData)}
            onBusy={setDataBusy}
            onLoading={setDataLoading}
            refreshKey={refreshKey}
          />
        ) : (
          <Alert>
            <AlertTitle>{t('denied')}</AlertTitle>
          </Alert>
        )}
        {!access.readConfiguration ? (
          <Alert>
            <AlertTitle>{t('configurationDenied')}</AlertTitle>
          </Alert>
        ) : (
          <>
            {error ? <Failure error={error} retry={() => void load()} /> : null}
            {loading && !view ? (
              <Skeleton
                className='h-56 w-full'
                aria-label={$t('common.loading')}
              />
            ) : null}
            {/* Callbacks carried by common only access request refs when invoked after an event. */}
            {/* eslint-disable-next-line react-hooks/refs -- onReload is an async event callback, not render-time ref access. */}
            {view && common ? (
              <>
                <Editor
                  key={`schedule:${refreshKey}`}
                  section='schedule'
                  {...common}
                >
                  {(value, change, disabled, fieldError) => (
                    <>
                      <Label>
                        <Checkbox
                          checked={value.enabled}
                          disabled={disabled}
                          onCheckedChange={(enabled) =>
                            change({ ...value, enabled })
                          }
                        />
                        {t('daily')}
                      </Label>
                      {value.enabled ? (
                        <div className='grid gap-3 sm:grid-cols-2'>
                          <Label className='grid gap-2'>
                            {t('hour')} *
                            <Choice
                              label={t('hour')}
                              value={String(value.hour)}
                              values={Array.from({ length: 24 }, (_, n) => [
                                String(n),
                                String(n).padStart(2, '0'),
                              ])}
                              disabled={disabled}
                              onChange={(hour) =>
                                change({ ...value, hour: Number(hour) })
                              }
                            />
                          </Label>
                          <Label className='grid gap-2'>
                            {t('minute')} *
                            <Choice
                              label={t('minute')}
                              value={String(value.minute)}
                              values={Array.from({ length: 60 }, (_, n) => [
                                String(n),
                                String(n).padStart(2, '0'),
                              ])}
                              disabled={disabled}
                              onChange={(minute) =>
                                change({ ...value, minute: Number(minute) })
                              }
                            />
                          </Label>
                          <Label className='grid gap-2'>
                            {t('timezone')} *
                            <Input
                              required
                              list='demo-timezones'
                              name='demoTimezone'
                              aria-invalid={Boolean(fieldError)}
                              aria-describedby={
                                fieldError ? 'demo-timezone-error' : undefined
                              }
                              value={value.timezone}
                              disabled={disabled}
                              onChange={(event) =>
                                change({
                                  ...value,
                                  timezone: event.target.value,
                                })
                              }
                            />
                            {fieldError ? (
                              <p
                                id='demo-timezone-error'
                                className='text-sm text-destructive'
                              >
                                {fieldError}
                              </p>
                            ) : null}
                            <datalist id='demo-timezones'>
                              {Intl.supportedValuesOf('timeZone').map(
                                (zone) => (
                                  <option key={zone} value={zone} />
                                ),
                              )}
                            </datalist>
                          </Label>
                          <Label className='grid gap-2'>
                            {t('language')} *
                            <Choice
                              label={t('language')}
                              value={value.language}
                              values={['en-US', 'zh-CN'].map((language) => [
                                language,
                                language === 'en-US' ? 'English' : '简体中文',
                              ])}
                              disabled={disabled}
                              onChange={(language) =>
                                change({ ...value, language })
                              }
                            />
                          </Label>
                        </div>
                      ) : null}
                      <p className='text-sm text-muted-foreground'>
                        {t('nextRun')}:{' '}
                        {preview(value)
                          ? new Date(preview(value)!).toLocaleString()
                          : t('notScheduled')}
                      </p>
                    </>
                  )}
                </Editor>
                <Editor key={`rules:${refreshKey}`} section='rules' {...common}>
                  {(rules, change, disabled) => (
                    <>
                      <p className='break-words text-sm text-muted-foreground'>
                        {t('fixed')}: {view.fixedTables.join(', ') || '—'}.{' '}
                        {t('signInTables')}
                      </p>
                      {view.fixedTables.includes('nr_snapshots') ? (
                        <Alert>
                          <AlertTitle>{t('legacySnapshots')}</AlertTitle>
                          <AlertDescription>
                            {t('legacySnapshotsHelp')}
                          </AlertDescription>
                        </Alert>
                      ) : null}
                      <Input
                        aria-label={t('search')}
                        placeholder={t('search')}
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                      {!view.capabilities.length ? (
                        <Missing />
                      ) : !capabilities.length ? (
                        <p>
                          {t('noResults')}{' '}
                          <Button
                            variant='outline'
                            onClick={() => setSearch('')}
                          >
                            {t('clearSearch')}
                          </Button>
                        </p>
                      ) : (
                        capabilities.map((item) => (
                          <div
                            key={item.id}
                            className='flex flex-col gap-3 rounded-md border p-4'
                          >
                            <p className='break-words font-medium'>
                              {title(item)}{' '}
                              <span className='text-sm text-muted-foreground'>
                                ({item.table})
                              </span>
                            </p>
                            {item.operations.map((operation) => {
                              const selected = rules.find(
                                (rule) =>
                                  rule.capability === item.id &&
                                  rule.operation === operation,
                              );
                              const rest = rules.filter(
                                (rule) =>
                                  rule.capability !== item.id ||
                                  rule.operation !== operation,
                              );
                              return (
                                <div
                                  key={operation}
                                  className='flex flex-wrap items-center gap-3'
                                >
                                  <Label>
                                    <Checkbox
                                      disabled={disabled}
                                      checked={Boolean(selected)}
                                      onCheckedChange={(checked) =>
                                        change(
                                          checked
                                            ? [
                                                ...rest,
                                                {
                                                  capability: item.id,
                                                  operation,
                                                  scope: item.scopes[0].id,
                                                },
                                              ]
                                            : rest,
                                        )
                                      }
                                    />
                                    {t(operation)}
                                  </Label>
                                  {selected ? (
                                    <div className='min-w-0 flex-1'>
                                      <Choice
                                        disabled={disabled}
                                        label={`${title(item)}: ${t('scope')}`}
                                        value={selected.scope}
                                        values={item.scopes.map((scope) => [
                                          scope.id,
                                          scope.id === 'all'
                                            ? t('allRecords')
                                            : t('demoProjects'),
                                        ])}
                                        onChange={(scope) =>
                                          change([
                                            ...rest,
                                            { ...selected, scope },
                                          ])
                                        }
                                      />
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ))
                      )}
                    </>
                  )}
                </Editor>
                <Editor key={`mocks:${refreshKey}`} section='mocks' {...common}>
                  {(mocks, change, disabled) =>
                    !view.adapters.length ? (
                      <Missing />
                    ) : (
                      <div className='flex flex-col gap-3'>
                        {view.adapters.map((adapter) => (
                          <div
                            key={adapter.id}
                            className='flex flex-col gap-2 rounded-md border p-4'
                          >
                            <Label>
                              <Checkbox
                                disabled={disabled}
                                checked={mocks[adapter.id] === true}
                                onCheckedChange={(enabled) =>
                                  change({ ...mocks, [adapter.id]: enabled })
                                }
                              />
                              {title(adapter)}
                            </Label>
                            <p className='break-words text-sm text-muted-foreground'>
                              {t(adapter.kind)} ·{' '}
                              {adapter.scope === 'demo-projects-plan-only'
                                ? t('planOnly')
                                : adapter.scope === 'demo-projects'
                                  ? t('demoProjects')
                                  : t('demoModel')}
                            </p>
                          </div>
                        ))}
                      </div>
                    )
                  }
                </Editor>
              </>
            ) : null}
          </>
        )}
      </div>
    </PageContainer>
  );
}
