import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { $t } from '#i18n';
import { toast } from '#lib/toast';
import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Checkbox } from '#components/ui/checkbox';
import {
  Field,
  FieldLabel,
  FieldDescription,
  FieldGroup,
} from '#components/ui/field';
import { Skeleton } from '#components/ui/skeleton';
import { proxyKey, proxyRequest, type Profile } from './api';
import { ProxyError } from './feedback';

export default function EditProfile() {
  const { profileId } = useParams(),
    navigate = useNavigate(),
    location = useLocation(),
    client = useQueryClient();
  const query = useQuery({
    queryKey: [...proxyKey, profileId],
    queryFn: () => proxyRequest<Profile>('get', { id: profileId }),
    enabled: !!profileId,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
  });
  if (profileId && (query.isPending || query.isFetching || query.error))
    return (
      <RouteDialog
        title={$t('编辑代理 Profile')}
        closeTo={`/proxy-profiles${location.search}`}
      >
        {query.error ? (
          <>
            <ProxyError
              error={query.error}
              retry={() => void query.refetch()}
            />
            <Button
              variant='outline'
              onClick={() => {
                void client.invalidateQueries({ queryKey: proxyKey });
                void navigate(`/proxy-profiles${location.search}`);
              }}
            >
              {$t('返回列表')}
            </Button>
          </>
        ) : (
          <Skeleton className='h-64 w-full' />
        )}
      </RouteDialog>
    );
  return (
    <ProfileForm
      key={profileId || 'new'}
      profile={profileId ? query.data : undefined}
    />
  );
}
function ProfileForm({ profile }: { profile?: Profile }) {
  const profileId = profile?.id;
  const navigate = useNavigate(),
    location = useLocation(),
    client = useQueryClient();
  const [form, setForm] = useState({
    name: profile?.name ?? '',
    url: profile?.url ?? '',
    username: profile?.username ?? '',
    password: '',
    clearAuth: false,
  });
  const [revision] = useState(profile?.revision);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  const close = () => void navigate(`/proxy-profiles${location.search}`);
  function validate(value: typeof form) {
    const issues: Record<string, string> = {};
    if (!value.name.trim()) issues.name = $t('请填写名称');
    try {
      const u = new URL(value.url);
      if (
        !['http:', 'https:'].includes(u.protocol) ||
        !u.hostname ||
        u.username ||
        u.password ||
        u.pathname !== '/' ||
        u.search ||
        u.hash
      )
        throw new Error();
    } catch {
      issues.url = $t(
        '请输入 HTTP 或 HTTPS 代理地址，不要在地址中包含账号密码',
      );
    }
    if (!value.clearAuth && value.password && !value.username)
      issues.username = $t('使用密码时请填写用户名');
    return issues;
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    const issues = validate(form);
    setErrors(issues);
    if (Object.keys(issues).length) {
      formRef.current
        ?.querySelector<HTMLInputElement>(`[name="${Object.keys(issues)[0]}"]`)
        ?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await proxyRequest('save', {
        ...form,
        ...(profileId ? { id: profileId, revision } : {}),
      });
      await client.invalidateQueries({ queryKey: proxyKey });
      toast.success($t('代理 Profile 已保存'));
      close();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <RouteDialog
      title={profileId ? $t('编辑代理 Profile') : $t('新增 Profile')}
      description={$t(
        '支持 HTTP/HTTPS 正向代理，也可填写 Clash 的 HTTP 代理端口。',
      )}
      beforeClose={() => !busy}
      closeTo={`/proxy-profiles${location.search}`}
      footer={
        <>
          <Button variant='outline' disabled={busy} onClick={close}>
            {$t('取消')}
          </Button>
          <Button type='submit' form='proxy-profile-form' disabled={busy}>
            {busy ? $t('处理中…') : $t('保存')}
          </Button>
        </>
      }
    >
      <form
        id='proxy-profile-form'
        ref={formRef}
        onSubmit={(e) => void save(e)}
        noValidate
        className='flex flex-col gap-4'
      >
        <ProxyError error={error} />
        {(error as { status?: number })?.status === 409 && (
          <p className='text-sm text-muted-foreground'>
            {$t('请检查名称是否重复；若配置已更新，请关闭后重新打开编辑。')}
          </p>
        )}
        <FieldGroup>
          {(['name', 'url', 'username', 'password'] as const).map((key) => (
            <Field key={key} data-invalid={!!errors[key]}>
              <FieldLabel htmlFor={`proxy-${key}`}>
                {$t(
                  {
                    name: '名称',
                    url: '代理地址',
                    username: '用户名',
                    password: '密码',
                  }[key],
                )}
                {['name', 'url'].includes(key) ? ' *' : ''}
              </FieldLabel>
              <Input
                id={`proxy-${key}`}
                name={key}
                type={key === 'password' ? 'password' : 'text'}
                autoComplete={key === 'password' ? 'new-password' : 'off'}
                disabled={
                  busy ||
                  (form.clearAuth && ['username', 'password'].includes(key))
                }
                required={['name', 'url'].includes(key)}
                maxLength={
                  { name: 80, url: 2048, username: 256, password: 1024 }[key]
                }
                value={form[key]}
                aria-invalid={!!errors[key]}
                aria-describedby={`proxy-${key}-help`}
                placeholder={
                  key === 'url' ? 'http://proxy.example.com:7890' : undefined
                }
                onChange={(e) => {
                  const next = { ...form, [key]: e.target.value };
                  setForm(next);
                  if (Object.keys(errors).length) setErrors(validate(next));
                }}
              />
              <FieldDescription id={`proxy-${key}-help`}>
                {errors[key] ||
                  (key === 'password'
                    ? profile?.hasPassword
                      ? $t('已保存密码，留空保留；勾选下方选项可清除认证。')
                      : $t('认证信息加密保存，不会返回到浏览器。')
                    : '')}
              </FieldDescription>
            </Field>
          ))}
        </FieldGroup>
        {profileId && (
          <Field orientation='horizontal'>
            <Checkbox
              id='clear-proxy-auth'
              checked={form.clearAuth}
              disabled={busy}
              onCheckedChange={(checked) =>
                setForm({ ...form, clearAuth: checked === true })
              }
            />
            <FieldLabel htmlFor='clear-proxy-auth'>
              {$t('保存时清除用户名和密码')}
            </FieldLabel>
          </Field>
        )}
      </form>
    </RouteDialog>
  );
}
