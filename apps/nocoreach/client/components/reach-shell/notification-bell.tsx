import { $t } from '@/i18n';
// 通知 (2026-10-08 user decision): the bell in the header shows NocoReach's in-app messages (NocoBase's own notifications,
// channel “nocoreach”) — a task waiting for you, becoming a task's owner, someone's message on your task, a failed daily
// analysis for admins. The number is the unread ones; one click opens it and marks it read; 全部已读 clears the rest.
// Checked every minute and when the window comes back into focus.
import { useState, type ReactElement } from 'react';
import { useNavigate } from 'react-router';
import { BellIcon } from 'lucide-react';
import {
  useInboxItems,
  useInboxUnreadCount,
  useInboxActions,
  useInboxRefresh,
} from '@nocobase/app-plugin-notification-in-app/client/inbox';
import { Button } from '@/components/reach-ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/reach-ui/popover';
import { cn } from '@/lib/utils';

type Message = {
  id: string;
  title: string;
  content: string;
  status: 'read' | 'unread';
  receiveTimestamp: number;
  options?: { url?: string };
};
const routeOf = (url?: string) => url || '';
function ago(ts: number): string {
  const m = Math.max(0, Math.round((Date.now() - ts) / 60000));
  if (m < 1) return $t('刚刚');
  if (m < 60) return $t('{0} 分钟前', { 0: m });
  const h = Math.round(m / 60);
  return h < 24
    ? $t('{0} 小时前', { 0: h })
    : new Date(ts).toLocaleDateString();
}

export function NotificationBell({
  className,
}: {
  className?: string;
}): ReactElement {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  useInboxRefresh();
  const inbox = useInboxItems(30),
    count = useInboxUnreadCount(),
    actions = useInboxActions();
  const messages: Message[] = (
    inbox.data?.pages.flatMap((p) => p.data) || []
  ).map((m) => ({
    id: m.id,
    title: m.title,
    content: m.body,
    status: m.readAt ? 'read' : 'unread',
    receiveTimestamp: Date.parse(m.createdAt),
    options: { url: m.target?.type === 'route' ? m.target.path : undefined },
  }));
  const refresh = () => void inbox.refetch();
  const unread = count.data || 0;
  const openOne = async (m: Message) => {
    setOpen(false);
    if (m.status === 'unread')
      void actions.mark(m.id, 'read').catch(() => undefined);
    const to = routeOf(m.options?.url);
    if (to) navigate(to);
  };
  const readAll = () => void actions.readAll().catch(() => undefined);
  const label = unread ? $t('通知，{0} 条未读', { 0: unread }) : $t('通知');
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) refresh();
      }}
    >
      <PopoverTrigger
        render={
          <Button
            variant='outline'
            size='icon'
            aria-label={label}
            title={label}
            data-notifications={unread}
            className={cn(
              'relative size-10 rounded-xl border-border/70 bg-background/60',
              className,
            )}
          />
        }
      >
        <BellIcon />
        {unread ? (
          <span
            className='absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-semibold text-white tabular-nums'
            aria-hidden='true'
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align='end'
        className='w-80 gap-0 p-0'
        aria-label={$t('通知')}
      >
        <div className='flex items-center justify-between border-b px-3 py-2'>
          <p className='text-sm font-semibold'>{$t('通知')}</p>
          {unread ? (
            <Button size='xs' variant='ghost' onClick={readAll}>
              {$t('全部已读')}
            </Button>
          ) : null}
        </div>
        {messages.length ? (
          <ul
            className='max-h-96 divide-y overflow-y-auto'
            aria-label={$t('通知列表')}
          >
            {messages.map((m) => (
              <li key={m.id}>
                <button
                  type='button'
                  onClick={() => void openOne(m)}
                  data-message={m.id}
                  data-unread={m.status === 'unread' || undefined}
                  className='flex w-full gap-2 px-3 py-2 text-left hover:bg-muted/50'
                >
                  <span
                    className={cn(
                      'mt-1.5 size-2 shrink-0 rounded-full',
                      m.status === 'unread' ? 'bg-primary' : 'bg-transparent',
                    )}
                    aria-hidden='true'
                  />
                  <span className='min-w-0 flex-1'>
                    <span
                      className={cn(
                        'block text-sm',
                        m.status === 'unread'
                          ? 'font-medium'
                          : 'text-muted-foreground',
                      )}
                    >
                      {$t(m.title)}
                    </span>
                    {m.content ? (
                      <span className='line-clamp-2 block text-xs text-muted-foreground'>
                        {$t(m.content)}
                      </span>
                    ) : null}
                    <span className='block text-xs text-muted-foreground'>
                      {ago(Number(m.receiveTimestamp))}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className='px-3 py-6 text-center text-sm text-muted-foreground'>
            {$t(
              '还没有通知。任务等你处理、有人在你负责的任务里留言时会提醒你。',
            )}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
