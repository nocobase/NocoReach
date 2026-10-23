import { useState, type ComponentProps, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { $t } from '#i18n';
import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import { text } from './styles';

// The task page's one layout system (styles.ts): every card the same, holding a single level of boxes.
const INNER_GAP = 'gap-4';

/**
 * A card: its title (and a grey line under it) on the left and its actions on the right of one row, then its content.
 * `sticky` keeps the title row in view while long content scrolls under it (the card for what to do now). Content
 * that renders nothing leaves no empty space.
 */
export function Card({
  title,
  sub,
  actions,
  sticky = false,
  as: Root = 'section',
  children,
  className,
  ...props
}: Omit<ComponentProps<'section'>, 'title'> & {
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
  as?: 'section' | 'aside';
}) {
  const head = Boolean(title || actions);
  return (
    <Root
      className={cn(
        'flex min-w-0 flex-col rounded-lg border bg-card text-card-foreground',
        className,
      )}
      {...props}
    >
      {head && (
        <header
          className={cn(
            'flex flex-wrap items-start justify-between gap-x-4 gap-y-3 p-4',
            sticky && 'sticky top-0 z-10 rounded-lg bg-card',
          )}
        >
          <div className='flex min-w-0 flex-[1_1_16rem] flex-col gap-1'>
            {title && (
              <h2
                className={cn(
                  text.cardTitle,
                  'flex min-w-0 items-center gap-1.5 break-words',
                )}
              >
                {title}
              </h2>
            )}
            {sub && <div className={text.muted}>{sub}</div>}
          </div>
          {actions && (
            <div className='flex flex-wrap items-center gap-2'>{actions}</div>
          )}
        </header>
      )}
      {children && (
        <div
          className={cn(
            'flex min-w-0 flex-col px-4 pb-4 empty:hidden',
            head ? 'pt-0' : 'pt-4',
            INNER_GAP,
          )}
        >
          {children}
        </div>
      )}
    </Root>
  );
}

/** A labelled block inside a card: the label in grey above, full width. */
export function Field({
  label,
  htmlFor,
  id,
  children,
  className,
}: {
  label: ReactNode;
  htmlFor?: string;
  id?: string;
  children: ReactNode;
  className?: string;
}) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label id={id} htmlFor={htmlFor} className={text.muted}>
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Long plain text clamped to three lines, with Expand / Collapse when it does not fit and any links after it. */
export function Clamped({
  children,
  long,
  extra,
}: {
  children: string;
  /** Whether the text is long enough to clamp. */
  long: boolean;
  /** Links shown on the same line as Expand. */
  extra?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className='flex min-w-0 flex-col items-start gap-1'>
      <p
        className={cn(
          text.body,
          'leading-6 break-words whitespace-pre-wrap',
          long && !open && 'line-clamp-3',
        )}
      >
        {children}
      </p>
      {(long || extra) && (
        <div className='flex flex-wrap items-center gap-x-4 gap-y-1'>
          {long && (
            <Button
              variant='link'
              size='sm'
              className='h-auto p-0 font-normal'
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? $t('common.collapse') : $t('taskDetail.expand')}
            </Button>
          )}
          {extra}
        </div>
      )}
    </div>
  );
}

/**
 * Something to look at before going on (a conflict, an overwrite after publishing), inside a card: a line with a
 * warning mark, then its details. Not a box, so the card stays the only one.
 */
export function Notice({
  title,
  children,
}: {
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div role='alert' className='flex min-w-0 flex-col gap-2'>
      <p className={cn(text.body, 'flex items-start gap-1.5')}>
        <TriangleAlert
          aria-hidden='true'
          className='mt-0.5 size-4 shrink-0 text-nr-ink-amber'
        />
        <span className='min-w-0'>{title}</span>
      </p>
      {children && (
        <div className='flex min-w-0 flex-col gap-2 pl-5.5'>{children}</div>
      )}
    </div>
  );
}
