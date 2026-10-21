import { getCurrentLocale } from '#i18n';
// Columns and values shared by the 小红书, Bilibili and YouTube data tables (collector-content.tsx).
import type { ReactNode } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { SortableHeader } from '#components/seo/sortable-header';
import { formatDate } from '#lib/format';

/** A failed load offers Retry unless retrying cannot help: signed out, no access, or no such project. */
export const retryable = (error: unknown) =>
  !(
    error &&
    typeof error === 'object' &&
    'status' in error &&
    [401, 403, 404].includes(Number(error.status))
  );

/** A count read from the platform; unknown stays "—", never 0. */
export const countText = (value: number | null | undefined) =>
  typeof value === 'number' ? value.toLocaleString(getCurrentLocale()) : '—';
export const shortDate = (value: string | null | undefined) =>
  formatDate(value);

const right = {
  headerClassName: 'hidden text-right md:table-cell',
  cellClassName: 'hidden text-right tabular-nums md:table-cell',
} as const;

/** A count column, sorted on the server; hidden on phones, where the title cell carries a summary line. */
export function countColumn<T>(
  id: string,
  label: string,
  get: (row: T) => ReactNode,
): ColumnDef<T> {
  return {
    id,
    accessorFn: () => undefined,
    sortDescFirst: true,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={label}
        align='right'
        help={false}
      />
    ),
    cell: ({ row }) => get(row.original),
    meta: right,
  };
}
/** The publication column (`published`), with a muted second line such as when the record was collected. */
export function dateColumn<T>(
  label: string,
  get: (row: T) => ReactNode,
  sub?: (row: T) => ReactNode,
): ColumnDef<T> {
  return {
    id: 'published',
    accessorFn: () => undefined,
    sortDescFirst: true,
    header: ({ column }) => (
      <SortableHeader
        column={column}
        label={label}
        align='right'
        help={false}
      />
    ),
    cell: ({ row }) => (
      <span className='flex flex-col items-end'>
        <span>{get(row.original)}</span>
        {sub ? (
          <span className='text-xs text-muted-foreground'>
            {sub(row.original)}
          </span>
        ) : null}
      </span>
    ),
    meta: right,
  };
}
/** The record itself: wraps fully (never cut off), and on phones adds the counts the hidden columns show. */
export function titleColumn<T>(
  label: string,
  get: (row: T) => ReactNode,
  summary: (row: T) => ReactNode,
): ColumnDef<T> {
  return {
    id: 'title',
    enableSorting: false,
    header: () => label,
    cell: ({ row }) => (
      <div className='flex min-w-0 flex-col gap-1'>
        {get(row.original)}
        <p className='text-xs text-muted-foreground md:hidden'>
          {summary(row.original)}
        </p>
      </div>
    ),
    meta: {
      headerClassName: 'w-full',
      cellClassName: 'w-full min-w-48 whitespace-normal break-words',
    },
  };
}
