import { Fragment, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import {
  useDemoData,
  type DemoDataStatus,
} from '@nocobase/app-plugin-demo-mode/client/demo-data';
import { $t, useNocoReachLocale } from '#i18n';
import { toast } from '#lib/toast';
import { PageContainer, PageHeader, Section } from '#components/reach/page';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
} from '#components/ui/alert-dialog';
import { StatusBadge } from '#components/status-badge';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Progress } from '#components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#components/ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useWorkspaceCache } from './workspace-cache';

const LANGUAGES = ['zh-CN', 'en-US'] as const;
const languageLabel = (language: string) =>
  $t(
    language === 'en-US'
      ? 'demoData.language.english'
      : 'demoData.language.chinese',
  );
const COUNTS = [
  'projects',
  'accounts',
  'tasks',
  'opportunities',
  'knowledge',
] as const;

/** What a refused import, clear or reset tells the administrator; the server's reason picks the line. */
function errorText(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 401) return $t('common.sessionExpiredSignAgain');
  if (status === 403) return $t('demoData.errors.denied');
  if (status === 404) return $t('demoData.unavailable');
  const reason = (error as { reason?: string } | null)?.reason;
  switch (reason) {
    case 'DEMO_MODE_REQUIRED':
      return $t('demoData.errors.demoModeRequired');
    case 'DEMO_DATA_WORK_RUNNING':
      return $t('demoData.errors.workRunning');
    case 'DEMO_DATA_BUSY':
      return $t('demoData.errors.busy');
    case 'DEMO_DATA_EXISTS':
      return $t('demoData.errors.exists');
    case 'DEMO_DATA_MISSING':
      return $t('demoData.errors.missing');
    case 'DEMO_DATA_ACCOUNT_CONFLICT':
      return $t('demoData.errors.accountConflict');
    case 'DEMO_DATA_ACCESS_REQUIRED':
      return $t('demoData.errors.denied');
    default:
      return $t('demoData.errors.failed');
  }
}

