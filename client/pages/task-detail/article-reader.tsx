import { usePageBreadcrumb } from '@nocobase/app-client';
import { useEffect, useState, type ReactElement } from 'react';
import {
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { $t, useNocoReachLocale } from '#i18n';
import { PageContainer } from '#components/reach/page';
import { RouteChildPage } from '#components/route-child-page';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';
import { mockSettingsAvailable } from '../../../app-plugins/nocoreach-mock/client/index.js';
import {
  articleLanguages,
  reviewRound,
  type ArticleView,
} from './article-model';
import {
  ArticleLanguage,
  LanguageTabs,
  MissingLanguages,
  ViewSwitch,
} from './article-review.js';
import {
  ArticleEditActions,
  ArticleEditFields,
  RequestChangesBox,
} from './article-edit.js';
import { editedLine } from './article-edit-model.js';
import { useArticleEdit, useArticleSubmit } from './article-edit-session.js';
import { useStayWithDrafts, useTaskDraftStatus } from './draft-store.js';
import { useStickyHead } from './sticky-head.js';
import { nextVersion } from '../../../shared/article-versions.js';
import { TaskDraftScope } from './drafts.js';
import type { TaskPageContext } from './reader-context.js';
import { Checklist } from './review-parts.js';
import { text } from './styles.js';

// The article on a page of its own (2026-10-24 user request, as Ghost's full-screen preview and Notion's "open as
// page"): the rendered article at reading width with nothing beside it, and a slim bar on top with the language, the
// Preview | Changes switch and the review's actions, so the reader can act as soon as they have read it. It is a child
// page of the task (/actions/:taskId/article?lang=en&view=preview), so it opens in a new tab or from a shared link;
// the task page stays mounted underneath, and Back to task or Esc returns to it where it was scrolled. While the
// article waits for review it is edited here as in the task's card (article-edit.tsx), with the same edits.

export default function ArticleReaderPage(): ReactElement {
  useNocoReachLocale();
  const context = useOutletContext<TaskPageContext>();
  const { taskId = '' } = useParams();
  usePageBreadcrumb([
    { label: $t('common.tasks'), to: '/actions' },
    { label: context.crumb, to: `/actions/${taskId}` },
    { label: $t('articleTask.article') },
  ]);
  return (
    <RouteChildPage>
      <TaskDraftScope scope={context.draftScope}>
        <Reader context={context} />
      </TaskDraftScope>
    </RouteChildPage>
  );
}

function Reader({ context }: { context: TaskPageContext }): ReactElement {
  const { data, update, busy, error, allowed } = context;
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const session = useArticleEdit();
  const w = data.work,
    index = w.stageIndex || 0,
    stage = w.flow?.stages[index];
  const closed = Boolean(w.cancelledAt || w.archivedAt) || w.stage === 'done';
  // The version under review when the step waits for one; otherwise the latest article the task delivered, to read.
  const reviewing =
    !closed &&
    stage?.kind === 'review' &&
    w.flow?.stages[index + 1]?.kind === 'release' &&
    Boolean(w.results[index - 1]?.article);
  const out = reviewing
    ? w.results[index - 1]
    : [...w.results].reverse().find((r) => r?.article);
  // Under review, whoever may review edits it here as in the card, with the same edits (2026-11-04 user request).
  const editing = Boolean(reviewing && allowed && session);
  const [checked, setChecked] = useState<string[]>([]);
  const [asking, setAsking] = useState(false);
  const { clear } = useTaskDraftStatus();
  const barRef = useStickyHead<HTMLDivElement>();
  // The task page stays mounted under this one with the same drafts, so going back and forth never asks about them
  // (2026-11-04: an edit taken full screen comes back to the task still being edited).
  const stay = useStayWithDrafts();
  const back = () => {
    stay();
    void navigate('..', { relative: 'path' });
  };
  // After an approval the task moves on: go back once the command has settled, since the task page holds navigation
  // while one is in flight.
  const [leave, setLeave] = useState(false);
  useEffect(() => {
    if (!leave || busy) return;
    stay();
    void navigate('..', { relative: 'path' });
  }, [leave, busy, navigate, stay]);
  // Esc returns to the task, except while typing in a field or the article (the edits are kept either way).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const el = e.target;
      if (
        el instanceof Element &&
        el.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      stay();
      void navigate('..', { relative: 'path' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate, stay]);

  const article = out?.article;
  const languages = article ? articleLanguages(data, article) : null;
  const asked = params.get('lang') || '';
  const show = (lang: string, next?: ArticleView) => {
    stay();
    setParams(next ? { lang, view: next } : { lang }, { replace: true });
  };
  const submit = useArticleSubmit({
    data,
    article: editing ? article : undefined,
    session,
    onTab: (l) => show(l),
  });

  const backButton = (
    <Button variant='ghost' size='sm' onClick={back}>
      <ArrowLeft />
      {$t('articleTask.backToTask')}
    </Button>
  );
  if (!out || !article || !languages || !stage)
    return (
      <PageContainer>
        {backButton}
        <p className={text.muted}>{$t('articleTask.noArticleYet')}</p>
      </PageContainer>
    );
  const tab = languages.locales.includes(asked) ? asked : languages.first;
  const versions = languages.versions(tab);
  const askedView = params.get('view');
  const view: ArticleView =
    versions && (askedView === 'preview' || askedView === 'changes')
      ? askedView
      : languages.defaultView(tab);
  const act = async (command: string, body: object) => {
    const result = await update(command, { stageKey: stage.key, ...body });
    if (result) clear();
    return result;
  };
  // The edits made a version first; the command then acts on that version.
  const versioned = async (command: string, body: object) => {
    const v = await submit.prepare(command === 'approveStage');
    return v
      ? act(command, {
          ...body,
          artifactId: v.artifactId,
          revision: v.revision,
        })
      : undefined;
  };
  const missingChecks = (stage.checklist || []).some(
    (c) => c.required && !checked.includes(c.key),
  );
  const targetGone = !(data.articleTargets || []).some(
    (t) => t.id === article.targetId,
  );
  // The same round as the task's card (reviewRound): a version that changed none of the other languages offers Update
  // again first, and publishing the primary only.
  const simulated =
      mockSettingsAvailable() || Boolean(data.task.evidence?.simulated),
    round = reviewRound(data, article, simulated),
    nothing = reviewing && round.nothing;
  const versionsList = [
    ...(data.artifacts || []),
    ...(w.results.filter(Boolean) as NonNullable<(typeof w.results)[number]>[]),
  ];
  return (
    <PageContainer className='gap-0'>
      <div
        ref={barRef}
        className='sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-2'
      >
        {backButton}
        {!editing && (
          <LanguageTabs
            locales={languages.locales}
            tab={tab}
            onTab={(l) => show(l, languages.defaultView(l))}
          />
        )}
        <div className='ml-auto flex flex-wrap items-center gap-2'>
          {!editing && versions && (
            <ViewSwitch value={view} onChange={(v) => show(tab, v)} />
          )}
          {editing && session && (
            <ArticleEditActions
              session={session}
              version={out.version}
              busy={busy}
              request={() => setAsking(true)}
              lead={
                nothing ? (
                  <Button
                    disabled={busy || session.readOnly}
                    onClick={() =>
                      void versioned('requestStageChanges', {
                        comment: round.againComment,
                      }).then((d) => {
                        if (d) setLeave(true);
                      })
                    }
                  >
                    <RotateCcw />
                    {round.again}
                  </Button>
                ) : undefined
              }
              approve={
                targetGone
                  ? undefined
                  : {
                      label:
                        round.approve ||
                        $t(
                          simulated
                            ? 'taskDetail.approveAndSimulatePublish'
                            : 'taskDetail.approveAndPublish',
                        ),
                      primary: !nothing,
                      disabled: missingChecks || session.readOnly,
                      run: () =>
                        void versioned('approveStage', { checked }).then(
                          (d) => {
                            if (d) setLeave(true);
                          },
                        ),
                    }
              }
            />
          )}
        </div>
      </div>
      <div
        className={cn(
          'mx-auto flex w-full min-w-0 flex-col gap-4 py-6',
          // The editor gets more of the page than reading, which keeps a reading width.
          editing ? 'max-w-5xl' : 'max-w-3xl',
        )}
      >
        {error && (
          <p role='alert' className='nr-error'>
            {error}
          </p>
        )}
        {targetGone && reviewing && (
          <p role='alert' className='text-sm text-destructive'>
            {$t('articles.targetMissing')}
          </p>
        )}
        {nothing && <p className={text.muted}>{round.hint}</p>}
        {editing && session && asking && (
          <RequestChangesBox
            session={session}
            nextVersion={nextVersion(versionsList, out.stepId)}
            busy={busy}
            onCancel={() => setAsking(false)}
            onSend={async (comment, imageIds) => {
              const d = await versioned('requestStageChanges', {
                comment,
                ...(imageIds.length ? { imageIds } : {}),
              });
              if (d) setLeave(true);
              return Boolean(d);
            }}
          />
        )}
        {editing && session ? (
          <>
            {session.changed && (
              <p className={text.muted}>{editedLine(session, out.version)}</p>
            )}
            <ArticleEditFields
              data={data}
              article={article}
              session={session}
              tab={asked}
              onTab={(l) => show(l)}
              id={submit.id}
              errors={submit.errors}
            />
            <Checklist
              stage={stage}
              checked={checked}
              setChecked={setChecked}
              busy={busy}
            />
          </>
        ) : (
          <>
            <MissingLanguages languages={languages} unchanged={reviewing} />
            <ArticleLanguage
              data={data}
              article={article}
              base={languages.base}
              tab={tab}
              view={view}
            />
          </>
        )}
      </div>
    </PageContainer>
  );
}
