import { useCallback, useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router';
import { $t, isChinese } from '#i18n';
import { toast } from '#lib/toast';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Badge } from '#components/ui/badge';
import { Button } from '#components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Textarea } from '#components/ui/textarea';
import { confirmAction } from '#components/reach/confirm';
import {
  bilibiliMessage,
  bilibiliRequest,
  type BilibiliStatus,
} from './bilibili-api';

interface Failure {
  status: number;
  message: string;
}
function failure(error: unknown): Failure {
  const status = Number((error as { status?: number })?.status || 0);
  // The app's request translator localizes known server sentences. Display only
  // this allowlist, never arbitrary collector diagnostics or server payloads.
  const known = [
    'collector_unreachable',
    'collector_unauthorized',
    'tool_missing',
    'browser_unavailable',
    'login_required',
    'security_block',
    'rate_limited',
    'not_found',
    'invalid_response',
    'timeout',
    'unsupported',
    'unconfirmed_empty',
    'busy',
    'cancelled',
  ]
    .map(bilibiliMessage)
    .find((message) => message === (error as Error)?.message);
  return {
    status,
    message:
      status === 401
        ? $t('登录已过期，请重新登录后再试。')
        : status === 403
          ? $t('你没有操作此 Bilibili 接入的权限。')
          : status === 404
            ? $t('项目不存在或已被删除。')
            : status === 409
              ? $t('配置已变更或操作正在运行，请重新载入状态。')
              : known || $t('Bilibili 操作未完成，请稍后重试。'),
  };
}
function FailureAlert({
  value,
  retry,
}: {
  value: Failure;
  retry?: () => void;
}) {
  return (
    <Alert variant='destructive'>
      <AlertDescription className='flex flex-col items-start gap-2'>
        <p>{value.message}</p>
        {value.status === 401 ? (
          <Link className='underline' to='/login'>
            {$t('重新登录')}
          </Link>
        ) : ![403, 404].includes(value.status) && retry ? (
          <Button type='button' variant='outline' size='sm' onClick={retry}>
            {$t('重新载入状态')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
const split = (s: string) =>
  s
    .split(/[,，、\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
const validBvid = (s: string) => {
  if (/^BV[a-zA-Z0-9]{10}$/.test(s)) return true;
  try {
    const u = new URL(s);
    return (
      u.protocol === 'https:' &&
      ['bilibili.com', 'www.bilibili.com', 'm.bilibili.com'].includes(
        u.hostname,
      ) &&
      !u.username &&
      !u.password &&
      !u.port &&
      /^\/video\/BV[a-zA-Z0-9]{10}\/?$/.test(u.pathname)
    );
  } catch {
    return false;
  }
};
const stamp = (value: string | null) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(isChinese() ? 'zh-CN' : 'en-US')
    : $t('未知');
const count = (value: number | null) =>
  value == null
    ? $t('未知')
    : value.toLocaleString(isChinese() ? 'zh-CN' : 'en-US');

function BilibiliForm({
  state,
  save,
  cancel,
  refresh,
  test,
  blocked,
  resetTools,
}: {
  state: BilibiliStatus;
  save: (data: object) => Promise<void>;
  cancel: () => void;
  refresh: () => void;
  test: (collectorId: string) => Promise<void>;
  blocked: boolean;
  resetTools: () => void;
}) {
  const schema = z
    .object({
      collectorId: z
        .string()
        .refine(
          (id) => state.collectors.some((c) => c.id === id),
          $t('请选择可用的浏览器采集器。'),
        ),
      terms: z
        .string()
        .max(2048)
        .refine(
          (v) =>
            split(v).length <= 3 &&
            split(v).every(
              (s) =>
                s.length <= 80 &&
                ![...s].some(
                  (c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
                ),
            ),
          $t('最多填写 3 个搜索词，每个 1–80 字。'),
        ),
      bvids: z
        .string()
        .max(2048)
        .refine(
          (v) => split(v).length <= 5 && split(v).every(validBvid),
          $t('最多填写 5 个有效 BV 号或标准视频链接。'),
        ),
    })
    .refine((v) => split(v.terms).length > 0 || split(v.bvids).length > 0, {
      path: ['terms'],
      message: $t('请至少填写一个搜索词或视频。'),
    });
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      collectorId: state.collectorId || state.collectors[0]?.id || '',
      terms: state.terms.join('\n'),
      bvids: state.bvids.join('\n'),
    },
  });
  const [problem, setProblem] = useState<Failure | null>(null);
  const [testing, setTesting] = useState(false);
  const busy = form.formState.isSubmitting || testing || blocked;
  const disabled =
    busy || (problem !== null && [401, 403, 404].includes(problem.status));
  const submit = form.handleSubmit(async (values) => {
    setProblem(null);
    try {
      await save({ ...values, revision: state.revision });
    } catch (error) {
      setProblem(failure(error));
    }
  });
  return (
    <form
      noValidate
      onSubmit={(event) => {
        void submit(event);
      }}
      className='flex flex-col gap-4'
    >
      {problem && <FailureAlert value={problem} retry={refresh} />}
      <FieldGroup>
        <Controller
          name='collectorId'
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor='bili-collector'>
                {$t('选择浏览器采集器')}{' '}
                <span aria-hidden='true' className='text-destructive'>
                  *
                </span>
              </FieldLabel>
              <Select
                items={state.collectors.map((c) => ({
                  value: c.id,
                  label: c.name,
                }))}
                value={field.value}
                onValueChange={(v) => {
                  if (v !== null) {
                    field.onChange(v);
                    resetTools();
                  }
                }}
                disabled={disabled}
              >
                <SelectTrigger
                  ref={field.ref}
                  onBlur={field.onBlur}
                  id='bili-collector'
                  aria-describedby='bili-collector-error'
                  aria-required='true'
                  aria-invalid={fieldState.invalid}
                  className='w-full min-w-0'
                >
                  <SelectValue className='min-w-0 truncate' />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {state.collectors.map((c) => (
                      <SelectItem
                        key={c.id}
                        value={c.id}
                        className='[&>span]:min-w-0 [&>span]:shrink [&>span]:whitespace-normal'
                      >
                        <span className='min-w-0 whitespace-normal break-words'>
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError
                id='bili-collector-error'
                errors={[fieldState.error]}
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='self-start'
                disabled={disabled || !field.value}
                onClick={() => {
                  setTesting(true);
                  setProblem(null);
                  void test(field.value)
                    .catch((e) => setProblem(failure(e)))
                    .finally(() => setTesting(false));
                }}
              >
                {testing ? $t('正在检查…') : $t('检查工具')}
              </Button>
            </Field>
          )}
        />
        <Controller
          name='terms'
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor='bili-terms'>{$t('搜索词')}</FieldLabel>
              <Textarea
                {...field}
                id='bili-terms'
                aria-invalid={fieldState.invalid}
                aria-describedby='bili-terms-help bili-terms-error'
                disabled={disabled}
                rows={3}
              />
              <FieldDescription id='bili-terms-help'>
                {$t('每行一个，最多 3 个，每个 1–80 字；也可只填写下方视频。')}
              </FieldDescription>
              <FieldError id='bili-terms-error' errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name='bvids'
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor='bili-videos'>
                {$t('BV 号或视频链接')}
              </FieldLabel>
              <Textarea
                {...field}
                id='bili-videos'
                aria-invalid={fieldState.invalid}
                aria-describedby='bili-videos-help bili-videos-error'
                disabled={disabled}
                rows={3}
              />
              <FieldDescription id='bili-videos-help'>
                {$t('每行一个，最多 5 个标准视频链接或 BV 号，不支持短链接。')}
              </FieldDescription>
              <FieldError id='bili-videos-error' errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
      <p className='text-sm text-muted-foreground'>
        {$t('保存只更新条件，不会开始读取。修改条件会保留并标记旧记录。')}
      </p>
      <div className='flex flex-wrap justify-end gap-2'>
        {state.connected && (
          <Button
            type='button'
            variant='outline'
            disabled={busy}
            onClick={cancel}
          >
            {$t('取消修改')}
          </Button>
        )}
        <Button type='submit' disabled={disabled}>
          {form.formState.isSubmitting ? $t('正在保存…') : $t('保存配置')}
        </Button>
      </div>
    </form>
  );
}

export function BilibiliConnect(props: {
  projectId: number;
  isAdmin: boolean;
  onChange: () => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  // A project switch remounts draft/sequence state; old responses cannot fill the new project.
  return <BilibiliPanel key={props.projectId} {...props} />;
}
function BilibiliPanel({
  projectId,
  isAdmin,
  onChange,
  onSavingChange,
}: {
  projectId: number;
  isAdmin: boolean;
  onChange: () => void;
  onSavingChange?: (saving: boolean) => void;
}) {
  const [state, setState] = useState<BilibiliStatus | null>(null);
  const [error, setError] = useState<Failure | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [toolChecked, setToolChecked] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const aliveRef = useRef(true),
    epochRef = useRef(0),
    readsRef = useRef(0),
    lockedRef = useRef(false);
  const load = useCallback(
    async (edit = false) => {
      const current = epochRef.current,
        sequence = ++readsRef.current;
      try {
        const next = await bilibiliRequest<BilibiliStatus>(projectId, 'status');
        if (
          !aliveRef.current ||
          current !== epochRef.current ||
          sequence !== readsRef.current
        )
          return;
        setState(next);
        setError(null);
        if (edit) setEditing(true);
      } catch (e) {
        if (
          aliveRef.current &&
          current === epochRef.current &&
          sequence === readsRef.current
        )
          setError(failure(e));
      }
    },
    [projectId],
  );
  useEffect(() => {
    aliveRef.current = true;
    let active = true;
    void bilibiliRequest<BilibiliStatus>(projectId, 'status')
      .then((next) => {
        if (active) setState(next);
      })
      .catch((e) => {
        if (active) setError(failure(e));
      });
    return () => {
      active = false;
      aliveRef.current = false;
    };
  }, [projectId]);
  useEffect(() => {
    if (!state?.lastRun?.retryAt) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Date.parse(state.lastRun.retryAt) - Date.now()) + 20,
    );
    return () => clearTimeout(timer);
  }, [state?.lastRun?.retryAt]);
  useEffect(() => {
    if (!state?.checking && busy !== 'sync') return;
    const timer = setInterval(() => {
      void load();
    }, 1500);
    return () => clearInterval(timer);
  }, [state?.checking, busy, load]);
  async function mutate(action: string, body: object = {}) {
    if (lockedRef.current) return;
    lockedRef.current = true;
    const current = ++epochRef.current;
    setBusy(action);
    if (action === 'connect') onSavingChange?.(true);
    setError(null);
    try {
      const next = await bilibiliRequest<BilibiliStatus>(
        projectId,
        action,
        body,
      );
      if (!aliveRef.current || current !== epochRef.current) return;
      epochRef.current++;
      setState(next);
      setEditing(false);
      setToolChecked(false);
      onChange();
      if (action === 'sync') {
        if (next.lastRun?.ok) toast.success($t('Bilibili 读取完成。'));
        else if (next.lastRun?.partial)
          toast.info($t('已保存可确认的部分结果。'));
        else
          toast.warning(
            bilibiliMessage(next.lastRun?.errorCode || 'invalid_response'),
          );
      } else
        toast.success(
          action === 'disconnect'
            ? $t('Bilibili 已断开，公开记录保留。')
            : $t('Bilibili 配置已保存。'),
        );
    } catch (e) {
      if (aliveRef.current && current === epochRef.current) {
        if (action === 'connect') throw e;
        setError(failure(e));
        void load();
      }
    } finally {
      if (action === 'connect') onSavingChange?.(false);
      if (aliveRef.current) setBusy(null);
      lockedRef.current = false;
    }
  }
  const refresh = () => {
    void load();
  };
  if (!state)
    return error ? (
      <FailureAlert value={error} retry={refresh} />
    ) : (
      <div
        role='status'
        aria-label={$t('正在读取…')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-6 w-1/2' />
        <Skeleton className='h-24 w-full' />
      </div>
    );
  const edit = isAdmin && state.configured && (editing || !state.connected);
  const running = state.checking || busy === 'sync';
  const unavailable = !!error && [401, 403, 404].includes(error.status);
  const cooling =
    !!state.lastRun?.retryAt && Date.parse(state.lastRun.retryAt) > now;
  return (
    <div className='flex min-w-0 flex-col gap-4' data-bilibili-connection>
      <Alert>
        <AlertDescription className='flex flex-col gap-2'>
          <p>
            {$t(
              '仅手动读取公开搜索摘要与视频详情，不含字幕、视频下载或自动分析。',
            )}
          </p>
          <p>{$t('网络出口由采集器浏览器管理')}</p>
        </AlertDescription>
      </Alert>
      {error && <FailureAlert value={error} retry={refresh} />}
      {toolChecked && (
        <p role='status' className='text-sm text-muted-foreground'>
          {$t('工具可用，平台尚未验证')}
        </p>
      )}
      {!state.configured && (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{$t('尚无可用的 Bilibili 采集器')}</EmptyTitle>
            <EmptyDescription>
              {$t('请管理员部署浏览器采集器，并为此项目启用 Bilibili。')}{' '}
              <a
                href='https://github.com/nocobase/nocoreach/blob/main/docs/BILIBILI-COLLECTOR.md'
                target='_blank'
                rel='noreferrer'
              >
                {$t('查看部署说明')}
              </a>
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {state.configured && !state.connected && (
        <Empty className='border'>
          <EmptyHeader>
            <EmptyTitle>{$t('尚未配置 Bilibili')}</EmptyTitle>
            <EmptyDescription>
              {isAdmin
                ? $t('选择采集器并填写搜索词或视频，保存后手动读取。')
                : $t('请管理员配置采集器后开始读取。')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {state.connected && (
        <Card size='sm'>
          <CardHeader>
            <CardTitle>{$t('Bilibili 读取状态')}</CardTitle>
            <CardDescription>
              {state.collectors.find((c) => c.id === state.collectorId)?.name}
            </CardDescription>
          </CardHeader>
          <CardContent className='flex flex-col gap-3'>
            <div className='flex flex-wrap gap-2'>
              <Badge variant='secondary'>
                {running
                  ? $t('正在读取…')
                  : state.lastRun && !state.lastRun.ok
                    ? $t('上次读取未完整完成')
                    : state.verifiedAt
                      ? $t('已取得可确认内容')
                      : $t('已配置，尚未验证')}
              </Badge>
            </div>
            <p className='break-words text-sm'>
              {$t('搜索词')}：{state.terms.join('、') || '—'}
              <br />
              {$t('BV 号或视频链接')}：{state.bvids.join('、') || '—'}
            </p>
            <p className='text-sm text-muted-foreground'>
              {$t('最近成功读取：{0}', { 0: stamp(state.verifiedAt) })}
            </p>
            {isAdmin && !edit && (
              <div className='flex flex-wrap gap-2'>
                {running ? (
                  <Button
                    type='button'
                    variant='outline'
                    disabled={stopping || !state.requestId}
                    onClick={() => {
                      setStopping(true);
                      const current = epochRef.current;
                      void bilibiliRequest<BilibiliStatus>(
                        projectId,
                        'cancel',
                        { requestId: state.requestId },
                      )
                        .then((next) => {
                          if (
                            aliveRef.current &&
                            current === epochRef.current
                          ) {
                            setState(next);
                            toast.info($t('已请求停止 Bilibili 读取。'));
                          }
                        })
                        .catch((e) => {
                          if (aliveRef.current) setError(failure(e));
                        })
                        .finally(() => {
                          if (aliveRef.current) setStopping(false);
                        });
                    }}
                  >
                    {stopping ? $t('正在停止…') : $t('停止读取')}
                  </Button>
                ) : (
                  <Button
                    type='button'
                    disabled={!!busy || unavailable || cooling}
                    onClick={() => {
                      void mutate('sync');
                    }}
                  >
                    {$t('立即读取')}
                  </Button>
                )}
                <Button
                  type='button'
                  variant='outline'
                  disabled={!!busy || running || unavailable}
                  onClick={() => {
                    void load(true);
                  }}
                >
                  {$t('修改')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  disabled={!!busy || running || unavailable}
                  onClick={() => {
                    void confirmAction({
                      title: $t('断开 Bilibili？'),
                      description: $t('停止后续读取，保留已保存的公开记录。'),
                      action: $t('断开'),
                    }).then((ok) => {
                      if (ok && aliveRef.current)
                        void mutate('disconnect', { revision: state.revision });
                    });
                  }}
                >
                  {$t('断开')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  disabled={!!busy || running}
                  onClick={refresh}
                >
                  {$t('刷新')}
                </Button>
              </div>
            )}
            {cooling && (
              <p role='status' className='text-sm text-muted-foreground'>
                {$t('可再次尝试时间：{0}', {
                  0: stamp(state.lastRun?.retryAt || null),
                })}
              </p>
            )}
          </CardContent>
        </Card>
      )}
      {state.lastRun && !state.lastRun.ok && (
        <Alert>
          <AlertDescription>
            {bilibiliMessage(state.lastRun.errorCode || 'invalid_response')}
            {state.lastRun.partial && <p>{$t('已保存可确认的部分结果。')}</p>}
          </AlertDescription>
        </Alert>
      )}
      {edit && (
        <BilibiliForm
          state={state}
          blocked={unavailable}
          resetTools={() => setToolChecked(false)}
          save={(values) => mutate('connect', values)}
          cancel={() => setEditing(false)}
          refresh={() => {
            void load(true);
          }}
          test={async (collectorId) => {
            await bilibiliRequest(projectId, 'test', { collectorId });
            if (aliveRef.current) setToolChecked(true);
          }}
        />
      )}
      <Card size='sm'>
        <CardHeader>
          <CardTitle>{$t('最近读取的视频')}</CardTitle>
          <CardDescription>
            {$t('展示最近 5 条，已保留 {0} 条。', {
              0: state.total.toLocaleString(),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {!state.recent.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{$t('尚无已保存的视频')}</EmptyTitle>
                <EmptyDescription>
                  {$t('保存条件并手动读取；未确认的空结果不会作为读取成功。')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className='flex flex-col gap-4'>
              {state.recent.map((video) => (
                <li
                  key={video.id}
                  className='flex min-w-0 flex-col gap-1 text-sm'
                >
                  <a
                    className='break-words font-medium text-primary underline underline-offset-4'
                    href={`https://www.bilibili.com/video/${encodeURIComponent(video.id)}`}
                    target='_blank'
                    rel='noreferrer'
                  >
                    {video.title || video.id}
                  </a>
                  {video.fromEarlierConfig && (
                    <Badge variant='outline' className='self-start'>
                      {$t('来自先前配置')}
                    </Badge>
                  )}
                  <p className='text-muted-foreground'>
                    {$t('播放 {0} · 点赞 {1} · 评论 {2}', {
                      0: count(video.views),
                      1: count(video.likes),
                      2: count(video.comments),
                    })}
                  </p>
                  <p className='text-muted-foreground'>
                    {$t('发布时间：{0}', {
                      0: video.publishedAt
                        ? `${video.publishedAt.slice(0, 16).replace('T', ' ')} UTC (${$t('分钟精度')})`
                        : $t('未知'),
                    })}
                  </p>
                  <p className='text-muted-foreground'>
                    {$t('采集时间：{0}', { 0: stamp(video.collectedAt) })}
                  </p>
                  <p className='break-words text-muted-foreground'>
                    {$t('来源：{0}', {
                      0: video.sources
                        .map((s) =>
                          s.kind === 'search'
                            ? $t('搜索：{0}', { 0: s.value })
                            : s.value,
                        )
                        .join(' · '),
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <p className='text-sm text-muted-foreground'>
            {$t('搜索仅覆盖返回的第一页，指标可能不完整。')}
          </p>
          <p className='text-sm text-muted-foreground'>
            {$t('最多保留最近 500 条公开记录，累计指标不代表新增增长。')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
