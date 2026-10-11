import { useEffect, useId, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { YoutubeIcon } from 'lucide-react';
import { $t } from '#i18n';
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
import { confirmAction } from '#components/reach/confirm';

interface Video {
  id: string;
  url: string;
  title: string;
  description: string;
  channel: string;
  publishedAt: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  fetchedAt: string;
  transcript: {
    status: 'manual' | 'automatic' | 'missing' | 'failed';
    language: string | null;
    text: string;
    truncated: boolean;
  };
}
export interface YouTubeStatus {
  configured: boolean;
  connected: boolean;
  syncing: boolean;
  runId: string | null;
  revision: string | null;
  terms: string[];
  videoUrls: string[];
  autoSync: boolean;
  fetchedAt: string | null;
  expired: boolean;
  videos: Video[];
  total: number;
  lastSync: { at: string; ok: boolean; errors: string[] } | null;
}
const youtubeRequest = (
  projectId: number,
  action: string,
  values: object = {},
  signal?: AbortSignal,
) =>
  api.action<YouTubeStatus>('nrYouTube', action, {
    method: 'POST',
    body: { projectId, ...values },
    unwrap: 'data',
    signal,
  });
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
          ? $t('登录已过期，请重新登录')
          : status === 403
            ? $t('你没有操作 YouTube 接入的权限')
            : status === 404
              ? $t('项目不存在或已被删除')
              : error instanceof Error
                ? $t(error.message)
                : $t('YouTube 请求未完成，请重试')}
        {status === 401 ? (
          <a className='ml-2 underline' href={api.resolveUrl('/login')}>
            {$t('重新登录')}
          </a>
        ) : ![403, 404].includes(status) && retry ? (
          <Button size='sm' variant='outline' onClick={retry}>
            {$t('重试')}
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
}: {
  projectId: number;
  onChange: () => void;
  readOnly?: boolean;
}) {
  return (
    <YouTubePanel
      key={projectId}
      projectId={projectId}
      onChange={onChange}
      readOnly={readOnly}
    />
  );
}
function YouTubePanel({
  projectId,
  onChange,
  readOnly,
}: {
  projectId: number;
  onChange: () => void;
  readOnly: boolean;
}) {
  const client = useQueryClient(),
    queryKey = ['nocoreach', 'youtube', projectId];
  const [editing, setEditing] = useState<YouTubeStatus | null>(null),
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
    aliveRef = useRef(true),
    lastRef = useRef<string | null>(null);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  useEffect(() => {
    const at = query.data?.lastSync?.at;
    if (at && lastRef.current !== at) {
      lastRef.current = at;
      onChange();
    }
  }, [query.data?.lastSync?.at, onChange]);
  async function run(action: string, values: object = {}) {
    if (pendingRef.current || readOnly) return;
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await client.cancelQueries({ queryKey, exact: true });
      const state = await youtubeRequest(projectId, action, values);
      if (!aliveRef.current) return;
      await client.cancelQueries({ queryKey, exact: true });
      if (!aliveRef.current) return;
      client.setQueryData(queryKey, state);
      setEditing(null);
      onChange();
      toast.success(
        $t(
          action === 'connect'
            ? 'YouTube 设置已保存'
            : action === 'disconnect'
              ? 'YouTube 已断开'
              : action === 'cancel'
                ? '已停止并暂停自动读取'
                : 'YouTube 已开始读取',
        ),
      );
    } catch (e) {
      if (aliveRef.current) setError(e);
    } finally {
      pendingRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  }
  async function edit() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await client.cancelQueries({ queryKey, exact: true });
      const latest = await youtubeRequest(projectId, 'status');
      await client.cancelQueries({ queryKey, exact: true });
      if (aliveRef.current) {
        client.setQueryData(queryKey, latest);
        setEditing(latest);
      }
    } catch (e) {
      if (aliveRef.current) setError(e);
    } finally {
      pendingRef.current = false;
      if (aliveRef.current) setBusy(false);
    }
  }
  if (query.isPending)
    return (
      <div role='status' aria-label={$t('正在加载')} className='grid gap-3'>
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
    <div className='grid min-w-0 gap-4'>
      {error ? <ErrorMessage error={error} /> : null}
      {query.isError ? (
        <ErrorMessage error={query.error} retry={() => void query.refetch()} />
      ) : null}
      <p className='text-sm text-muted-foreground'>
        {$t('公开内容研究；不包含频道所有者 Analytics')}
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
            if (
              form.total > 0 &&
              changed &&
              !(await confirmAction({
                title: $t('替换 YouTube 研究条件？'),
                description: $t(
                  '现有 YouTube 结果会清除，保存后按新条件重新读取。',
                ),
                action: $t('替换'),
              }))
            )
              return;
            await run('connect', { ...values, revision: form.revision });
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
                {state.autoSync ? $t('已开启每日读取') : $t('手动读取')}
                {state.fetchedAt
                  ? $t(' · 上次读取 {0}', {
                      0: new Date(state.fetchedAt).toLocaleString(),
                    })
                  : ''}
              </p>
              {state.syncing ? (
                <p role='status'>
                  {$t('YouTube 正在读取公开内容，可以关闭面板稍后查看')}
                </p>
              ) : null}
              {state.expired ? <p>{$t('缓存已过期，请重新读取')}</p> : null}
              {state.lastSync?.errors.length ? (
                <Alert variant='destructive'>
                  <AlertDescription>
                    {state.lastSync.errors.map((message) => (
                      <p key={message}>{$t(message)}</p>
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
                      {$t('停止并暂停自动读取')}
                    </Button>
                  ) : (
                    <Button disabled={busy} onClick={() => void run('sync')}>
                      {busy ? $t('处理中…') : $t('立即读取')}
                    </Button>
                  )}
                  <Button
                    variant='outline'
                    disabled={busy || state.syncing}
                    onClick={() => void edit()}
                  >
                    {$t('修改')}
                  </Button>
                  <Button
                    variant='ghost'
                    disabled={busy}
                    onClick={() =>
                      void (async () => {
                        if (
                          await confirmAction({
                            title: $t('断开 YouTube？'),
                            description: $t(
                              'YouTube 配置和已读取的内容会删除，自动读取会停止。',
                            ),
                            action: $t('断开'),
                          })
                        )
                          void run('disconnect', { revision: state.revision });
                      })()
                    }
                  >
                    {$t('断开')}
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <p>{$t('还未配置 YouTube，请管理员接入')}</p>
          )}
          <p className='text-sm text-muted-foreground'>
            {$t(
              '每词最多 5 条结果，合计最多 15 个视频；不代表完整搜索结果。字幕优先人工，再自动，最多保留 30,000 字符。',
            )}
          </p>
          {!state.videos.length ? (
            <Empty className='min-h-40 border p-6'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <YoutubeIcon />
                </EmptyMedia>
                <EmptyTitle>
                  {state.connected
                    ? $t('未找到匹配的视频')
                    : $t('暂无 YouTube 结果')}
                </EmptyTitle>
                <EmptyDescription>
                  {state.syncing
                    ? $t('读取完成后会自动更新')
                    : state.lastSync && !state.lastSync.ok
                      ? $t('请根据上方提示处理后重试')
                      : readOnly
                        ? $t('请管理员修改研究条件或重新读取')
                        : $t('可以修改关键词或添加具体视频链接')}
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
                    {$t('播放 {0} · 点赞 {1} · 评论 {2}', {
                      0: v.views?.toLocaleString() ?? '—',
                      1: v.likes?.toLocaleString() ?? '—',
                      2: v.comments?.toLocaleString() ?? '—',
                    })}
                  </p>
                  <p className='mt-1 text-xs text-muted-foreground'>
                    {$t('来源：YouTube（yt-dlp） · 读取于 {0}', {
                      0: new Date(v.fetchedAt).toLocaleString(),
                    })}
                  </p>
                  {v.description ? (
                    <p className='mt-2 whitespace-pre-wrap break-words text-sm'>
                      {v.description}
                    </p>
                  ) : null}
                  <details className='mt-3'>
                    <summary className='cursor-pointer text-sm underline'>
                      {$t('字幕')} ·{' '}
                      {$t(
                        v.transcript.status === 'manual'
                          ? '人工字幕'
                          : v.transcript.status === 'automatic'
                            ? '自动字幕'
                            : v.transcript.status === 'missing'
                              ? '未发现可用字幕'
                              : '字幕读取失败',
                      )}
                      {v.transcript.language
                        ? ` (${v.transcript.language})`
                        : ''}
                    </summary>
                    {v.transcript.text ? (
                      <p className='mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm'>
                        {v.transcript.text}
                      </p>
                    ) : (
                      <p className='mt-2 text-sm text-muted-foreground'>
                        {$t(
                          v.transcript.status === 'missing'
                            ? '未发现可用字幕，不会自动下载音频转写'
                            : '字幕没有读到实质内容，不能判断视频没有字幕',
                        )}
                      </p>
                    )}
                    {v.transcript.truncated ? (
                      <p className='text-sm text-muted-foreground'>
                        {$t('字幕已截断至 30,000 字符')}
                      </p>
                    ) : null}
                  </details>
                </article>
              ))}
            </div>
          )}
        </>
      )}
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
        ? $t('请填写搜索词或 YouTube 视频链接')
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
          ? $t('最多填写 2 个搜索词，每个 2–80 字符，且不能包含控制字符')
          : '',
    videoUrls:
      urls.length > 5
        ? $t('最多填写 5 个 YouTube 视频链接，每行一个')
        : urls.some((url) => !isVideo(url))
          ? $t('请填写有效的 YouTube 视频链接或 11 位视频 ID')
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
        <Label htmlFor={`${id}-terms`}>{$t('YouTube 搜索词')}</Label>
        <Textarea
          id={`${id}-terms`}
          ref={termsRef}
          aria-invalid={Boolean(errors.terms) || undefined}
          aria-describedby={`${id}-help${errors.terms ? ` ${id}-terms-error` : ''}`}
          value={terms}
          disabled={busy}
          maxLength={200}
          placeholder={$t('例如 NocoBase tutorial，每行一个')}
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
        <Label htmlFor={`${id}-videos`}>{$t('指定 YouTube 视频')}</Label>
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
        {$t('搜索词和视频链接至少填写一项；不需要 API Key。')}
      </p>
      <div className='flex items-center gap-2'>
        <Checkbox
          id={`${id}-daily`}
          checked={autoSync}
          disabled={busy}
          onCheckedChange={(value) => setAutoSync(Boolean(value))}
        />
        <Label htmlFor={`${id}-daily`}>{$t('每天自动读取一次')}</Label>
      </div>
      <p className='text-sm text-muted-foreground'>
        {$t(
          '默认手动。开启每日读取后，网络失败会延迟重试；遇登录、验证或限流会停止，需手动重试。',
        )}
      </p>
      <div className='flex flex-wrap justify-end gap-2'>
        {editing ? (
          <Button
            type='button'
            variant='outline'
            disabled={busy}
            onClick={onCancel}
          >
            {$t('取消')}
          </Button>
        ) : null}
        <Button type='submit' disabled={busy}>
          {busy ? $t('正在保存…') : $t('保存并读取')}
        </Button>
      </div>
    </form>
  );
}
