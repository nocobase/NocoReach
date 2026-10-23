import type { ReactNode } from 'react';
import { ChevronDown, ExternalLink, Sparkles, UserSearch } from 'lucide-react';
import { useTranslation } from '@nocobase/i18n/client';
import { useNavigate } from 'react-router';
import { $t, $tj } from '#i18n';
import { formatDate, formatDateTime } from '#lib/format';
import { cn } from '#lib/utils';
import { ActorAvatar } from '#components/reach/actor';
import { Card } from './layout';
import { text } from './styles';
import { Button } from '#components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import type { TaskData } from '../task-execution-types';
import { AgentMenu } from './agent-menu';
import { articlePageUrl } from './article-page';
import { entryTitleKey, taskSource, type TaskSource } from '../task-source';
import { TaskStandingTag } from '../task-status-tag';

// The task's properties in their own card (2026-10-22 user request, as the sidebar of a Linear, Jira or GitHub issue):
// one label and value per row, so the header keeps only what to read. In the right column from 1280px, in two columns
// below that, one column on phones. Rows without a value are left out.

type Member = { id: string; name: string };

const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};

// Labels and values in one size, told apart by colour (2026-10-22: a smaller label beside a larger value looked off,
// as Linear, GitHub and Jira do it); each row 32px high, with a menu's text on the same left edge as plain values.
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 leading-5'>
      <dt className={cn(text.muted, 'py-1.5')}>{label}</dt>
      <dd className={cn(text.body, 'm-0 min-w-0 py-1.5 break-words')}>
        {children}
      </dd>
    </div>
  );
}

