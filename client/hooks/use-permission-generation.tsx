/* eslint-disable react-refresh/only-export-components -- the provider and its hook are intentionally colocated */
import {
  realtimeClientToken,
  useClientApplication,
} from '@nocobase/app-client';
import {
  useAuthorizationClient,
  useAuthorizationRevision,
} from '@nocobase/app-plugin-authorization/client';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
  type ReactElement,
} from 'react';

import {
  PermissionGeneration,
  type PermissionRealtime,
} from '#lib/permission-generation';

const Context = createContext<PermissionGeneration | null>(null);

const watchable = (realtime: unknown): realtime is PermissionRealtime => {
  const candidate = realtime as Partial<PermissionRealtime> | undefined;
  return (
    typeof candidate?.watch === 'function' &&
    typeof candidate.onReady === 'function' &&
    typeof candidate.onStateChange === 'function'
  );
};

/**
 * One generation per session: the authorization provider above remounts the application when the session changes.
 * Without a realtime client to tell events and dropped connections apart, every invalidation still counts.
 */
export function PermissionGenerationProvider({
  children,
}: PropsWithChildren): ReactElement {
  const snapshots = useAuthorizationClient();
  const { services } = useClientApplication();
  const [generation] = useState(() => {
    const realtime = services.has(realtimeClientToken)
      ? services.resolve(realtimeClientToken)
      : undefined;
    return watchable(realtime)
      ? new PermissionGeneration(snapshots, realtime)
      : null;
  });
  useEffect(() => generation?.start(), [generation]);
  return <Context.Provider value={generation}>{children}</Context.Provider>;
}

const unsubscribed = () => () => undefined;

/**
 * The permission generation of the current session, for keys that drop page state and cached responses. Without the
 * provider (a component rendered on its own) it is the authorization revision, as before.
 */
export function usePermissionGeneration(): number {
  const generation = useContext(Context);
  const revision = useAuthorizationRevision();
  const value = useSyncExternalStore(
    generation?.subscribe ?? unsubscribed,
    generation?.current ?? (() => revision),
  );
  return generation ? value : revision;
}
