/* eslint-disable react-refresh/only-export-components -- provider, gates and their existing companion hooks are intentionally colocated */
import { $t } from '#i18n';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from 'react';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { useAuthorizationRevision } from '@nocobase/app-plugin-authorization/client';
import { Info, UserRoundX } from 'lucide-react';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Button } from '#components/ui/button';
import { ListSkeleton, LoadError } from '#components/reach/states';

// NocoReach membership remains an application policy; the official provider owns session invalidation.
export type Role = 'admin' | 'member';
export type Me = { id: string; name: string; role: Role | null };
type MeState = { me?: Me; error?: string; reload: () => void };
const Context = createContext<MeState | null>(null);

export function MeProvider({ children }: PropsWithChildren): ReactNode {
  const { session, isPending } = useAuthentication();
  const revision = useAuthorizationRevision();
  if (isPending || !session) return null;
  // A new session or permission revision cannot render the previous member or retain its page state.
  const key = JSON.stringify([session.user.id, session.session.id, revision]);
  return (
    <MemberProvider key={key} userId={session.user.id}>
      {children}
    </MemberProvider>
  );
}

function MemberProvider({
  children,
  userId,
}: PropsWithChildren<{ userId: string }>): ReactElement {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{
    attempt: number;
    me?: Me;
    error?: string;
  }>();
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    void api
      .action<Partial<Me>>('nrMembers', 'me', {
        method: 'POST',
        body: {},
        unwrap: 'data',
        signal: controller.signal,
      })
      .then((value) => {
        if (
          !value ||
          String(value.id ?? '') !== userId ||
          (value.role !== 'admin' &&
            value.role !== 'member' &&
            value.role !== null)
        ) {
          throw new Error('成员身份响应无效，请重试。');
        }
        if (active)
          setState({
            attempt,
            me: {
              id: userId,
              name: String(value.name ?? ''),
              role: value.role ?? null,
            },
          });
      })
      .catch(() => {
        if (active)
          setState({
            attempt,
            error: '暂时无法确认你的 NocoReach 权限，请重试。',
          });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, userId]);
  const current = state?.attempt === attempt ? state : undefined;
  return (
    <Context.Provider
      value={{
        me: current?.me,
        error: current?.error,
        reload: () => setAttempt((value) => value + 1),
      }}
    >
      {children}
    </Context.Provider>
  );
}

// A task's owner is its assigned human, or its creator before anything happened on it.
export const taskOwner = (t: {
  evidence?: {
    work?: { humanOwnerId?: string } | null;
    createdBy?: { id?: string };
  };
}): string | null =>
  t.evidence?.work?.humanOwnerId ?? t.evidence?.createdBy?.id ?? null;
export function useMe() {
  const value = useContext(Context);
  if (!value) throw new Error('NocoReach member provider is not mounted.');
  const isAdmin = value.me?.role === 'admin';
  const joined = Boolean(value.me?.role);
  return {
    ...value,
    isAdmin,
    can: (ownerId?: string | null) =>
      joined && (isAdmin || !ownerId || String(ownerId) === value.me?.id),
    mine: (ownerId?: string | null) =>
      joined && (ownerId ? String(ownerId) === value.me?.id : isAdmin),
  };
}

export function MemberGate({ children }: { children: ReactNode }): ReactNode {
  const { me, error, reload } = useMe();
  const [leaving, setLeaving] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const { client, refresh } = useAuthentication();
  const logout = async () => {
    setLeaving(true);
    setLogoutError('');
    try {
      // Better Auth reports API errors in the result, just as the shell's account menu handles them.
      const result = await client.signOut();
      if (result.error) throw new Error('Sign-out failed');
      await refresh();
    } catch {
      setLogoutError('退出登录失败，请重试。');
    } finally {
      setLeaving(false);
    }
  };
  if (!me && !error)
    return (
      <div className='p-6 md:p-8'>
        <ListSkeleton rows={4} />
      </div>
    );
  if (me?.role) return children;
  return (
    <div className='grid flex-1 place-items-center p-6 md:p-8'>
      <div
        data-not-joined={!error || undefined}
        className='w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm'
      >
        {error ? (
          <LoadError
            title={$t('无法读取成员权限')}
            message={$t(error)}
            onRetry={reload}
          />
        ) : (
          <>
            <UserRoundX
              className='mx-auto mb-3 size-8 text-muted-foreground'
              aria-hidden='true'
            />
            <h1 className='text-lg font-semibold tracking-tight'>
              {$t('你还没有加入 NocoReach')}
            </h1>
            <p className='mt-1 mb-5 text-sm text-muted-foreground'>
              {$t('请管理员在“设置 · 成员”里给你选角色，选好后刷新这一页。')}
            </p>
            <Button variant='outline' onClick={reload}>
              {$t('重新检查')}
            </Button>
          </>
        )}
        <Button
          className='mt-3'
          variant='outline'
          disabled={leaving}
          onClick={() => void logout()}
        >
          {$t('退出登录')}
        </Button>
        {logoutError ? (
          <p role='alert' className='mt-3 text-sm text-destructive'>
            {$t(logoutError)}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function AdminOnlyNote(): ReactElement | null {
  const { isAdmin } = useMe();
  if (isAdmin) return null;
  return (
    <p
      data-admin-only
      className='flex items-center gap-1.5 text-sm text-muted-foreground'
    >
      <Info className='size-3.5 shrink-0' aria-hidden='true' />
      {$t('只有管理员能修改这里的设置')}
    </p>
  );
}
