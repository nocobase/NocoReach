import { useToaster } from '@nocobase/app-client';
import { useDemoMode } from '@nocobase/app-plugin-demo-mode/client';
import { useDemoAccounts } from '@nocobase/app-plugin-demo-mode/client/accounts';
import { DemoModeMenu } from '@nocobase/app-plugin-demo-mode/client/menu';
import { useTranslation } from '@nocobase/i18n/client';
import { useId, useState } from 'react';
import { useLocation } from 'react-router';
import { useMediaQuery } from '#hooks/use-media-query';
import { $t, useNocoReachLocale } from '#i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';

/** Keep the desktop entry; narrow screens use the public account hook with a short, text-based status. */
export function HeaderDemoModeMenu() {
  const compact = useMediaQuery('(max-width: 1279px)');
  const enabled = useDemoMode();
  return compact && enabled ? <CompactDemoModeMenu /> : <DemoModeMenu />;
}

function CompactDemoModeMenu() {
  useNocoReachLocale();
  const { accounts, signIn } = useDemoAccounts();
  const { t } = useTranslation('@nocobase/app-plugin-demo-mode');
  const toaster = useToaster();
  const location = useLocation();
  const descriptionId = useId();
  const [pending, setPending] = useState<string | null>(null);
  const current = accounts?.find((account) => account.current);

  const enter = async (username: string) => {
    if (pending !== null || username === current?.username) return;
    setPending(username);
    try {
      await signIn(
        username,
        `${location.pathname}${location.search}${location.hash}`,
      );
    } catch {
      setPending(null);
      toaster.show({ type: 'error', title: t('accounts.failed') });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        openOnHover
        delay={0}
        aria-label={
          accounts?.length
            ? `${t('menu.label')} · ${t('menu.switchAccount')}`
            : t('menu.label')
        }
        className='inline-flex h-8 w-12 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-primary/30 bg-primary/10 px-0.5 text-xs font-medium text-primary outline-none hover:bg-primary/15 focus-visible:ring-3 focus-visible:ring-ring/50'
      >
        <span className='truncate'>{$t('demoData.badge')}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align='end'
        aria-describedby={descriptionId}
        className='w-72 max-w-[calc(100vw-2rem)]'
      >
        <div className='px-2 py-1.5'>
          <p className='text-sm font-medium'>{t('menu.title')}</p>
          <p
            id={descriptionId}
            className='mt-0.5 text-xs text-muted-foreground'
          >
            {t('menu.description')}
            {accounts?.length ? ` ${t('menu.accountsDescription')}` : ''}
          </p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('menu.switchAccount')}</DropdownMenuLabel>
          {accounts?.length ? (
            <DropdownMenuRadioGroup
              value={current?.username ?? ''}
              aria-label={t('menu.switchAccount')}
              aria-busy={pending !== null}
              onValueChange={(username: string) => void enter(username)}
            >
              {accounts.map((account) => (
                <DropdownMenuRadioItem
                  key={account.username}
                  value={account.username}
                  disabled={pending !== null}
                  closeOnClick={false}
                >
                  <span className='min-w-0'>
                    <span className='block truncate'>{account.name}</span>
                    {account.role ? (
                      <span className='block truncate text-xs text-muted-foreground'>
                        {account.role}
                      </span>
                    ) : null}
                    {pending === account.username ? (
                      <span
                        role='status'
                        className='block text-xs text-muted-foreground'
                      >
                        {t('accounts.entering')}
                      </span>
                    ) : null}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          ) : (
            <p
              role='status'
              className='px-2 py-1.5 text-xs text-muted-foreground'
            >
              {accounts === null
                ? t('menu.loading')
                : t('accounts.unavailable')}
            </p>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
