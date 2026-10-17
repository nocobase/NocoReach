import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { YoutubeIcon } from 'lucide-react';
import { $t, getCurrentLocale, useNocoReachLocale } from '#i18n';
import { nocobaseClient as api, NocoReachHttpError } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import { Button } from '#components/ui/button';
import { Label } from '#components/ui/label';
import { Textarea } from '#components/ui/textarea';
import { Checkbox } from '#components/ui/checkbox';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Skeleton } from '#components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
} from '#components/ui/empty';
import { confirmAction, type ConfirmAsk } from '#components/reach/confirm';

export type { YouTubeStatus } from './youtube-api';
import {
  youtubeRequest,
  youtubeMessage,
  youtubeErrorMessage,
  type YouTubeStatus,
} from './youtube-api';
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
          <a className='ml-2 underline' href={api.resolveUrl('/login')}>
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
  refreshKey = 0,
}: {
  projectId: number;
  onChange: () => void;
  readOnly?: boolean;
  refreshKey?: number;
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
      refreshKey={refreshKey}
    />
  );
}
function YouTubePanel({
  ownerKey,
  sessionId,
  projectId,
  onChange,
  readOnly,
  refreshKey,
}: {
  ownerKey: string;
  sessionId: string;
  projectId: number;
  onChange: () => void;
  readOnly: boolean;
  refreshKey: number;
}) {
  const { refresh } = useAuthentication();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const queryRoot = ['nocoreach', 'youtube', ownerKey];
  const queryKey = [...queryRoot, page];
  const [editing, setEditing] = useState<YouTubeStatus | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      youtubeRequest(projectId, 'status', { page }, signal),
    retry: false,
    placeholderData: keepPreviousData,
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
    action: string,
    values: object = {},
    confirmation?: Omit<ConfirmAsk, 'signal'>,
  ) {
    const owner = ownerRef.current;
    if (pendingRef.current || readOnly || !owner || owner.signal.aborted)
      return;
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    const active = () => !owner.signal.aborted;
    try {
      if (
        confirmation &&
        !(await confirmAction({ ...confirmation, signal: owner.signal }))
      )
        return;
      if (!active()) return;
      await client.cancelQueries({ queryKey: queryRoot });
      if (!active()) return;
      const state = await youtubeRequest(
        projectId,
        action,
        values,
        undefined,
        sessionId,
      );
      if (!active()) return;
      await client.cancelQueries({ queryKey: queryRoot });
      if (!active()) return;
      await client.invalidateQueries({
        queryKey: queryRoot,
        refetchType: 'none',
      });
      if (!active()) return;
      client.setQueryData([...queryRoot, 1], state);
      setPage(1);
      setEditing(null);
      onChange();
      toast.success(() =>
        $t(
          action === 'connect'
            ? 'youtube.settingsSaved'
            : action === 'disconnect'
              ? 'youtube.disconnected'
              : action === 'clear'
                ? 'youtube.deletedSaved'
                : action === 'cancel'
                  ? 'youtube.readsPaused'
                  : 'youtube.readingStarted',
        ),
      );
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
  const edit = useCallback(
    async (collectorChanged = false) => {
      const owner = ownerRef.current;
      if (pendingRef.current || readOnly || !owner || owner.signal.aborted)
        return;
      pendingRef.current = true;
      setBusy(true);
      setError(null);
      const root = ['nocoreach', 'youtube', ownerKey];
      const key = [...root, page];
      try {
        await client.cancelQueries({ queryKey: collectorChanged ? root : key });
        if (owner.signal.aborted) return;
        const latest = await youtubeRequest(projectId, 'status', { page });
        if (owner.signal.aborted) return;
        await client.cancelQueries({ queryKey: collectorChanged ? root : key });
        if (collectorChanged) {
          await client.invalidateQueries({
            queryKey: root,
            refetchType: 'none',
          });
        }
        if (!owner.signal.aborted) {
          client.setQueryData(key, latest);
          // Only the saved snapshot changes; the mounted form retains its draft.
          setEditing((current) =>
            collectorChanged && !current ? null : latest,
          );
        }
      } catch (e) {
        if (!owner.signal.aborted) setError(e);
      } finally {
        if (!owner.signal.aborted) {
          pendingRef.current = false;
          setBusy(false);
        }
      }
    },
    [client, ownerKey, page, projectId, readOnly],
  );
  const refreshedKeyRef = useRef(refreshKey);
  useEffect(() => {
    if (busy || refreshedKeyRef.current === refreshKey) return;
    refreshedKeyRef.current = refreshKey;
    void Promise.resolve().then(() => edit(true));
  }, [busy, edit, refreshKey]);
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
  const form = editing || (!state.configured && !readOnly ? state : null);
  return (
    <div data-youtube-connection className='grid min-w-0 gap-4'>
      {error ? (
        <ErrorMessage error={error} retry={() => void edit(true)} />
      ) : null}
      {query.isError ? (
        <ErrorMessage error={query.error} retry={() => void query.refetch()} />
      ) : null}
      <p className='text-sm text-muted-foreground'>
        {$t('youtube.publicResearchScope')}
      </p>
      {form ? (
        <YouTubeForm
          initial={form}
          busy={busy}
          editing={Boolean(editing)}
          onCancel={() => {
            setEditing(null);
            setError(null);
          }}
          onSave={async (values) => {
            const changed =
              JSON.stringify([values.terms.trim(), values.videoUrls.trim()]) !==
              JSON.stringify([
                form.terms.join('\n'),
                form.videoUrls.join('\n'),
              ]);
            await run(
              'connect',
              { ...values, revision: form.revision },
              form.total > 0 && changed
                ? {
                    title: () => $t('youtube.replaceCriteriaTitle'),
                    description: () => $t('youtube.criteriaChangeHelp'),
                    action: () => $t('projectKnowledge.replace'),
                  }
                : undefined,
            );
          }}
        />
      ) : (
        <>
          {state.configured ? (
            <>
              <p className='break-words text-sm'>
                {[...state.terms, ...state.videoUrls].join(' · ')}
              </p>
              <p className='text-sm text-muted-foreground'>
                {state.autoSync
                  ? $t('youtube.dailyReadingEnabled')
                  : $t('youtube.manualReading')}
                {state.fetchedAt
                  ? $t('dataChat.lastRead', {
                      0: new Date(state.fetchedAt).toLocaleString(
                        getCurrentLocale(),
                      ),
                    })
                  : ''}
              </p>
              {state.syncing ? (
                <p role='status'>{$t('youtube.readingBackgroundHelp')}</p>
              ) : null}
              {state.lastSync?.errors.length ? (
                <Alert variant='destructive'>
                  <AlertDescription>
                    {state.lastSync.errors.map((message) => (
                      <p key={message}>{youtubeMessage(message)}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              ) : null}
              {!readOnly ? (
                <div className='flex flex-wrap gap-2'>
                  {state.syncing ? (
                    <Button
                      variant='outline'
                      disabled={busy}
                      onClick={() => void run('cancel', { runId: state.runId })}
                    >
                      {$t('youtube.pauseReads')}
                    </Button>
                  ) : (
                    <Button disabled={busy} onClick={() => void run('sync')}>
                      {busy ? $t('common.working') : $t('common.readNow')}
                    </Button>
                  )}
                  <Button
                    variant='outline'
                    disabled={busy || state.syncing}
                    onClick={() => void edit()}
                  >
                    {$t('common.modify')}
                  </Button>
                  <Button
                    variant='ghost'
                    disabled={busy}
                    onClick={() =>
                      void run(
                        'disconnect',
                        { revision: state.revision },
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
                </div>
              ) : null}
            </>
          ) : (
            <p>{$t('youtube.adminSetupRequired')}</p>
          )}
        </>
      )}
      {!editing ? (
        <>
          <p className='text-sm text-muted-foreground'>
            {$t('youtube.researchLimits')}
          </p>
          <p className='text-sm text-muted-foreground'>
            {$t('youtube.savedVideosSummary', {
              0: state.total.toLocaleString(getCurrentLocale()),
            })}
          </p>
          {state.total > 0 && !readOnly ? (
            <Button
              variant='outline'
              disabled={busy || state.syncing}
              onClick={() =>
                void run(
                  'clear',
                  { revision: state.revision },
                  {
                    title: () => $t('youtube.deleteSavedTitle'),
                    description: () => $t('youtube.deleteSavedHelp'),
                    action: () => $t('youtube.deleteSaved'),
                  },
                )
              }
            >
              {$t('youtube.deleteSaved')}
            </Button>
          ) : null}
          {!state.videos.length ? (
            <Empty className='min-h-40 border p-6'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <YoutubeIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {state.connected
                    ? $t('youtube.noMatchingVideos')
                    : $t('youtube.empty')}
                </EmptyTitle>
                <EmptyDescription>
                  {state.syncing
                    ? $t('youtube.resultsUpdating')
                    : state.lastSync && !state.lastSync.ok
                      ? $t('youtube.retryGuidance')
                      : readOnly
                        ? $t('youtube.adminRetryGuidance')
                        : $t('youtube.refineCriteria')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className='grid gap-4'>
              {state.videos.map((v) => (
                <article
                  key={v.id}
                  className='min-w-0 rounded-lg border border-border p-4'
                >
                  <a
                    href={v.url}
                    target='_blank'
                    rel='noreferrer'
                    className='break-words font-medium underline'
                  >
                    {v.title}
                  </a>
                  <p className='mt-1 break-words text-sm text-muted-foreground'>
                    {v.channel} · {v.publishedAt || '—'}
                  </p>
                  <p className='mt-2 text-sm'>
                    {$t('bilibili.viewsLikesComments', {
                      0: v.views?.toLocaleString(getCurrentLocale()) ?? '—',
                      1: v.likes?.toLocaleString(getCurrentLocale()) ?? '—',
                      2: v.comments?.toLocaleString(getCurrentLocale()) ?? '—',
                    })}
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {$t('youtube.sourceRetrieved', {
                      0: new Date(v.fetchedAt).toLocaleString(
                        getCurrentLocale(),
                      ),
                    })}
                  </p>
                  {v.metricFetchedAt ? (
                    <p className='mt-1 text-xs text-muted-foreground'>
                      {$t('youtube.metricsReadAt', {
                        0: v.metricFetchedAt.views
                          ? new Date(v.metricFetchedAt.views).toLocaleString(
                              getCurrentLocale(),
                            )
                          : '—',
                        1: v.metricFetchedAt.likes
                          ? new Date(v.metricFetchedAt.likes).toLocaleString(
                              getCurrentLocale(),
                            )
                          : '—',
                        2: v.metricFetchedAt.comments
                          ? new Date(v.metricFetchedAt.comments).toLocaleString(
                              getCurrentLocale(),
                            )
                          : '—',
                      })}
                    </p>
                  ) : null}
                  {v.description ? (
                    <p className='mt-2 whitespace-pre-wrap break-words text-sm'>
                      {v.description}
                    </p>
                  ) : null}
                  <details className='mt-3'>
                    <summary className='cursor-pointer text-sm underline'>
                      {$t('youtube.captions')} ·{' '}
                      {$t(
                        v.transcript.status === 'manual'
                          ? 'youtube.manualCaptions'
                          : v.transcript.status === 'automatic'
                            ? 'youtube.automaticCaptions'
                            : v.transcript.status === 'missing'
                              ? 'youtube.captionsMissing'
                              : 'youtube.captionsFailed',
                      )}
                      {v.transcript.language
                        ? ` (${v.transcript.language})`
                        : ''}
                    </summary>
                    {v.transcriptRefreshFailed && v.transcript.text ? (
                      <p className='text-sm text-muted-foreground'>
                        {$t('youtube.retainedCaptionsAt', {
                          0: v.transcriptFetchedAt
                            ? new Date(v.transcriptFetchedAt).toLocaleString(
                                getCurrentLocale(),
                              )
                            : '—',
                        })}
                      </p>
                    ) : null}
                    {v.transcript.text ? (
                      <p className='mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm'>
                        {v.transcript.text}
                      </p>
                    ) : (
                      <p className='mt-2 text-sm text-muted-foreground'>
                        {$t(
                          v.transcript.status === 'missing'
                            ? 'youtube.captionsMissingHelp'
                            : 'youtube.captionsEmptyHelp',
                        )}
                      </p>
                    )}
                    {v.transcript.truncated ? (
                      <p className='text-sm text-muted-foreground'>
                        {$t('youtube.captionsTruncated')}
                      </p>
                    ) : null}
                  </details>
                </article>
              ))}
            </div>
          )}
          {state.total > (state.pageSize || 20) ? (
            <nav
              aria-label={$t('youtube.savedPagination')}
              className='flex flex-wrap items-center gap-2'
            >
              <Button
                variant='outline'
                disabled={busy || query.isFetching || (state.page || 1) <= 1}
                onClick={() => setPage((state.page || 1) - 1)}
              >
                {$t('tablePagination.previous')}
              </Button>
              <span className='text-sm'>
                {$t('youtube.pageSummary', {
                  0: state.page || 1,
                  1: Math.ceil(state.total / (state.pageSize || 20)),
                })}
              </span>
              <Button
                variant='outline'
                disabled={
                  busy ||
                  query.isFetching ||
                  (state.page || 1) * (state.pageSize || 20) >= state.total
                }
                onClick={() => setPage((state.page || 1) + 1)}
              >
                {$t('tablePagination.next')}
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
function youtubeFormErrors(terms: string, videoUrls: string) {
  const lines = (value: string) =>
    value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  const keywords = lines(terms),
    urls = lines(videoUrls);
  const isVideo = (value: string) => {
    const id = /^[A-Za-z0-9_-]{11}$/;
    if (id.test(value)) return true;
    try {
      const url = new URL(value);
      if (
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        ![
          'youtube.com',
          'www.youtube.com',
          'm.youtube.com',
          'youtu.be',
        ].includes(url.hostname)
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
      return Boolean(candidate && id.test(candidate));
    } catch {
      return false;
    }
  };
  return {
    terms:
      !keywords.length && !urls.length
        ? $t('youtube.criteriaRequired')
        : keywords.length > 2 ||
            keywords.some(
              (term) =>
                term.length < 2 ||
                term.length > 80 ||
                [...term].some(
                  (character) =>
                    character.charCodeAt(0) < 32 ||
                    character.charCodeAt(0) === 127,
                ),
            )
          ? $t('youtube.invalidKeywords')
          : '',
    videoUrls:
      urls.length > 5
        ? $t('youtube.videoLimit')
        : urls.some((url) => !isVideo(url))
          ? $t('youtube.invalidVideo')
          : '',
  };
}
function YouTubeForm({
  initial,
  busy,
  editing,
  onSave,
  onCancel,
}: {
  initial: YouTubeStatus;
  busy: boolean;
  editing: boolean;
  onSave: (values: {
    terms: string;
    videoUrls: string;
    autoSync: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const [terms, setTerms] = useState(initial.terms.join('\n')),
    [videoUrls, setVideoUrls] = useState(initial.videoUrls.join('\n')),
    [autoSync, setAutoSync] = useState(initial.autoSync),
    [submitted, setSubmitted] = useState(false);
  const id = useId(),
    termsRef = useRef<HTMLTextAreaElement>(null),
    videosRef = useRef<HTMLTextAreaElement>(null),
    savingRef = useRef(false),
    editFocusMovedRef = useRef(false);
  useEffect(() => {
    // The Change trigger unmounts when the fresh edit form arrives. Hand focus
    // to its first field once; later saves/errors must not interrupt typing.
    if (editing && !busy && !editFocusMovedRef.current) {
      editFocusMovedRef.current = true;
      // Respect a newer focus choice made while the status request was pending.
      if (document.activeElement === document.body) termsRef.current?.focus();
    }
  }, [editing, busy]);
  // Validate derived values without normalizing the controlled draft (including IME text).
  const errors = submitted
    ? youtubeFormErrors(terms, videoUrls)
    : { terms: '', videoUrls: '' };
  return (
    <form
      className='grid gap-4'
      onSubmit={(event) => {
        event.preventDefault();
        if (busy || savingRef.current) return;
        const nextErrors = youtubeFormErrors(terms, videoUrls);
        setSubmitted(true);
        if (nextErrors.terms || nextErrors.videoUrls) {
          (nextErrors.terms ? termsRef : videosRef).current?.focus();
          return;
        }
        savingRef.current = true;
        void onSave({ terms, videoUrls, autoSync }).finally(() => {
          savingRef.current = false;
        });
      }}
    >
      <div className='grid gap-2'>
        <Label htmlFor={`${id}-terms`}>{$t('youtube.keywords')}</Label>
        <Textarea
          id={`${id}-terms`}
          ref={termsRef}
          aria-invalid={Boolean(errors.terms) || undefined}
          aria-describedby={`${id}-help${errors.terms ? ` ${id}-terms-error` : ''}`}
          value={terms}
          disabled={busy}
          maxLength={200}
          placeholder={$t('youtube.keywordPlaceholder')}
          onChange={(e) => setTerms(e.target.value)}
        />
        {errors.terms ? (
          <p
            id={`${id}-terms-error`}
            role='alert'
            className='text-sm text-destructive'
          >
            {errors.terms}
          </p>
        ) : null}
      </div>
      <div className='grid gap-2'>
        <Label htmlFor={`${id}-videos`}>{$t('youtube.videoLinks')}</Label>
        <Textarea
          id={`${id}-videos`}
          ref={videosRef}
          aria-invalid={Boolean(errors.videoUrls) || undefined}
          aria-describedby={`${id}-help${errors.videoUrls ? ` ${id}-videos-error` : ''}`}
          value={videoUrls}
          disabled={busy}
          maxLength={3000}
          placeholder='https://www.youtube.com/watch?v=…'
          onChange={(e) => setVideoUrls(e.target.value)}
        />
        {errors.videoUrls ? (
          <p
            id={`${id}-videos-error`}
            role='alert'
            className='text-sm text-destructive'
          >
            {errors.videoUrls}
          </p>
        ) : null}
      </div>
      <p id={`${id}-help`} className='text-sm text-muted-foreground'>
        {$t('youtube.criteriaRequiredHelp')}
      </p>
      <div className='flex items-center gap-2'>
        <Checkbox
          id={`${id}-daily`}
          checked={autoSync}
          disabled={busy}
          onCheckedChange={(value) => setAutoSync(Boolean(value))}
        />
        <Label htmlFor={`${id}-daily`}>{$t('youtube.dailyReading')}</Label>
      </div>
      <p className='text-sm text-muted-foreground'>
        {$t('youtube.dailyReadingHelp')}
      </p>
      <div className='flex flex-wrap justify-end gap-2'>
        {editing ? (
          <Button
            type='button'
            variant='outline'
            disabled={busy}
            onClick={onCancel}
          >
            {$t('common.cancel')}
          </Button>
        ) : null}
        <Button type='submit' disabled={busy}>
          {busy ? $t('common.saving') : $t('youtube.saveAndRead')}
        </Button>
      </div>
    </form>
  );
}
