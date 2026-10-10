import { useCallback, useEffect, useRef, useState } from 'react';
import { $t } from '#i18n';
import { xiaohongshuRequest } from './xiaohongshu-api';
import { ListSkeleton, EmptyState } from '#components/reach/states';
import { Search } from 'lucide-react';
import { Button } from '#components/ui/button';
import { confirmAction } from '#components/reach/confirm';
import { useMe } from './me';

export interface XiaohongshuNote {
  id: string;
  title: string;
  url: string;
  likes: number | null;
  likesText: string | null;
  publishedAt: null;
  estimatedPublishedAt: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  query: string;
}
export interface XiaohongshuView {
  connected: boolean;
  revision: number;
  configured: boolean;
  collectorId: string | null;
  collectors: { id: string; name: string }[];
  query: string;
  verifiedAt: string | null;
  lastRun: {
    at: string;
    ok: boolean;
    errorCode?: string;
    count?: number;
  } | null;
  total: number;
  running: string | null;
  notes: XiaohongshuNote[];
  latestIds: string[];
}
const messages: Record<string, string> = {
  collector_unreachable: '无法连接小红书采集器，请检查采集器是否运行。',
  collector_unauthorized: '小红书采集器认证失败，请管理员核对部署令牌。',
  tool_missing: '采集器尚未安装 OpenCLI，请管理员完成安装。',
  browser_unavailable:
    '采集器无法连接浏览器，请打开已授权的 Chrome 和 OpenCLI 扩展。',
  login_required: '请在采集器的浏览器中自行登录小红书，再重新搜索。',
  security_block:
    '小红书要求安全验证或限制了访问，采集已停止，请在浏览器中处理。',
  timeout: '小红书采集超时，保留上次成功结果，请稍后手动重试。',
  invalid_response: '采集器返回的数据格式不完整，未覆盖上次成功结果。',
  busy: '采集器正在处理其他请求，请稍后再试。',
  no_results:
    '本次未返回可确认的笔记，未验证当前登录状态；这不代表全网没有提及。',
  cancelled: '采集已取消，上次成功结果保留。',
};

