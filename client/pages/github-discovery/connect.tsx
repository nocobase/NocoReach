import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Search, MoreHorizontalIcon } from 'lucide-react';
import { $t } from '#i18n';
import { Button, buttonVariants } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Section } from '#components/reach/page';
import { RefreshButton } from '#components/reach/refresh-button';
import {
  ListSkeleton,
  LoadError,
  EmptyState,
  InlineError,
} from '#components/reach/states';
import { confirmAction } from '#components/reach/confirm';
import { useBusinessAccess } from '#hooks/use-business-access';
import { toast } from '#lib/toast';
import {
  discoveryRequest,
  useDiscoveryStatus,
  retryable,
  type DiscoveryStatus,
  type DiscoveryRule,
} from './api.js';
import { DiscoveryState, DetectionBadge } from './components.js';

export function GitHubDiscoveryConnect({
  projectId,
  onChange,
  onSavingChange,
}: {
  projectId: number;
  onChange: () => void;
  onSavingChange: (saving: boolean) => void;
}) {
  const { data, error, reload, accept } = useDiscoveryStatus(projectId);
  const [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState('');
  const aliveRef = useRef(true),
    addRuleRef = useRef<HTMLButtonElement>(null),
    focusAddRef = useRef(false);
  useEffect(() => {
    if (focusAddRef.current && addRuleRef.current) {
      focusAddRef.current = false;
      const frame = requestAnimationFrame(() => addRuleRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [data?.rules.length]);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);
  const { can: canSave } = useBusinessAccess(
    'nrGitHubDiscovery.saveRule',
    projectId,
  );
  const { can: canSetToken } = useBusinessAccess(
    'nrGitHubDiscovery.setToken',
    projectId,
  );
  const { can: canRemoveToken } = useBusinessAccess(
    'nrGitHubDiscovery.removeToken',
    projectId,
  );
  const { can: canRemoveRule } = useBusinessAccess(
    'nrGitHubDiscovery.removeRule',
    projectId,
  );
  const { can: canPause } = useBusinessAccess(
    'nrGitHubDiscovery.setEnabled',
    projectId,
  );
  const { can: canScan } = useBusinessAccess(
    'nrGitHubDiscovery.scan',
    projectId,
  );
  const navigate = useNavigate(),
    [params] = useSearchParams();
  async function run(
    action: string,
    body: object = {},
    headers?: Record<string, string>,
  ) {
    if (busy || !data) return;
    setBusy(true);
    onSavingChange(true);
    setFailure('');
    try {
      const next = await discoveryRequest<DiscoveryStatus>(
        projectId,
        action,
        { revision: data.revision, ...body },
        { headers },
      );
      if (!aliveRef.current) return;
      if (action === 'removeRule') focusAddRef.current = true;
      accept(next);
      if (action === 'setToken') setToken('');
      toast.success(() =>
        $t(action === 'scan' ? 'githubDiscovery.scanStarted' : 'common.saved'),
      );
      onChange();
    } catch (e) {
      if (aliveRef.current)
        setFailure(
          e instanceof Error ? e.message : $t('common.operationFailedRetry'),
        );
    } finally {
      onSavingChange(false);
      if (aliveRef.current) setBusy(false);
    }
  }
  const edit = (ruleId: string, preset = false) => {
    const query = new URLSearchParams(params);
    query.set('source', 'github-discovery');
    if (preset) query.set('preset', 'nocobase3');
    else query.delete('preset');
    void navigate(`/connections/discovery/${ruleId}?${query}`);
  };
  async function changeRule(rule: DiscoveryRule, remove = false) {
    const action = remove
      ? 'common.remove'
      : rule.enabled
        ? 'githubDiscovery.pause'
        : 'githubDiscovery.resume';
    if (
      (remove || rule.enabled) &&
      !(await confirmAction({
        title: () =>
          $t('githubDiscovery.confirmChange', { 0: $t(action), 1: rule.name }),
        description: () =>
          $t(
            remove
              ? 'githubDiscovery.removeRuleHelp'
              : 'githubDiscovery.pauseHelp',
          ),
        action,
        destructive: remove || rule.enabled,
      }))
    )
      return;
    await run(remove ? 'removeRule' : 'setEnabled', {
      ruleId: rule.id,
      ...(!remove ? { enabled: !rule.enabled } : {}),
    });
  }
  if (!data)
    return error ? (
      <LoadError
        title={$t('githubDiscovery.loadFailed')}
        message={error instanceof Error ? error.message : undefined}
        onRetry={retryable(error) ? reload : undefined}
      />
    ) : (
      <ListSkeleton />
    );
  const newActions = canSave ? (
    <div className='flex flex-wrap gap-2'>
      <Button ref={addRuleRef} disabled={busy} onClick={() => edit('new')}>
        {$t('githubDiscovery.addRule')}
      </Button>
      <Button
        variant='outline'
        disabled={busy}
        onClick={() => edit('new', true)}
      >
        {$t('githubDiscovery.usePreset')}
      </Button>
    </div>
  ) : undefined;
  return (
    <div className='flex flex-col gap-4'>
      {Boolean(error) && (
        <LoadError
          title={$t('githubDiscovery.loadFailed')}
          message={error instanceof Error ? error.message : undefined}
          onRetry={retryable(error) ? reload : undefined}
        />
      )}
      {failure && (
        <InlineError
          action={
            <Button
              variant='outline'
              size='sm'
              onClick={() => {
                setFailure('');
                reload();
              }}
            >
              {$t('githubDiscovery.reload')}
            </Button>
          }
        >
          {failure}
        </InlineError>
      )}
      <Section
        title={$t('githubDiscovery.credential')}
        description={$t('githubDiscovery.credentialHelp')}
      >
        <p className='text-sm text-muted-foreground'>
          {$t(
            `githubDiscovery.credential${data.credential[0].toUpperCase()}${data.credential.slice(1)}`,
          )}
        </p>
        {canSetToken && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                'setToken',
                {},
                { 'x-nocoreach-discovery-token': token.trim() },
              );
            }}
            className='flex flex-col gap-3'
          >
            <Label htmlFor='discovery-token'>
              {$t('githubDiscovery.credential')} *
            </Label>
            <Input
              id='discovery-token'
              type='password'
              autoComplete='off'
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={busy}
              required
            />
            <div className='flex flex-wrap justify-end gap-2'>
              {data.credential === 'dedicated' && canRemoveToken && (
                <Button
                  type='button'
                  variant='outline'
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      if (
                        await confirmAction({
                          title: () => $t('githubDiscovery.removeCredential'),
                          description: () =>
                            $t('githubDiscovery.removeCredentialHelp'),
                          action: 'common.remove',
                        })
                      )
                        await run('removeToken');
                    })();
                  }}
                >
                  {$t('common.remove')}
                </Button>
              )}
              <Button type='submit' disabled={busy || !token.trim()}>
                {busy ? $t('common.saving') : $t('github.saveVerify')}
              </Button>
            </div>
          </form>
        )}
      </Section>
      <Section
        title={$t('githubDiscovery.rules')}
        description={$t('githubDiscovery.rulesHelp')}
        actions={data.rules.length ? newActions : undefined}
      >
        {!data.rules.length ? (
          <EmptyState
            icon={<Search />}
            title={$t('githubDiscovery.noRules')}
            description={$t(
              canSave
                ? 'githubDiscovery.rulesHelp'
                : 'accessMembers.errors.denied',
            )}
            action={newActions}
          />
        ) : (
          <div className='flex flex-col gap-3'>
            {data.rules.map((rule) => (
              <div
                key={rule.id}
                className='flex items-center justify-between gap-2 border-b pb-3 last:border-0'
              >
                <div className='min-w-0'>
                  <p className='break-words font-medium'>{rule.name}</p>
                  <DetectionBadge
                    status={rule.enabled ? 'enabled' : 'paused'}
                  />
                </div>
                {(canSave || canRemoveRule || canPause) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant='ghost'
                          size='icon-sm'
                          aria-label={$t('common.moreActions', {
                            0: rule.name,
                          })}
                          disabled={busy}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align='end'
                      className='w-auto min-w-40'
                    >
                      {canSave && (
                        <DropdownMenuItem onClick={() => edit(rule.id)}>
                          {$t('common.edit')}
                        </DropdownMenuItem>
                      )}
                      {canPause && (
                        <DropdownMenuItem onClick={() => void changeRule(rule)}>
                          {$t(
                            rule.enabled
                              ? 'githubDiscovery.pause'
                              : 'githubDiscovery.resume',
                          )}
                        </DropdownMenuItem>
                      )}
                      {canRemoveRule && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant='destructive'
                            onClick={() => void changeRule(rule, true)}
                          >
                            {$t('common.remove')}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>
      <Section
        title={$t('githubDiscovery.collection')}
        actions={
          canScan && (
            <RefreshButton
              busy={busy || data.running}
              disabled={!data.connected || !data.rules.some((r) => r.enabled)}
              label={$t(
                !data.connected
                  ? 'githubDiscovery.tokenNeeded'
                  : !data.rules.some((r) => r.enabled)
                    ? 'githubDiscovery.noEnabledRules'
                    : 'githubDiscovery.scan',
              )}
              onClick={() => void run('scan')}
            />
          )
        }
      >
        <DiscoveryState data={data} />
        <Link
          className={buttonVariants({ variant: 'outline' })}
          to='/data/github?view=discovery'
        >
          {$t('githubDiscovery.viewResults')}
        </Link>
      </Section>
    </div>
  );
}
