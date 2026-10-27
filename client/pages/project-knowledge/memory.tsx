import {
  $legacyText,
  $t,
  $tj,
  getCurrentLocale,
  useNocoReachLocale,
} from '#i18n';
import { useState, type ReactElement, type ReactNode } from 'react';
import { Link, Outlet, useLocation, useOutletContext } from 'react-router';
import { LoaderCircleIcon, PencilIcon } from 'lucide-react';
import { LongText } from '#components/long-text';
import { AiMark } from '#components/reach/actor';
import { InfoTip } from '#components/reach/info-tip';
import { HeaderActions } from '#components/reach/page';
import { RefreshButton } from '#components/reach/refresh-button';
import { InlineError } from '#components/reach/states';
import { Tag } from '#components/reach/tag';
import { Button } from '#components/ui/button';
import { useBusinessAccess } from '#hooks/use-business-access';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { toast } from '#lib/toast';
import type { SupportedLocale } from '../../../shared/i18n/locales';
import {
  contentLanguageName,
  contentLanguageOf,
  contentLanguages,
} from '../content-language';
import { help } from '../glossary';
import {
  day,
  getMemorySections,
  memoryOf,
  SUGGESTED,
  type MemorySuggestion,
  type ProjectKnowledgeContext,
} from './model';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';

// 记忆 tab: how full it is, the AI's update suggestions to accept or ignore, and one row per item — the project name,
// the language the AI writes in, and the nine handbook sections. One Edit opens every item in a dialog over this tab
// (user decision 2026-10-21, instead of a pencil per row); Generate from the website and materials first shows what the AI will read.
export default function MemoryTab(): ReactElement {
  // Tabs and overlays are not gated routes: follow a language change here.
  useNocoReachLocale();
  const context = useOutletContext<ProjectKnowledgeContext>();
  const { project, updates } = context;
  const memory = memoryOf(project),
    sections = getMemorySections();
  const filled = sections.filter(([k]) => memory[k]).length,
    total = Object.values(memory).reduce((n, t) => n + t.length, 0);
  const { can: canDraft } = useBusinessAccess('nrMemory.draft', project.id),
    { can: canSave } = useBusinessAccess('nrKnowledge.saveMemory', project.id);
  const location = useLocation();
  return (
    <div className='flex flex-col gap-4' data-memory-tab>
      <div className='flex flex-wrap items-center gap-2'>
        <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
          {$tj('projectKnowledge.memorySummary', {
            0: filled,
            1: sections.length,
            2: total.toLocaleString(getCurrentLocale()),
          })}
          <InfoTip label={$t('projectKnowledge.whatMemory')}>
            <p>{help($t('projectKnowledge.memory'))}</p>
            <p>
              {$tj('projectKnowledge.memoryLengthHelp', {
                0: SUGGESTED.toLocaleString(getCurrentLocale()),
              })}
            </p>
          </InfoTip>
        </p>
        {total > SUGGESTED ? (
          <Tag tone='amber'>{$t('projectKnowledge.tooLong')}</Tag>
        ) : null}
        {canDraft ? (
          <Button
            size='sm'
            variant='outline'
            className='ml-auto'
            nativeButton={false}
            render={
              <Link to={{ pathname: 'generate', search: location.search }} />
            }
          >
            {updates.status?.draft?.status === 'done'
              ? $t('projectKnowledge.regenerate')
              : $t('projectKnowledge.generateWebsiteMaterials')}
          </Button>
        ) : null}
        {canSave ? (
          <Button
            size='sm'
            variant='outline'
            className={canDraft ? undefined : 'ml-auto'}
            nativeButton={false}
            render={<Link to={{ pathname: 'edit', search: location.search }} />}
          >
            <PencilIcon />
            {$t('common.edit')}
          </Button>
        ) : null}
      </div>
      <MemoryUpdates projectId={project.id} updates={updates} />
      <MemoryList context={context} />
      <Outlet context={context} />
    </div>
  );
}

