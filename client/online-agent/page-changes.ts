import { useEffect, useRef } from 'react';
import type { OnlinePage } from '../../shared/online-agent.js';

// A change saved from the chat panel (a confirmed proposal) tells the page it belongs to, which reads its data again,
// so the page shows the change without a reload.
const changes = new EventTarget();
type Detail = { page: OnlinePage; projectId: string };

export function notifyPageChange(page: OnlinePage, projectId: string | number) {
  changes.dispatchEvent(
    new CustomEvent<Detail>('change', {
      detail: { page, projectId: String(projectId) },
    }),
  );
}

/** Calls `reload` when something saved in the chat changed this page's data in this project. */
export function usePageChange(
  page: OnlinePage,
  projectId: string | number,
  reload: () => void,
) {
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });
  useEffect(() => {
    const listener = (event: Event) => {
      const { detail } = event as CustomEvent<Detail>;
      if (detail.page === page && detail.projectId === String(projectId))
        reloadRef.current();
    };
    changes.addEventListener('change', listener);
    return () => changes.removeEventListener('change', listener);
  }, [page, projectId]);
}
