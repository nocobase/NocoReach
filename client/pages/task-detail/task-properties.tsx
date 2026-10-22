import type { ReactNode } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router';
import { $t } from '#i18n';
import { formatDateTime } from '#lib/format';
import { cn } from '#lib/utils';
import { ActorAvatar } from '#components/reach/actor';
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

// The task's properties in their own column (2026-10-22 user request, as the sidebar of a Linear, Jira or GitHub
// issue): one label and value per row, so the header keeps only what to read. Beside the content from 1280px, above
// it in two columns below that, one column on phones. Rows without a value are left out.

type Member = { id: string; name: string };

const pathOf = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className='grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-3 py-1.5'>
      <dt className='pt-0.5 text-xs text-muted-foreground'>{label}</dt>
      <dd className='m-0 min-w-0 text-sm break-words'>{children}</dd>
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
  const evidence = data.task.evidence as
    | {
        insight?: { id?: string; no?: number };
        createdBy?: { id?: string; name?: string };
      }
    | undefined;
  const insight = evidence?.insight;
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
  const owner =
    allowed && members.length ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              size='sm'
              variant='ghost'
              className='-ml-2 h-7 max-w-full px-2 font-normal'
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
    <aside
      aria-label={$t('taskDetail.properties')}
      className={cn('min-w-0', className)}
    >
      <dl className='m-0 grid grid-cols-1 gap-x-8 sm:grid-cols-2 xl:grid-cols-1'>
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
        {insight?.id && (
          <Row label={$t('taskDetail.propSource')}>
            <button
              type='button'
              className='nr-link text-left'
              onClick={() =>
                void navigate(
                  `/opportunities?item=${encodeURIComponent(insight.id!)}`,
                )
              }
            >
              {insight.no ? `O-${insight.no}` : $t('common.opportunity')}
            </button>
          </Row>
        )}
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
              {data.related!.map((r) => (
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
            </span>
          </Row>
        )}
        {started && (
          <Row label={$t('taskDetail.propStarted')}>
            <span className='text-muted-foreground'>
              {formatDateTime(started)}
            </span>
          </Row>
        )}
      </dl>
    </aside>
  );
}
