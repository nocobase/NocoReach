import { Navigate } from 'react-router';
import { FlaskConical, CircleHelp, FlaskConicalOff } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './components/ui/tooltip.js';
import { createMockIndicator } from '../app-plugins/nocoreach-mock/client/index.js';
import { useNocoReachLocale } from './i18n/index.js';
import { useMe } from './pages/me.js';
import { currentProjectId } from './pages/current-project.js';
import { nocobaseClient } from './lib/nocoreach-api.js';

const StatusIndicator = createMockIndicator({
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
  components: {
    StatusIcon: ({ label, description, state, onRetry }) => {
      const Icon =
        state === 'unknown'
          ? CircleHelp
          : state === 'disabled'
            ? FlaskConicalOff
            : FlaskConical;
      const className =
        'flex h-5 shrink-0 items-center rounded-sm text-sidebar-foreground/80 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring';
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
  },
});

export function MockIndicator(props: Parameters<typeof StatusIndicator>[0]) {
  return <StatusIndicator {...props} />;
}

/** Old bookmarks retain a redirect, not a second writable settings page. */
export function MockSettingsPage() {
  return <Navigate to='/proxy-profiles' replace />;
}
