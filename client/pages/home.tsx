import type { ReactElement } from 'react';
import { Navigate } from 'react-router';

// The application's root: NocoReach opens on 洞察.
export default function Home(): ReactElement {
  return <Navigate to='/home' replace />;
}
