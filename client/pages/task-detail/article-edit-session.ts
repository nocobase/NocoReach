import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { $t } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import {
  ARTICLE_AUTOSAVE_MS,
  ARTICLE_LEASE_HEARTBEAT_MS,
  type ArticleEditState,
} from '../../../shared/article-edit.js';
import type { ArticleProposal, TaskData } from '../task-execution-types';
import { focusSoon } from './article-model';
import {
  editableLocales,
  formDraft,
  formProblems,
  initialForm,
  keptForm,
  reviewedArticle,
  sameForm,
  withForm,
  type EditForm,
} from './article-edit-model.js';

// The edits to the article under review (2026-11-04 user request): kept on the server a moment after each change, so a
// refresh, a closed tab or another computer finds them, without becoming a version; a version is made of them only on
// Approve or Request changes. One person edits at a time: whoever opens the article first holds it while their page is
// open, and anyone else reads it as that person leaves it. One session per task page, which its card, the article's
// full-screen page and Activity's message box share.

export type ArticleEditSession = {
  /** The version under review being edited. */
  artifactId: string;
  form: EditForm;
  /** AI rewrites accepted since the version. */
  ai: number;
  /** Whether the form differs from the version. */
  changed: boolean;
  /** Not the person's to edit now: someone else holds it, they may not, or it is still being opened. */
  readOnly: boolean;
  /** Who holds it when it is someone else. */
  holder?: string;
  /** Whether the edits shown are someone else's. */
  othersEdits: boolean;
  /** The last automatic save of the form (ISO time). */
  savedAt?: string;
  saving: boolean;
  saveFailed: boolean;
  set: (form: EditForm) => void;
  /** An AI rewrite was accepted into the form. */
  accepted: () => void;
  discard: () => Promise<void>;
  /**
   * The edits made a version first, when there are any: the version to act on and the revision to act at, or nothing
   * when the version could not be made.
   */
  version: () => Promise<{ artifactId: string; revision: number } | null>;
};

type Update = (command: string, body?: object) => Promise<TaskData | undefined>;

export const ArticleEditContext = createContext<ArticleEditSession | null>(
  null,
);
export const useArticleEdit = () => useContext(ArticleEditContext);

