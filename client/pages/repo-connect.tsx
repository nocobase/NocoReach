import { $t } from '#i18n';
import { NocoReachHttpError } from '#lib/nocoreach-api';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '#components/ui/select';
import { confirmAction } from '#components/reach/confirm';
import { agentRequest, type AgentStatus } from './repo-connect-api';

type Props = { projectId: number; onChange: () => void };
export function RepoConnect(props: Props) {
  return <RepoConnectForm key={props.projectId} {...props} />;
}
function RepoConnectForm({ projectId, onChange }: Props) {
  const [state, setState] = useState<AgentStatus>();
  const [url, setUrl] = useState(''),
    [branch, setBranch] = useState('main'),
    [paths, setPaths] = useState('');
  const [agentId, setAgentId] = useState(''),
    [saving, setSaving] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const busy = Boolean(saving);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [errorStatus, setErrorStatus] = useState(0);
  const [retryable, setRetryable] = useState(true);
  const reportLoadError = useCallback((e: unknown) => {
    setErrorStatus(e instanceof NocoReachHttpError ? e.status : 0);
    setRetryable(
      !(e instanceof NocoReachHttpError && [401, 403, 404].includes(e.status)),
    );
    setError(
      e instanceof NocoReachHttpError
        ? e.message
        : $t('读取网站源码设置失败。'),
    );
  }, []);
  const load = useCallback(
    async (initial = false) => {
      const next = await agentRequest<AgentStatus>('status', projectId);
      setState(next);
      setError('');
      setRetryable(true);
      if (initial) {
        setUrl(next.repo?.repo || '');
        setBranch(next.repo?.baseBranch || 'main');
        setPaths(next.repo?.allowedPaths?.join(', ') || '');
        setAgentId(next.agentId || '');
      }
      return next;
    },
    [projectId],
  );
  useEffect(() => {
    void Promise.resolve()
      .then(() => load(true))
      .catch(reportLoadError);
  }, [load, reportLoadError]);
  async function save(action: string, values: object) {
    if (!state) return;
    if (busy) return;
    setSaving(action);
    setFieldErrors({});
    setErrorStatus(0);
    setError('');
    setNotice('');
    try {
      await agentRequest(action, projectId, {
        revision: state.revision,
        ...values,
      });
      await load();
      setNotice($t('已保存'));
      onChange();
    } catch (e) {
      const message =
        e instanceof NocoReachHttpError
          ? e.message
          : $t('操作未完成，请重试。');
      setError(message);
      setErrorStatus(e instanceof NocoReachHttpError ? e.status : 0);
      if (e instanceof NocoReachHttpError && e.status === 400) {
        const field = /分支|branch/i.test(message)
          ? 'branch'
          : /目录|path/i.test(message)
            ? 'paths'
            : /仓库|repository/i.test(message)
              ? 'repo'
              : '';
        if (field) setFieldErrors({ [field]: message });
      }
      setRetryable(
        !(
          e instanceof NocoReachHttpError && [401, 403, 404].includes(e.status)
        ),
      );
    } finally {
      setSaving('');
    }
  }
  if (!state)
    return (
      <div>
        {error ? (
          <p role='alert'>{error}</p>
        ) : (
          <div role='status' aria-label={$t('正在读取…')} className='space-y-3'>
            <Skeleton className='h-6 w-32' />
            <Skeleton className='h-9 w-full' />
            <Skeleton className='h-9 w-full' />
          </div>
        )}
        {errorStatus === 401 && <Link to='/login'>{$t('登录')}</Link>}
        {(errorStatus === 403 || errorStatus === 404) && (
          <Link to='/connections'>{$t('返回数据接入')}</Link>
        )}
        {error && retryable && (
          <Button
            variant='outline'
            onClick={() => void load(true).catch(reportLoadError)}
          >
            {$t('重试')}
          </Button>
        )}
      </div>
    );
  const validAgent = state.options.some((a) => a.id === agentId);
  return (
    <div className='flex flex-col gap-6'>
      <Card className='p-4'>
        <form
          className='flex flex-col gap-3'
          onSubmit={(e) => {
            e.preventDefault();
            if (agentId && !busy) void save('select', { agentId });
          }}
        >
          <h3>{$t('任务执行 Agent')}</h3>
          <Label htmlFor='task-agent'>{$t('任务执行 Agent')}</Label>
          <Select
            value={agentId || null}
            onValueChange={(v) => setAgentId(v || '')}
            disabled={busy || !state.options.length}
            items={state.options.map((a) => ({ value: a.id, label: a.name }))}
          >
            <SelectTrigger
              id='task-agent'
              className='w-full min-w-0'
              aria-invalid={Boolean(agentId && !validAgent)}
            >
              <SelectValue
                className='truncate'
                title={state.options.find((a) => a.id === agentId)?.name}
                placeholder={$t('请选择任务执行 Agent')}
              />
            </SelectTrigger>
            <SelectContent className='w-max min-w-(--anchor-width) max-w-[min(32rem,calc(100vw-2rem))]'>
              {state.options.map((a) => (
                <SelectItem
                  key={a.id}
                  value={a.id}
                  className='[&>span:first-child]:min-w-0 [&>span:first-child]:shrink [&>span:first-child]:whitespace-normal [&>span:first-child]:break-words'
                  title={a.name}
                >
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!state.options.length && (
            <p role='status' className='text-sm text-muted-foreground'>
              {$t('暂无可用 Agent，请先创建并连接 Runner')}
            </p>
          )}
          {agentId && !validAgent && (
            <p role='alert' className='text-sm text-destructive'>
              {$t('已选 Agent 不再可用，请重新选择')}
            </p>
          )}
          <p className='text-sm text-muted-foreground'>
            {$t('项目使用允许所有成员调用的 Runner Agent。')}{' '}
            <Link className='underline' to='/agents'>
              {$t('管理 Agent')}
            </Link>{' '}
            ·{' '}
            <Link className='underline' to='/runtimes'>
              {$t('管理 Runner')}
            </Link>
          </p>
          <Button
            className='self-start'
            disabled={busy || !validAgent || state.agentId === agentId}
            type='submit'
          >
            {saving === 'select' ? $t('正在保存…') : $t('保存 Agent')}
          </Button>
        </form>
      </Card>
      <Card className='p-4'>
        <form
          className='flex flex-col gap-3'
          onSubmit={(e) => {
            e.preventDefault();
            void save('saveRepo', {
              repo: url,
              baseBranch: branch,
              allowedPaths: paths
                .split(/[,\n]/)
                .map((s) => s.trim())
                .filter(Boolean),
            });
          }}
        >
          <h3>{$t('网站源码仓库')}</h3>
          <Label htmlFor='task-repo'>{$t('仓库链接')} <span aria-hidden='true'>*</span></Label>
          <Input
            id='task-repo'
            aria-invalid={Boolean(fieldErrors.repo)}
            aria-describedby={fieldErrors.repo ? 'error-repo' : undefined}
            required
            value={url}
            disabled={busy}
            placeholder='https://github.com/org/website'
            onChange={(e) => setUrl(e.target.value)}
          />
          {fieldErrors.repo && (
            <p id='error-repo' className='text-sm text-destructive'>
              {fieldErrors.repo}
            </p>
          )}
          <Label htmlFor='task-branch'>{$t('基础分支')} <span aria-hidden='true'>*</span></Label>
          <Input
            id='task-branch'
            aria-invalid={Boolean(fieldErrors.branch)}
            aria-describedby={fieldErrors.branch ? 'error-branch' : undefined}
            required
            value={branch}
            disabled={busy}
            onChange={(e) => setBranch(e.target.value)}
          />
          {fieldErrors.branch && (
            <p id='error-branch' className='text-sm text-destructive'>
              {fieldErrors.branch}
            </p>
          )}
          <Label htmlFor='task-paths'>
            {$t('允许修改的目录（逗号分隔，留空为整个仓库）')}
          </Label>
          <Input
            id='task-paths'
            aria-invalid={Boolean(fieldErrors.paths)}
            aria-describedby={fieldErrors.paths ? 'error-paths' : undefined}
            value={paths}
            disabled={busy}
            onChange={(e) => setPaths(e.target.value)}
          />
          {fieldErrors.paths && (
            <p id='error-paths' className='text-sm text-destructive'>
              {fieldErrors.paths}
            </p>
          )}
          <p className='text-sm text-muted-foreground'>
            {$t(
              'Runner 使用本机 GitHub 凭据访问仓库；研究任务可以不配置仓库。',
            )}
          </p>
          <div className='flex flex-wrap gap-2'>
            <Button
              disabled={busy || !url.trim() || !branch.trim()}
              type='submit'
            >
              {saving === 'saveRepo' ? $t('正在保存…') : $t('保存仓库')}
            </Button>
            {state.repo && (
              <Button
                variant='outline'
                type='button'
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    if (
                      await confirmAction({
                        title: $t('移除仓库 {0}？', {
                          0: state.repo?.repo || '',
                        }),
                        description: $t(
                          '新任务将无法修改此仓库，已经开的 PR 不受影响。',
                        ),
                        action: '移除',
                      })
                    ) {
                      await save('removeRepo', {});
                    }
                  })();
                }}
              >
                {$t('移除')}
              </Button>
            )}
          </div>
        </form>
      </Card>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error} {errorStatus === 401 && <Link to='/login'>{$t('登录')}</Link>}
          {(errorStatus === 403 || errorStatus === 404) && (
            <Link to='/connections'>{$t('返回数据接入')}</Link>
          )}
          {retryable && (
            <Button
              variant='link'
              onClick={() => void load().catch(reportLoadError)}
            >
              {$t('重新读取')}
            </Button>
          )}
        </p>
      )}
      {notice && (
        <p role='status' className='text-sm text-muted-foreground'>
          {notice}
        </p>
      )}
    </div>
  );
}
