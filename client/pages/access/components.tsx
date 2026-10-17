import { ApiClientError } from '@nocobase/app-client';
import { Link } from 'react-router';
import { RefreshCw, MoreHorizontal } from 'lucide-react';
import { type ReactNode } from 'react';
import { $t } from '#i18n';
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
export function Pager({
  total,
  page,
  onChange,
}: {
  total: number;
  page: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / 20));
  return (
    <div className='flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground'>
      <span>
        {$t('accessMembers.pagination', { 0: total, 1: page + 1, 2: pages })}
      </span>
      <Button
        variant='outline'
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        {$t('accessMembers.previous')}
      </Button>
      <Button
        variant='outline'
        disabled={page + 1 >= pages}
        onClick={() => onChange(page + 1)}
      >
        {$t('accessMembers.next')}
      </Button>
    </div>
  );
}
