import { createContext, useContext } from 'react';

type Entry = { value: string | boolean; dirty: boolean };
export type Drafts = Record<string, Entry>;
export const DraftContext = createContext<{
  drafts: Drafts;
  set: (key: string, entry: Entry | undefined) => void;
  clear: (prefix: string) => void;
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
