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
        title={$t('common.projectAi')}
        description={$t('projectAi.chooseTaskAgentProjectConfigure')}
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
      toast.success(() => $t('common.saved'));
    } catch (e) {
      setError(e instanceof NocoReachHttpError ? e.status : 0);
    } finally {
      setBusy(false);
    }
  };
  const items =
    state?.options.map((agent) => ({
      value: agent.id,
      label: `${agent.name} · ${$t(agent.type === 'online' ? 'common.onlineAgent' : 'common.runnerAgent')} · ${agent.online ? $t('projectAi.ready') : $t(agent.type === 'online' ? 'onlineAgent.modelRequired' : 'projectAi.waitingEligibleRunner')}`,
    })) || [];
  const errorText =
    error === 401
      ? $t('common.sessionExpiredSignAgain')
      : error === 403
        ? $t('projectAi.cannotChangeProjectAiSettings')
        : error === 404
          ? $t('projectAi.projectAgentNoLongerExists')
          : error === 409
            ? $t('projectAi.settingsAgentChangedChoicePreserved')
            : $t('projectAi.requestFailedRetry');
  return (
    <div className='flex max-w-3xl flex-col gap-6'>
      <p className='text-sm text-muted-foreground'>
        {$t('projectAi.currentProject', { 0: projectName })}
      </p>
      <AdminOnlyNote />
      <Card>
        <CardHeader>
          <CardTitle>{$t('projectAi.defaultTaskAgent')}</CardTitle>
          <CardDescription>
            {$t('projectAi.usedWhenTaskNoAgent')}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          {error !== null && (
            <Alert variant='destructive'>
              <AlertDescription>
                <p>{errorText}</p>
                {error === 401 ? (
                  <Link to='/login'>{$t('common.signAgain')}</Link>
                ) : error === 404 ? (
                  <Link to='/home'>{$t('projectAi.backProject')}</Link>
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
                    {$t('common.reload')}
                  </Button>
                ) : null}
              </AlertDescription>
            </Alert>
          )}
          {!state && busy && (
            <div
              role='status'
              aria-label={$t('common.loading')}
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
                <EmptyTitle>
                  {$t('projectAi.noSharedAgentsAvailable')}
                </EmptyTitle>
                <EmptyDescription>
                  {$t('projectAi.askAdministratorCreateSharedAgent')}
                </EmptyDescription>
              </EmptyHeader>
              {isAdmin && agentAccess.can && (
                <EmptyContent>
                  <Button nativeButton={false} render={<Link to='/agents' />}>
                    {$t('common.manageAgents')}
                  </Button>
                </EmptyContent>
              )}
            </Empty>
          ) : state ? (
            <>
              <div className='flex flex-col gap-2'>
                <Label htmlFor='project-default-agent'>
                  {$t('projectAi.defaultTaskAgent')} *
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
                      placeholder={$t('projectAi.selectTaskAgent')}
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
                    {$t('projectAi.chooseAvailableSharedAgent')}
                  </p>
                )}
                {state.agentId &&
                  !state.options.some(
                    (agent) => agent.id === state.agentId,
                  ) && (
                    <p className='text-sm text-destructive'>
                      {$t('projectAi.defaultAgentUnavailableChooseAnother')}
                    </p>
                  )}
              </div>
              <p
                id='project-agent-help'
                className='text-sm text-muted-foreground'
              >
                {$t('projectAi.onlineAgentsSupportResearchDrafts')}
              </p>
            </>
          ) : null}
        </CardContent>
        {state && items.length > 0 && isAdmin && (
          <CardFooter className='justify-end gap-3'>
            {unchanged && (
              <span className='text-sm text-muted-foreground'>
                {$t('projectAi.noChanges')}
              </span>
            )}
            <Button
              disabled={busy || unchanged || reloadRequired}
              onClick={() => void save()}
            >
              {busy && <Spinner />}
              {busy ? $t('common.saving') : $t('common.save')}
            </Button>
          </CardFooter>
        )}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{$t('projectAi.businessCapabilities')}</CardTitle>
          <CardDescription>
            {$t('projectAi.grantTaskDataAccessDraft')}
          </CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-3'>
          <p>{$t('projectAi.agentsReadCurrentTaskMetrics')}</p>
          <p>{$t('projectAi.draftsSavedCandidatesStillRequire')}</p>
          <p className='text-muted-foreground'>
            {$t('projectAi.whenCreatingAgentChooseNocoreach')}
          </p>
          <div className='flex flex-wrap gap-3'>
            {agentAccess.can && (
              <Link className='underline' to='/agents'>
                {$t('common.manageAgents')}
              </Link>
            )}
            {modelAccess.can && (
              <Link className='underline' to='/models'>
                {$t('projectAi.manageModels')}
              </Link>
            )}
            {runnerAccess.can && (
              <Link className='underline' to='/runtimes'>
                {$t('projectAi.manageRunners')}
              </Link>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
