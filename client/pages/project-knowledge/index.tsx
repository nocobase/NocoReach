import { $legacyText, $t, $tj, useMessageState, type Message } from '#i18n';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import {
  matchPath,
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useResolvedPath,
} from 'react-router';
import { PageContainer, PageHeader } from '#components/reach/page';
import { ListSkeleton } from '#components/reach/states';
import { toast } from '#lib/toast';
import { cn } from '#lib/utils';
import { useProject } from '../reach-data';
import {
  KNOWLEDGE_PARAMS,
  memoryRequest,
  request,
  type Item,
  type MemoryStatus,
  type MemoryUpdates,
  type ProjectKnowledgeContext,
} from './model';

// 项目知识 in two tabs (user decision 2026-10-20): 记忆, what every analysis and task reads, and 知识库, the material the
// Agent looks up. The page loads what both tabs and the tab bar need (the project, the material list and the memory
// suggestions) and hands it to them through the Outlet; each tab opens its own dialogs and drawer over itself.

export default function ProjectKnowledgePage(): ReactElement {
  const location = useLocation();
  const pagePath = useResolvedPath('.');
  // /project itself opens 记忆; a tab's own URL stays where it is.
  if (
    matchPath({ path: pagePath.pathname, end: true }, location.pathname) !==
    null
  )
    return (
      <Navigate replace to={{ pathname: 'memory', search: location.search }} />
    );
  return <ProjectKnowledge />;
}

function ProjectKnowledge(): ReactElement {
  const { project, error: projectError } = useProject();
  const projectId = project?.id;
  const { items, error: itemsError, reload: reloadItems } = useItems(projectId);
  const updates = useMemoryUpdates(projectId);
  const projectSaved = useCallback((message: Message) => {
    toast.success(message);
    window.dispatchEvent(new Event('reach-project-saved'));
  }, []);
  const context = useMemo<ProjectKnowledgeContext | undefined>(
    () =>
      project
        ? { project, items, itemsError, reloadItems, updates, projectSaved }
        : undefined,
    [project, items, itemsError, reloadItems, updates, projectSaved],
  );
  return (
    <PageContainer className='nr-page'>
      <PageHeader
        title={$t('projectKnowledge.projectKnowledge')}
        description={$t('projectKnowledge.whatAiTeamKnowsAbout')}
      />
      <KnowledgeTabs
        suggestions={updates.status?.suggestions.length ?? 0}
        items={items?.length}
      />
      {context ? (
        <Outlet context={context} />
      ) : projectError ? (
        <p role='alert' className='nr-error'>
          {projectError}
        </p>
      ) : (
        <ListSkeleton rows={6} />
      )}
    </PageContainer>
  );
}

// Tabs look like the other pages' line tabs (审计, 搜索表现) but are links: each tab is a route of its own.
const tabClass = cn(
  'relative inline-flex h-8 items-center gap-1.5 rounded-md px-1.5 text-sm font-medium whitespace-nowrap text-foreground/60 transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none dark:text-muted-foreground dark:hover:text-foreground',
  'after:absolute after:inset-x-0 after:bottom-[-5px] after:h-0.5 after:bg-foreground after:opacity-0 after:transition-opacity aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100',
);
function KnowledgeTabs({
  suggestions,
  items,
}: {
  suggestions: number;
  items?: number;
}): ReactElement {
  const location = useLocation();
  const knowledgePath = useResolvedPath('knowledge');
  const params = new URLSearchParams(location.search);
  for (const key of KNOWLEDGE_PARAMS) params.delete(key);
  const search = params.toString() ? `?${params}` : '';
  const inKnowledge =
    matchPath(
      { path: knowledgePath.pathname, end: false },
      location.pathname,
    ) !== null;
  return (
    <nav
      aria-label={$t('projectKnowledge.tabs')}
      className='flex flex-wrap gap-1 pb-1.5'
    >
      <NavLink className={tabClass} to={{ pathname: 'memory', search }}>
        {$t('projectKnowledge.memory')}
        {suggestions ? (
          <>
            <span
              aria-hidden='true'
              className='rounded-full bg-attention px-1.5 text-xs leading-4 text-attention-foreground tabular-nums'
            >
              {suggestions}
            </span>
            <span className='sr-only'>
              {$tj('projectKnowledge.suggestedUpdatesValue', {
                0: suggestions,
              })}
            </span>
          </>
        ) : null}
      </NavLink>
      <NavLink
        className={tabClass}
        to={{
          pathname: 'knowledge',
          search: inKnowledge ? location.search : search,
        }}
      >
        {$t('projectKnowledge.knowledgeBase')}
        {items !== undefined ? (
          <span className='text-xs font-normal text-muted-foreground tabular-nums'>
            {items}
          </span>
        ) : null}
      </NavLink>
    </nav>
  );
}

