import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $t } from '#i18n';
import { useBusinessAccess } from '#hooks/use-business-access';
import { toast } from '#lib/toast';
import { Button } from '#components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '#components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '#components/ui/select';
import { Label } from '#components/ui/label';
import { Skeleton } from '#components/ui/skeleton';
import { Switch } from '#components/ui/switch';
import {
  DIRECT,
  networkKey,
  proxyKey,
  proxyRequest,
  sourceConnection,
  type NetworkSettings,
  type Profile,
  type ProfileCapabilities,
  type NetworkTest,
} from '#pages/proxy-profiles/api';
import { ProxyError, ProxyTestResult } from '#pages/proxy-profiles/feedback';

type NetworkAction = 'select' | 'selectAll' | 'testConnection';

export function ConnectionNetwork({
  projectId,
  source,
}: {
  projectId: string | number;
  source: string;
}) {
  const connection = sourceConnection[source];
  const capabilities = useQuery({
    queryKey: [...proxyKey, 'capabilities'],
    queryFn: () => proxyRequest<ProfileCapabilities>('capabilities'),
  });
  if (!connection) return null;
  // A mock deployment keeps choosing a profile per connection; a live one only turns the default proxy off.
  if (capabilities.data?.mockEnabled)
    return (
      <NetworkChoice
        key={`${projectId}:${connection}`}
        projectId={String(projectId)}
        connection={connection}
      />
    );
  if (!capabilities.data)
    return capabilities.error ? (
      <ProxyError
        error={capabilities.error}
        retry={() => void capabilities.refetch()}
      />
    ) : null;
  return (
    <ProxySwitch
      key={`${projectId}:${connection}`}
      projectId={String(projectId)}
      connection={connection}
    />
  );
}
// Shown only when Settings › Network has a proxy. Off keeps this connection direct in this project.
function ProxySwitch({
  projectId,
  connection,
}: {
  projectId: string;
  connection: string;
}) {
  const { can: canSelect } = useBusinessAccess(
    'nrProxyProfiles.select',
    projectId,
  );
  const client = useQueryClient();
  const network = useQuery({
    queryKey: networkKey,
    queryFn: () => proxyRequest<NetworkSettings>('network'),
  });
  const selections = useQuery({
    queryKey: [...proxyKey, 'selections', projectId],
    queryFn: () =>
      proxyRequest<Record<string, string>>('selections', { projectId }),
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  // Browser collectors use their own host's network.
  if (['bilibili', 'xiaohongshu'].includes(connection)) return null;
  const loadError = network.error || selections.error;
  if (!loadError && !(network.data?.proxy && selections.data)) return null;
  const on = selections.data?.[connection] !== DIRECT;
  async function toggle(next: boolean) {
    if (!canSelect) return;
    setBusy(true);
    setError(null);
    try {
      await proxyRequest('select', {
        projectId,
        connection,
        profileId: next ? null : DIRECT,
      });
      await client.invalidateQueries({ queryKey: proxyKey });
      toast.success(() =>
        $t(next ? 'network.useProxyOn' : 'network.useProxyOff'),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className='flex shrink-0 flex-col gap-3 border-t pt-4'>
      <ProxyError
        error={error || loadError}
        retry={
          busy || (error && !canSelect)
            ? undefined
            : error
              ? () => void toggle(!on)
              : () => {
                  void network.refetch();
                  void selections.refetch();
                }
        }
      />
      {network.data?.proxy && selections.data && (
        <div className='flex items-start justify-between gap-4'>
          <div className='min-w-0'>
            <p className='text-sm font-medium'>{$t('network.useProxy')}</p>
            <p className='mt-1 text-sm text-muted-foreground'>
              {$t('network.useProxyHelp')}
              {connection === 'google' &&
                ` ${$t('connectionNetwork.ga4SearchConsoleShare')}`}
              {connection === 'github' &&
                ` ${$t('connectionNetwork.githubRepositoriesTrafficDiscussionsShare')}`}
              {connection === 'dataforseo' &&
                ` ${$t('connectionNetwork.keywordsRankingsTrendsRedditAi')}`}
            </p>
          </div>
          <Switch
            aria-label={$t('network.useProxy')}
            checked={on}
            disabled={busy || !canSelect}
            onCheckedChange={(next) => void toggle(next)}
          />
        </div>
      )}
    </section>
  );
}
function NetworkChoice({
  projectId,
  connection,
}: {
  projectId: string;
  connection: string;
}) {
  const { can: canSelect } = useBusinessAccess(
    'nrProxyProfiles.select',
    projectId,
  );
  const { can: canSelectAll } = useBusinessAccess('nrProxyProfiles.selectAll');
  const { can: canTest } = useBusinessAccess(
    'nrProxyProfiles.testConnection',
    projectId,
  );
  const fieldId = useId(),
    client = useQueryClient();
  const profiles = useQuery({
    queryKey: proxyKey,
    queryFn: () => proxyRequest<Profile[]>('list'),
  });
  const selections = useQuery({
    queryKey: [...proxyKey, 'selections', projectId],
    queryFn: () =>
      proxyRequest<Record<string, string>>('selections', { projectId }),
  });
  const capabilities = useQuery({
    queryKey: [...proxyKey, 'capabilities'],
    queryFn: () => proxyRequest<ProfileCapabilities>('capabilities'),
  });
  const mockEnvironment = capabilities.data?.mockEnabled === true;
  const collector = ['bilibili', 'xiaohongshu'].includes(connection);
  const directLabel = $t(
    mockEnvironment
      ? 'networkProfiles.paused'
      : 'connectionNetwork.directConnection',
  );
  const [draft, setDraft] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [failedAction, setFailedAction] = useState<NetworkAction>('select'),
    [result, setResult] = useState<NetworkTest | null>(null);
  const saved = selections.data?.[connection] || 'direct';
  const choice = draft ?? saved;
  const changed = choice !== saved;
  const allowed = {
    select: canSelect,
    selectAll: canSelectAll,
    testConnection: canTest,
  };
  async function act(action: NetworkAction) {
    if (!allowed[action]) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (action === 'testConnection')
        setResult(
          await proxyRequest<NetworkTest>('testConnection', {
            projectId,
            connection,
          }),
        );
      else {
        await proxyRequest(action, {
          projectId,
          connection,
          profileId: choice === 'direct' ? null : choice,
        });
        await client.invalidateQueries({ queryKey: proxyKey });
        setDraft(null);
        toast.success(() => $t('connectionNetwork.networkConnectionSaved'));
      }
    } catch (e) {
      setError(e);
      setFailedAction(action);
    } finally {
      setBusy(false);
    }
  }
  if (collector && capabilities.data && !mockEnvironment) return null;
  return (
    // The connection drawer is a scrollable flex column. Keep the card at its
    // content height so its overflow-hidden frame cannot clip the form.
    <Card className='shrink-0'>
      <CardHeader>
        <CardTitle>{$t('connectionNetwork.networkConnection')}</CardTitle>
        <CardDescription>
          {$t(
            mockEnvironment
              ? 'networkProfiles.mockConnectionHelp'
              : 'connectionNetwork.selectProxyProfileConnectionDirect',
          )}
          {connection === 'google' &&
            ` ${$t('connectionNetwork.ga4SearchConsoleShare')}`}
          {connection === 'github' &&
            ` ${$t('connectionNetwork.githubRepositoriesTrafficDiscussionsShare')}`}
          {connection === 'dataforseo' &&
            ` ${$t('connectionNetwork.keywordsRankingsTrendsRedditAi')}`}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <ProxyError
          error={
            error || profiles.error || selections.error || capabilities.error
          }
          retry={
            busy || (error && !allowed[failedAction])
              ? undefined
              : error
                ? () => void act(failedAction)
                : () => {
                    void profiles.refetch();
                    void capabilities.refetch();
                    void selections.refetch();
                  }
          }
        />
        <Label htmlFor={fieldId}>{$t('common.proxyProfiles')}</Label>
        {profiles.isPending ||
        selections.isPending ||
        capabilities.isPending ? (
          <Skeleton
            className='h-9 w-full'
            role='status'
            aria-label={$t('common.loading')}
          />
        ) : profiles.data && selections.data && capabilities.data ? (
          <>
            <Select
              value={choice}
              onValueChange={(v) => {
                if (v) {
                  setDraft(v);
                  setResult(null);
                  setError(null);
                }
              }}
              disabled={busy || (!canSelect && !canSelectAll)}
            >
              <SelectTrigger id={fieldId} className='w-full text-foreground'>
                <SelectValue>
                  {choice === 'direct'
                    ? directLabel
                    : profiles.data.find((p) => p.id === choice)?.name ||
                      $t('connectionNetwork.proxyProfileNotFound')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='direct'>{directLabel}</SelectItem>
                  {profiles.data
                    .filter((p) =>
                      mockEnvironment ? p.kind === 'mock' : p.kind !== 'mock',
                    )
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className='whitespace-normal break-all'>
                          {p.name}
                          {p.kind === 'mock'
                            ? ` · ${$t('networkProfiles.mock')}`
                            : ''}
                        </span>
                      </SelectItem>
                    ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className='text-sm text-muted-foreground'>
              {$t(
                collector
                  ? 'networkProfiles.mediaNetwork'
                  : 'connectionNetwork.proxyFailuresNeverFallBack',
              )}
            </p>
            {changed && (
              <p role='status' className='text-sm text-muted-foreground'>
                {$t('connectionNetwork.saveSelectionBeforeTestingConnection')}
              </p>
            )}
            <Link to='/proxy-profiles' className='text-sm underline'>
              {$t('connectionNetwork.manageProxyProfiles')}
            </Link>
          </>
        ) : null}
        <ProxyTestResult result={result} />
      </CardContent>
      <CardFooter className='flex-wrap justify-end gap-2'>
        {canSelectAll &&
          mockEnvironment &&
          profiles.data?.find((profile) => profile.id === choice)?.kind ===
            'mock' && (
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => void act('selectAll')}
            >
              {$t('networkProfiles.applyAll')}
            </Button>
          )}

        {canTest && (
          <Button
            variant='outline'
            disabled={busy || changed || !selections.data || !profiles.data}
            onClick={() => void act('testConnection')}
          >
            {$t('common.testConnection')}
          </Button>
        )}
        {canSelect && (
          <Button
            disabled={busy || !changed || !selections.data || !profiles.data}
            onClick={() => void act('select')}
          >
            {busy ? $t('common.working') : $t('common.save')}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