function LoadError({
  error,
  refresh,
  loading,
  stale = false,
}: {
  error: unknown;
  refresh: () => Promise<void>;
  loading: boolean;
  stale?: boolean;
}) {
  const status = (error as { status?: number } | null)?.status ?? 0;
  return (
    <Alert variant='destructive' className='max-w-3xl'>
      <AlertTitle>{errorText(error)}</AlertTitle>
      <AlertDescription>
        {status === 403 ? (
          <p>{$t('demoData.accessHelp')}</p>
        ) : status === 404 ? (
          <p>{$t('demoData.unavailableHelp')}</p>
        ) : stale ? (
          <p>{$t('strategy.blockStale')}</p>
        ) : null}
        {status === 401 ? (
          <Link to='/login'>{$t('common.signAgain')}</Link>
        ) : ![403, 404].includes(status) ? (
          <Button
            variant='outline'
            size='sm'
            disabled={loading}
            onClick={() => void refresh()}
          >
            {$t('common.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function stateBadge(status: DemoDataStatus) {
  if (status.state === 'importing')
    return (
      <StatusBadge tone='info'>{$t('demoData.state.importing')}</StatusBadge>
    );
  if (status.state === 'clearing')
    return (
      <StatusBadge tone='info'>{$t('demoData.state.clearing')}</StatusBadge>
    );
  if (status.state === 'failed')
    return (
      <StatusBadge tone='warning'>{$t('demoData.state.failed')}</StatusBadge>
    );
  if (status.present)
    return (
      <StatusBadge tone='success'>{$t('demoData.state.present')}</StatusBadge>
    );
  return <StatusBadge>{$t('demoData.state.none')}</StatusBadge>;
}

function DemoDataLoading() {
  return (
    <div
      className='flex w-full max-w-3xl flex-col gap-4'
      role='status'
      aria-label={$t('common.loading')}
    >
      <div className='space-y-3 rounded-md border bg-card p-4'>
        <Skeleton className='h-5 w-24' />
        <Skeleton className='h-4 w-2/3' />
        <div className='grid grid-cols-2 gap-3 sm:grid-cols-5'>
          {COUNTS.map((key) => (
            <Skeleton key={key} className='h-14' />
          ))}
        </div>
        <Skeleton className='h-8 w-2/3' />
      </div>
      <div className='space-y-3 rounded-md border bg-card p-4'>
        <Skeleton className='h-5 w-24' />
        <Skeleton className='h-4 w-full' />
        {['header', 'first', 'second', 'third', 'fourth', 'fifth'].map(
          (key) => (
            <Skeleton key={key} className='h-7 w-full' />
          ),
        )}
      </div>
      <div className='space-y-3 rounded-md border bg-card p-4'>
        <Skeleton className='h-5 w-16' />
        <Skeleton className='h-20 w-full' />
      </div>
    </div>
  );
}

/** Settings › Demo data: import, reset and clear the demo projects, accounts and simulated model. */
export default function DemoDataPage({
  embedded = false,
  canManage = true,
  onBusy,
  onLoading,
  refreshKey = 0,
}: {
  embedded?: boolean;
  canManage?: boolean;
  onBusy?: (busy: boolean) => void;
  onLoading?: (loading: boolean) => void;
  refreshKey?: number;
} = {}) {
  const Container = embedded ? Fragment : PageContainer;
  const locale = useNocoReachLocale();
  const demo = useDemoData();
  const previousRefreshRef = useRef(refreshKey);
  useEffect(() => {
    if (previousRefreshRef.current !== refreshKey) {
      previousRefreshRef.current = refreshKey;
      void demo.refresh();
    }
  }, [refreshKey, demo]);
  useEffect(() => {
    onLoading?.(demo.loading);
  }, [demo.loading, onLoading]);
  const [intent, setIntent] = useState<'import' | 'reset' | 'clear' | null>(
    null,
  );
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<unknown>();
  const cache = useWorkspaceCache();
  const status = demo.status;
  const [chosenLanguage, setChosenLanguage] = useState<string | null>(null);
  const language = chosenLanguage ?? status?.language ?? LANGUAGES[0];
  const running = Boolean(status?.importing);
  const busy = demo.pending || running || actionPending;
  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);
  const demoModeEnabled =
    status?.mode === 'read-only' || status?.mode === 'observe';
  const denied = [401, 403, 404].includes(
    (demo.error as { status?: number } | null)?.status ?? 0,
  );
  const primaryActionRef = useRef<HTMLButtonElement>(null);
  const focusAfterActionRef = useRef(false);
  useEffect(() => {
    if (!busy && focusAfterActionRef.current) {
      primaryActionRef.current?.focus();
      focusAfterActionRef.current = false;
    }
  }, [busy, status]);

  // The project list and every report move with the demo; pages read them again once an import or clear ends.
  const previousRef = useRef<DemoDataStatus | null>(null);
  useEffect(() => {
    const previous = previousRef.current;
    if (
      previous &&
      status &&
      !running &&
      (previous.importing ||
        previous.finishedAt !== status.finishedAt ||
        previous.present !== status.present)
    ) {
      cache.invalidate(() => true);
      window.dispatchEvent(new Event('reach-project-saved'));
      if (status.present) toast.success(() => $t('demoData.imported'));
      else if (status.failure) toast.error(() => $t('demoData.importFailed'));
    }
    previousRef.current = status;
  }, [running, status, cache]);

  const clear = () => {
    setActionError(undefined);
    setIntent('clear');
  };
  const reset = () => {
    setActionError(undefined);
    setIntent('reset');
  };
  const importData = () => {
    setActionError(undefined);
    setIntent('import');
  };
  async function execute() {
    setActionPending(true);
    setActionError(undefined);
    try {
      if (intent === 'clear') {
        await demo.clear();
        cache.invalidate(() => true);
        window.dispatchEvent(new Event('reach-project-saved'));
        toast.success(() => $t('demoData.cleared'));
      } else if (intent === 'reset') await demo.reset(language);
      else await demo.importData(language);
      setIntent(null);
      focusAfterActionRef.current = true;
    } catch (error) {
      setActionError(error);
    } finally {
      setActionPending(false);
    }
  }
  const intentTitle =
    intent === 'clear'
      ? 'demoData.clearTitle'
      : intent === 'reset'
        ? 'demoData.resetTitle'
        : status?.state === 'failed'
          ? 'demoData.retryTitle'
          : 'demoData.importTitle';
  const intentDescription =
    intent === 'clear'
      ? 'demoData.clearDescription'
      : intent === 'reset'
        ? 'demoData.resetDescription'
        : status?.model.enabled
          ? 'demoData.noteModel'
          : 'demoData.description';
  const intentAction =
    intent === 'clear'
      ? 'demoData.clear'
      : intent === 'reset'
        ? 'demoData.reset'
        : 'demoData.importAction';

  const accounts = status?.present
    ? status.accounts
    : (status?.accountsByLanguage[language] ?? []);
  return (
    <Container>
      <AlertDialog
        open={Boolean(intent)}
        onOpenChange={(open) => {
          if (!open && !actionPending) setIntent(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{$t(intentTitle)}</AlertDialogTitle>
            <AlertDialogDescription>
              {$t(intentDescription)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {actionError ? (
            <Alert variant='destructive'>
              <AlertTitle>{errorText(actionError)}</AlertTitle>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <Button
              variant='outline'
              disabled={actionPending}
              onClick={() => setIntent(null)}
            >
              {$t('common.cancel')}
            </Button>
            <Button
              variant={intent === 'import' ? 'default' : 'destructive'}
              disabled={actionPending}
              onClick={() => void execute()}
            >
              {actionPending ? <LoaderCircle className='animate-spin' /> : null}
              {$t(intentAction)}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {!embedded && (
        <PageHeader
          title={$t('demoData.title')}
          description={$t('demoData.description')}
          actions={
            !denied ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant='outline'
                      size='icon'
                      disabled={demo.loading || busy}
                      aria-label={$t('common.refresh')}
                      aria-busy={demo.loading}
                      onClick={() => void demo.refresh()}
                    />
                  }
                >
                  <RefreshCw
                    className={demo.loading ? 'animate-spin' : undefined}
                    aria-hidden='true'
                  />
                </TooltipTrigger>
                <TooltipContent>{$t('common.refresh')}</TooltipContent>
              </Tooltip>
            ) : null
          }
        />
      )}
      {demo.loading && !status ? (
        <DemoDataLoading />
      ) : !status ? (
        <LoadError
          error={demo.error}
          refresh={() => demo.refresh()}
          loading={demo.loading}
        />
      ) : !status.available ? (
        <p className='text-sm text-muted-foreground'>
          {$t('demoData.unavailable')}
        </p>
      ) : (
        <div className='flex max-w-3xl flex-col gap-4'>
          {demo.error ? (
            <LoadError
              error={demo.error}
              refresh={() => demo.refresh()}
              loading={demo.loading}
              stale
            />
          ) : null}
          <Alert>
            <AlertTitle>
              {$t(
                demoModeEnabled
                  ? 'demoData.demoModeTitle'
                  : 'demoData.modeOffTitle',
              )}
            </AlertTitle>
            <AlertDescription>
              {$t(
                demoModeEnabled
                  ? 'demoData.demoModeDescription'
                  : 'demoData.modeOffDescription',
              )}
            </AlertDescription>
          </Alert>
          {status.failure ? (
            <Alert variant='destructive'>
              <AlertTitle>{$t('demoData.importFailed')}</AlertTitle>
              <AlertDescription>
                {errorText({ reason: status.failure.code })}
              </AlertDescription>
            </Alert>
          ) : null}
          <Section
            title={$t('demoData.statusTitle')}
            actions={stateBadge(status)}
            description={
              status.present && status.createdAt
                ? $t('demoData.importedAt', {
                    0: new Date(status.createdAt).toLocaleString(locale),
                    1: languageLabel(status.language ?? language),
                  })
                : $t('demoData.notImported')
            }
          >
            <p className='text-sm text-muted-foreground'>
              {$t('demoConfig.dataset')}: {status.datasetId}
            </p>
            {status.importing ? (
              <Progress
                value={status.importing.percent}
                aria-label={$t('demoData.state.importing')}
              />
            ) : null}
            {status.present ? (
              <dl className='grid grid-cols-2 gap-3 sm:grid-cols-5'>
                {COUNTS.map((key) => (
                  <div key={key} className='rounded-md border px-3 py-2'>
                    <dt className='text-xs text-muted-foreground'>
                      {$t(`demoData.counts.${key}`)}
                    </dt>
                    <dd className='text-lg font-semibold tabular-nums'>
                      {status.counts[key] ?? 0}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {canManage && (
              <div className='flex flex-wrap items-center gap-2'>
                {
                  <Select
                    value={language}
                    onValueChange={(value) => value && setChosenLanguage(value)}
                    disabled={busy}
                  >
                    {/* Both supported language names fit beside the lifecycle actions in this compact control. */}
                    <SelectTrigger
                      className='w-40 max-w-full'
                      aria-label={$t('demoData.languageLabel')}
                    >
                      <SelectValue>{languageLabel(language)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
                      {LANGUAGES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {languageLabel(value)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
                {status.present || demoModeEnabled ? (
                  <>
                    <Button
                      ref={status.present ? primaryActionRef : undefined}
                      variant='outline'
                      disabled={busy || !demoModeEnabled}
                      aria-busy={demo.pending}
                      onClick={() => void reset()}
                    >
                      {demo.pending ? (
                        <LoaderCircle
                          className='size-4 animate-spin'
                          aria-hidden='true'
                        />
                      ) : null}
                      {$t('demoData.reset')}
                    </Button>
                    <Button
                      variant='destructive'
                      disabled={busy || !demoModeEnabled}
                      aria-busy={demo.pending}
                      onClick={() => void clear()}
                    >
                      {demo.pending ? (
                        <LoaderCircle
                          className='size-4 animate-spin'
                          aria-hidden='true'
                        />
                      ) : null}
                      {$t('demoData.clear')}
                    </Button>
                  </>
                ) : null}
                {!status.present ? (
                  <Button
                    ref={primaryActionRef}
                    disabled={busy}
                    aria-busy={demo.pending}
                    onClick={() => void importData()}
                  >
                    {demo.pending ? (
                      <LoaderCircle
                        className='size-4 animate-spin'
                        aria-hidden='true'
                      />
                    ) : null}
                    {status.state === 'failed'
                      ? $t('demoData.retry')
                      : $t('demoData.import')}
                  </Button>
                ) : null}
              </div>
            )}
          </Section>
          <Section
            title={$t('demoData.accountsTitle')}
            description={$t('demoData.accountsDescription')}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{$t('demoData.username')}</TableHead>
                  <TableHead>{$t('demoData.name')}</TableHead>
                  <TableHead>{$t('demoData.role')}</TableHead>
                  <TableHead>{$t('demoData.password')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.map((account) => (
                  <TableRow key={account.username}>
                    <TableCell className='font-mono'>
                      {account.username}
                    </TableCell>
                    <TableCell>{account.name}</TableCell>
                    <TableCell>{account.role}</TableCell>
                    <TableCell className='font-mono'>
                      {account.password}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
          <Section
            title={$t('demoData.notesTitle')}
            description={$t('demoData.notesDescription')}
          >
            <ul className='flex list-disc flex-col gap-2 pl-5 text-sm text-muted-foreground'>
              <li>{$t('demoData.noteOffline')}</li>
              {status.model.enabled ? (
                <li>{$t('demoData.noteModel')}</li>
              ) : null}
              <li>{$t('demoData.noteRunner')}</li>
              <li>{$t('demoData.noteClear')}</li>
            </ul>
          </Section>
        </div>
      )}
    </Container>
  );
}
