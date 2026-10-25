import { $t } from '#i18n';
// Ported from every-app/open-seo db8bde1 src/client/components/table/DataTable.tsx (MIT).
// Changes: NocoReach ui components and empty state, Chinese copy, no sticky-scroll container.
import {
  flexRender,
  getCoreRowModel,
  getExpandedRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type Table as TanStackTable,
  type TableOptions,
} from '@tanstack/react-table';
import { useRef, type MouseEvent, type MutableRefObject, type ReactNode } from 'react';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Skeleton } from '#components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '#components/ui/table';
import { applyShiftRangeSelection, type SelectionAnchor } from './table-selection';

type AppColumnMeta<TData> = {
  headerClassName?: string;
  cellClassName?: string | ((row: Row<TData>) => string | undefined);
};

// Read through a cast rather than a global ColumnMeta augmentation, which would leak into every table in the app.
const metaOf = <TData,>(meta: unknown) => meta as AppColumnMeta<TData> | undefined;

type UseDataTableOptions<TData> = Omit<TableOptions<TData>, 'getCoreRowModel'> & {
  withSorting?: boolean;
  withExpanded?: boolean;
  withPagination?: boolean;
};

export function useDataTable<TData>(options: UseDataTableOptions<TData>) {
  const { withSorting, withExpanded, withPagination, ...tableOptions } = options;
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Table intentionally exposes a mutable instance; this adapter is not compiler-memoized.
  return useReactTable({
    ...tableOptions,
    getCoreRowModel: getCoreRowModel(),
    ...(withSorting ? { getSortedRowModel: getSortedRowModel() } : {}),
    ...(withExpanded ? { getExpandedRowModel: getExpandedRowModel() } : {}),
    ...(withPagination ? { getPaginationRowModel: getPaginationRowModel() } : {}),
  });
}

export function useSelectionAnchor(): MutableRefObject<SelectionAnchor | null> {
  return useRef<SelectionAnchor | null>(null);
}

export function makeSelectionColumn<TData>(anchorRef: MutableRefObject<SelectionAnchor | null>): ColumnDef<TData> {
  return {
    id: 'select',
    size: 32,
    enableSorting: false,
    meta: { headerClassName: 'w-10', cellClassName: 'w-10' },
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        indeterminate={table.getIsSomeRowsSelected()}
        disabled={table.getRowModel().rows.length === 0}
        onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
        aria-label={$t('common.select')}
      />
    ),
    cell: ({ row, table }) => <SelectionCheckbox row={row} table={table} anchorRef={anchorRef} />,
  };
}

function SelectionCheckbox<TData>({
  row,
  table,
  anchorRef,
}: {
  row: Row<TData>;
  table: TanStackTable<TData>;
  anchorRef: MutableRefObject<SelectionAnchor | null>;
}) {
  return (
    <Checkbox
      checked={row.getIsSelected()}
      aria-label={$t('common.selectRow')}
      // The checkbox is a span, so a shift+click would also select page text.
      onMouseDown={(event) => {
        if (event.shiftKey) event.preventDefault();
      }}
      onClick={(event) => {
        event.stopPropagation();
        // A shift+click selects the range, so the checkbox must not toggle.
        if (applyShiftRangeSelection(event, row, table, anchorRef)) {
          event.preventBaseUIHandler();
        }
      }}
      onCheckedChange={(checked) => row.toggleSelected(checked)}
    />
  );
}

/**
 * The table body of a data table: sortable headers, skeleton rows while the
 * first page loads, and an empty state that says whether filters hide rows.
 * The page owns sorting, pagination, filters and selection.
 */
export function DataTable<TData>({
  table,
  isLoading = false,
  empty,
  isFiltered = false,
  onClearFilters,
  toolbar,
  footer,
  onRowClick,
}: {
  table: TanStackTable<TData>;
  isLoading?: boolean;
  /** Shown when there are no rows and no filters. */
  empty: { title: string; description?: string; action?: ReactNode };
  isFiltered?: boolean;
  onClearFilters?: () => void;
  toolbar?: ReactNode;
  footer?: ReactNode;
  onRowClick?: (row: Row<TData>, event: MouseEvent<HTMLTableRowElement>) => void;
}) {
  const columns = table.getVisibleLeafColumns();
  const rows = table.getRowModel().rows;
  return (
    <div data-slot='table-card' className='[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4'>
      {toolbar}
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className={metaOf<TData>(header.column.columnDef.meta)?.headerClassName}>
                  {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 8 }, (_, index) => (
              <TableRow key={index} aria-hidden>
                {columns.map((column) => (
                  <TableCell key={column.id}>
                    <Skeleton className={column.id === 'select' ? 'size-4' : 'h-4 w-full'} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className='hover:bg-transparent'>
              <TableCell colSpan={columns.length} className='whitespace-normal'>
                {/* An empty table says so in one muted sentence, like an empty card (UI review 2026-10-22). */}
                {isFiltered ? (
                  <TableEmpty
                    title={$t('dataTable.noRowsMatchFilters')}
                    description={$t('dataTable.changeClearFiltersSeeMore')}
                    action={
                      onClearFilters ? (
                        <Button variant='outline' size='sm' onClick={onClearFilters}>
                          {$t('dataTable.clearFilters')}</Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <TableEmpty {...empty} />
                )}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? 'selected' : undefined}
                className={onRowClick ? 'cursor-pointer' : undefined}
                onClick={onRowClick ? (event) => onRowClick(row, event) : undefined}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = metaOf<TData>(cell.column.columnDef.meta)?.cellClassName;
                  return (
                    <TableCell key={cell.id} className={typeof meta === 'function' ? meta(row) : meta}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {footer}
    </div>
  );
}

function TableEmpty({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className='py-3 text-sm text-muted-foreground'>
      <p>{title}</p>
      {description ? <p className='mt-1 text-xs'>{description}</p> : null}
      {action ? <div className='mt-3'>{action}</div> : null}
    </div>
  );
}
