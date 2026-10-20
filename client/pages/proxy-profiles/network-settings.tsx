import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, PowerOff, RefreshCw } from 'lucide-react';
import { $legacyText, $t } from '#i18n';
import { toast } from '#lib/toast';
import { PageHeader } from '#components/reach/page';
import { InfoTip, NotesTip } from '#components/reach/info-tip';
import { Tag } from '#components/reach/tag';
import { confirmAction } from '#components/reach/confirm';
import { Button } from '#components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { Switch } from '#components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#components/ui/table';
import { useBusinessAccess } from '#hooks/use-business-access';
import { useProject } from '../reach-data';
import {
  DIRECT,
  checkKey,
  networkKey,
  networkSources,
  proxyKey,
  proxyRequest,
  proxyHost,
  unreachableNotes,
  type NetworkSettings,
  type NetworkTest,
} from './api';
import { ProxyError } from './feedback';

type Proxy = NetworkSettings['proxy'];
/** What Settings › Network hands the proxy dialog rendered in its outlet. */
export interface NetworkOutletContext {
  /** A saved proxy checks every data source once. */
  onSaved: () => void;
}

/** Settings › Network in a live deployment: the deployment's one proxy, then how each data source of the current
 * project is reached. Every project uses the proxy unless a data source turns it off. */
export function NetworkSettingsForm() {
  const access = useBusinessAccess('nrProxyProfiles.network');
  const query = useQuery({
    queryKey: networkKey,
    queryFn: () => proxyRequest<NetworkSettings>('network'),
    enabled: access.can,
  });
  // Checks run only once asked for in this visit; after that a changed route checks its data source again.
  const [checking, setChecking] = useState(false);
  return (
    <>
      <PageHeader
        title={$t('network.title')}
        description={$t('network.description')}
        info={
          <NotesTip
            label={$t('network.title')}
            notes={[$t('network.notAffected'), $t('network.certificateHelp')]}
          />
        }
      />
      <ProxyError
        error={access.error || query.error}
        retry={access.error ? access.retry : () => void query.refetch()}
      />
      {access.isPending || (access.can && query.isPending) ? (
        <div
          className='flex max-w-3xl flex-col gap-6'
          role='status'
          aria-label={$t('common.loading')}
        >
          <Skeleton className='h-36 w-full' />
          <Skeleton className='h-96 w-full' />
        </div>
      ) : !access.can ? (
        <p>{$t('accessMembers.errors.denied')}</p>
      ) : query.data ? (
        <div className='flex max-w-3xl flex-col gap-6'>
          <ProxyCard proxy={query.data.proxy} />
          <SourcesCard
            proxy={query.data.proxy}
            checking={checking}
            onCheck={() => setChecking(true)}
          />
        </div>
      ) : null}
      <Outlet
        context={
          { onSaved: () => setChecking(true) } satisfies NetworkOutletContext
        }
      />
    </>
  );
}

