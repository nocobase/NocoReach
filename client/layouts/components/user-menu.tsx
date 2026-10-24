import { useAuthenticationErrorResolver } from '@nocobase/app-plugin-authentication/client/actions';
import { useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { useAuthentication } from '@nocobase/app-plugin-authentication/client';
import { LogOut, Mail, TerminalIcon, UserRound } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { Link } from 'react-router';
import { $t, useNocoReachLocale } from '#i18n';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';

import { AgentSetupDialog } from '#components/agent-setup-dialog';
import { usePendingInvitationCount } from '#pages/access/api';

import { DemoAccountMenu } from '@nocobase/app-plugin-demo-mode/client/account-menu';
import { AppVersion } from './app-version.js';
import { LanguageSwitcher } from './language-switcher.js';

export function UserMenu(): ReactElement {
  useNocoReachLocale();
  const {
    client,
    session,
    isPending: isLoading,
    refresh,
  } = useAuthentication();
  const identity = session?.user
    ? {
        id: session.user.id,
        fullName: session.user.name,
        email: session.user.email,
        avatar: session.user.image ?? undefined,
      }
    : null;
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const [agentSetupOpen, setAgentSetupOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const { t } = useTranslation();
  const toaster = useToaster();
  const resolveError = useAuthenticationErrorResolver();
  const invitations = usePendingInvitationCount(!!identity && !isLoading);

  const name =
    identity?.fullName ||
    identity?.email ||
    t('account.fallback', { defaultValue: 'Account' });
  const initials = getInitials(name);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          ref={accountTriggerRef}
          openOnHover
          // Long enough that dismissing a full-height drawer under the pointer
          // doesn't immediately reopen this menu; still feels instant on hover.
          delay={180}
          aria-label={t('account.openMenu', {
            defaultValue: 'Open account menu',
          })}
          className='flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-background/60 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50'
        >
          {identity?.avatar ? (
            <img
              src={identity.avatar}
              alt=''
              className='size-full rounded-full object-cover'
            />
          ) : (
            <span className='grid size-full place-items-center rounded-full bg-muted text-xs font-medium text-muted-foreground'>
              {isLoading ? <UserRound className='size-4' /> : initials}
            </span>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align='end'
          className='w-auto min-w-64 max-w-[calc(100vw-2rem)]'
        >
          <div className='px-2 py-1.5'>
            <p className='truncate text-sm font-medium'>{name}</p>
            {identity?.email ? (
              <p className='truncate text-xs text-muted-foreground'>
                {identity.email}
              </p>
            ) : null}
          </div>
          <DropdownMenuSeparator />
          {/* Only an invitation still waiting for this account makes the page worth a menu entry; the emailed link
              opens it directly either way. */}
          {identity && !isLoading && invitations > 0 ? (
            <DropdownMenuItem
              className='gap-2'
              render={<Link to='/member-invitations' />}
            >
              <Mail className='size-4' />
              {$t('accessMembers.yourInvitations')}
              <span className='ml-auto rounded-full bg-attention px-1.5 text-xs leading-4 text-attention-foreground tabular-nums'>
                {invitations > 99 ? '99+' : invitations}
              </span>
            </DropdownMenuItem>
          ) : null}
          {identity && !isLoading ? (
            <DropdownMenuItem
              className='gap-2'
              onClick={() => setAgentSetupOpen(true)}
            >
              <TerminalIcon className='size-4' />
              {t('agentSetup.title')}
            </DropdownMenuItem>
          ) : null}
          <LanguageSwitcher />
          <DropdownMenuSeparator />
          {/* A demo's accounts, to switch between before signing out. */}
          <DemoAccountMenu />
          <DropdownMenuItem
            disabled={isLoggingOut}
            onClick={() => {
              void (async () => {
                setIsLoggingOut(true);
                try {
                  // Better Auth returns API failures as data rather than throwing.
                  const result = await client.signOut();
                  if (result.error) {
                    toaster.show({
                      type: 'error',
                      title:
                        resolveError(result.error)?.message ??
                        t('account.signOutFailed', {
                          defaultValue: 'Unable to sign out. Please try again.',
                        }),
                    });
                    return;
                  }
                  await refresh();
                } catch (error) {
                  toaster.show({
                    type: 'error',
                    title:
                      resolveError(error)?.message ??
                      t('account.signOutFailed', {
                        defaultValue: 'Unable to sign out. Please try again.',
                      }),
                  });
                } finally {
                  setIsLoggingOut(false);
                }
              })();
            }}
            className='gap-2'
          >
            <LogOut className='size-4' />
            {isLoggingOut
              ? t('account.signingOut', { defaultValue: 'Signing out…' })
              : t('account.signOut', { defaultValue: 'Sign out' })}
          </DropdownMenuItem>
          {/* The version, for support; it used to sit in the sidebar footer under the template's name. */}
          <DropdownMenuSeparator />
          <AppVersion />
        </DropdownMenuContent>
      </DropdownMenu>
      {identity && !isLoading ? (
        <AgentSetupDialog
          key={identity.id}
          open={agentSetupOpen}
          onOpenChange={setAgentSetupOpen}
          returnFocus={accountTriggerRef}
        />
      ) : null}
    </>
  );
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return '?';
  }
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('');
}