function MemoryUpdates({
  projectId,
  updates,
}: {
  projectId: number;
  updates: ProjectKnowledgeContext['updates'];
}): ReactElement | null {
  const { can: canDraft } = useBusinessAccess('nrMemory.draft', projectId),
    { can: canCheck } = useBusinessAccess('nrMemory.check', projectId),
    { can: canAccept } = useBusinessAccess('nrMemory.accept', projectId),
    { can: canDismiss } = useBusinessAccess('nrMemory.dismiss', projectId),
    { can: canSeen } = useBusinessAccess('nrMemory.seen', projectId);
  const { status, busy, error } = updates,
    [showRead, setShowRead] = useState(false);
  if (!status)
    return error ? (
      <InlineError
        action={
          <Button
            size='xs'
            variant='outline'
            className='ml-auto'
            onClick={updates.reload}
          >
            {$t('common.retry')}
          </Button>
        }
      >
        {error}
      </InlineError>
    ) : null;
  const d = status.draft,
    c = status.lastCheck;
  // When the AI last looked for updates, read as every status line's "Updated" (2026-10-22 decision D2); the weekly
  // routine is in the ⓘ, and Check now sits at the top right as every page's refresh does.
  const checkLine = status.aiReady ? (
    <span className='flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground'>
      <span>
        {c
          ? $tj('projectKnowledge.lastCheckedAt', {
              0: day(c.at),
              1: c.ok
                ? c.added
                  ? $t('projectKnowledge.suggestions', { 0: c.added })
                  : $t('projectKnowledge.nothingUpdate')
                : $t('projectKnowledge.notComplete', {
                    0: $legacyText(c.error),
                  }),
            })
          : $t('projectKnowledge.notCheckedYet')}
      </span>
      <InfoTip label={$t('projectKnowledge.howUpdatesWork')}>
        {$t('projectKnowledge.weeklyCheckHelp')}
      </InfoTip>
      {canCheck ? (
        <HeaderActions>
          <RefreshButton
            busy={status.running === 'check'}
            disabled={busy || Boolean(status.running)}
            label={$t('common.checkNow')}
            onClick={() => void updates.run('check')}
          />
        </HeaderActions>
      ) : null}
    </span>
  ) : (
    <span className='text-xs text-muted-foreground'>
      {$t('projectKnowledge.onlineAiConnectedWritesFirst')}
    </span>
  );
  return (
    <div className='flex flex-col gap-3'>
      {error ? (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      ) : null}
      {status.running ? (
        <p
          aria-live='polite'
          className='flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm'
        >
          <LoaderCircleIcon
            className='size-4 animate-spin'
            aria-hidden='true'
          />
          {status.running === 'draft'
            ? $t('projectKnowledge.readingWebsiteMaterialsWriteFirst')
            : $t('projectKnowledge.checkingUpdates')}
        </p>
      ) : d && !d.seen ? (
        d.status === 'done' ? (
          <div
            className='rounded-md bg-nr-tint-blue px-3 py-2 text-sm text-nr-ink-blue'
            data-memory-draft
          >
            <p>
              {$tj('projectKnowledge.aiDraftReadWebsitePages', {
                0: d.pages?.length || 0,
                1: d.items?.length
                  ? $t('projectKnowledge.materials', { 0: d.items.length })
                  : '',
                2: day(d.at),
                3: d.filled?.length
                  ? $t('projectKnowledge.filled', { 0: d.filled.join('、') })
                  : $t('projectKnowledge.nothingFoundEmptySections'),
                4: d.suggested
                  ? $t(
                      'projectKnowledge.suggestionsSectionsAlreadyWrittenBelow',
                      { 0: d.suggested },
                    )
                  : '',
              })}
            </p>
            {showRead ? (
              <ul className='mt-1.5 list-disc pl-5 text-xs'>
                {d.pages?.map((p) => (
                  <li key={p.url}>
                    <a
                      className='nr-link'
                      href={p.url}
                      target='_blank'
                      rel='noreferrer'
                    >
                      {p.title || p.url}
                    </a>
                  </li>
                ))}
                {d.items?.map((t) => (
                  <li key={t}>
                    {$tj('projectKnowledge.knowledgeBaseValue', { 0: t })}
                  </li>
                ))}
              </ul>
            ) : null}
            <div className='mt-1.5 flex gap-2'>
              <Button
                size='xs'
                variant='ghost'
                aria-expanded={showRead}
                onClick={() => setShowRead((v) => !v)}
              >
                {showRead
                  ? $t('common.collapse')
                  : $t('projectKnowledge.whatRead')}
              </Button>
              {canSeen ? (
                <Button
                  size='xs'
                  variant='ghost'
                  disabled={busy}
                  onClick={() => void updates.seen()}
                >
                  {$t('projectKnowledge.got')}
                </Button>
              ) : null}
            </div>
          </div>
        ) : (
          <div data-memory-draft>
            <InlineError
              action={
                <span className='ml-auto flex gap-2'>
                  {canDraft && status.aiReady ? (
                    <Button
                      size='xs'
                      variant='outline'
                      disabled={busy}
                      onClick={() => void updates.run('draft')}
                    >
                      {$t('common.retry')}
                    </Button>
                  ) : null}
                  {canSeen ? (
                    <Button
                      size='xs'
                      variant='ghost'
                      disabled={busy}
                      onClick={() => void updates.seen()}
                    >
                      {$t('projectKnowledge.got')}
                    </Button>
                  ) : null}
                </span>
              }
            >
              {$tj('projectKnowledge.firstMemoryDraftNotGenerated', {
                0: $legacyText(d.error),
              })}
            </InlineError>
          </div>
        )
      ) : null}
      {status.suggestions.length ? (
        <section
          className='rounded-lg border bg-card'
          aria-label={$t('projectKnowledge.suggestedUpdates')}
        >
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-2'>
            <AiMark label={$t('common.aiSuggestions')} />
            <h2 className='text-sm font-semibold'>
              {$tj('projectKnowledge.suggestedUpdatesValue', {
                0: status.suggestions.length,
              })}
            </h2>
            <span className='ml-auto'>{checkLine}</span>
          </div>
          {status.suggestions.map((x) => (
            <Suggestion
              key={x.id}
              x={x}
              busy={busy}
              onAccept={canAccept ? () => void updates.accept(x.id) : undefined}
              onDismiss={
                canDismiss ? () => void updates.dismiss(x.id) : undefined
              }
            />
          ))}
        </section>
      ) : (
        <p className='flex'>{checkLine}</p>
      )}
    </div>
  );
}