export function TaskProperties({
  data,
  members,
  allowed,
  busy,
  runActive,
  agentLocked,
  onOwner,
  onAgent,
  className,
}: {
  data: TaskData;
  members: Member[];
  allowed: boolean;
  busy: boolean;
  runActive: boolean;
  /** Why the Agent cannot be changed now, if it cannot. */
  agentLocked?: string;
  onOwner: (userId: string) => void;
  onAgent: (agentId: string) => Promise<boolean>;
  className?: string;
}) {
  const navigate = useNavigate(),
    w = data.work;
  const owners =
    members.some((m) => m.id === w.humanOwnerId) || !w.humanOwnerId
      ? members
      : [
          { id: w.humanOwnerId, name: w.humanOwnerName || w.humanOwnerId },
          ...members,
        ];
  const assigned =
    w.humanOwnerName || owners.find((m) => m.id === w.humanOwnerId)?.name;
  const ownerName = assigned || $t('common.unassigned');
  // An avatar only for a person: Unassigned stays plain text.
  const avatar = assigned ? (
    <ActorAvatar type='user' name={assigned} size='xs' />
  ) : null;
  const collaborators = w.collaborators || [],
    playbook = w.flow ? w.playbook?.name || w.flow.name : '',
    article = w.article?.articleId ? w.article : undefined,
    articleUrl = article
      ? articlePageUrl(data, article.targetId, article.slug)
      : '',
    started = w.history.find((h) => h.action === 'startTask')?.at;
  // Related tasks: the one before and after in a playbook chain, then the other tasks of the same opportunity
  // (2026-10-22: an opportunity is handed off one task per place to change).
  const chain = (data.related || []).filter((r) => r.relation !== 'sibling'),
    siblings = (data.related || []).filter((r) => r.relation === 'sibling'),
    insight = taskSource(data.task).insight;
  const owner =
    allowed && members.length ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size='sm'
              variant='ghost'
              className='-mx-2 -my-1.5 h-8 max-w-[calc(100%+1rem)] px-2 text-sm font-normal'
              disabled={busy || runActive}
              title={
                runActive
                  ? $t('taskDetail.executorRunningChangeAfterFinishes')
                  : undefined
              }
              aria-label={`${$t('common.owner')} · ${ownerName}`}
            >
              {avatar}
              <span className='truncate'>{ownerName}</span>
              <ChevronDown />
            </Button>
          }
        />
        <DropdownMenuContent align='start'>
          <DropdownMenuRadioGroup
            value={w.humanOwnerId || ''}
            onValueChange={(v) => {
              if (v && v !== w.humanOwnerId) onOwner(String(v));
            }}
          >
            {owners.map((m) => (
              <DropdownMenuRadioItem key={m.id} value={m.id}>
                {m.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <span className='inline-flex items-center gap-1.5'>
        {avatar}
        {ownerName}
      </span>
    );
  return (
    <Card
      as='aside'
      aria-label={$t('taskDetail.properties')}
      title={$t('taskDetail.properties')}
      className={className}
    >
      <dl className='-my-1.5 grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-1'>
        <Row label={$t('taskDetail.propSource')}>
          <Source
            source={taskSource(data.task)}
            onOpportunity={(id) =>
              void navigate(`/opportunities?item=${encodeURIComponent(id)}`)
            }
          />
        </Row>
        <Row label={$t('common.owner')}>{owner}</Row>
        <Row label={$t('taskDetail.agent')}>
          <AgentMenu
            data={data}
            busy={busy}
            locked={agentLocked}
            bare
            onChange={onAgent}
          />
        </Row>
        {collaborators.length > 0 && (
          <Row label={$t('taskDetail.collaborators')}>
            <span className='inline-flex flex-wrap items-center gap-1.5'>
              {collaborators.map((c) => (
                <span key={c.id} className='inline-flex items-center gap-1'>
                  <ActorAvatar type='user' name={c.name} size='xs' />
                  {c.name}
                </span>
              ))}
            </span>
          </Row>
        )}
        {playbook && <Row label={$t('common.playbook')}>{playbook}</Row>}
        {article && (
          <Row label={$t('articleTask.article')}>
            {articleUrl ? (
              <a
                className='nr-link'
                href={articleUrl}
                target='_blank'
                rel='noreferrer'
                title={article.slug}
              >
                {article.title || article.slug}
                <ExternalLink
                  className='ml-1 inline size-3 align-baseline'
                  aria-hidden='true'
                />
              </a>
            ) : (
              <span title={article.slug}>{article.title || article.slug}</span>
            )}
          </Row>
        )}
        {w.page && (
          <Row label={$t('common.relatedPage')}>
            <a
              className='nr-link break-all'
              href={w.page.url}
              target='_blank'
              rel='noreferrer'
              title={w.page.url}
            >
              {pathOf(w.page.url)}
              <ExternalLink
                className='ml-1 inline size-3 align-baseline'
                aria-hidden='true'
              />
            </a>
          </Row>
        )}
        {(data.related || []).length > 0 && (
          <Row label={$t('taskDetail.propRelated')}>
            <span className='flex flex-col items-start gap-1'>
              {chain.map((r) => (
                <button
                  key={r.id}
                  type='button'
                  className='nr-link text-left'
                  onClick={() => void navigate(`/actions/${r.id}`)}
                >
                  {r.relation === 'prev'
                    ? $t('taskDetail.previous')
                    : $t('taskDetail.next')}
                  {r.title}
                </button>
              ))}
              {siblings.length > 0 && (
                <span
                  className='flex w-full min-w-0 flex-col gap-1'
                  data-same-opportunity=''
                >
                  <span className='text-muted-foreground'>
                    {$tj('opportunityTasks.sameOpportunity', {
                      0: insight?.id ? (
                        <button
                          type='button'
                          className='nr-link'
                          onClick={() =>
                            void navigate(
                              `/opportunities?item=${encodeURIComponent(insight.id!)}`,
                            )
                          }
                        >
                          {insight.no
                            ? `O-${insight.no}`
                            : $t('common.opportunity')}
                        </button>
                      ) : (
                        $t('common.opportunity')
                      ),
                    })}
                  </span>
                  {siblings.map((r) => (
                    <span
                      key={r.id}
                      className='flex w-full min-w-0 items-center gap-2'
                    >
                      <button
                        type='button'
                        className='nr-link min-w-0 flex-1 truncate text-left'
                        title={r.title}
                        onClick={() => void navigate(`/actions/${r.id}`)}
                      >
                        {r.no ? `T-${r.no} ` : ''}
                        {r.title}
                      </button>
                      {r.state && <TaskStandingTag state={r.state} />}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </Row>
        )}
        {started && (
          <Row label={$t('taskDetail.propStarted')}>
            {formatDateTime(started)}
          </Row>
        )}
      </dl>
    </Card>
  );
}

// Who found the task and where (2026-10-22, before the owner): "Found by AI · O-41" with the analysis date, or
// "Found by <name>" with the page it was handed off from. An older task without its person shows the second line only.
function Source({
  source,
  onOpportunity,
}: {
  source: TaskSource;
  onOpportunity: (id: string) => void;
}) {
  const { t } = useTranslation();
  const at = source.at ? formatDate(source.at) : '';
  const entry = entryTitleKey(
    source.via === 'content' ? '/content' : source.entry,
  );
  const label =
    source.via === 'opportunity'
      ? $t('strategy.dailyAnalysisName')
      : source.via === 'change'
        ? $t('taskSource.fromInsights')
        : source.via === 'plan'
          ? $t('taskSource.plan')
          : source.via === 'newTask'
            ? $t('manualTask.newTask')
            : source.via === 'results'
              ? $t('taskSource.fromResults')
              : entry
                ? $t('taskSource.handedOffFrom', { 0: t(entry) })
                : source.via === 'dataPage'
                  ? $t('taskSource.handedOff')
                  : '';
  // The place, then the date; a task found nowhere in particular says only when it was created.
  const where = label
    ? [label, at].filter(Boolean).join(' · ')
    : at
      ? $t('taskSource.created', { 0: at })
      : '';
  return (
    <span className='flex flex-col'>
      {source.by === 'ai' ? (
        <span className='inline-flex flex-wrap items-center gap-x-1.5'>
          <span className='inline-flex items-center gap-1'>
            <Sparkles aria-hidden='true' className='size-3.5 text-agent' />
            {$t('taskSource.foundByAi')}
          </span>
          {source.insight?.id && (
            <>
              <span className='text-muted-foreground'>·</span>
              <button
                type='button'
                className='nr-link text-left'
                onClick={() => onOpportunity(source.insight!.id!)}
              >
                {source.insight.no
                  ? `O-${source.insight.no}`
                  : $t('common.opportunity')}
              </button>
            </>
          )}
        </span>
      ) : source.name ? (
        <span className='inline-flex items-center gap-1'>
          <UserSearch
            aria-hidden='true'
            className='size-3.5 shrink-0 text-muted-foreground'
          />
          {$t('taskSource.foundBy', { 0: source.name })}
        </span>
      ) : null}
      {where && <span className='text-muted-foreground'>{where}</span>}
    </span>
  );
}
