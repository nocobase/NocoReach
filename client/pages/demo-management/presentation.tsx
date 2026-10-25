import type { ComponentProps, ReactElement } from 'react';
import type {
  DemoSettingsComponents,
  DemoSettingsHeaderProps,
} from '@nocobase/app-plugin-demo-mode/client/settings';
import { PageHeader, Section, SectionHeading } from '#components/reach/page';
import { RefreshButton } from '#components/reach/refresh-button';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';

// This module exports a stable plugin component map rather than a Fast Refresh boundary.
// eslint-disable-next-line react-refresh/only-export-components
function Header({
  title,
  description,
  badge,
  refreshDisabled,
  refreshing,
  onRefresh,
}: DemoSettingsHeaderProps): ReactElement {
  return (
    <PageHeader
      title={title}
      info={badge}
      description={description}
      actions={
        <RefreshButton
          busy={refreshing}
          disabled={refreshDisabled}
          onClick={onRefresh}
        />
      }
    />
  );
}

// Stable adapters keep the plugin's drafts mounted while the host owns its page styling.
export const demoSettingsComponents: DemoSettingsComponents = {
  Header,
  Button,
  Card: ({ size: _size, ...props }) => <Section {...props} />,
  CardHeader: ({ className, ...props }) => (
    <div {...props} className={cn('grid min-w-0 gap-1', className)} />
  ),
  CardTitle: ({ children, ...props }) => (
    <div {...props}>
      <SectionHeading title={children} />
    </div>
  ),
  CardDescription: ({ className, ...props }) => (
    <div
      {...props}
      className={cn('text-sm text-muted-foreground', className)}
    />
  ),
  CardContent: (props: ComponentProps<'div'>) => <div {...props} />,
};
