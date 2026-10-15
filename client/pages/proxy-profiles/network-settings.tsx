import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $t } from '#i18n';
import { toast } from '#lib/toast';
import { PageHeader } from '#components/reach/page';
import { NotesTip } from '#components/reach/info-tip';
import { Button } from '#components/ui/button';
import { Card, CardContent, CardFooter } from '#components/ui/card';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Skeleton } from '#components/ui/skeleton';
import {
  networkKey,
  proxyKey,
  proxyRequest,
  type NetworkSettings,
} from './api';
import { ProxyError } from './feedback';

/** 设置 › 网络: the deployment's one proxy. Every project and connection uses it unless a connection turns it off. */
export function NetworkSettingsForm() {
  const query = useQuery({
    queryKey: networkKey,
    queryFn: () => proxyRequest<NetworkSettings>('network'),
  });
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
      <ProxyError error={query.error} retry={() => void query.refetch()} />
      {query.isPending ? (
        <Skeleton
          className='h-64 w-full max-w-2xl'
          role='status'
          aria-label={$t('common.loading')}
        />
      ) : query.data ? (
        <ProxyForm
          // A saved change reloads the form with the new revision.
          key={query.data.proxy?.revision ?? 0}
          saved={query.data.proxy}
        />
      ) : null}
    </>
  );
}

function ProxyForm({ saved }: { saved: NetworkSettings['proxy'] }) {
  const client = useQueryClient(),
    id = useId();
  const [url, setUrl] = useState(saved?.url ?? ''),
    [username, setUsername] = useState(saved?.username ?? ''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const changed =
    url.trim() !== (saved?.url ?? '') ||
    username.trim() !== (saved?.username ?? '') ||
    !!password;
  async function save() {
    setBusy(true);
    setError(null);
    try {
      const next = await proxyRequest<NetworkSettings>('saveNetwork', {
        url: url.trim(),
        username: username.trim(),
        password: password || undefined,
        revision: saved?.revision,
      });
      // Connection drawers and the profile list read the same settings.
      await client.invalidateQueries({ queryKey: proxyKey });
      toast.success(() =>
        $t(next.proxy ? 'network.saved' : 'network.directSaved'),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className='max-w-2xl'>
      <CardContent className='flex flex-col gap-5'>
        <ProxyError error={error} />
        <div className='flex flex-col gap-2'>
          <Label htmlFor={`${id}-url`}>
            {$t('proxyProfiles.proxyAddress')}
          </Label>
          <Input
            id={`${id}-url`}
            value={url}
            placeholder='http://proxy.example.com:8080'
            autoComplete='off'
            onChange={(e) => setUrl(e.target.value)}
          />
          <p className='text-sm text-muted-foreground'>
            {$t('network.addressHelp')}
          </p>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor={`${id}-user`}>{$t('proxyProfiles.username')}</Label>
            <Input
              id={`${id}-user`}
              value={username}
              autoComplete='off'
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor={`${id}-password`}>
              {$t('proxyProfiles.password')}
            </Label>
            <Input
              id={`${id}-password`}
              type='password'
              value={password}
              autoComplete='new-password'
              placeholder={
                saved?.hasPassword ? $t('network.passwordSaved') : undefined
              }
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        </div>
        <p className='text-sm text-muted-foreground'>
          {$t('network.authHelp')}
        </p>
      </CardContent>
      <CardFooter className='justify-end'>
        <Button disabled={busy || !changed} onClick={() => void save()}>
          {busy ? $t('common.working') : $t('common.save')}
        </Button>
      </CardFooter>
    </Card>
  );
}
