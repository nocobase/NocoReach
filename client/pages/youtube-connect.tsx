import {
  formatCompactIn,
  formatCount,
  formatDate,
  formatDateTime,
} from '#lib/format';
import { confirmCollectorClear } from '#lib/collector-clear';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { $t, getCurrentLocale, useNocoReachLocale } from '#i18n';
import { nocobaseClient as api, NocoReachHttpError } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { useBusinessAccess } from '#hooks/use-business-access';
import { Button } from '#components/ui/button';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import {
  Dialog,
  DialogContent,
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
import { chipClass } from '#components/reach/chip';
import { confirmAction, type ConfirmAsk } from '#components/reach/confirm';
import { safeLink } from './analytics';
import { sentences } from './task-detail/failure-model';

export type { YouTubeStatus } from './youtube-api';
import {
  youtubeRequest,
  youtubeMessage,
  youtubeErrorMessage,
  type YouTubeStatus,
} from './youtube-api';

// YouTube (2026-11-02): searched through the project's DataForSEO connection, like Reddit discussions. The drawer
// says what is read and what it costs, then holds the search terms, the videos found lately, daily reading and Read
// now; Change opens the terms and tracked videos in a dialog. The proxy switch (passed in as `network`) sits above the
// links to the data and the destructive actions, which close the drawer.
const MAX_TERMS = 5;
const MAX_VIDEOS = 5;

function ErrorMessage({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const status = error instanceof NocoReachHttpError ? error.status : 0;
  return (
    <Alert variant='destructive'>
      <AlertDescription>
        {status === 401
          ? $t('common.sessionExpiredSignAgain')
          : status === 403
            ? $t('youtube.permissionDenied')
            : status === 404
              ? $t('youtube.projectUnavailable')
              : error instanceof Error
                ? youtubeErrorMessage(error)
                : $t('youtube.requestFailed')}
        {status === 401 ? (
          <a className='nr-link ml-2' href={api.resolveUrl('/login')}>
            {$t('common.signAgain')}
          </a>
        ) : ![403, 404].includes(status) && retry ? (
          <Button size='sm' variant='outline' onClick={retry}>
            {$t('common.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function YouTubeConnect({
  projectId,
  onChange,
  readOnly = false,
  suggested,
  network,
  onOpenSource,
}: {
  projectId: number;
  onChange: () => void;
  readOnly?: boolean;
  /** Offered as the first search term (the project's name). */
  suggested?: string;
  /** The connection's proxy switch, shown above the drawer's closing links. */
  network?: ReactNode;
  /** Opens another source's drawer: DataForSEO, to connect it or change its budget. */
  onOpenSource?: (id: string) => void;
}) {
  useNocoReachLocale();
  const { session, isPending } = useAuthentication();
  const revision = useAuthorizationRevision();
  if (isPending || !session) return null;
  const ownerKey = JSON.stringify([
    session.user.id,
    session.session.id,
    revision,
    projectId,
    readOnly,
  ]);
  return (
    <YouTubePanel
      key={ownerKey}
      ownerKey={ownerKey}
      sessionId={session.session.id}
      projectId={projectId}
      onChange={onChange}
      readOnly={readOnly}
      suggested={suggested}
      network={network}
      onOpenSource={onOpenSource}
    />
  );
}

type Action = 'connect' | 'sync' | 'disconnect' | 'clear';

function YouTubePanel({
  ownerKey,
  sessionId,
  projectId,
  onChange,
  readOnly,
  suggested,
  network,
  onOpenSource,
}: {
  ownerKey: string;
  sessionId: string;
  projectId: number;
  onChange: () => void;
  readOnly: boolean;
  suggested?: string;
  network?: ReactNode;
  onOpenSource?: (id: string) => void;
}) {
  const { refresh } = useAuthentication();
  const { can: connectAllowed } = useBusinessAccess(
    'nrYouTube.connect',
    projectId,
  );
  const { can: syncAllowed } = useBusinessAccess('nrYouTube.sync', projectId);
  const { can: disconnectAllowed } = useBusinessAccess(
    'nrYouTube.disconnect',
    projectId,
  );
  const { can: clearAllowed } = useBusinessAccess('nrYouTube.clear', projectId);
  const canConnect = !readOnly && connectAllowed;
  const canSync = !readOnly && syncAllowed;
  const canDisconnect = !readOnly && disconnectAllowed;
  const canClear = !readOnly && clearAllowed;
  const accessRef = useRef<Record<Action, boolean>>({
    connect: canConnect,
    sync: canSync,
    disconnect: canDisconnect,
    clear: canClear,
  });
  // A layout effect, not a passive one: a button appears in the commit that grants its permission, and a passive
  // effect can run after the browser has already dispatched a click to it, so the handler would see the old denial.
  useLayoutEffect(() => {
    accessRef.current = {
      connect: canConnect,
      sync: canSync,
      disconnect: canDisconnect,
      clear: canClear,
    };
  }, [canConnect, canSync, canDisconnect, canClear]);
  const client = useQueryClient();
  const queryKey = ['nocoreach', 'youtube', ownerKey];
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => youtubeRequest(projectId, 'status', {}, signal),
    retry: false,
    refetchOnWindowFocus: !busy,
    refetchOnReconnect: !busy,
    refetchInterval: (q) => (!busy && q.state.data?.syncing ? 2000 : false),
  });
  const pendingRef = useRef(false),
    ownerRef = useRef<AbortController | null>(null),
    lastRef = useRef<string | null>(null);
  useEffect(() => {
    const owner = new AbortController();
    ownerRef.current = owner;
    return () => owner.abort();
  }, []);
  useEffect(() => {
    const at = query.data?.lastSync?.at;
    if (at && lastRef.current !== at) {
      lastRef.current = at;
      onChange();
    }
  }, [query.data?.lastSync?.at, onChange]);
  async function run(
    action: Action,
    values: object,
    done: string,
    confirmation?: Omit<ConfirmAsk, 'signal'>,
  ) {
    const owner = ownerRef.current;
    if (
      pendingRef.current ||
      !accessRef.current[action] ||
      !owner ||
      owner.signal.aborted
    )
      return;
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    const active = () => !owner.signal.aborted && accessRef.current[action];
    try {
      if (action === 'clear') {
        if (!(await confirmCollectorClear('nrYouTube', owner.signal))) return;
      } else if (
        confirmation &&
        !(await confirmAction({ ...confirmation, signal: owner.signal }))
      )
        return;
      if (!active()) return;
      await client.cancelQueries({ queryKey });
      if (!active()) return;
      const state = await youtubeRequest(
        projectId,
        action,
        values,
        undefined,
        sessionId,
      );
      if (!active()) return;
      await client.cancelQueries({ queryKey });
      if (!active()) return;
      client.setQueryData(queryKey, state);
      setEditing(false);
      onChange();
      toast.success(() => $t(done));
    } catch (e) {
      // An obsolete owner must never refresh authentication or close a newer dialog.
      if (!active()) return;
      if (
        e instanceof NocoReachHttpError &&
        e.code === 'NOCOREACH_CONFIRMATION_SESSION_CHANGED'
      ) {
        await refresh();
        return;
      }
      setError(e);
    } finally {
      if (active()) {
        pendingRef.current = false;
        setBusy(false);
      }
    }
  }
  if (error && !query.data)
    return <ErrorMessage error={error} retry={() => void query.refetch()} />;
  if (query.isPending)
    return (
      <div
        role='status'
        aria-label={$t('common.loading')}
        className='grid gap-3'
      >
        <Skeleton className='h-8 w-full' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  if (query.isError && !query.data)
    return (
      <ErrorMessage error={query.error} retry={() => void query.refetch()} />
    );
  const state = query.data;
  if (!state) return null;
  const save = (values: {
    terms: string[];
    videoUrls: string[];
    autoSync: boolean;
  }) =>
    run(
      'connect',
      { ...values, revision: state.revision },
      'youtube.settingsSaved',
    );
  return (
    <div data-youtube-connection className='grid min-w-0 gap-4'>
      {error && !editing ? (
        <ErrorMessage error={error} retry={() => void query.refetch()} />
      ) : null}
      {query.isError ? (
        <ErrorMessage error={query.error} retry={() => void query.refetch()} />
      ) : null}
      <Problem
        state={state}
        canOpen={!readOnly && Boolean(onOpenSource)}
        onOpenSource={onOpenSource}
      />
      {state.configured ? (
        <section
          className='nr-guide-connected grid gap-3'
          aria-label={$t('youtube.searchTerms')}
        >
          <div className='flex items-center justify-between gap-2'>
            <h3 className='!mb-0'>{$t('youtube.searchTerms')}</h3>
            {canConnect ? (
              <Button
                size='sm'
                variant='outline'
                disabled={busy || state.syncing}
                onClick={() => {
                  setError(null);
                  setEditing(true);
                }}
              >
                {$t('common.modify')}
              </Button>
            ) : null}
          </div>
          <div className='flex flex-wrap gap-1.5'>
            {state.terms.map((term) => (
              <span key={term} className={chipClass}>
                {term}
              </span>
            ))}
          </div>
          {state.videoUrls.length ? (
            <p className='text-muted-foreground'>
              {$t('youtube.trackedVideos', { 0: state.videoUrls.length })}
            </p>
          ) : null}
          {state.total > 0 ? (
            <p className='text-muted-foreground'>
              {$t('youtube.videosRecorded', {
                0: formatCount(state.total),
                1: state.recordingSince
                  ? $t('common.recordingSince', {
                      0: formatDate(state.recordingSince, { withYear: true }),
                    })
                  : '',
              })}
            </p>
          ) : null}
          {state.syncing ? (
            <p role='status' className='flex items-center gap-2'>
              <Spinner />
              {$t('youtube.readingProgress')}
            </p>
          ) : null}
          {state.recent.length ? (
            <div>
              <p className='nr-guide-subtitle !mt-1'>
                {$t('youtube.recentVideos')}
              </p>
              <ul className='grid gap-1'>
                {state.recent.map((video) => (
                  <li key={video.id} className='flex min-w-0 gap-1'>
                    <a
                      className='nr-link min-w-0 truncate'
                      href={safeLink(video.url)}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {video.title || video.url}
                    </a>
                    <span className='shrink-0 text-muted-foreground'>
                      {video.publishedAt
                        ? ` · ${formatDate(video.publishedAt)}`
                        : ''}
                      {video.views !== null
                        ? ` · ${formatCompactIn('youtube.viewsCount', video.views)}`
                        : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className='flex items-center justify-between gap-3 pt-1'>
            <label className='flex min-w-0 items-center gap-2'>
              <Switch
                checked={state.autoSync}
                disabled={!canConnect || busy || state.syncing}
                onCheckedChange={(next) =>
                  void run(
                    'connect',
                    {
                      terms: state.terms,
                      videoUrls: state.videoUrls,
                      autoSync: next,
                      revision: state.revision,
                    },
                    next ? 'youtube.autoReadOn' : 'youtube.autoReadOff',
                  )
                }
              />
              <span>
                {$t('youtube.autoRead')}
                {state.fetchedAt ? (
                  <span className='text-muted-foreground'>
                    {' · '}
                    {$t('youtube.sourceRetrieved', {
                      0: formatDateTime(state.fetchedAt),
                    })}
                  </span>
                ) : null}
              </span>
            </label>
            {canSync ? (
              // A disabled button shows no tooltip, so the reason it waits sits on its wrapper.
              <span
                className='shrink-0'
                title={
                  state.pausedUntil
                    ? $t('youtube.readNowPaused', {
                        0: formatDate(state.pausedUntil),
                      })
                    : undefined
                }
              >
                <Button
                  size='sm'
                  variant='outline'
                  disabled={
                    busy ||
                    state.syncing ||
                    !state.dataforseo ||
                    Boolean(state.pausedUntil)
                  }
                  onClick={() => void run('sync', {}, 'youtube.readingStarted')}
                >
                  {state.syncing
                    ? $t('youtube.readingShort')
                    : $t('common.readNow')}
                </Button>
              </span>
            ) : null}
          </div>
          <MissedNote state={state} />
          <Estimate state={state} />
        </section>
      ) : state.dataforseo ? (
        <section className='nr-guide-connected flex items-center justify-between gap-3'>
          <div className='min-w-0'>
            <h3>{$t('youtube.searchTerms')}</h3>
            <p className='text-muted-foreground'>
              {canConnect
                ? $t('youtube.noTermsYet')
                : $t('youtube.adminSetupRequired')}
            </p>
          </div>
          {canConnect ? (
            <Button
              onClick={() => {
                setError(null);
                setEditing(true);
              }}
            >
              {$t('youtube.addTerms')}
            </Button>
          ) : null}
        </section>
      ) : null}
      {network}
      {state.total > 0 || (state.configured && canDisconnect) ? (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          {state.total > 0 ? (
            <Link to='/data/youtube' className='nr-link text-sm'>
              {$t('collectorPage.viewData')}
            </Link>
          ) : (
            <span />
          )}
          <div className='flex flex-wrap gap-1'>
            {canClear && state.total > 0 ? (
              <Button
                size='sm'
                variant='ghost'
                disabled={busy || state.syncing}
                onClick={() =>
                  void run(
                    'clear',
                    { revision: state.revision },
                    'youtube.deletedSaved',
                  )
                }
              >
                {$t('collectorClear.action')}
              </Button>
            ) : null}
            {canDisconnect && state.configured ? (
              <Button
                size='sm'
                variant='ghost'
                disabled={busy}
                onClick={() =>
                  void run(
                    'disconnect',
                    { revision: state.revision },
                    'youtube.disconnected',
                    {
                      title: () => $t('youtube.disconnectTitle'),
                      description: () => $t('youtube.disconnectHelp'),
                      action: () => $t('common.disconnect'),
                    },
                  )
                }
              >
                {$t('common.disconnect')}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <Dialog
        open={editing}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setEditing(false);
            setError(null);
          }
        }}
      >
        {/* Made anew each time it opens, from the saved terms (or the project's name for the first one). */}
        {editing ? (
          <TermsForm
            state={state}
            suggested={suggested}
            busy={busy}
            error={error}
            onCancel={() => {
              setEditing(false);
              setError(null);
            }}
            onSave={(terms, videoUrls) =>
              void save({
                terms,
                videoUrls,
                autoSync: state.configured ? state.autoSync : true,
              })
            }
          />
        ) : null}
      </Dialog>
    </div>
  );
}

const quoted = (terms: string[]) =>
  new Intl.ListFormat(getCurrentLocale()).format(terms.map((t) => `“${t}”`));

/** What stops or limits reading, most pressing first, with what to do about it. */
function Problem({
  state,
  canOpen,
  onOpenSource,
}: {
  state: YouTubeStatus;
  canOpen: boolean;
  onOpenSource?: (id: string) => void;
}) {
  const box = (title: string, body: ReactNode, action?: ReactNode) => (
    <section className='nr-guide-step !mt-0 grid gap-1' role='status'>
      <h3 className='!mb-0'>{title}</h3>
      <div className='text-muted-foreground'>{body}</div>
      {action ? <div className='mt-2'>{action}</div> : null}
    </section>
  );
  const open = (label: string) =>
    canOpen ? (
      <Button
        size='sm'
        variant='outline'
        onClick={() => onOpenSource?.('keywords')}
      >
        {label}
      </Button>
    ) : undefined;
  if (!state.dataforseo)
    return box(
      $t('youtube.dataforseoMissingTitle'),
      $t('youtube.dataforseoMissing'),
      open($t('youtube.goConnectDataforseo')),
    );
  if (state.pausedUntil)
    return box(
      $t('youtube.budgetPausedTitle'),
      $t('youtube.budgetPaused', {
        0: state.spend?.monthUsd.toFixed(2) ?? '—',
        1: state.spend?.budgetUsd ?? '—',
        2: formatDate(state.pausedUntil),
      }),
      open($t('youtube.adjustBudget')),
    );
  const last = state.lastSync;
  if (!last || state.syncing) return null;
  const retry = $t(
    state.autoSync ? 'youtube.retryTomorrow' : 'youtube.retryManually',
  );
  if (!last.ok)
    return box(
      $t('youtube.lastReadFailedTitle'),
      <>
        {(last.errors.length ? last.errors : [$t('youtube.requestFailed')]).map(
          (message) => (
            <p key={message}>{youtubeMessage(message)}</p>
          ),
        )}
        <p>{retry}</p>
      </>,
    );
  // A term missed once is read again the next day (MissedNote); only one missed on three daily reads in a row
  // needs attention.
  if (!state.repeatedMisses.length) return null;
  return box(
    $t('youtube.termsMissedRepeatedTitle'),
    <p>
      {$t('youtube.termsMissedRepeated', {
        0: quoted(state.repeatedMisses),
      })}
    </p>,
  );
}

/** The terms the last read missed, other than those Problem already flags, as a grey line: they are read again. */
function MissedNote({ state }: { state: YouTubeStatus }) {
  const last = state.lastSync;
  if (!last?.ok || state.syncing) return null;
  const missed = (last.missed ?? []).filter(
    (m) => !state.repeatedMisses.includes(m.term),
  );
  if (!missed.length) return null;
  const others = state.terms.length - (last.missed ?? []).length;
  const terms = quoted(missed.map((m) => m.term));
  return (
    <p className='text-muted-foreground' role='status' data-missed-note=''>
      {sentences(
        others > 0
          ? $t(
              missed.every((m) => m.reason === 'timeout')
                ? 'youtube.termsTimedOut'
                : 'youtube.termsFailed',
              { 0: terms, 1: others },
            )
          : $t('youtube.termsMissedOnly', { 0: terms }),
        $t(state.autoSync ? 'youtube.retryTomorrow' : 'youtube.retryManually'),
      )}
    </p>
  );
}

const estimateUsd = (value: number) =>
  value < 0.1 ? value.toFixed(2) : value.toFixed(1);

/** What daily reading costs a month at the current terms, against this month's DataForSEO spending. */
function Estimate({ state }: { state: YouTubeStatus }) {
  if (!state.spend || !state.dataforseo) return null;
  const used = state.spend.monthUsd.toFixed(2),
    budget = state.spend.budgetUsd;
  const tracked = state.videoUrls.length;
  return (
    <p className='text-muted-foreground'>
      {!state.autoSync
        ? $t('youtube.estimateOff', {
            0: estimateUsd(state.estimate.monthlyUsd),
            1: used,
            2: budget,
          })
        : tracked
          ? $t('youtube.estimateTracked', {
              0: state.terms.length,
              1: tracked,
              2: estimateUsd(state.estimate.monthlyUsd),
              3: used,
              4: budget,
            })
          : $t('youtube.estimate', {
              0: state.terms.length,
              1: estimateUsd(state.estimate.monthlyUsd),
              2: used,
              3: budget,
            })}
    </p>
  );
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
function isVideo(value: string) {
  if (VIDEO_ID.test(value)) return true;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(
        url.hostname,
      )
    )
      return false;
    const candidate =
      url.hostname === 'youtu.be'
        ? url.pathname.slice(1)
        : url.pathname === '/watch'
          ? url.searchParams.get('v')
          : /^\/(shorts|live)\//.test(url.pathname)
            ? url.pathname.split('/')[2]
            : '';
    return Boolean(candidate && VIDEO_ID.test(candidate));
  } catch {
    return false;
  }
}
const lines = (value: string) => [
  ...new Set(
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  ),
];
function formErrors(terms: string[], urls: string[]) {
  return {
    terms: !terms.length
      ? $t('youtube.termsRequired')
      : terms.length > MAX_TERMS ||
          terms.some(
            (term) =>
              term.length < 2 ||
              term.length > 80 ||
              [...term].some(
                (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
              ),
          )
        ? $t('youtube.invalidKeywords')
        : '',
    videoUrls:
      urls.length > MAX_VIDEOS
        ? $t('youtube.videoLimit')
        : urls.some((url) => !isVideo(url))
          ? $t('youtube.invalidVideo')
          : '',
  };
}

function TermsForm({
  state,
  suggested,
  busy,
  error,
  onSave,
  onCancel,
}: {
  state: YouTubeStatus;
  suggested?: string;
  busy: boolean;
  error: unknown;
  onSave: (terms: string[], videoUrls: string[]) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [terms, setTerms] = useState(
      state.terms.length ? state.terms.join('\n') : (suggested ?? ''),
    ),
    [videoUrls, setVideoUrls] = useState(state.videoUrls.join('\n')),
    [submitted, setSubmitted] = useState(false);
  // Validate derived values without normalizing the controlled draft (including IME text).
  const errors = submitted
    ? formErrors(lines(terms), lines(videoUrls))
    : { terms: '', videoUrls: '' };
  return (
    <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg'>
      <DialogHeader>
        <DialogTitle>
          {$t(
            state.configured
              ? 'youtube.editTermsTitle'
              : 'youtube.addTermsTitle',
          )}
        </DialogTitle>
      </DialogHeader>
      <form
        id={`${id}-form`}
        className='-mx-4 flex min-h-0 flex-col gap-5 overflow-y-auto px-4 pb-1'
        onSubmit={(event) => {
          event.preventDefault();
          if (busy) return;
          setSubmitted(true);
          const next = formErrors(lines(terms), lines(videoUrls));
          if (next.terms || next.videoUrls) return;
          onSave(lines(terms), lines(videoUrls));
        }}
      >
        <Field data-invalid={Boolean(errors.terms) || undefined}>
          <FieldLabel htmlFor={`${id}-terms`}>
            {$t('youtube.keywords')}
          </FieldLabel>
          <Textarea
            id={`${id}-terms`}
            autoFocus
            aria-invalid={Boolean(errors.terms) || undefined}
            value={terms}
            disabled={busy}
            maxLength={500}
            placeholder={$t('youtube.keywordPlaceholder')}
            onChange={(e) => setTerms(e.target.value)}
          />
          {errors.terms ? (
            <FieldError>{errors.terms}</FieldError>
          ) : (
            <FieldDescription>{$t('youtube.termsHelp')}</FieldDescription>
          )}
        </Field>
        <Field data-invalid={Boolean(errors.videoUrls) || undefined}>
          <FieldLabel htmlFor={`${id}-videos`}>
            {$t('youtube.trackedVideosLabel')}
          </FieldLabel>
          <Textarea
            id={`${id}-videos`}
            aria-invalid={Boolean(errors.videoUrls) || undefined}
            value={videoUrls}
            disabled={busy}
            maxLength={3000}
            placeholder='https://www.youtube.com/watch?v=…'
            onChange={(e) => setVideoUrls(e.target.value)}
          />
          {errors.videoUrls ? (
            <FieldError>{errors.videoUrls}</FieldError>
          ) : (
            <FieldDescription>
              {$t('youtube.trackedVideosHelp')}
            </FieldDescription>
          )}
        </Field>
        {error ? <ErrorMessage error={error} /> : null}
      </form>
      <DialogFooter>
        <Button variant='outline' disabled={busy} onClick={onCancel}>
          {$t('common.cancel')}
        </Button>
        <Button type='submit' form={`${id}-form`} disabled={busy}>
          {busy && <Spinner data-icon='inline-start' />}
          {$t(state.configured ? 'common.save' : 'youtube.saveAndRead')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