function ProxyCard({ proxy }: { proxy: Proxy }) {
  const { can: canSave } = useBusinessAccess('nrProxyProfiles.saveNetwork');
  const location = useLocation();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const edit = { pathname: 'proxy', search: location.search };
  async function turnOff() {
    if (!proxy) return;
    const host = proxyHost(proxy.url);
    const ok = await confirmAction({
      title: () => $t('network.turnOffTitle', { 0: host }),
      description: 'network.turnOffDescription',
      action: 'network.turnOffAction',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await proxyRequest<NetworkSettings>('saveNetwork', {
        url: '',
        username: '',
        revision: proxy.revision,
      });
      await client.invalidateQueries({ queryKey: proxyKey });
      toast.success(() => $t('network.directSaved'));
    } catch (e) {
      toast.error(() =>
        e instanceof Error && e.message
          ? $legacyText(e.message)
          : $t('proxyProfiles.requestNotCompletedTryAgain'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          {$t('network.proxyTitle')}
          <Tag tone={proxy ? 'green' : 'grey'} dot>
            {$t(proxy ? 'network.proxyOn' : 'network.proxyOff')}
          </Tag>
        </CardTitle>
        <CardDescription>
          {$t(
            proxy
              ? 'network.proxyOnDescription'
              : 'network.proxyOffDescription',
          )}
        </CardDescription>
        {canSave && (
          <CardAction className='flex items-center gap-2'>
            {proxy ? (
              <>
                <Button
                  variant='outline'
                  nativeButton={false}
                  render={<Link to={edit} />}
                >
                  {$t('common.edit')}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant='ghost'
                        size='icon'
                        aria-label={$t('network.proxyActions')}
                        disabled={busy}
                      />
                    }
                  >
                    <MoreHorizontal />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-auto min-w-40'>
                    <DropdownMenuGroup>
                      <DropdownMenuItem
                        variant='destructive'
                        onClick={() => void turnOff()}
                      >
                        <PowerOff />
                        {$t('network.turnOff')}
                      </DropdownMenuItem>
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Button nativeButton={false} render={<Link to={edit} />}>
                {$t('network.setUp')}
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      {proxy && (
        <CardContent>
          <dl className='grid grid-cols-[8rem_1fr] gap-x-4 gap-y-2 text-sm'>
            <dt className='text-muted-foreground'>{$t('network.server')}</dt>
            <dd className='min-w-0 break-all'>{proxyHost(proxy.url)}</dd>
            <dt className='text-muted-foreground'>{$t('network.login')}</dt>
            <dd className='min-w-0 break-all'>
              {proxy.username
                ? $t('network.loginRequired', { 0: proxy.username })
                : $t('network.loginNone')}
            </dd>
          </dl>
        </CardContent>
      )}
    </Card>
  );
}

function SourcesCard({
  proxy,
  checking,
  onCheck,
}: {
  proxy: Proxy;
  checking: boolean;
  onCheck: () => void;
}) {
  const { project, error: projectError } = useProject();
  const projectId = project ? String(project.id) : null;
  const read = useBusinessAccess('nrProxyProfiles.selections', projectId);
  const { can: canTest } = useBusinessAccess(
    'nrProxyProfiles.testConnection',
    projectId,
  );
  const client = useQueryClient();
  const selections = useQuery({
    queryKey: [...proxyKey, 'selections', projectId],
    queryFn: () =>
      proxyRequest<Record<string, string>>('selections', { projectId }),
    enabled: read.can && !!projectId,
  });
  const running =
    useIsFetching({ queryKey: [...checkKey, projectId] }) > 0 && checking;
  function check() {
    if (!checking) onCheck();
    else
      void client.refetchQueries({
        queryKey: [...checkKey, projectId],
        type: 'active',
      });
  }
  const loading = !projectError && (!project || read.isPending);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{$t('network.sourcesTitle')}</CardTitle>
        <CardDescription>
          {project &&
            $t(
              proxy
                ? 'network.sourcesDescription'
                : 'network.sourcesDirectDescription',
              { 0: project.name },
            )}
        </CardDescription>
        {canTest && selections.data && (
          <CardAction>
            <Button variant='outline' disabled={running} onClick={check}>
              {running ? (
                <Spinner data-icon='inline-start' />
              ) : (
                <RefreshCw data-icon='inline-start' />
              )}
              {$t('network.check')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        <ProxyError
          error={read.error || selections.error}
          retry={read.error ? read.retry : () => void selections.refetch()}
        />
        {projectError ? (
          <p className='text-sm text-muted-foreground'>{projectError}</p>
        ) : loading || (read.can && selections.isPending) ? (
          <Skeleton
            className='h-72 w-full'
            role='status'
            aria-label={$t('common.loading')}
          />
        ) : !read.can ? (
          <p className='text-sm text-muted-foreground'>
            {$t('network.sourcesDenied')}
          </p>
        ) : selections.data && projectId ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{$t('network.sourceColumn')}</TableHead>
                {proxy && <TableHead>{$t('network.useProxy')}</TableHead>}
                {canTest && <TableHead>{$t('network.accessColumn')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {networkSources.map((source) => (
                <SourceRow
                  key={source.connection}
                  projectId={projectId}
                  source={source}
                  proxy={proxy}
                  on={!!proxy && selections.data[source.connection] !== DIRECT}
                  checking={checking && canTest}
                  showCheck={canTest}
                />
              ))}
            </TableBody>
          </Table>
        ) : null}
      </CardContent>
      <CardFooter>
        <p className='text-sm text-muted-foreground'>
          {$t('network.viaCollector')}
        </p>
      </CardFooter>
    </Card>
  );
}

function SourceRow({
  projectId,
  source,
  proxy,
  on,
  checking,
  showCheck,
}: {
  projectId: string;
  source: (typeof networkSources)[number];
  proxy: Proxy;
  on: boolean;
  checking: boolean;
  showCheck: boolean;
}) {
  const { can: canSelect } = useBusinessAccess(
    'nrProxyProfiles.select',
    projectId,
  );
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const name = $t(source.name);
  // The route is part of the key: switching it, or saving another proxy, checks this data source again.
  const route = on && proxy ? `proxy:${proxy.revision}` : DIRECT;
  const result = useQuery({
    queryKey: [...checkKey, projectId, source.connection, route],
    queryFn: () =>
      proxyRequest<NetworkTest>('testConnection', {
        projectId,
        connection: source.connection,
      }),
    enabled: checking,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
  });
  async function toggle(next: boolean) {
    if (!canSelect) return;
    setBusy(true);
    try {
      await proxyRequest('select', {
        projectId,
        connection: source.connection,
        profileId: next ? null : DIRECT,
      });
      await client.invalidateQueries({ queryKey: proxyKey });
      toast.success(() =>
        $t(next ? 'network.useProxyOn' : 'network.useProxyOff', { 0: name }),
      );
    } catch (e) {
      toast.error(() =>
        e instanceof Error && e.message
          ? $legacyText(e.message)
          : $t('proxyProfiles.requestNotCompletedTryAgain'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <TableRow>
      <TableCell className='whitespace-normal'>
        <div className='font-medium'>{name}</div>
        {source.detail && (
          <div className='text-xs text-muted-foreground'>
            {$t(source.detail)}
          </div>
        )}
      </TableCell>
      {proxy && (
        <TableCell>
          <Switch
            aria-label={$t('network.sourceSwitch', { 0: name })}
            checked={on}
            disabled={busy || !canSelect}
            onCheckedChange={(next) => void toggle(next)}
          />
        </TableCell>
      )}
      {showCheck && (
        <TableCell>
          {!checking ? (
            <span className='text-sm text-muted-foreground'>
              {$t('network.notChecked')}
            </span>
          ) : result.isFetching ? (
            <span className='inline-flex items-center gap-2 text-sm text-muted-foreground'>
              <Spinner />
              {$t('network.checking')}
            </span>
          ) : result.error ? (
            <span className='inline-flex items-center gap-1'>
              <Tag tone='grey' dot>
                {$t('network.checkIncomplete')}
              </Tag>
              <InfoTip label={$t('network.whyUnreachable', { 0: name })}>
                <p>
                  {result.error instanceof Error && result.error.message
                    ? $legacyText(result.error.message)
                    : $t('proxyProfiles.requestNotCompletedTryAgain')}
                </p>
              </InfoTip>
            </span>
          ) : result.data?.reachable ? (
            <span className='inline-flex items-center gap-2'>
              <Tag tone='green' dot>
                {$t('network.reachable')}
              </Tag>
              <span className='text-xs text-muted-foreground'>
                {$t('network.elapsed', { 0: result.data.elapsedMs })}
              </span>
            </span>
          ) : result.data ? (
            <span className='inline-flex items-center gap-1'>
              <Tag tone='red' dot>
                {$t('network.unreachable')}
              </Tag>
              <InfoTip label={$t('network.whyUnreachable', { 0: name })}>
                {unreachableNotes(result.data, name, !!proxy).map((note) => (
                  <p key={note}>{note}</p>
                ))}
              </InfoTip>
            </span>
          ) : null}
        </TableCell>
      )}
    </TableRow>
  );
}
