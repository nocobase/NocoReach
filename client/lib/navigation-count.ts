import { useEffect } from 'react';
import { useLocation } from 'react-router';

let count = 0;

/** How many in-app navigations happened so far, back and forward included, for state a navigation must end. */
export const navigations = (): number => count;

/** Counts each in-app navigation. `AppRouter` mounts it once, above every page. */
export function useCountNavigations(): void {
  const { key } = useLocation();
  useEffect(() => {
    count += 1;
  }, [key]);
}
