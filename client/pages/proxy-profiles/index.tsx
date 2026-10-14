import { useState, useRef } from 'react';
import {
  Outlet,
  useLocation,
  useNavigate,
  useSearchParams,
} from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Pencil, Trash2, Cable } from 'lucide-react';
import { getCurrentLocale, $t } from '#i18n';
import { toast } from '#lib/toast';
import { PageContainer, PageHeader } from '#components/reach/page';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '#components/ui/tooltip';
import { Skeleton } from '#components/ui/skeleton';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from '#components/ui/empty';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '#components/ui/table';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '#components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '#components/ui/alert-dialog';
import { useMe } from '../me';
import { loadProjects } from '../reach-data';
import { switchProject } from '../current-project';
import {
  proxyKey,
  proxyRequest,
  sourceConnection,
  connectionLabels,
  type Profile,
  type NetworkTest,
} from './api';
import { ProxyError, ProxyTestResult } from './feedback';
import { scenarioLabels } from './scenario-labels';

export default function ProxyProfilesPage() {
  const { me } = useMe();
  return (
    <PageContainer>
      {(!me || me.role !== 'admin') && (
        <PageHeader
          title={$t('common.proxyProfiles')}
          description={$t('proxyProfiles.manageProxyProfilesCentrallySelect')}
        />
      )}
      {!me ? (
        <Skeleton className='h-24 w-full' />
      ) : me.role !== 'admin' ? (
        <p>{$t('proxyProfiles.administratorsManageNetworkConnections')}</p>
      ) : (
        <ProfileList />
      )}
    </PageContainer>
  );
}
function ProfileList() {
  const client = useQueryClient(),
    navigate = useNavigate(),
    location = useLocation();
  const [params, setParams] = useSearchParams(),
    search = params.get('q') || '';
  const query = useQuery({
    queryKey: proxyKey,
    queryFn: () => proxyRequest<Profile[]>('list'),
  });
  const projects = useQuery({
    queryKey: ['nocoreach', 'projects'],
    queryFn: loadProjects,
  });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sort, setSort] = useState<'updatedAt' | 'name' | 'references'>(
      'updatedAt',
    ),
    [descending, setDescending] = useState(true);
  const [remove, setRemove] = useState<Profile | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [failedProfile, setFailedProfile] = useState<Profile | null>(null),
    [result, setResult] = useState<NetworkTest | null>(null);
  const rows = (query.data || [])
    .filter((p) =>
      `${p.name} ${p.url}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
    )
    .sort(
      (a, b) =>
        (sort === 'references'
          ? a.references - b.references
          : a[sort].localeCompare(b[sort])) * (descending ? -1 : 1),
    );
  const open = (path: string) =>
    void navigate(`/proxy-profiles/${path}${location.search}`);
  const add = (
    <Button
      disabled={(query.data?.length ?? 0) >= 50}
      onClick={() => open('new')}
    >
      <Plus data-icon='inline-start' />
      {$t('proxyProfiles.newProfile')}
    </Button>
  );
  function order(next: typeof sort) {
    setDescending(sort === next ? !descending : false);
    setSort(next);
  }
  async function action(profile: Profile, deleting: boolean) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      if (deleting) {
        await proxyRequest('remove', { id: profile.id });
        setRemove(null);
        await client.invalidateQueries({ queryKey: proxyKey });
        toast.success(() => $t('proxyProfiles.proxyProfileDeleted'));
      } else
        setResult(await proxyRequest<NetworkTest>('test', { id: profile.id }));
    } catch (e) {
      setError(e);
      setFailedProfile(deleting ? null : profile);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title={$t('common.proxyProfiles')}
        description={$t('proxyProfiles.manageProxyProfilesCentrallySelect')}
        actions={query.data?.length ? add : undefined}
      />
      <ProxyError
        error={query.error || projects.error || (!remove && error)}
        retry={
          busy
            ? undefined
            : query.error || projects.error
              ? () => {
                  void query.refetch();
                  void projects.refetch();
                }
              : failedProfile
                ? () => void action(failedProfile, false)
                : undefined
        }
      />
      <ProxyTestResult result={result} />
      {query.isPending ? (
        <Skeleton className='h-40 w-full' />
      ) : query.data?.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{$t('proxyProfiles.noProxyProfilesYet')}</EmptyTitle>
            <EmptyDescription>
              {$t('proxyProfiles.addProfileSelectDataSources')}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{add}</EmptyContent>
        </Empty>
      ) : query.data ? (
        <>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <Input
              aria-label={$t('proxyProfiles.searchNameProxyAddress')}
              placeholder={$t('proxyProfiles.searchNameProxyAddress')}
              className='sm:max-w-xs'
              value={search}
              onChange={(e) => {
                const next = new URLSearchParams(params);
                if (e.target.value) next.set('q', e.target.value);
                else next.delete('q');
                setParams(next, { replace: true });
              }}
            />
            {search && (
              <Button
                variant='ghost'
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.delete('q');
                  setParams(next);
                }}
              >
                {$t('proxyProfiles.clearSearch')}
              </Button>
            )}
          </div>
          {query.data.length >= 50 && (
            <p className='text-sm text-muted-foreground'>
              {$t('proxyProfiles.addUp50ProxyProfiles')}
            </p>
          )}
          {!rows.length ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>
                  {$t('proxyProfiles.noMatchingProfiles')}
                </EmptyTitle>
                <EmptyDescription>
                  {$t('proxyProfiles.tryAnotherKeywordClearSearch')}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead
                    aria-sort={
                      sort === 'name'
                        ? descending
                          ? 'descending'
                          : 'ascending'
                        : 'none'
                    }
                  >
                    <Button variant='ghost' onClick={() => order('name')}>
                      {$t('common.name')}
                      {sort === 'name' ? (descending ? ' ↓' : ' ↑') : ''}
                    </Button>
                  </TableHead>
                  <TableHead>{$t('proxyProfiles.proxyAddress')}</TableHead>
                  <TableHead
                    className='text-right'
                    aria-sort={
                      sort === 'references'
                        ? descending
                          ? 'descending'
                          : 'ascending'
                        : 'none'
                    }
                  >
                    <Button variant='ghost' onClick={() => order('references')}>
                      {$t('proxyProfiles.references')}
                      {sort === 'references' ? (descending ? ' ↓' : ' ↑') : ''}
                    </Button>
                  </TableHead>
                  <TableHead>
                    <span className='sr-only'>{$t('common.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <ClippedText text={p.name} />
                    </TableCell>
                    <TableCell>
                      <ClippedText
                        text={
                          p.kind === 'mock'
                            ? `${$t('networkProfiles.mock')} · ${$t(scenarioLabels[p.mock?.scenario ?? 'normal'])}`
                            : p.url
                        }
                      />
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {p.references ? (
                        <>
                          <Button
                            variant='link'
                            aria-label={`${$t('proxyProfiles.viewReferences')} ${p.name}`}
                            aria-expanded={expanded === p.id}
                            onClick={() =>
                              setExpanded(expanded === p.id ? null : p.id)
                            }
                          >
                            {p.references.toLocaleString(getCurrentLocale())}
                          </Button>
                          {expanded === p.id && (
                            <ul className='flex flex-col items-end gap-1'>
                              {p.referenceDetails.map((ref) => (
                                <li key={`${ref.projectId}:${ref.connection}`}>
                                  <Button
                                    variant='link'
                                    className='h-auto whitespace-normal text-right'
                                    onClick={() =>
                                      switchProject(
                                        Number(ref.projectId),
                                        `/connections?source=${Object.keys(sourceConnection).find((source) => sourceConnection[source] === ref.connection)}`,
                                      )
                                    }
                                  >
                                    {projects.data?.find(
                                      (project) =>
                                        String(project.id) === ref.projectId,
                                    )?.name || ref.projectId}
                                    {' · '}
                                    {$t(connectionLabels[ref.connection])}
                                  </Button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </>
                      ) : (
                        0
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button
                              variant='ghost'
                              size='icon-sm'
                              aria-label={`${$t('common.actions')} ${p.name}`}
                              disabled={busy}
                            />
                          }
                        >
                          <MoreHorizontal />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align='end'>
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              onClick={() => void action(p, false)}
                            >
                              <Cable />
                              {$t('common.testConnection')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => open(`${p.id}/edit`)}
                            >
                              <Pencil />
                              {$t('common.edit')}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuGroup>
                            <DropdownMenuItem
                              variant='destructive'
                              disabled={p.references > 0}
                              onClick={() => {
                                setError(null);
                                setRemove(p);
                              }}
                            >
                              <Trash2 />
                              {p.references
                                ? $t('proxyProfiles.useCannotDelete')
                                : $t('common.delete')}
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      ) : null}
      <AlertDialog
        open={!!remove}
        onOpenChange={(open) => {
          if (!open && !busy) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {$t('proxyProfiles.deleteProxyProfile')}「{remove?.name}」？
            </AlertDialogTitle>
            <AlertDialogDescription>
              {$t('proxyProfiles.deletionCannotUndoneRemoveReferences')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ProxyError error={error} />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {$t('common.cancel')}
            </AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={busy}
              onClick={() => remove && void action(remove, true)}
            >
              {busy ? $t('common.working') : $t('common.delete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Outlet />
    </>
  );
}

function ClippedText({ text }: { text: string }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [clipped, setClipped] = useState(false);
  const check = () => {
    const el = textRef.current;
    setClipped(!!el && el.scrollWidth > el.clientWidth);
  };
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            ref={textRef}
            tabIndex={0}
            className='block max-w-48 truncate'
            onMouseEnter={check}
            onFocus={check}
          />
        }
      >
        {text}
      </TooltipTrigger>
      {clipped && (
        <TooltipContent className='max-w-xs break-all'>{text}</TooltipContent>
      )}
    </Tooltip>
  );
}