// The project's material list, newest first. State is kept with the project it belongs to, so another project's list
// never shows, and a response for a project no longer shown is dropped.
function useLatest(projectId?: number) {
  const currentRef = useRef(projectId);
  useEffect(() => {
    currentRef.current = projectId;
  }, [projectId]);
  return currentRef;
}
function useItems(projectId?: number) {
  const [state, setState] = useState<{ projectId: number; items: Item[] }>();
  const [error, setError] = useMessageState('');
  const currentRef = useLatest(projectId);
  const reload = useCallback(async () => {
    if (!projectId) return;
    setError('');
    await request<{ items: Item[] }>('list', projectId)
      .then((r) => {
        if (currentRef.current === projectId)
          setState({ projectId, items: r.items });
      })
      .catch(() => {
        if (currentRef.current === projectId)
          setError(() => $t('projectKnowledge.notLoadKnowledgeBaseRefresh'));
      });
  }, [projectId, setError, currentRef]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return {
    items: state?.projectId === projectId ? state?.items : undefined,
    error,
    reload,
  };
}

// The first draft and the weekly suggestions for 记忆. While a draft or a check runs, look again every few seconds;
// when it ends, 记忆 may have changed.
function useMemoryUpdates(projectId?: number): MemoryUpdates {
  const [state, setState] = useState<{
    projectId: number;
    status: MemoryStatus;
  }>();
  const status = state?.projectId === projectId ? state?.status : undefined;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useMessageState('');
  const currentRef = useLatest(projectId);
  const reload = useCallback(() => {
    if (!projectId) return;
    setError('');
    void memoryRequest<MemoryStatus>('status', projectId)
      .then((next) => {
        if (currentRef.current === projectId)
          setState({ projectId, status: next });
      })
      .catch(() => {
        if (currentRef.current === projectId)
          setError(() => $t('projectKnowledge.notLoadMemoryUpdatesRefresh'));
      });
  }, [projectId, setError, currentRef]);
  useEffect(reload, [reload]);
  useEffect(() => {
    if (!projectId || !status?.running) return;
    const timer = setTimeout(
      () =>
        void memoryRequest<MemoryStatus>('status', projectId)
          .then((next) => {
            if (currentRef.current !== projectId) return;
            setState({ projectId, status: next });
            if (!next.running)
              window.dispatchEvent(new Event('reach-project-saved'));
          })
          .catch(() => {
            // A failed look tries again after the same wait instead of leaving the spinner on.
            if (currentRef.current === projectId)
              setState((prev) =>
                prev?.projectId === projectId
                  ? { projectId, status: { ...prev.status } }
                  : prev,
              );
          }),
      4000,
    );
    return () => clearTimeout(timer);
  }, [projectId, status, currentRef]);
  const act = useCallback(
    async (
      action: string,
      body: object = {},
      done?: (r: MemoryStatus & { memory?: string[] }) => void,
    ) => {
      if (!projectId) return;
      setBusy(true);
      setError('');
      try {
        const r = await memoryRequest<MemoryStatus & { memory?: string[] }>(
          action,
          projectId,
          body,
        );
        if (currentRef.current !== projectId) return;
        setState({ projectId, status: r });
        done?.(r);
      } catch (e) {
        setError(() =>
          e instanceof Error
            ? $legacyText(e.message)
            : $t('common.retryFailure'),
        );
      } finally {
        setBusy(false);
      }
    },
    [projectId, setError, currentRef],
  );
  return useMemo(
    () => ({
      status,
      busy,
      error,
      reload,
      run: (kind: 'draft' | 'check') => act(kind),
      seen: () => act('seen'),
      dismiss: (id: string) => act('dismiss', { ids: [id] }),
      accept: (id: string) =>
        act('accept', { ids: [id] }, (r) => {
          toast.success(() =>
            $t('projectKnowledge.memoryUpdated', {
              0: (r.memory || []).join('、'),
            }),
          );
          window.dispatchEvent(new Event('reach-project-saved'));
        }),
    }),
    [status, busy, error, reload, act],
  );
}
