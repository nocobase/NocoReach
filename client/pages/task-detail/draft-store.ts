import { createContext, useContext } from 'react';

type Entry = { value: string | boolean; dirty: boolean };
export type Drafts = Record<string, Entry>;
export const DraftContext = createContext<{
  drafts: Drafts;
  set: (key: string, entry: Entry | undefined) => void;
  clear: (prefix: string) => void;
  /**
   * Let the navigation that follows at once go without asking about drafts: it moves between the task page and its
   * article page, which stays mounted over the task page, so nothing is left behind.
   */
  stay: () => void;
  /** Whether such a navigation is under way (read by the navigation guard). */
  staying: () => boolean;
} | null>(null);
export const ScopeContext = createContext('');

export function useDraftContext() {
  const context = useContext(DraftContext);
  if (!context)
    throw new Error('Task drafts require the authenticated draft provider');
  return context;
}
export function useTaskDraft(
  field: string,
  initial: string,
  track?: boolean,
): [string, (value: string) => void, () => void];
export function useTaskDraft(
  field: string,
  initial: boolean,
  track?: boolean,
): [boolean, (value: boolean) => void, () => void];
export function useTaskDraft<T extends string | boolean>(
  field: string,
  initial: T,
  track = true,
): [T, (value: T) => void, () => void] {
  const context = useDraftContext();
  const key = useContext(ScopeContext) + JSON.stringify(field);
  return [
    (context.drafts[key]?.value as T | undefined) ?? initial,
    (value) => {
      context.set(key, value === initial ? undefined : { value, dirty: track });
    },
    () => context.clear(key),
  ];
}
/**
 * Call right before navigating between the task page and its article page: the drafts are on both. Without the draft
 * provider (an article shown on its own) there are no drafts to keep.
 */
export function useStayWithDrafts() {
  return useContext(DraftContext)?.stay ?? noop;
}
const noop = () => {};
export function useTaskDraftStatus() {
  const context = useDraftContext();
  const scope = useContext(ScopeContext);
  return {
    dirty: Object.entries(context.drafts).some(
      ([key, entry]) => key.startsWith(scope) && entry.dirty,
    ),
    clear: () => context.clear(scope),
  };
}
