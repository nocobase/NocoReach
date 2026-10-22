import {
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useNavigationGuard } from '@nocobase/app-client';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import { Textarea } from '#components/ui/textarea';
import { Card } from './layout';
import {
  confirmAction,
  confirmLeaveWithDrafts,
} from '#components/reach/confirm';
import {
  DraftContext,
  ScopeContext,
  useDraftContext,
  type Drafts,
} from './draft-store.js';

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
// Mounted beside the authenticated Outlet: drafts may outlive their task page,
// but a guest/optional route destroys this subtree even without a browser reload.
export function TaskDraftNavigationGuard() {
  const { drafts } = useDraftContext();
  const acknowledgedRef = useRef<Drafts>({});
  useNavigationGuard(async () => {
    const changed = Object.entries(drafts).some(
      ([key, entry]) => entry.dirty && acknowledgedRef.current[key] !== entry,
    );
    if (!changed) return true;
    if (!(await confirmLeaveWithDrafts())) return false;
    // Acknowledgement is not a save or discard: keep recovery and unload protection.
    // Entry identity makes any later edit require confirmation again.
    acknowledgedRef.current = drafts;
    return true;
  });
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
    <Card
      aria-label={$t('taskDetail.previousDrafts')}
      title={$t('taskDetail.previousDrafts')}
      sub={$t('taskDetail.previousDraftsHelp')}
    >
      {previous.map(([key, entry], index) => (
        <div key={key} className='flex flex-col items-start gap-2'>
          <Textarea
            aria-label={$t('taskDetail.previousDraftText', { 0: index + 1 })}
            value={String(entry.value)}
            readOnly
            rows={4}
            className='field-sizing-fixed'
          />
          <Button
            size='sm'
            variant='ghost'
            onClick={() => {
              void confirmAction({
                title: () =>
                  $t('taskDetail.discardEarlierDraft', { 0: index + 1 }),
                description: () => $t('taskDetail.discardDraftWarning'),
                action: 'taskDetail.discardDraft',
              }).then((confirmed) => {
                if (confirmed) context.clear(key);
              });
            }}
          >
            {$t('taskDetail.discardDraft')}
          </Button>
        </div>
      ))}
    </Card>
  );
}