export function useArticleEditSession({
  projectId,
  taskId,
  data,
  allowed,
  update,
}: {
  projectId: number;
  taskId: string;
  data: TaskData;
  allowed: boolean;
  update: Update;
}): ArticleEditSession | null {
  const reviewed = reviewedArticle(data);
  const key = allowed && reviewed ? reviewed.out.id : '';
  const initial = reviewed ? initialForm(data, reviewed.article) : null;
  // The person's own changes, for the version they were made to.
  const [local, setLocal] = useState<{
    key: string;
    form: EditForm | null;
    ai: number;
    /** Changes not saved yet; counts up with each, so a save that ends after another change keeps it unsaved. */
    unsaved: number;
  }>({ key: '', form: null, ai: 0, unsaved: 0 });
  const [remote, setRemote] = useState<{
    key: string;
    state: ArticleEditState | null;
    failed: boolean;
  }>({ key: '', state: null, failed: false });
  const [saving, setSaving] = useState(false);
  const mine = remote.key === key && (remote.state?.mine ?? remote.failed);
  const ready = remote.key === key && (Boolean(remote.state) || remote.failed);

  const liveRef = useRef({ key, local, remote, mine, initial, reviewed, data });
  useLayoutEffect(() => {
    liveRef.current = { key, local, remote, mine, initial, reviewed, data };
  });
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flushingRef = useRef<Promise<void>>(Promise.resolve());
  /** The version this page holds the article for, until it lets go. */
  const heldRef = useRef('');
  useEffect(() => {
    if (mine && key) heldRef.current = key;
  }, [mine, key]);
  const release = () => {
    const at = heldRef.current;
    heldRef.current = '';
    if (at)
      void flushingRef.current
        .then(() => call({ op: 'release', artifactId: at }))
        .catch(() => undefined);
  };

  const call = (body: object) =>
    api.action<ArticleEditState>('nrTaskWork', 'articleEdit', {
      method: 'POST',
      body: { projectId: String(projectId), taskId, ...body },
      unwrap: 'data',
    });

  /** What the server holds, shown unless the person has changes of their own it has not saved yet. */
  const receive = (at: string, state: ArticleEditState) => {
    if (liveRef.current.key !== at) return;
    setRemote({ key: at, state, failed: false });
    const draft = state.draft?.artifactId === at ? state.draft : null;
    setLocal((old) => {
      if (old.key === at && old.unsaved && state.mine) return old;
      const base = liveRef.current.initial;
      if (!base) return old;
      return {
        key: at,
        form: draft ? withForm(base, draft.form) : null,
        ai: draft?.ai ?? 0,
        unsaved: 0,
      };
    });
  };

  // Opened when the version comes up for review, renewed while the page stays open, let go when it closes; someone
  // else's hold is asked about again on each beat, so the article opens for editing once they leave.
  useEffect(() => {
    // Approved or sent back: nothing is being edited now.
    if (!key) return release();
    let stopped = false;
    const open = () =>
      call({ op: 'open', artifactId: key }).then(
        (state) => {
          if (!stopped) receive(key, state);
        },
        () => {
          if (!stopped && liveRef.current.remote.key !== key)
            setRemote({ key, state: null, failed: true });
        },
      );
    void open();
    const beat = setInterval(() => void open(), ARTICLE_LEASE_HEARTBEAT_MS);
    return () => {
      stopped = true;
      clearInterval(beat);
      clearTimeout(timerRef.current);
      const { local: l } = liveRef.current;
      // What was typed in the last moment is saved before the article is let go.
      if (heldRef.current === key && l.key === key && l.unsaved && l.form)
        flushingRef.current = call({
          op: 'save',
          artifactId: key,
          form: keptForm(l.form),
          ai: l.ai,
        }).then(
          () => undefined,
          () => undefined,
        );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- the session follows the version, not each render
  }, [key, projectId, taskId]);

  // Let go when the page closes; a newer version of the same review is opened over the hold instead.
  useEffect(
    () => () => release(),
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- once, when the page closes
    [],
  );

  const save = async () => {
    const { key: at, local: l, mine: holding } = liveRef.current;
    if (!at || !holding || l.key !== at || !l.unsaved) return;
    const count = l.unsaved;
    setSaving(true);
    try {
      const state = await call(
        l.form
          ? { op: 'save', artifactId: at, form: keptForm(l.form), ai: l.ai }
          : { op: 'discard', artifactId: at },
      );
      if (liveRef.current.key !== at) return;
      setRemote({ key: at, state, failed: false });
      setLocal((old) =>
        old.key === at && old.unsaved === count ? { ...old, unsaved: 0 } : old,
      );
    } catch {
      if (liveRef.current.key === at)
        setRemote((old) => ({ ...old, key: at, failed: true }));
    } finally {
      setSaving(false);
    }
  };
  const later = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void save(), ARTICLE_AUTOSAVE_MS);
  };
  // A save that failed is tried again with the next change, or on the next beat.
  useEffect(() => {
    if (local.unsaved && remote.failed && !saving) later();
    // eslint-disable-next-line react-hooks/exhaustive-deps, @eslint-react/exhaustive-deps -- retried on the state that failed
  }, [remote.failed]);

  if (!reviewed || !initial) return null;
  const article = reviewed.article;
  const ownForm = local.key === key ? local.form : null;
  const form = ownForm ?? initial;
  const draft =
    remote.key === key && remote.state?.draft?.artifactId === key
      ? remote.state.draft
      : null;
  const holder =
    remote.key === key && remote.state && !remote.state.mine
      ? remote.state.lease?.name
      : undefined;
  const ai = local.key === key ? local.ai : 0;
  const unsaved = local.key === key ? local.unsaved : 0;
  return {
    artifactId: reviewed.out.id,
    form,
    ai,
    changed: !sameForm(form, initial),
    readOnly: !allowed || !ready || !mine,
    holder,
    othersEdits: Boolean(holder && ownForm && !sameForm(ownForm, initial)),
    savedAt: draft && !unsaved ? draft.savedAt : undefined,
    saving: saving || unsaved > 0,
    saveFailed: remote.key === key && remote.failed && unsaved > 0,
    set: (next) => {
      if (!key || !mine) return;
      setLocal((old) => ({
        key,
        form: sameForm(next, initial) ? null : next,
        ai: old.key === key ? old.ai : 0,
        unsaved: (old.key === key ? old.unsaved : 0) + 1,
      }));
      later();
    },
    accepted: () => {
      if (!key || !mine) return;
      setLocal((old) => ({
        ...old,
        key,
        ai: (old.key === key ? old.ai : 0) + 1,
        unsaved: (old.key === key ? old.unsaved : 0) + 1,
      }));
      later();
    },
    discard: async () => {
      if (!key || !mine) return;
      clearTimeout(timerRef.current);
      setLocal({ key, form: null, ai: 0, unsaved: 0 });
      try {
        receive(key, await call({ op: 'discard', artifactId: key }));
      } catch {
        // Saved as the version on the next change, or replaced by the next version.
      }
    },
    version: async () => {
      const { data: now, local: l } = liveRef.current;
      const own = l.key === key ? l.form : null;
      if (!own || sameForm(own, initial))
        return { artifactId: reviewed.out.id, revision: now.work.revision };
      clearTimeout(timerRef.current);
      const d = await update('editArticleDraft', {
        stageKey: reviewed.stage.key,
        artifactId: reviewed.out.id,
        article: formDraft(now, article, own),
        edits: { ai: l.ai },
      });
      const index = d?.work.stageIndex || 0,
        made = d?.work.results[index - 1];
      if (!d || !made) return null;
      // Saved as the version: nothing is left to save to the one it replaces.
      setLocal((old) => ({ ...old, unsaved: 0 }));
      return { artifactId: made.id, revision: d.work.revision };
    },
  };
}

/** The automatic save as the card says it: Saved automatically 18:22, Saving…, or that it could not be saved. */
export function savedText(
  session: ArticleEditSession,
  time: (iso: string) => string,
) {
  if (session.saveFailed) return $t('articleEdit.saveFailed');
  if (session.saving) return $t('articleEdit.saving');
  if (session.savedAt)
    return $t('articleEdit.savedAt', { 0: time(session.savedAt) });
  return '';
}

/**
 * Checks the form before a version is made of it, showing what is wrong in it (another language's field opens that
 * language); then makes the version. What to act on, or nothing.
 */
export function useArticleSubmit({
  data,
  article: a,
  session,
  onTab,
}: {
  data: TaskData;
  /** None while there is nothing being edited (the page that holds the form has no article under review). */
  article: ArticleProposal | undefined;
  session: ArticleEditSession | null;
  onTab: (tab: string) => void;
}) {
  const id = useId();
  const [submitted, setSubmitted] = useState(false);
  const errors =
    submitted && a && session ? formProblems(data, a, session.form) : {};
  return {
    id,
    errors,
    prepare: async () => {
      if (!a || !session) return null;
      setSubmitted(true);
      const first = Object.keys(formProblems(data, a, session.form))[0];
      if (first) {
        const l = first.split('.')[0];
        if (editableLocales(data, a).includes(l)) onTab(l);
        focusSoon(`${id}-${first}`);
        return null;
      }
      return session.version();
    },
  };
}
