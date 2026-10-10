import { useId, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $t } from '@/i18n';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  proxyKey,
  proxyRequest,
  sourceConnection,
  type Profile,
  type NetworkTest,
} from '@/pages/proxy-profiles/api';
import { ProxyError, ProxyTestResult } from '@/pages/proxy-profiles/feedback';

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
  const [draft, setDraft] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [result, setResult] = useState<NetworkTest | null>(null);
  const saved = selections.data?.[connection] || 'direct';
  const choice = draft ?? saved;
  const changed = choice !== saved;
  async function act(test: boolean) {
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
        await proxyRequest('select', {
          projectId,
          connection,
          profileId: choice === 'direct' ? null : choice,
        });
        await client.invalidateQueries({ queryKey: proxyKey });
        setDraft(null);
        toast.success($t('网络出口已保存'));
      }
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>{$t('网络出口')}</CardTitle>
        <CardDescription>
          {$t('选择此接入使用的代理 Profile，默认直连。')}
          {connection === 'google' &&
            ` ${$t('GA4 与 Search Console 共用此设置。')}`}
          {connection === 'github' &&
            ` ${$t('GitHub 仓库、Traffic 与 Discussions 共用此设置。')}`}
          {connection === 'dataforseo' &&
            ` ${$t('关键词、排名、Trends、Reddit 和 AI 搜索共用 DataForSEO 出口。')}`}
        </CardDescription>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <ProxyError
          error={error || profiles.error || selections.error}
          retry={() => {
            void profiles.refetch();
            void selections.refetch();
          }}
        />
        {profiles.isPending || selections.isPending ? (
          <Skeleton className='h-9 w-full' />
        ) : profiles.data && selections.data ? (
          <>
            <Label htmlFor={fieldId}>{$t('代理 Profile')}</Label>
            <Select
              value={choice}
              onValueChange={(v) => {
                if (v) {
                  setDraft(v);
                  setResult(null);
                }
              }}
              disabled={busy}
            >
              <SelectTrigger id={fieldId} className='w-full text-foreground'>
                <SelectValue>
                  {choice === 'direct'
                    ? $t('直连')
                    : profiles.data.find((p) => p.id === choice)?.name ||
                      $t('代理 Profile 不存在')}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value='direct'>{$t('直连')}</SelectItem>
                  {profiles.data.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <span className='whitespace-normal break-all'>
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <p className='text-sm text-muted-foreground'>
              {$t('代理失败时不会自动切换直连。测试使用已保存的出口。')}
            </p>
            {changed && (
              <p role='status' className='text-sm text-muted-foreground'>
                {$t('请先保存网络出口，再测试连接。')}
              </p>
            )}
            <Link to='/proxy-profiles' className='text-sm underline'>
              {$t('管理代理 Profile')}
            </Link>
          </>
        ) : null}
        <ProxyTestResult result={result} />
      </CardContent>
      <CardFooter className='justify-end gap-2'>
        <Button
          variant='outline'
          disabled={busy || changed || !selections.data || !profiles.data}
          onClick={() => void act(true)}
        >
          {$t('测试连接')}
        </Button>
        <Button
          disabled={busy || !changed || !selections.data || !profiles.data}
          onClick={() => void act(false)}
        >
          {busy ? $t('处理中…') : $t('保存')}
        </Button>
      </CardFooter>
    </Card>
  );
}
