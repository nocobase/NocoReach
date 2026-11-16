import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { $t } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Button } from '#components/ui/button';
import { pageKey } from '../../../shared/opportunity-parts.js';
import { translatesArticle } from '../../../shared/playbook-catalog';
import type { PlaybookList } from '../playbook-model';
import type { TaskData } from '../task-execution-types';
import { LanguagesLine, PageList } from './article-start';
import { joinNames, type ArticleFound } from './article-model';
import { Card, Clamped, Field } from './layout';
import { TaskMedia } from './media';
import { PlaybookDrawer } from './playbook-drawer';
import { startedPlace } from './step-place';
import { startBrief, startedDelivery, startedPlaybook } from './started-model';
import { text } from './styles';

// What the task was started with (2026-11-02 user decision, ui-references/task-brief-2026-11-02/brief-after-start-b.png):
// once it starts, the start card's content stays on the page, read-only, under the card for what to do now, with the
// same labels in the same order: the brief, the playbook, the pages to change with their languages, where the change
// goes and the attachments. Fields without a value are left out. Anything to add is a message in Activity.

/** The titles of the site's pages in Website content, read without asking the publishing targets. */
function usePageTitles(projectId: number, taskId: string, urls: string[]) {
  const key = urls.length ? `${projectId}\n${taskId}\n${urls.join('\n')}` : '';
  const [found, setFound] = useState<{
    key: string;
    titles: Map<string, string>;
  }>();
  useEffect(() => {
    if (!key) return;
    const c = new AbortController();
    void api
      .action<ArticleFound>('nrTaskWork', 'pagePlaces', {
        method: 'POST',
        body: { projectId: String(projectId), taskId, match: false },
        unwrap: 'data',
        signal: c.signal,
      })
      .then(
        (r) => {
          if (c.signal.aborted) return;
          const titles = new Map<string, string>();
          for (const p of r?.pages || [])
            if (p.title) titles.set(pageKey(p.url), p.title);
          setFound({ key, titles });
        },
        () => undefined,
      );
    return () => c.abort();
  }, [key, projectId, taskId]);
  return found?.key === key ? found.titles : undefined;
}

export function StartedCard({
  data,
  list,
  projectId,
  taskId,
  onChangePlaybook,
}: {
  data: TaskData;
  list?: PlaybookList;
  projectId: number;
  taskId: string;
  /** Change playbook (shared/playbook-change.ts), offered on the playbook's line while the playbook can change. */
  onChangePlaybook?: () => void;
}) {
  const w = data.work,
    [viewing, setViewing] = useState(false);
  const brief = startBrief(data, true),
    delivery = startedDelivery(data),
    playbook = startedPlaybook(w, list);
  const translate = translatesArticle(
    list?.playbooks.find((p) => p.id === playbook?.id) || w.playbook,
  );
  const site = delivery?.kind === 'site' ? delivery.pages : [],
    titles = usePageTitles(
      projectId,
      taskId,
      site.map((p) => p.url),
    );
  const pages =
    delivery?.kind === 'site'
      ? site.map((p) => {
          // The server names the same addresses; the linked page may be another address of the page.
          const linked =
            pageKey(w.page?.url, data.pageIdentity) ===
            pageKey(p.url, data.pageIdentity)
              ? w.page?.title
              : '';
          return {
            url: p.url,
            title: titles?.get(pageKey(p.url)) || linked || undefined,
          };
        })
      : delivery?.pages || [];
  const targetName = (id: string) =>
    data.articleTargets?.find((t) => t.id === id)?.name || id;
  const languages =
    delivery?.kind === 'article' ? (
      <LanguagesLine languages={delivery.locales} translate={translate} />
    ) : null;
  const where =
    delivery?.kind === 'article' ? (
      <span data-started-where='article'>
        {joinNames(delivery.targets.map(targetName))} ·{' '}
        {$t('articleTask.publishDirect')}
      </span>
    ) : delivery?.repo ? (
      <span data-started-where='repo'>
        <a
          className='nr-link break-all'
          href={`https://github.com/${delivery.repo.repo}`}
          target='_blank'
          rel='noreferrer'
          data-task-repo=''
        >
          {delivery.repo.repo}
          <ExternalLink
            className='ml-1 inline size-3 align-baseline'
            aria-hidden='true'
          />
        </a>{' '}
        · {$t('articleTask.viaPr')}
      </span>
    ) : null;
  const attachments =
    Array.isArray(data.task.evidence?.attachmentIds) &&
    data.task.evidence.attachmentIds.length > 0;
  const title = $t('taskDetail.givenAtStart');
  return (
    <Card aria-label={title} title={title} data-started-card=''>
      {brief.text && (
        <Field label={brief.title}>
          <Clamped long={brief.long}>{brief.text}</Clamped>
        </Field>
      )}
      {playbook && (
        <Field label={$t('common.playbook')}>
          <p className={text.body}>
            {playbook.name} ·{' '}
            <Button
              variant='link'
              size='sm'
              className='h-auto p-0 align-baseline font-normal'
              onClick={() => setViewing(true)}
            >
              {$t('taskDetail.viewSteps')}
            </Button>
            {onChangePlaybook && (
              <>
                {' '}
                ·{' '}
                <Button
                  variant='link'
                  size='sm'
                  className='h-auto p-0 align-baseline font-normal'
                  onClick={onChangePlaybook}
                >
                  {$t('taskDetail.changePlaybook')}
                </Button>
              </>
            )}
          </p>
          <PlaybookDrawer
            playbook={playbook}
            place={startedPlace(data)}
            open={viewing}
            onClose={() => setViewing(false)}
          />
        </Field>
      )}
      {pages.length > 0 && (
        <Field
          label={$t(
            translate ? 'articleTask.articleToTranslate' : 'taskPages.label',
          )}
        >
          <PageList pages={pages} stacked />
          {languages}
        </Field>
      )}
      {where && (
        <Field label={$t('articleTask.changesGoTo')}>
          <p className={text.body}>{where}</p>
          {/* A new article has no page to change: its languages go with where it is published. */}
          {!pages.length && languages}
        </Field>
      )}
      {attachments && (
        <Field label={$t('manualTask.attachments')}>
          <TaskMedia projectId={projectId} taskId={taskId} compact />
        </Field>
      )}
    </Card>
  );
}