export function XiaohongshuConnect({
  projectId,
  onChange,
}: {
  projectId: number;
  onChange: () => void;
}) {
  const { isAdmin } = useMe();
  const [data, setData] = useState<XiaohongshuView | null>(null);
  const [collectorId, setCollectorId] = useState('');
  const [query, setQuery] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');
  const [blocked, setBlocked] = useState(false);
  const [notice, setNotice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [shown, setShown] = useState(20);
  const mountedRef = useRef(true);
  const lockRef = useRef(false);
  const cancelLockRef = useRef(false);
  const queryInputRef = useRef<HTMLInputElement>(null);
  const collectorInputRef = useRef<HTMLSelectElement>(null);
  const authorizationInputRef = useRef<HTMLInputElement>(null);
  const setFailure = useCallback((e: unknown) => {
    if (!mountedRef.current) return;
    const status = (e as { status?: number }).status;
    setBlocked([401, 403, 404].includes(status ?? 0));
    setError(
      status === 401
        ? $t('登录已失效，请重新登录 NocoReach。')
        : status === 403
          ? $t('你没有权限执行此操作。')
          : status === 404
            ? $t('项目或接口不存在，请刷新页面。')
            : e instanceof Error
              ? $t(e.message)
              : $t('操作未完成，请重试。'),
    );
  }, []);
  const load = useCallback(async () => {
    const value = await xiaohongshuRequest<XiaohongshuView>(projectId, 'view');
    if (mountedRef.current) setData(value);
    return value;
  }, [projectId]);
  useEffect(() => {
    mountedRef.current = true;
    let disposed = false;
    void xiaohongshuRequest<XiaohongshuView>(projectId, 'view')
      .then((value) => {
        if (disposed) return;
        setData(value);
        setCollectorId(value.collectorId || value.collectors[0]?.id || '');
        setQuery(value.query);
      })
      .catch((e: unknown) => {
        if (!disposed) setFailure(e);
      });
    return () => {
      disposed = true;
      mountedRef.current = false;
    };
    // Each project is keyed by the parent. Closing does not cancel an explicitly started collection.
  }, [projectId, setFailure]);
  useEffect(() => {
    if (!data?.running && busy !== 'search') return;
    const timer = setInterval(() => {
      void load().catch(setFailure);
    }, 1500);
    return () => clearInterval(timer);
    // Polling deliberately never updates the editable query or collector draft.
  }, [data?.running, busy, load, setFailure]);
  async function run(action: string, task: () => Promise<void>) {
    if (lockRef.current) return;
    lockRef.current = true;
    setBusy(action);
    setError('');
    setNotice('');
    setBlocked(false);
    try {
      await task();
    } catch (e) {
      setFailure(e);
      if ((e as { status?: number }).status === 409)
        await load().catch(setFailure);
    } finally {
      lockRef.current = false;
      if (mountedRef.current) setBusy('');
    }
  }
  async function search(rev: number) {
    try {
      const value = await xiaohongshuRequest<XiaohongshuView>(
        projectId,
        'search',
        { revision: rev },
      );
      if (mountedRef.current) {
        setData(value);
        setNotice($t('小红书笔记已采集并保存。'));
      }
    } finally {
      if (mountedRef.current) await load().catch(setFailure);
      // Keep the catalog's outcome current after errors and after this sheet
      // has closed, not only after a successful collection.
      onChange();
    }
  }
  const running = Boolean(data?.running || busy === 'search');
  if (!data)
    return (
      <div className='grid gap-3'>
        {error ? (
          <>
            <p role='alert' className='nr-error'>
              {error}
            </p>
            {!blocked && (
              <Button
                variant='outline'
                onClick={() =>
                  void run('load', async () => {
                    const v = await load();
                    setCollectorId(v.collectorId || v.collectors[0]?.id || '');
                    setQuery(v.query);
                  })
                }
              >
                {$t('重试')}
              </Button>
            )}
          </>
        ) : (
          <div role='status' aria-label={$t('正在读取…')}>
            <ListSkeleton rows={3} />
          </div>
        )}
      </div>
    );
  const form = isAdmin && (!data.connected || editing);
  const queryValid =
    query.trim().length >= 2 &&
    query.trim().length <= 60 &&
    !/^-/.test(query.trim()) &&
    ![...query].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
  const fieldErrors = {
    collector: submitted && !collectorId,
    query: submitted && !queryValid,
    authorization: submitted && !authorized,
  };
  const resetValidation = () => {
    setSubmitted(false);
  };
  const validate = () => {
    setSubmitted(true);
    if (!collectorId) {
      collectorInputRef.current?.focus();
      return false;
    }
    if (!queryValid) {
      queryInputRef.current?.focus();
      return false;
    }
    if (!authorized) {
      authorizationInputRef.current?.focus();
      return false;
    }
    return true;
  };
  return (
    <div className='grid gap-4' data-xiaohongshu-connect>
      <div className='rounded-md border border-border bg-muted/30 p-3 text-sm'>
        <p className='font-medium'>{$t('使用已授权浏览器 · 手动采集')}</p>
        <p className='mt-1 text-muted-foreground'>
          {$t(
            '使用采集器中已登录的小红书浏览器，只读搜索公开笔记。不是官方 API；遇到登录或安全限制会停止，不会自动绕过。',
          )}
        </p>
        <p className='mt-1 text-muted-foreground'>
          {$t('结果仅供查看和归档，暂不进入每日分析或全局数据健康。')}
        </p>
        <p className='mt-1 text-muted-foreground'>
          {$t('浏览器使用采集器电脑的网络，不受本项目的出站代理设置影响。')}
        </p>
      </div>
      {error && (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      )}
      {notice && (
        <p role='status' className='text-sm'>
          {notice}
        </p>
      )}
      {!data.configured && (
        <div className='grid gap-2 text-sm'>
          <h3 className='font-medium'>{$t('尚未配置小红书采集器')}</h3>
          <p className='text-muted-foreground'>
            {$t(
              '请管理员按部署文档登记一次已授权的只读采集器，各项目即可选择。采集器必须能从 NocoReach 服务端访问；服务端的回环地址不代表你的电脑。',
            )}
          </p>
        </div>
      )}
      {form && data.configured && (
        <form
          className='grid gap-3'
          onSubmit={(e) => {
            e.preventDefault();
            if (!validate()) return;
            void run('save', async () => {
              const value = await xiaohongshuRequest<XiaohongshuView>(
                projectId,
                'connect',
                {
                  collectorId,
                  query: query.trim(),
                  revision: data.revision,
                  authorized,
                },
              );
              if (mountedRef.current) {
                setData(value);
                setEditing(false);
                setAuthorized(false);
                resetValidation();
                setNotice($t('连接已保存，尚未验证浏览器和登录状态。'));
                onChange();
              }
            });
          }}
        >
          <label className='nr-field'>
            {$t('采集器')}{' '}
            <span aria-hidden='true' className='text-destructive'>
              *
            </span>
            <select
              ref={collectorInputRef}
              aria-label={$t('采集器')}
              aria-required='true'
              aria-invalid={fieldErrors.collector}
              disabled={Boolean(busy) || running}
              value={collectorId}
              onChange={(e) => {
                setCollectorId(e.target.value);
                setNotice('');
              }}
            >
              <option value=''>{$t('选择已配置的采集器')}</option>
              {data.collectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {fieldErrors.collector && (
            <p role='alert' className='nr-error'>
              {$t('选择已配置的采集器')}
            </p>
          )}
          <label className='nr-field'>
            {$t('小红书搜索词')}{' '}
            <span aria-hidden='true' className='text-destructive'>
              *
            </span>
            <input
              ref={queryInputRef}
              aria-label={$t('小红书搜索词')}
              aria-required='true'
              aria-invalid={fieldErrors.query}
              value={query}
              disabled={Boolean(busy) || running}
              maxLength={60}
              placeholder='NocoBase'
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {fieldErrors.query && (
            <p role='alert' className='nr-error'>
              {$t('请填写 2–60 个字符的小红书搜索词。')}
            </p>
          )}
          <p className='nr-footnote'>
            {$t(
              '输入一个词组，每次最多读取 20 条结果。不会定时搜索，不代表全网提及总量。',
            )}
          </p>
          <label className='flex items-start gap-2 text-sm'>
            <input
              ref={authorizationInputRef}
              type='checkbox'
              aria-required='true'
              aria-invalid={fieldErrors.authorization}
              checked={authorized}
              disabled={Boolean(busy) || running}
              onChange={(e) => setAuthorized(e.target.checked)}
            />
            <span>
              {$t(
                '我有权使用该采集器中已登录的小红书会话，并将搜索结果保存到本项目。',
              )}{' '}
              <span aria-hidden='true' className='text-destructive'>
                *
              </span>
            </span>
          </label>
          {fieldErrors.authorization && (
            <p role='alert' className='nr-error'>
              {$t('请确认有权使用采集器中的小红书浏览器会话。')}
            </p>
          )}
          <div className='nr-step-actions flex-wrap'>
            <Button
              type='submit'
              disabled={Boolean(busy) || running || blocked}
            >
              {busy === 'save' ? $t('正在保存…') : $t('保存连接')}
            </Button>
            <Button
              type='button'
              variant='outline'
              disabled={Boolean(busy) || running || !collectorId || blocked}
              onClick={() =>
                void run('test', async () => {
                  await xiaohongshuRequest(projectId, 'test', { collectorId });
                  if (mountedRef.current)
                    setNotice(
                      $t(
                        '采集器可达，OpenCLI 已安装；浏览器和小红书登录状态仍未验证。',
                      ),
                    );
                })
              }
            >
              {busy === 'test' ? $t('正在检查…') : $t('检查采集器')}
            </Button>
            {editing && (
              <Button
                type='button'
                variant='ghost'
                disabled={Boolean(busy)}
                onClick={() => {
                  setEditing(false);
                  setQuery(data.query);
                  setCollectorId(data.collectorId || '');
                  setAuthorized(false);
                  resetValidation();
                }}
              >
                {$t('取消')}
              </Button>
            )}
          </div>
        </form>
      )}
      {data.connected && !editing && (
        <section className='grid gap-2'>
          <h3 className='font-medium'>{$t('搜索：{0}', { 0: data.query })}</h3>
          <p className='nr-footnote'>
            {data.collectors.find((c) => c.id === data.collectorId)?.name} ·{' '}
            {data.verifiedAt
              ? $t('上次成功采集 {0}', {
                  0: new Date(data.verifiedAt).toLocaleString(),
                })
              : $t('尚未验证浏览器和小红书登录状态。')}
          </p>
          {isAdmin && (
            <div className='nr-step-actions flex-wrap'>
              <Button
                disabled={Boolean(busy) || running || blocked}
                onClick={() => void run('search', () => search(data.revision))}
              >
                {running ? $t('正在采集…') : $t('立即搜索')}
              </Button>
              <Button
                variant='outline'
                disabled={Boolean(busy) || running || blocked}
                onClick={() =>
                  void run('edit', async () => {
                    const latest = await load();
                    if (mountedRef.current) {
                      setQuery(latest.query);
                      setCollectorId(latest.collectorId || '');
                      setEditing(true);
                      setAuthorized(false);
                      resetValidation();
                    }
                  })
                }
              >
                {$t('修改连接')}
              </Button>
              <Button
                variant='ghost'
                disabled={Boolean(busy) || running || blocked}
                onClick={() =>
                  void run('disconnect', async () => {
                    if (
                      !(await confirmAction({
                        title: $t('断开小红书采集器？'),
                        description: $t(
                          '已保存的笔记保留，不再使用该连接发起采集。',
                        ),
                        action: '断开',
                      }))
                    )
                      return;
                    const value = await xiaohongshuRequest<XiaohongshuView>(
                      projectId,
                      'disconnect',
                      { revision: data.revision },
                    );
                    if (mountedRef.current) {
                      setData(value);
                      setNotice($t('小红书连接已断开，已保存的笔记保留。'));
                      onChange();
                    }
                  })
                }
              >
                {$t('断开')}
              </Button>
            </div>
          )}
        </section>
      )}
      {running && (
        <div className='grid gap-2'>
          <p role='status' className='nr-footnote'>
            {$t(
              '正在使用采集器的浏览器搜索，最多约 80 秒。关闭面板后仍会继续，可重新打开查看或取消。',
            )}
          </p>
          {isAdmin && data.running && (
            <Button
              variant='outline'
              disabled={cancelling || blocked}
              onClick={() => {
                const requestId = data.running;
                if (!requestId || cancelLockRef.current) return;
                cancelLockRef.current = true;
                setCancelling(true);
                void xiaohongshuRequest(projectId, 'cancel', { requestId })
                  .then(() => {
                    if (mountedRef.current) setNotice($t('已请求取消采集。'));
                    return load();
                  })
                  .catch(setFailure)
                  .finally(() => {
                    cancelLockRef.current = false;
                    if (mountedRef.current) setCancelling(false);
                  });
              }}
            >
              {cancelling ? $t('正在取消…') : $t('取消采集')}
            </Button>
          )}
        </div>
      )}
      {data.lastRun && !data.lastRun.ok && (
        <p role='status' className='nr-footnote'>
          {$t(
            messages[data.lastRun.errorCode || 'invalid_response'] ||
              messages.invalid_response,
          )}{' '}
          {data.notes.length > 0 && $t('下方保留的是上次成功采集的数据。')}
        </p>
      )}
      {!data.notes.length ? (
        <EmptyState
          icon={<Search />}
          title={$t('还没有已保存的笔记')}
          description={$t(
            isAdmin
              ? '保存连接后，点击“立即搜索”验证浏览器并读取结果。'
              : '尚未有可确认的笔记，请管理员配置采集器并手动搜索。',
          )}
        />
      ) : (
        <section className='grid gap-2'>
          <h3 className='font-medium'>
            {$t('已保存 {0} 条笔记', { 0: data.total })}
          </h3>
          <p className='nr-footnote'>
            {$t(
              '每次最多 20 条，仅保留最近 1,000 条采集笔记。点赞为页面显示值，缩写保留原文；缺失值未知。推算发布日期不是准确发布时间。',
            )}
          </p>
          <ul className='grid gap-3'>
            {data.notes.slice(0, shown).map((note) => (
              <li
                className='min-w-0 rounded-md border border-border p-3'
                key={note.id}
              >
                <a
                  className='nr-link break-words font-medium'
                  href={note.url}
                  target='_blank'
                  rel='noreferrer'
                >
                  {note.title}
                </a>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {$t('页面显示点赞：{0}', { 0: note.likesText ?? $t('未知') })}
                </p>
                <p className='mt-1 text-xs text-muted-foreground'>
                  {note.estimatedPublishedAt
                    ? $t('推算发布日：{0}', { 0: note.estimatedPublishedAt })
                    : $t('发布时间未知')}{' '}
                  ·{' '}
                  {$t('采集于 {0}', {
                    0: new Date(note.lastSeenAt).toLocaleString(),
                  })}
                </p>
                <p className='mt-1 break-words text-xs text-muted-foreground'>
                  {$t('搜索词：{0}', { 0: note.query })}
                </p>
              </li>
            ))}
          </ul>
          {shown < data.notes.length && (
            <Button variant='outline' onClick={() => setShown((n) => n + 20)}>
              {$t('显示更多')}
            </Button>
          )}
        </section>
      )}
      <p className='nr-footnote'>
        {$t(
          '当前只支持搜索结果采集，不提供创作者后台、粉丝增长、评论或收藏统计。',
        )}
      </p>
    </div>
  );
}
