import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $t } from '#i18n';
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
import {
  proxyKey,
  proxyRequest,
  sourceConnection,
  type Profile,
  type ProfileCapabilities,
  type NetworkTest,
} from '#pages/proxy-profiles/api';
import { ProxyError, ProxyTestResult } from '#pages/proxy-profiles/feedback';

export function ConnectionNetwork({
  projectId,
  source,
}: {
  projectId: string | number;
  source: string;
}) {
  const connection = sourceConnection[source];
  return connection ? (
    <NetworkChoice
      key={`${projectId}:${connection}`}
      projectId={String(projectId)}
      connection={connection}
    />
  ) : null;
}
function NetworkChoice({
  projectId,
  connection,
}: {
  projectId: string;
  connection: string;
}) {
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
    [failedTest, setFailedTest] = useState(false),
    [result, setResult] = useState<NetworkTest | null>(null);
  const saved = selections.data?.[connection] || 'direct';
  const choice = draft ?? saved;
  const changed = choice !== saved;
  async function act(test: boolean, all = false) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (test)
        setResult(
          await proxyRequest<NetworkTest>('testConnection', {
            projectId,
            connection,
          }),
        );
      else {
        await proxyRequest(all ? 'selectAll' : 'select', {
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
      setFailedTest(test);
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
            busy
              ? undefined
              : error
                ? () => void act(failedTest)
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
              disabled={busy}
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
                    .filter(
                      (p) =>
                        (!collector && !mockEnvironment) || p.kind === 'mock',
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
        {mockEnvironment &&
          profiles.data?.find((profile) => profile.id === choice)?.kind ===
            'mock' && (
            <Button
              variant='outline'
              disabled={busy}
              onClick={() => void act(false, true)}
            >
              {$t('networkProfiles.applyAll')}
            </Button>
          )}

        <Button
          variant='outline'
          disabled={busy || changed || !selections.data || !profiles.data}
          onClick={() => void act(true)}
        >
          {$t('common.testConnection')}
        </Button>
        <Button
          disabled={busy || !changed || !selections.data || !profiles.data}
          onClick={() => void act(false)}
        >
          {busy ? $t('common.working') : $t('common.save')}
        </Button>
      </CardFooter>
    </Card>
  );
}
