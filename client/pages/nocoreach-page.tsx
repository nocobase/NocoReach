// What the classic portal layout put around every NocoReach page (components/app-shell/layout.tsx there): the main
// area as a size container (pages use @container/main variants), the member gate (you have joined NocoReach) and the
// project gate (there is a project to work on). The shared request cache (WorkspaceCacheProvider) sits higher, in
// client/react-providers.ts, so it lasts across pages.
import type { ReactNode } from 'react';

import { MemberGate } from './me';
import { ProjectGate } from './project-switcher';

export function NocoReachPage({ children }: { children?: ReactNode }): ReactNode {
  return (
    <div className='@container/main relative flex w-full min-w-0 flex-1 flex-col'>
      <MemberGate>
        <ProjectGate>{children}</ProjectGate>
      </MemberGate>
    </div>
  );
}
