import type { PropsWithChildren, ReactElement } from 'react';

/**
 * NocoReach departs from the template here (docs/DEVELOPMENT.md, Routes, identity, and shell): a signed-in session's
 * pages mount at once instead of waiting for the realtime connection, whose new TCP and TLS handshake took 1.2 to
 * 1.8 s from Hong Kong (2026-11-05) before the first business request could start. That wait existed because the
 * authorization plugin invalidated its snapshot when the connection opened and when each permission topic became
 * ready, so pages mounted earlier would be checked and mounted again. The patched plugin
 * (patches/@nocobase__app-plugin-authorization@1.0.0-beta.33.patch) reads the snapshot again then and invalidates only
 * when it changed. A changed snapshot, a permission event and a reconnection after a drop still hide protected content
 * while it is checked again; the previous session's snapshot is cleared by the authorization provider before any page
 * mounts, and the server checks every request. A connection that cannot be made no longer locks the application: the
 * realtime client keeps retrying, and only live updates wait for it.
 */
export function SessionPreparation({
  children,
}: PropsWithChildren): ReactElement {
  return <>{children}</>;
}
