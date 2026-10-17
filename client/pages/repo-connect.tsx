import { useMessageState, renderMessage, type Message, $t } from '#i18n';
import { NocoReachHttpError } from '#lib/nocoreach-api';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '#components/ui/button';
import { Card } from '#components/ui/card';
import { Skeleton } from '#components/ui/skeleton';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { useBusinessAccess } from '#hooks/use-business-access';

import { confirmAction } from '#components/reach/confirm';
import { agentRequest, type AgentStatus } from './repo-connect-api';

type Props = { projectId: number; onChange: () => void };
export function RepoConnect(props: Props) {
  return <RepoConnectForm key={props.projectId} {...props} />;
}
function RepoConnectForm({ projectId, onChange }: Props) {
  const { can: canSave } = useBusinessAccess('nrAgent.saveRepo', projectId);
  const { can: canRemove } = useBusinessAccess('nrAgent.removeRepo', projectId);
  const [state, setState] = useState<AgentStatus>();
  const [url, setUrl] = useState(''),
    [branch, setBranch] = useState('main'),
    [paths, setPaths] = useState('');
  const [saving, setSaving] = useState(''),
    [error, setError] = useMessageState(''),
    [notice, setNotice] = useMessageState('');
  const busy = Boolean(saving);
  const [fieldErrors, setFieldErrors] = useState<Record<string, Message>>({});
  const [errorStatus, setErrorStatus] = useState(0);
  const [retryable, setRetryable] = useState(true);
  const reportLoadError = useCallback(
    (e: unknown) => {
      setErrorStatus(e instanceof NocoReachHttpError ? e.status : 0);
      setRetryable(
        !(
          e instanceof NocoReachHttpError && [401, 403, 404].includes(e.status)
        ),
      );
      setError(() =>
        e instanceof NocoReachHttpError
          ? e.message
          : $t('repo.notLoadRepositorySettings'),
      );
    },
    [setError],
  );
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
      }
      return next;
    },
    [projectId, setError],
  );
  useEffect(() => {
    void Promise.resolve()
      .then(() => load(true))
      .catch(reportLoadError);
  }, [load, reportLoadError]);
  async function save(action: 'saveRepo' | 'removeRepo', values: object) {
    if (!state) return;
    if (busy) return;
    if (action === 'saveRepo' ? !canSave : !canRemove) return;
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
      setNotice(() => $t('common.saved'));
      onChange();
    } catch (e) {
      const message = () =>
        e instanceof NocoReachHttpError
          ? e.message
          : $t('common.operationFailedRetry');
      setError(message);
      setErrorStatus(e instanceof NocoReachHttpError ? e.status : 0);
      if (e instanceof NocoReachHttpError && e.status === 400) {
        const field = /分支|branch/i.test(message())
          ? 'branch'
          : /目录|path/i.test(message())
            ? 'paths'
            : /仓库|repository/i.test(message())
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
          <div
            role='status'
            aria-label={$t('common.loadingLoading')}
            className='space-y-3'
          >
            <Skeleton className='h-6 w-32' />
            <Skeleton className='h-9 w-full' />
            <Skeleton className='h-9 w-full' />
          </div>
        )}
        {errorStatus === 401 && <Link to='/login'>{$t('repo.sign')}</Link>}
        {(errorStatus === 403 || errorStatus === 404) && (
          <Link to='/connections'>{$t('repo.backConnections')}</Link>
        )}
        {error && retryable && (
          <Button
            variant='outline'
            onClick={() => void load(true).catch(reportLoadError)}
          >
            {$t('common.retry')}
          </Button>
        )}
      </div>
    );
  return (
    <div className='flex flex-col gap-6'>
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
          <h3>{$t('repo.websiteSourceRepository')}</h3>
          <Label htmlFor='task-repo'>
            {$t('common.repositoryLink')} <span aria-hidden='true'>*</span>
          </Label>
          <Input
            id='task-repo'
            aria-invalid={Boolean(fieldErrors.repo)}
            aria-describedby={fieldErrors.repo ? 'error-repo' : undefined}
            required
            value={url}
            disabled={busy || !canSave}
            placeholder='https://github.com/org/website'
            onChange={(e) => setUrl(e.target.value)}
          />
          {fieldErrors.repo && (
            <p id='error-repo' className='text-sm text-destructive'>
              {renderMessage(fieldErrors.repo)}
            </p>
          )}
          <Label htmlFor='task-branch'>
            {$t('repo.baseBranch')} <span aria-hidden='true'>*</span>
          </Label>
          <Input
            id='task-branch'
            aria-invalid={Boolean(fieldErrors.branch)}
            aria-describedby={fieldErrors.branch ? 'error-branch' : undefined}
            required
            value={branch}
            disabled={busy || !canSave}
            onChange={(e) => setBranch(e.target.value)}
          />
          {fieldErrors.branch && (
            <p id='error-branch' className='text-sm text-destructive'>
              {renderMessage(fieldErrors.branch)}
            </p>
          )}
          <Label htmlFor='task-paths'>
            {$t('repo.allowedPathsCommaSeparatedLeave')}
          </Label>
          <Input
            id='task-paths'
            aria-invalid={Boolean(fieldErrors.paths)}
            aria-describedby={fieldErrors.paths ? 'error-paths' : undefined}
            value={paths}
            disabled={busy || !canSave}
            onChange={(e) => setPaths(e.target.value)}
          />
          {fieldErrors.paths && (
            <p id='error-paths' className='text-sm text-destructive'>
              {renderMessage(fieldErrors.paths)}
            </p>
          )}
          <p className='text-sm text-muted-foreground'>
            {$t('repo.runnerUsesLocalGithubCredentials')}
          </p>
          <div className='flex flex-wrap gap-2'>
            {canSave && (
              <Button
                disabled={busy || !url.trim() || !branch.trim()}
                type='submit'
              >
                {saving === 'saveRepo'
                  ? $t('common.saving')
                  : $t('repo.saveRepository')}
              </Button>
            )}
            {state.repo && canRemove && (
              <Button
                variant='outline'
                type='button'
                disabled={busy}
                onClick={() => {
                  void (async () => {
                    if (
                      await confirmAction({
                        title: () =>
                          $t('repo.removeRepository', {
                            0: state.repo?.repo || '',
                          }),
                        description: () =>
                          $t('repo.newTasksCannotChangeRepository'),
                        action: 'common.remove',
                      })
                    ) {
                      await save('removeRepo', {});
                    }
                  })();
                }}
              >
                {$t('common.remove')}
              </Button>
            )}
          </div>
        </form>
      </Card>
      {error && (
        <p role='alert' className='text-sm text-destructive'>
          {error}{' '}
          {errorStatus === 401 && <Link to='/login'>{$t('repo.sign')}</Link>}
          {(errorStatus === 403 || errorStatus === 404) && (
            <Link to='/connections'>{$t('repo.backConnections')}</Link>
          )}
          {retryable && (
            <Button
              variant='link'
              onClick={() => void load().catch(reportLoadError)}
            >
              {$t('common.reread')}
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