const getSource = (): Record<MemorySuggestion['source'], string> => ({
  reviews: $t('projectKnowledge.taskFeedback'),
  results: $t('projectKnowledge.approvedDeliverables'),
  site: $t('projectKnowledge.website'),
  draft: $t('projectKnowledge.rewriteWebsiteMaterials'),
});
// One suggestion: the item it belongs to, what would change, and why in one line; the quoted examples sit in the ⓘ.
function Suggestion({
  x,
  busy,
  onAccept,
  onDismiss,
}: {
  x: MemorySuggestion;
  busy: boolean;
  onAccept?: () => void;
  onDismiss?: () => void;
}): ReactElement {
  const section =
    getMemorySections().find(([k]) => k === x.section)?.[1] ||
    $legacyText(x.label);
  return (
    <div
      className='flex flex-col gap-2 border-b px-3 py-2.5 last:border-0 sm:flex-row sm:items-start sm:gap-3'
      data-suggestion={x.id}
    >
      <div className='flex min-w-0 flex-1 flex-col gap-1 text-sm'>
        <p>
          <Tag tone='grey' className='mr-1.5 align-[1px]'>
            {section}
          </Tag>
          {x.replace ? (
            <>
              <span className='text-muted-foreground line-through'>
                {x.replace}
              </span>
              {' → '}
            </>
          ) : null}
          <span className='whitespace-pre-wrap'>{x.text}</span>
        </p>
        <p className='flex min-w-0 items-center gap-1 text-xs text-muted-foreground'>
          <span className='line-clamp-1 min-w-0' title={x.reason || undefined}>
            {getSource()[x.source]}
            {x.reason ? ` · ${x.reason}` : ''}
          </span>
          {x.examples?.length ? (
            <InfoTip label={$t('projectKnowledge.whyExamples')}>
              <ul className='list-disc space-y-1 pl-4'>
                {x.examples.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </InfoTip>
          ) : null}
        </p>
      </div>
      {onAccept || onDismiss ? (
        <div className='flex shrink-0 gap-1'>
          {onAccept ? (
            <Button
              size='xs'
              variant='outline'
              disabled={busy}
              onClick={onAccept}
            >
              {x.replace
                ? $t('projectKnowledge.replace')
                : $t('projectKnowledge.add')}
            </Button>
          ) : null}
          {onDismiss ? (
            <Button
              size='xs'
              variant='ghost'
              disabled={busy}
              onClick={onDismiss}
            >
              {$t('common.ignore')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Every item on its own row: the name and its content (five lines, then unfolds); Edit above changes them.
function MemoryList({
  context,
}: {
  context: ProjectKnowledgeContext;
}): ReactElement {
  const { project } = context;
  const memory = memoryOf(project);
  return (
    <dl
      className='rounded-lg border bg-card text-sm'
      aria-label={$t('projectKnowledge.memory')}
    >
      <Row label={$t('common.projectName')}>{project.name}</Row>
      <Row label={$t('common.languageAiWrittenContent')}>
        <LanguageSetting context={context} />
      </Row>
      {getMemorySections().map(([k, title, hint]) => (
        <Row key={k} label={title} item={k}>
          {memory[k] ? (
            // Five lines, the last fading out; a click unfolds the rest in place (guideline I14).
            <LongText>{memory[k]}</LongText>
          ) : (
            <span className='flex flex-wrap items-center gap-2'>
              <Tag tone='grey'>{$t('projectKnowledge.notFilledTag')}</Tag>
              <span className='text-muted-foreground'>{hint}</span>
            </span>
          )}
        </Row>
      ))}
    </dl>
  );
}
function Row({
  label,
  item,
  children,
}: {
  label: string;
  item?: string;
  children: ReactNode;
}): ReactElement {
  return (
    <div
      className='flex flex-col gap-1 border-b px-4 py-3 last:border-0 sm:flex-row sm:gap-4'
      data-memory-item={item}
    >
      <dt className='shrink-0 text-muted-foreground sm:w-36 sm:pt-0.5'>
        {label}
      </dt>
      <dd className='m-0 min-w-0 flex-1 sm:pt-0.5'>{children}</dd>
    </div>
  );
}
// AI content language (2026-10-07): the analysis, opportunities, task documents and Memory follow it. Saved at once.
function LanguageSetting({
  context,
}: {
  context: ProjectKnowledgeContext;
}): ReactElement {
  const { project, projectSaved } = context;
  const { can: canEdit } = useBusinessAccess('nrProjects.edit', project.id);
  const value = contentLanguageOf(project.language),
    [busy, setBusy] = useState(false);
  async function change(next: SupportedLocale) {
    if (!canEdit || next === value) return;
    setBusy(true);
    try {
      await api.action('nrProjects', 'edit', {
        method: 'POST',
        body: { projectId: String(project.id), language: next },
      });
      projectSaved(() =>
        $t('projectKnowledge.changedAiWrittenContentUses', {
          0: contentLanguageName(next),
        }),
      );
    } catch (e) {
      toast.error(() =>
        e instanceof Error
          ? $legacyText(e.message)
          : $t('common.notChangedTryAgain'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <span className='flex flex-wrap items-center gap-2' data-project-language>
      <Select
        value={value}
        disabled={busy || !canEdit}
        onValueChange={(v) => void change(v as SupportedLocale)}
      >
        <SelectTrigger
          className='w-full sm:w-40'
          aria-label={$t('common.languageAiWrittenContent')}
        >
          <SelectValue>
            {(v: string) => contentLanguageName(v as SupportedLocale)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
          {contentLanguages.map((k) => (
            <SelectItem key={k} value={k}>
              {contentLanguageName(k)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <InfoTip label={$t('common.info')}>
        {$t('projectKnowledge.dailyAnalysisOpportunitiesTaskDocuments')}
      </InfoTip>
    </span>
  );
}
