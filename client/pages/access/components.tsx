import { ApiClientError } from '@nocobase/app-client';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  RefreshCw,
} from 'lucide-react';
import { type ReactNode } from 'react';
import { $t } from '#i18n';
import { usePageTab } from '#hooks/use-page-tab';
import { PageHeader } from '#components/reach/page';
import { Button } from '#components/ui/button';
import { Alert, AlertDescription } from '#components/ui/alert';
import { Checkbox } from '#components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
} from '#components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '#components/ui/tooltip';
import { accessMessage, roleTitle, type BusinessRole } from './api';
import { lineTabClass, lineTabListClass } from '#components/reach/line-tabs';
import { formatCount } from '#lib/format';

export function AccessError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  if (!error) return null;
  const status = error instanceof ApiClientError ? error.status : 500;
  return (
    <Alert variant='destructive'>
      <AlertDescription className='flex flex-wrap items-center gap-3'>
        {accessMessage(error)}
        {status === 401 ? (
          <Link to='/login'>{$t('common.signAgain')}</Link>
        ) : retry && ![403, 404, 409].includes(status) ? (
          <Button variant='outline' onClick={retry}>
            {$t('common.retry')}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
export function Refresh({
  busy,
  onClick,
}: {
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant='outline'
            size='icon'
            aria-label={$t('accessMembers.refresh')}
            disabled={busy}
            onClick={onClick}
          />
        }
      >
        <RefreshCw className={busy ? 'animate-spin' : ''} />
      </TooltipTrigger>
      <TooltipContent>{$t('accessMembers.refresh')}</TooltipContent>
    </Tooltip>
  );
}
export function RowMenu({
  name,
  children,
}: {
  name: string;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant='ghost'
            size='icon-sm'
            aria-label={$t('accessMembers.actionsFor', { 0: name })}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-auto min-w-40'>
        <DropdownMenuGroup>{children}</DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
export function RolePicker({
  roles,
  selected,
  onChange,
  disabled = false,
}: {
  roles: BusinessRole[];
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className='flex flex-col gap-3'
      role='group'
      aria-label={$t('accessMembers.roles')}
    >
      {roles.map((role) => (
        <label key={role.key} className='flex items-start gap-2 text-sm'>
          <Checkbox
            checked={selected.includes(role.key)}
            disabled={disabled || !role.assignable}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...selected, role.key]
                  : selected.filter((key) => key !== role.key),
              )
            }
          />
          <span>
            {roleTitle(role)}
            {!role.assignable ? (
              <span className='block text-xs text-muted-foreground'>
                {$t('accessMembers.cannotGrant')}
              </span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}
// The same footer as the data tables' (TablePagination): the rows shown, the page, and previous and next as icons;
// nothing at all while everything fits on one page.
export function Pager({
  total,
  page,
  onChange,
}: {
  total: number;
  page: number;
  onChange: (page: number) => void;
}) {
  const size = 20;
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  const start = page * size + 1;
  const end = Math.min(total, (page + 1) * size);
  return (
    <div className='flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground tabular-nums'>
      <span>
        {$t('tablePagination.rows', {
          0: formatCount(start),
          1: formatCount(end),
          2: formatCount(total),
        })}
      </span>
      <div className='flex items-center gap-2'>
        <span>
          {$t('tablePagination.page', {
            0: formatCount(page + 1),
            1: formatCount(pages),
          })}
        </span>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={$t('tablePagination.previous')}
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft />
        </Button>
        <Button
          variant='ghost'
          size='icon-sm'
          aria-label={$t('tablePagination.next')}
          disabled={page + 1 >= pages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
export type AccessTab = 'members' | 'invitations' | 'roles';
/** Members, pending invitations and roles share one page, switched by `?tab=`; its description covers the whole page
 * and stays the same on every tab (2026-10-22 decision D3). */
export function AccessHeader({
  tab,
  invitations,
  actions,
  onChange,
}: {
  tab: AccessTab;
  invitations: boolean;
  actions: ReactNode;
  onChange?: () => void;
}) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Invitations is last: it appears once the member grant is known, and must not shift the other tabs.
  const tabs: [AccessTab, string][] = [
    ['members', 'accessMembers.members'],
    ['roles', 'accessMembers.roles'],
    ['invitations', 'accessMembers.pending'],
  ];
  usePageTab($t(tabs.find(([key]) => key === tab)![1]));
  return (
    <>
      <PageHeader
        title={$t('accessMembers.title')}
        description={$t('accessMembers.pageDescription')}
        actions={actions}
      />
      <nav
        className={lineTabListClass}
        aria-label={$t('accessMembers.memberViews')}
      >
        {tabs.map(([key, label]) =>
          key !== 'invitations' || invitations ? (
            <button
              type='button'
              key={key}
              className={lineTabClass}
              onClick={() => {
                if (tab === key) return;
                const next = new URLSearchParams(params);
                next.set('tab', key);
                // Member and role searches match different names, so a query never follows across them.
                if ((tab === 'roles') !== (key === 'roles')) next.delete('q');
                // Leave any open member or role form: it belongs to the tab being left.
                void navigate({ pathname: '.', search: `?${next}` });
                onChange?.();
              }}
              aria-current={tab === key ? 'page' : undefined}
            >
              {$t(label)}
            </button>
          ) : null,
        )}
      </nav>
    </>
  );
}
