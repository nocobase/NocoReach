import { FlaskConical, CircleHelp, FlaskConicalOff } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './components/ui/tooltip.js';
import { resolveAppUrl } from '@nocobase/app-client';
import { createMockUi } from '../app-plugins/nocoreach-mock/client/index.js';
import { useNocoReachLocale } from './i18n/index.js';
import { useMe } from './pages/me.js';
import { currentProjectId } from './pages/current-project.js';
import { NocoReachPage } from './pages/nocoreach-page.js';
import { nocobaseClient } from './lib/nocoreach-api.js';
import { toast } from './lib/toast.js';
import { PageContainer, PageHeader } from './components/reach/page.js';
import { Button } from './components/ui/button.js';
import { Input } from './components/ui/input.js';
import { Label } from './components/ui/label.js';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from './components/ui/card.js';
import { Alert, AlertTitle, AlertDescription } from './components/ui/alert.js';
import { Skeleton } from './components/ui/skeleton.js';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from './components/ui/select.js';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from './components/ui/alert-dialog.js';

export const { MockSettingsPage, MockIndicator } = createMockUi({
  useContext: () => {
    const { me } = useMe(),
      locale = useNocoReachLocale(),
      projectId = String(currentProjectId());
    return {
      projectId,
      role: me?.role ?? null,
      locale,
      scopeKey: `${me?.id ?? ''}:${me?.role ?? ''}:${projectId}`,
    };
  },
  request: (action, values, signal) =>
    nocobaseClient.action('nrMock', action, { body: values, signal }),
  notify: (message) => {
    toast.success(message);
  },
  signIn: () => {
    window.location.assign(resolveAppUrl('/login'));
  },
  projectSettings: () => {
    window.location.assign(resolveAppUrl('/project'));
  },
  components: {
    StatusIcon: ({ label, description, state, onRetry }) => {
      const Icon =
        state === 'unknown'
          ? CircleHelp
          : state === 'disabled'
            ? FlaskConicalOff
            : FlaskConical;
      const className =
        'flex size-8 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring';
      return (
        <Tooltip>
          <TooltipTrigger
            aria-label={label}
            aria-description={description}
            data-testid='mock-environment-indicator'
            render={
              onRetry ? (
                <button type='button' className={className} onClick={onRetry} />
              ) : (
                <span role='img' tabIndex={0} className={className} />
              )
            }
          >
            <Icon aria-hidden className='size-4' />
          </TooltipTrigger>
          <TooltipContent side='right' className='max-w-56'>
            {label} · {description}
          </TooltipContent>
        </Tooltip>
      );
    },
    Page: ({ title, description, children }) => (
      <NocoReachPage>
        <PageContainer className='max-w-4xl'>
          <PageHeader title={title} description={description} />
          {children}
        </PageContainer>
      </NocoReachPage>
    ),
    Card: ({ title, description, children }) => (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    ),
    Notice: ({ title, error, children }) => (
      <Alert
        variant={error ? 'destructive' : 'default'}
        role={error ? 'alert' : 'status'}
      >
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription>{children}</AlertDescription>
      </Alert>
    ),
    Button,
    Input,
    Field: ({ label, htmlFor, error, hint, children }) => (
      <div className='flex flex-col gap-2'>
        <Label htmlFor={htmlFor}>{label}</Label>
        {children}
        {error ? (
          <p id={`${htmlFor}-error`} className='text-sm text-destructive'>
            {error}
          </p>
        ) : hint ? (
          <p id={`${htmlFor}-hint`} className='text-sm text-muted-foreground'>
            {hint}
          </p>
        ) : null}
      </div>
    ),
    Select: ({ id, value, items, onChange, disabled }) => (
      <Select
        value={value}
        items={items}
        onValueChange={(next) => {
          if (next !== null) onChange(next);
        }}
        disabled={disabled}
      >
        <SelectTrigger id={id} className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    ),
    Confirm: ({
      open,
      pending,
      title,
      description,
      confirm,
      cancel,
      onOpenChange,
      onConfirm,
      children,
    }) => (
      <AlertDialog open={open} onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {children}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{cancel}</AlertDialogCancel>
            <Button
              variant='destructive'
              disabled={pending}
              onClick={onConfirm}
            >
              {confirm}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
    Loading: ({ label }) => (
      <div aria-label={label} className='flex flex-col gap-4'>
        <Skeleton className='h-12 w-full' />
        <Skeleton className='h-64 w-full' />
      </div>
    ),
  },
});
