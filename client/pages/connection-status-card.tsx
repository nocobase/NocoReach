import type { ComponentProps, ReactNode } from 'react';
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from '#components/ui/card';
import { cn } from '#lib/utils';

// One card for each website source repository and each publishing target (2026-10-29,
// ui-references/repos-2026-10-29/multi-repo.png): whether it works at a glance (the tag), what it serves, its latest
// check and what it last delivered (one StatusRow each), then its actions. The settings form opens from Edit, never
// on the card.
export function StatusCard({
  title,
  tag,
  note,
  actions,
  children,
  className,
  ...props
}: Omit<ComponentProps<'div'>, 'title'> & {
  title: ReactNode;
  tag?: ReactNode;
  /** A line under the rows, for what is true of it rather than its state. */
  note?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card size='sm' className={cn('gap-3', className)} {...props}>
      <CardHeader>
        <CardTitle className='flex min-w-0 flex-wrap items-center gap-2 break-all'>
          {title}
        </CardTitle>
        {tag && <CardAction>{tag}</CardAction>}
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <dl className='grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2'>
          {children}
        </dl>
        {note && <p className='text-muted-foreground'>{note}</p>}
        {actions && (
          <div className='flex flex-wrap items-center gap-2'>{actions}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function StatusRow({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <dt className='text-muted-foreground'>{label}</dt>
      <dd className='min-w-0'>{children}</dd>
    </>
  );
}
