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
  agentPicker,
  onAgentPicker,
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
  /** The Agent menu opened from elsewhere on the page (a failed step's Switch Agent). */
  agentPicker?: boolean;
  onAgentPicker?: (open: boolean) => void;
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
  const insight = taskSource(data.task).insight;
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
            open={agentPicker}
            onOpenChange={onAgentPicker}
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
        {started && (
          <Row label={$t('taskDetail.propStarted')}>
            {formatDateTime(started)}
          </Row>
        )}
      </dl>
      <RelatedTasks
        related={data.related || []}
        opportunity={
          insight?.id
            ? { id: insight.id, label: insight.no ? `O-${insight.no}` : '' }
            : undefined
        }
        onOpen={(id) => void navigate(`/actions/${id}`)}
        onOpportunity={(id) =>
          void navigate(`/opportunities?item=${encodeURIComponent(id)}`)
        }
      />
    </Card>
  );
}

type Related = NonNullable<TaskData['related']>[number];

/**
 * Related tasks below the properties, in groups (2026-10-24 user decision): the task this one was handed off from,
 * the other tasks of the same opportunity, and the tasks handed off from this one. A task is listed once, in its
 * closest relation (previous or next before the same opportunity); empty groups, and the section, are left out.
 */
function RelatedTasks({
  related,
  opportunity,
  onOpen,
  onOpportunity,
}: {
  related: Related[];
  opportunity?: { id: string; label: string };
  onOpen: (id: number) => void;
  onOpportunity: (id: string) => void;
}) {
  const seen = new Set<string>();
  const pick = (relation: Related['relation']) =>
    related.filter((r) => {
      if (r.relation !== relation || seen.has(String(r.id))) return false;
      seen.add(String(r.id));
      return true;
    });
  const prev = pick('prev'),
    next = pick('next'),
    same = pick('sibling');
  if (!prev.length && !next.length && !same.length) return null;
  const group = (caption: ReactNode, items: Related[], name: string) =>
    items.length > 0 && (
      <div className='flex flex-col gap-0.5' data-related={name}>
        <p className='text-xs text-muted-foreground'>{caption}</p>
        <ul className='flex flex-col'>
          {items.map((r) => (
            <li key={r.id}>
              <button
                type='button'
                className='-mx-2 flex w-[calc(100%+1rem)] min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted'
                title={r.title}
                onClick={() => onOpen(r.id)}
              >
                {r.no ? (
                  <span className='shrink-0 text-muted-foreground tabular-nums'>
                    T-{r.no}
                  </span>
                ) : null}
                <span className='min-w-0 flex-1 truncate'>{r.title}</span>
                {r.state && <TaskStandingTag state={r.state} />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section
      aria-label={$t('taskDetail.propRelated')}
      className='mt-3 flex flex-col gap-3 border-t pt-3'
    >
      <h3 className={cn(text.muted, 'font-normal')}>
        {$t('taskDetail.propRelated')}
      </h3>
      {group($t('taskDetail.relatedPrev'), prev, 'prev')}
      {group(
        // Tasks split off for pages in another place (2026-10-29) without an opportunity share the hand-off instead.
        !opportunity && same.every((r) => r.pages)
          ? $t('taskPages.relatedSplit')
          : $tj('taskDetail.relatedSame', {
              0: opportunity ? (
                <button
                  type='button'
                  className='nr-link'
                  onClick={() => onOpportunity(opportunity.id)}
                >
                  {opportunity.label || $t('common.opportunity')}
                </button>
              ) : (
                $t('common.opportunity')
              ),
            }),
        same,
        'same',
      )}
      {group($t('taskDetail.relatedNext'), next, 'next')}
    </section>
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
