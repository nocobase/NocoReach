// What the classic portal layout put around every NocoReach page (components/app-shell/layout.tsx there): the main
// area as a size container (pages use @container/main variants), the member gate (you have joined NocoReach) and the
// project gate (there is a project to work on). The shared identity and request cache sit inside the authenticated
// route subtree in client/routing/app-router.tsx, so they last across pages but never across sessions.
import type { ReactNode } from 'react';
import { cn } from 'cn';

import { MemberGate } from './me';
import { ProjectGate } from './project-switcher';

export function NocoReachPage({
  children,
  fullHeight = false,
}: {
  children?: ReactNode;
  fullHeight?: boolean;
}): ReactNode {
  return (
    <div
      className={cn(
        '@container/main relative flex w-full min-w-0 flex-1 flex-col',
        fullHeight && 'h-full min-h-0',
      )}
    >
      <MemberGate>
        <ProjectGate>{children}</ProjectGate>
      </MemberGate>
    </div>
  );
}
