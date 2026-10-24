import { usePageBreadcrumb } from '@nocobase/app-client';
import { useEffect, useState, type ReactElement } from 'react';
import {
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from 'react-router';
import { ArrowLeft, Pencil, Rocket } from 'lucide-react';
import { $t, useNocoReachLocale } from '#i18n';
import { PageContainer } from '#components/reach/page';
import { RouteChildPage } from '#components/route-child-page';
import { Button } from '#components/ui/button';
import { cn } from '#lib/utils';
import { mockSettingsAvailable } from '../../../app-plugins/nocoreach-mock/client/index.js';
import { getStageExecutor } from '../playbook-model';
import {
  articleLanguages,
  translationPending,
  type ArticleView,
} from './article-model';
import {
  ArticleEditor,
  ArticleLanguage,
  LanguageTabs,
  MissingLanguages,
  ViewSwitch,
} from './article-review.js';
import { useTaskDraft, useTaskDraftStatus } from './draft-store.js';
import { TaskDraftScope } from './drafts.js';
import type { TaskPageContext } from './reader-context.js';
import { Checklist, RequestBox } from './review-parts.js';
import { text } from './styles.js';

// The article on a page of its own (2026-10-24 user request, as Ghost's full-screen preview and Notion's "open as
// page"): the rendered article at reading width with nothing beside it, and a slim bar on top with the language, the
// Preview | Changes switch and the review's actions, so the reader can act as soon as they have read it. It is a child
// page of the task (/actions/:taskId/article?lang=en&view=preview), so it opens in a new tab or from a shared link;
// the task page stays mounted underneath, and Back to task or Esc returns to it where it was scrolled.

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
  const [editing, setEditing] = useTaskDraft('editing', false, false);
  const [requesting, setRequesting] = useTaskDraft('requesting', false, false);
  const [checked, setChecked] = useState<string[]>([]);
  const { clear } = useTaskDraftStatus();
  const back = () => void navigate('..', { relative: 'path' });
  // After an approval or a change request the task moves on: go back once the command has settled, since the task
  // page holds navigation while one is in flight.
  const [leave, setLeave] = useState(false);
  useEffect(() => {
    if (leave && !busy) void navigate('..', { relative: 'path' });
  }, [leave, busy, navigate]);
  // Esc returns to the task, except while editing (the edit is kept as a draft either way) or typing feedback.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || editing) return;
      const el = e.target;
      if (
        el instanceof Element &&
        el.closest('input, textarea, select, [contenteditable="true"]')
      )
        return;
      void navigate('..', { relative: 'path' });
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editing, navigate]);

  const backButton = (
    <Button variant='ghost' size='sm' onClick={back}>
      <ArrowLeft />
      {$t('articleTask.backToTask')}
    </Button>
  );
  if (!out?.article || !stage)
    return (
      <PageContainer>
        {backButton}
        <p className={text.muted}>{$t('articleTask.noArticleYet')}</p>
      </PageContainer>
    );
  const article = out.article;
  const languages = articleLanguages(data, article);
  const asked = params.get('lang') || '';
  const tab = languages.locales.includes(asked)
    ? asked
    : languages.locales.find(languages.changed) || languages.locales[0];
  const versions = languages.versions(tab);
  const askedView = params.get('view');
  const view: ArticleView =
    versions && (askedView === 'preview' || askedView === 'changes')
      ? askedView
      : languages.defaultView(tab);
  const show = (lang: string, next: ArticleView) =>
    setParams({ lang, view: next }, { replace: true });
  const act = async (command: string, body: object) => {
    const result = await update(command, { stageKey: stage.key, ...body });
    if (result) clear();
    return result;
  };
  const missingChecks = (stage.checklist || []).some(
    (c) => c.required && !checked.includes(c.key),
  );
  const targetGone = !(data.articleTargets || []).some(
    (t) => t.id === article.targetId,
  );
  const actions = reviewing && allowed && !editing;
  return (
    <PageContainer className='gap-0'>
      <div className='sticky top-0 z-10 -mx-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-background px-4 py-2'>
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
          {actions && (
            <>
              {!targetGone && (
                <Button
                  disabled={busy || missingChecks}
                  onClick={() =>
                    void act('approveStage', {
                      artifactId: out.id,
                      checked,
                    }).then((d) => {
                      if (d) setLeave(true);
                    })
                  }
                >
                  <Rocket />
                  {$t(
                    translationPending(data)
                      ? 'articleTask.approveTranslate'
                      : mockSettingsAvailable()
                        ? 'taskDetail.approveAndSimulatePublish'
                        : 'taskDetail.approveAndPublish',
                  )}
                </Button>
              )}
              <Button
                variant='outline'
                disabled={busy}
                onClick={() => setRequesting(!requesting)}
              >
                {$t('taskDetail.requestChanges')}
              </Button>
              <Button
                variant='ghost'
                disabled={busy}
                onClick={() => setEditing(true)}
              >
                <Pencil />
                {$t('taskDetail.editDirectly')}
              </Button>
            </>
          )}
        </div>
      </div>
      <div
        className={cn(
          'mx-auto flex w-full min-w-0 flex-col gap-4 py-6',
          // The editor writes beside its live preview, so it gets the page's width; reading keeps a reading width.
          editing ? 'max-w-6xl' : 'max-w-3xl',
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
        {requesting && actions && (
          <RequestBox
            executor={getStageExecutor().agent}
            busy={busy}
            onCancel={() => setRequesting(false)}
            onSend={async (comment) => {
              const d = await act('requestStageChanges', {
                artifactId: out.id,
                comment,
              });
              if (d) setLeave(true);
              return Boolean(d);
            }}
          />
        )}
        {editing && reviewing ? (
          <ArticleEditor
            data={data}
            article={article}
            draftKey={out.id}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSave={async (next) => {
              const d = await act('editArticleDraft', {
                artifactId: out.id,
                article: next,
              });
              if (d) setEditing(false);
              return Boolean(d);
            }}
          />
        ) : (
          <>
            <MissingLanguages languages={languages} />
            <ArticleLanguage
              data={data}
              article={article}
              base={languages.base}
              tab={tab}
              view={view}
            />
            {actions && (
              <Checklist
                stage={stage}
                checked={checked}
                setChecked={setChecked}
                busy={busy}
              />
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
}
