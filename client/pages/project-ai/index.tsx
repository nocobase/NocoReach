import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { Bot } from 'lucide-react';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import {
  agentsRoute,
  runtimesRoute,
  modelsRoute,
} from '@nocobase/app-plugin-agents/client/routes';
import { $t } from '#i18n';
import { PageContainer, PageHeader } from '#components/reach/page';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '#components/ui/card';
import { Button } from '#components/ui/button';
import { Label } from '#components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '#components/ui/select';
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '#components/ui/empty';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { toast } from '#lib/toast';
import { NocoReachHttpError } from '#lib/nocoreach-api';
import { agentRequest, type AgentStatus } from '../repo-connect-api.js';
import { useProject } from '../reach-data.js';
import { useMe, AdminOnlyNote } from '../me.js';

export default function ProjectAIPage() {
  const { project } = useProject();
  return (
    <PageContainer>
      <PageHeader
        title={$t('项目 AI')}
        description={$t('为当前项目选择任务 Agent，并配置它能使用的业务能力。')}
      />
      {project ? (
        <ProjectAISettings
          key={project.id}
          projectId={project.id}
          projectName={project.name}
        />
      ) : (
        <Skeleton className='h-40 w-full' />
      )}
    </PageContainer>
  );
}
export function ProjectAISettings({
  projectId,
  projectName,
}: {
  projectId: number;
  projectName: string;
}) {
  const { isAdmin } = useMe();
  const agentAccess = useCan(
    agentsRoute.authz === 'skip' ? undefined : agentsRoute.authz,
  );
  const runnerAccess = useCan(
    runtimesRoute.authz === 'skip' ? undefined : runtimesRoute.authz,
  );
  const modelAccess = useCan(
    modelsRoute.authz === 'skip' ? undefined : modelsRoute.authz,
  );
  const [state, setState] = useState<AgentStatus>();
  const [selection, setSelection] = useState('');
  const [error, setError] = useState<number | null>(null);
  const [fieldError, setFieldError] = useState(false);
  const [busy, setBusy] = useState(true);
  const [loadVersion, setLoadVersion] = useState(0);
  const selectRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let disposed = false;
    void agentRequest<AgentStatus>('status', projectId)
      .then((next) => {
        if (!disposed) {
          setState(next);
          setSelection(next.agentId || '');
          setFieldError(false);
        }
      })
      .catch((e) => {
        if (!disposed) setError(e instanceof NocoReachHttpError ? e.status : 0);
      })
      .finally(() => {
        if (!disposed) setBusy(false);
      });
    return () => {
      disposed = true;
    };
  }, [projectId, loadVersion]);
  const valid = state?.options.some((agent) => agent.id === selection);
  const unchanged = Boolean(state && selection === (state.agentId || ''));
  const reloadRequired = error !== null && [401, 403, 404, 409].includes(error);
  const save = async () => {
    if (busy || !state || reloadRequired) return;
    if (!selection || !valid) {
      setFieldError(true);
      selectRef.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await agentRequest<
        Pick<AgentStatus, 'revision' | 'agentId' | 'repo'>
      >('select', projectId, { revision: state.revision, agentId: selection });
      setState({ ...state, ...result });
      setSelection(result.agentId || '');
      setFieldError(false);
      toast.success($t('已保存'));
    } catch (e) {
      setError(e instanceof NocoReachHttpError ? e.status : 0);
    } finally {
      setBusy(false);
    }
  };
  const items =
    state?.options.map((agent) => ({
      value: agent.id,
      label: `${agent.name} · ${agent.type === 'online' ? $t('在线 Agent') : $t('Runner Agent')} · ${agent.online ? $t('就绪') : agent.type === 'online' ? $t('模型不可用') : $t('等待可用 Runner')}`,
    })) || [];
  const errorText =
    error === 401
      ? $t('登录已过期，请重新登录')
      : error === 403
        ? $t('没有修改项目 AI 设置的权限')
        : error === 404
          ? $t('项目或 Agent 已不存在，请返回项目列表')
          : error === 409
            ? $t('设置或 Agent 已变化。你的选择已保留，请重新加载后再保存。')
            : $t('请求未完成，请重试');
  return (
    <div className='flex max-w-3xl flex-col gap-6'>
      <p className='text-sm text-muted-foreground'>
        {$t('当前项目：{0}', { 0: projectName })}
      </p>
      <AdminOnlyNote />
      <Card>
        <CardHeader>
          <CardTitle>{$t('默认任务 Agent')}</CardTitle>
          <CardDescription>
            {$t('任务未单独指定 Agent 时使用此默认值。')}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {error !== null && (
            <Alert variant='destructive'>
              <AlertDescription>
                <p>{errorText}</p>
                {error === 401 ? (
                  <Link to='/login'>{$t('重新登录')}</Link>
                ) : error === 404 ? (
                  <Link to='/home'>{$t('返回项目')}</Link>
                ) : error === 409 || (!state && error !== 403) ? (
                  <Button
                    variant='outline'
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      setError(null);
                      setLoadVersion((value) => value + 1);
                    }}
                  >
                    {$t('重新加载')}
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          )}
          {!state && busy && (
            <div
              role='status'
              aria-label={$t('正在加载')}
              className='flex flex-col gap-3'
            >
              <Skeleton className='h-6 w-32' />
              <Skeleton className='h-9 w-full' />
            </div>
          )}
          {state && !items.length ? (
            <Empty className='min-h-40 border border-dashed p-6'>
              <EmptyHeader>
                <EmptyMedia variant='icon'>
                  <Bot />
                </EmptyMedia>
                <EmptyTitle>{$t('没有可用的共享 Agent')}</EmptyTitle>
                <EmptyDescription>
                  {$t(
                    '请管理员创建共享 Agent；研究和草稿可使用 Online 或 Runner。',
                  )}
                </EmptyDescription>
              </EmptyHeader>
              {isAdmin && agentAccess.can && (
                <EmptyContent>
                  <Button nativeButton={false} render={<Link to='/agents' />}>
                    {$t('管理 Agent')}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : state ? (
            <>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='project-default-agent'>
                  {$t('默认任务 Agent')} *
                </Label>
                <Select
                  items={items}
                  value={selection || null}
                  disabled={busy || !isAdmin || reloadRequired}
                  onValueChange={(value) => {
                    setSelection(value || '');
                    if (fieldError) setFieldError(!value);
                  }}
                >
                  <SelectTrigger
                    ref={selectRef}
                    id='project-default-agent'
                    className='w-full min-w-0'
                    aria-invalid={fieldError}
                    aria-describedby='project-agent-help'
                  >
                    <SelectValue
                      className='truncate'
                      placeholder={$t('请选择任务执行 Agent')}
                    />
                  </SelectTrigger>
                  <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
                    <SelectGroup>
                      {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {fieldError && (
                  <p role='alert' className='text-sm text-destructive'>
                    {$t('请选择可用的共享 Agent')}
                  </p>
                )}
                {state.agentId &&
                  !state.options.some(
                    (agent) => agent.id === state.agentId,
                  ) && (
                    <p className='text-sm text-destructive'>
                      {$t('默认 Agent 已不可用，请重新选择')}
                    </p>
                  )}
              </div>
              <p
                id='project-agent-help'
                className='text-sm text-muted-foreground'
              >
                {$t(
                  '在线 Agent 适合研究和草稿；修改仓库或处理 PR 需要 Runner Agent。离线 Runner 可以设为默认，任务将等待它上线。',
                )}
              </p>
            </>
          ) : null}
        </CardContent>
        {state && items.length > 0 && isAdmin && (
          <CardFooter className='justify-end gap-3'>
            {unchanged && (
              <span className='text-sm text-muted-foreground'>
                {$t('设置未更改')}
              </span>
            )}
            <Button
              disabled={busy || unchanged || reloadRequired}
              onClick={() => void save()}
            >
              {busy && <Spinner />}
              {busy ? $t('正在保存…') : $t('保存')}
            </Button>
          </CardFooter>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{$t('业务能力')}</CardTitle>
          <CardDescription>
            {$t('在 Agent 的能力设置中授予任务资料读取与草稿暂存。')}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <p>
            {$t(
              'Agent 可读取当前任务的指标、关键词、页面、审计、知识、Skills 和论坛资料快照。',
            )}
          </p>
          <p>
            {$t(
              '草稿只保存为候选内容，完成后仍需人工审核；不会自动发帖或发布。',
            )}
          </p>
          <p className='text-muted-foreground'>
            {$t(
              '创建 Agent 时可选择 NocoReach 研究或社区回复预设。模型、密钥和 Runner 由官方管理页面维护。',
            )}
          </p>
          <div className='flex flex-wrap gap-3'>
            {agentAccess.can && (
              <Link className='underline' to='/agents'>
                {$t('管理 Agent')}
              </Link>
            )}
            {modelAccess.can && (
              <Link className='underline' to='/models'>
                {$t('管理模型')}
              </Link>
            )}
            {runnerAccess.can && (
              <Link className='underline' to='/runtimes'>
                {$t('管理 Runner')}
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
