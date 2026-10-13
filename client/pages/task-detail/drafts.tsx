/* eslint-disable react-refresh/only-export-components -- task draft provider and companion hooks */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import { useNavigationGuard } from '@nocobase/app-client';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';

type Entry = { value: string | boolean; dirty: boolean };
type Drafts = Record<string, Entry>;
const DraftContext = createContext<{
  drafts: Drafts;
  set: (key: string, entry: Entry | undefined) => void;
  clear: (prefix: string) => void;
} | null>(null);
const ScopeContext = createContext('');

// Mounted inside SessionCache: account, session and permission changes destroy all drafts.
// Deliberately memory-only: drafts never enter shared browser storage or a business API.
export function TaskDraftProvider({ children }: PropsWithChildren) {
  const [drafts, setDrafts] = useState<Drafts>({});
  const dirty = Object.values(drafts).some((entry) => entry.dirty);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  return (
    <DraftContext.Provider
      value={{
        drafts,
        set: (key, entry) =>
          setDrafts((old) => {
            const next = { ...old };
            if (entry) next[key] = entry;
            else delete next[key];
            return next;
          }),
        clear: (prefix) =>
          setDrafts((old) =>
            Object.fromEntries(
              Object.entries(old).filter(
                ([key]) => !key.startsWith(prefix) || old[key] !== drafts[key],
              ),
            ),
          ),
      }}
    >
      {children}
    </DraftContext.Provider>
  );
}
export function TaskDraftScope({
  scope,
  children,
}: PropsWithChildren<{ scope: string }>) {
  const parent = useContext(ScopeContext);
  return (
    <ScopeContext.Provider value={`${parent}${JSON.stringify(scope)}/`}>
      {children}
    </ScopeContext.Provider>
  );
}
function useDraftContext() {
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

// Mounted beside the authenticated Outlet: drafts may outlive their task page,
// but a guest/optional route destroys this subtree even without a browser reload.
export function TaskDraftNavigationGuard() {
  const { dirty } = useTaskDraftStatus();
  useNavigationGuard(
    () => !dirty || window.confirm($t('taskDetail.leaveWithDrafts')),
  );
  return null;
}

// Never apply an earlier artifact's text to a newly fetched artifact and revision.
// Keep it available for comparison/copying even when its stage is no longer active.
export function TaskDraftRecovery({ activeScope }: { activeScope?: string }) {
  const context = useDraftContext();
  const scope = useContext(ScopeContext);
  const activePrefix = `${scope}${JSON.stringify(activeScope)}/`;
  const previous = Object.entries(context.drafts).filter(
    ([key, entry]) =>
      key.startsWith(scope) &&
      key.slice(scope.length).includes('/') &&
      !key.startsWith(activePrefix) &&
      entry.dirty &&
      typeof entry.value === 'string',
  );
  if (!previous.length) return null;
  return (
    <section
      aria-label={$t('taskDetail.previousDrafts')}
      className='nr-td-card'
    >
      <h3>{$t('taskDetail.previousDrafts')}</h3>
      <p>{$t('taskDetail.previousDraftsHelp')}</p>
      {previous.map(([key, entry], index) => (
        <div key={key} className='nr-field'>
          <textarea
            aria-label={$t('taskDetail.previousDraftText', { 0: index + 1 })}
            value={String(entry.value)}
            readOnly
            rows={4}
          />
          <Button size='sm' variant='ghost' onClick={() => context.clear(key)}>
            {$t('taskDetail.discardDraft')}
          </Button>
        </div>
      ))}
    </section>
  );
}
