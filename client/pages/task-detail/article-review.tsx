import { useState, type ReactNode } from 'react';
import { $t, getCurrentLocale } from '#i18n';
import { Button } from '#components/ui/button';
import {
  ARTICLE_FIELDS,
  coverKeyFor,
  coverPath,
  type ArticleContent,
} from '../../../shared/article-publishing.js';
import { CoverChange } from './article-cover.js';
import { Reveal } from '#components/reach/reveal';
import { Tag } from '#components/reach/tag';
import { GitBranch, Globe, Maximize2 } from 'lucide-react';
import { Link } from 'react-router';
import { lineTabClass, lineTabListClass } from '#components/reach/line-tabs';
import { Segmented } from '#components/reach/segmented';
import { ChangeView } from '../change-view';
import { FieldDiff } from './article-field-diff.js';
import { localeName } from '../article-targets-api';
import type {
  ArticleProposal,
  ArticleTargetRef,
  TaskData,
} from '../task-execution-types';
import { useStayWithDrafts } from './draft-store.js';
import { AgentNotes } from './agent-notes.js';
import { ArticlePreview } from './article-preview.js';
import {
  ArticleImageNotesContext,
  imageNote,
  imageSources,
} from './task-images-model.js';
import { imageChanges, taskImageOf } from '../../../shared/task-images.js';
import { localePageUrl } from './article-page.js';
import { Notice } from './layout.js';
import { text } from './styles.js';
import {
  articleLanguages,
  draftContent,
  revisedText,
  type ArticleLanguages,
  type ArticleView,
  fieldChange,
  fieldLabel,
  joinNames,
  nameOf,
  valueAt,
} from './article-model';

// The article an article step proposes, read as its readers will see it or field by field against the version it was
// written from; under review it is edited instead (article-edit.tsx). Conflicts from a rebase are listed first, with
// both versions.

// Where the article goes and what it becomes, as tags rather than a sentence (2026-10-24 user request, as the task
// header's steps): the target by its own name with a mark for its kind, new or update, and the status it is published
// with. A changed article names its address and status only when they change.
const KIND_ICON: Record<string, ReactNode> = {
  'git-files': <GitBranch aria-hidden='true' />,
};

type TargetTagsProps = {
  /** Before the tags for another target than the primary ("Also to"). */
  lead?: string;
  name: string;
  kind?: string;
  isNew: boolean;
  /** An existing article's title. */
  title?: string;
  slug?: string;
  slugBefore?: string;
  status?: string;
  /** The status changes on an existing article (Make draft) rather than being set on a new one (Save as draft). */
  statusChange?: boolean;
  children?: ReactNode;
};

function TargetTags({
  lead,
  name,
  kind,
  isNew,
  title,
  slug,
  slugBefore,
  status,
  statusChange = false,
  children,
}: TargetTagsProps) {
  const published = status === 'published';
  return (
    <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm'>
      {lead && <span className='text-muted-foreground'>{lead}</span>}
      <Tag
        tone='grey'
        icon={KIND_ICON[kind || ''] ?? <Globe aria-hidden='true' />}
      >
        {name}
      </Tag>
      <Tag tone='grey'>
        {isNew ? $t('articleTask.newArticle') : $t('articleTask.updateArticle')}
      </Tag>
      {status && (
        <Tag tone={published ? 'green' : 'grey'}>
          {$t(
            statusChange
              ? published
                ? 'articleTask.toPublished'
                : 'articleTask.toDraft'
              : published
                ? 'articleTask.asPublished'
                : 'articleTask.asDraft',
          )}
        </Tag>
      )}
      {title && <span className='min-w-0 break-words'>{title}</span>}
      {slug && (
        <span className='min-w-0 break-all text-muted-foreground'>
          {slugBefore && slugBefore !== slug ? `${slugBefore} → ` : ''}
          {slug}
        </span>
      )}
      {children}
    </div>
  );
}

function PrimaryTags({
  target,
  a,
  base,
}: {
  target?: ArticleTargetRef;
  a: ArticleProposal;
  base: ArticleContent | null;
}) {
  const isNew = !a.articleId;
  return (
    <TargetTags
      name={target?.name || a.targetId}
      kind={target?.kind}
      isNew={isNew}
      title={
        isNew
          ? undefined
          : base?.locales[target?.locales[0] || '']?.title || undefined
      }
      // An existing article is named by its title; its address only when it changes.
      slug={isNew || a.changes.includes('slug') ? a.draft.slug : undefined}
      slugBefore={!isNew && a.changes.includes('slug') ? base?.slug : undefined}
      // A new article without a status is created as a draft where the target keeps one.
      status={
        isNew
          ? (a.draft.status ?? (target?.status ? 'draft' : undefined))
          : a.changes.includes('status')
            ? a.draft.status
            : undefined
      }
      statusChange={!isNew}
    />
  );
}

/**
 * One row per other target: update or new article, and what that target cannot hold. An update can be compared with
 * that target's own version, which may differ from the primary's.
 */
function AlsoLines({ data, a }: { data: TaskData; a: ArticleProposal }) {
  return (a.also || []).map((x) => {
    const base = x.baseKey ? data.articleBases?.[x.baseKey] || null : null,
      target = data.articleTargets?.find((t) => t.id === x.targetId);
    const left = x.skipped.map((p) =>
      p.includes('.') || p === 'status' || p === 'cover'
        ? fieldLabel(p)
        : localeName(p, getCurrentLocale()),
    );
    const draft = draftContent(x),
      fields = x.changes.filter(
        (p) => p.includes('.') && !p.endsWith('.cover'),
      );
    return (
      <div key={x.targetId} className='flex min-w-0 flex-col gap-1'>
        <TargetTags
          lead={$t('articleTask.alsoTo')}
          name={nameOf(data, x.targetId)}
          kind={target?.kind}
          isNew={!x.articleId}
          title={x.articleId ? x.title || undefined : undefined}
          slug={!x.articleId || x.changes.includes('slug') ? x.slug : undefined}
          slugBefore={
            x.articleId && x.changes.includes('slug') ? base?.slug : undefined
          }
          status={x.changes.includes('status') ? x.draft.status : undefined}
          statusChange={Boolean(x.articleId)}
        >
          {left.length > 0 && (
            <span className='text-muted-foreground'>
              {$t('articleTask.skipped', { 0: joinNames(left) })}
            </span>
          )}
        </TargetTags>
        {x.articleId && base && fields.length > 0 && (
          <div className='border-l pl-3'>
            <Reveal
              label={$t('articleTask.alsoChanges', {
                0: nameOf(data, x.targetId),
              })}
            >
              <ChangeView
                changes={fields.map((p) =>
                  fieldChange(p, valueAt(base, p), valueAt(draft, p)),
                )}
              />
            </Reveal>
          </div>
        )}
      </div>
    );
  });
}

function ConflictList({
  conflicts,
  targetName,
}: {
  conflicts: { field: string; current: string; draft: string }[];
  targetName: string;
}) {
  return (
    <Notice title={$t('articleTask.conflictsTitle', { 0: targetName })}>
      {conflicts.map((c) => (
        <div key={c.field} className='flex min-w-0 flex-col gap-1'>
          <span className={text.muted}>
            {$t('articleTask.currentToDraft', { 0: targetName })}
          </span>
          <FieldDiff path={c.field} before={c.current} after={c.draft} />
        </div>
      ))}
    </Notice>
  );
}

/** The article's languages as tabs, by name only (2026-10-24 user request: no change counts). */
export function LanguageTabs({
  locales,
  tab,
  onTab,
}: {
  locales: string[];
  tab: string;
  onTab: (locale: string) => void;
}) {
  return (
    <div
      className={lineTabListClass}
      role='tablist'
      aria-label={$t('articleTask.article')}
    >
      {locales.map((l) => (
        <button
          key={l}
          type='button'
          role='tab'
          className={lineTabClass}
          aria-selected={l === tab}
          onClick={() => onTab(l)}
        >
          {localeName(l, getCurrentLocale())}
        </button>
      ))}
    </div>
  );
}

/**
 * Two ways to read a changed language, Preview | Changes (2026-10-24 user request: the reader needs what it will be
 * and what changed; a separate view of the earlier version, a text link for it and change counts on the tabs were
 * noise).
 */
export function ViewSwitch({
  value,
  onChange,
  className,
}: {
  value: ArticleView;
  onChange: (view: ArticleView) => void;
  className?: string;
}) {
  return (
    <Segmented
      label={$t('articleTask.viewAs')}
      value={value}
      onChange={(v) => onChange(v as ArticleView)}
      options={[
        { id: 'preview', label: $t('articleTask.viewPreview') },
        { id: 'changes', label: $t('articleTask.viewChanges') },
      ]}
      className={className}
    />
  );
}

/**
 * Which languages the article lacks: none written yet for a new article, none at all for a changed one. While the
 * primary waits for approval, which languages follow and how; once they are written, the ones this version left as
 * they were (`unchanged`, for the version under review only).
 */
export function MissingLanguages({
  languages,
  unchanged = false,
}: {
  languages: ArticleLanguages;
  unchanged?: boolean;
}) {
  const { locales, missing, isNew, pending, pendingUpdate } = languages;
  const names = (list: string[]) =>
    joinNames(list.map((l) => localeName(l, getCurrentLocale())));
  if (pending.length) {
    const translated = pending.filter((l) => !pendingUpdate.includes(l)),
      primary = names(locales.slice(0, 1));
    return (
      <p className={text.muted}>
        {!pendingUpdate.length
          ? $t('articleTask.translateAfter', { 0: names(pending), 1: primary })
          : translated.length
            ? $t('articleTask.updateTranslateAfter', {
                0: names(pendingUpdate),
                1: primary,
                2: names(translated),
              })
            : $t('articleTask.updateAfter', {
                0: names(pendingUpdate),
                1: primary,
              })}
      </p>
    );
  }
  // Every one of them unchanged is the card's title instead.
  const left =
    unchanged && languages.unchanged.length < languages.written.length
      ? languages.unchanged
      : [];
  return missing.length > 0 || left.length > 0 ? (
    <>
      {missing.length > 0 && (
        <p className={text.muted}>
          {isNew
            ? $t('articleTask.onlyWrote', { 0: names(locales) })
            : $t('articleTask.noVersion', { 0: names(missing) })}
        </p>
      )}
      {left.length > 0 && (
        <p className={text.muted}>
          {$t('articleTask.languagesNotChanged', { 0: names(left) })}
        </p>
      )}
    </>
  ) : null;
}

/** One language of the article, as its readers will see it or as its changes field by field. */
export function ArticleLanguage({
  data,
  article: a,
  base,
  tab,
  view,
}: {
  data: TaskData;
  article: ArticleProposal;
  base: ArticleContent | null;
  tab: string;
  view: ArticleView;
}) {
  const draft = draftContent(a),
    revised = revisedText(a, base, tab);
  // The cover this language shows (2026-11-05): its own, or the one shared by every language.
  const target = data.articleTargets?.find((t) => t.id === a.targetId),
    coverKey = target ? coverKeyFor(target, tab) : null,
    cover = target && coverKey !== null ? { key: coverKey, target } : null;
  // Images the version adds or swaps in (2026-11-03 user request): a note under each new task image in the preview,
  // and a line for each kind of change above the fields' changes.
  const images = imageChanges(base?.locales[tab]?.body, revised.body);
  const sources = imageSources(data),
    notes = new Map<string, string>();
  for (const [image, replaced] of [
    ...images.replaced.map((r) => [r.image, true] as const),
    ...images.added.map((i) => [i, false] as const),
  ]) {
    const task = taskImageOf(image.address);
    if (task) notes.set(task.id, imageNote(sources.get(task.id), replaced));
  }
  return (
    <div role='tabpanel' className='flex flex-col gap-3'>
      {view !== 'changes' ? (
        <ArticleImageNotesContext.Provider value={notes}>
          <ArticlePreview
            key={tab}
            text={revised}
            pageUrl={localePageUrl(
              data,
              a.targetId,
              a.draft.slug || base?.slug || '',
              tab,
            )}
          />
        </ArticleImageNotesContext.Provider>
      ) : (
        <>
          {cover && a.changes.includes(coverPath(cover.key)) && (
            <CoverChange
              before={base?.cover?.[cover.key] || ''}
              after={a.draft.cover?.[cover.key] || ''}
              target={cover.target}
            />
          )}
          <ImageChangeLines data={data} article={a} changes={images} />
          {ARTICLE_FIELDS.map((f) => {
            const path = `${tab}.${f}`;
            return a.changes.includes(path) ? (
              // The diff's own first line names the field ("English · Title"), so no label above it.
              <div key={path} className='flex min-w-0 flex-col gap-1'>
                <ChangeView
                  changes={[
                    fieldChange(
                      path,
                      valueAt(base, path),
                      valueAt(draft, path),
                    ),
                  ]}
                />
              </div>
            ) : (
              <p key={path} className='text-sm text-muted-foreground'>
                {$t(`articleTask.field.${f}`)} · {$t('articleTask.unchanged')}
              </p>
            );
          })}
        </>
      )}
    </div>
  );
}

/** Every target the article publishes to, as the task knows them. */
const articleTargetsOf = (data: TaskData, a: ArticleProposal) =>
  [a.targetId, ...(a.also || []).map((x) => x.targetId)].flatMap(
    (id) => data.articleTargets?.find((t) => t.id === id) ?? [],
  );

/**
 * The images a version adds, replaces or removes, one line each, and, where it brings task images, what happens to them
 * on approval: each target that takes them gets them uploaded to its file library before the article.
 */
function ImageChangeLines({
  data,
  article: a,
  changes,
}: {
  data: TaskData;
  article: ArticleProposal;
  changes: ReturnType<typeof imageChanges>;
}) {
  const name = (image: { address: string; alt: string }) =>
    $t('taskImages.name', {
      0: image.alt || image.address.slice(image.address.lastIndexOf('/') + 1),
    });
  const lines = [
    ['taskImages.replaced', changes.replaced.map((r) => r.image)],
    ['taskImages.added', changes.added],
    ['taskImages.removed', changes.removed],
  ] as const;
  const brought = [
    ...changes.replaced.map((r) => r.image),
    ...changes.added,
  ].some((i) => taskImageOf(i.address));
  const targets = articleTargetsOf(data, a);
  const taking = targets.filter((t) => t.capabilities.images),
    refusing = targets.filter((t) => !t.capabilities.images);
  if (!lines.some(([, list]) => list.length)) return null;
  return (
    <div className='flex flex-col gap-1 text-sm'>
      {lines.map(([key, list]) =>
        list.length ? (
          <p key={key}>
            {$t(key, { 0: list.length, 1: joinNames(list.map(name)) })}
          </p>
        ) : null,
      )}
      {brought && taking.length > 0 && (
        <p className={text.muted}>
          {$t('taskImages.uploadOnApproval', {
            0: joinNames(taking.map((t) => t.name)),
          })}
        </p>
      )}
      {brought && refusing.length > 0 && (
        <p className={text.muted}>
          {$t('taskImages.targetRefuses', {
            0: joinNames(refusing.map((t) => t.name)),
          })}
        </p>
      )}
    </div>
  );
}

export function ArticleReview({
  data,
  article: a,
  notes,
  summary = a.draft.summary,
  settled = false,
  against,
  readerTo,
  tab: asked,
  onTab,
  body,
}: {
  data: TaskData;
  article: ArticleProposal;
  notes: string;
  /** The text above the fields, the Agent's summary for the reviewer unless the caller has the publish record. */
  summary?: string;
  /** Looking back at a delivered version rather than reviewing it: what review settled (conflicts, adoption) is left out. */
  settled?: boolean;
  /** The version before, which Changes compares with instead of the article it was written from (againstPrevious). */
  against?: ArticleContent;
  /** Where Read full screen opens the language and view being shown; left out where there is no reading page. */
  readerTo?: (tab: string, view: ArticleView) => string;
  /** The language last chosen, kept by the card. */
  tab?: string;
  onTab?: (tab: string) => void;
  /** In place of the languages to read: the article's form, where reviewing is editing (article-edit.tsx). */
  body?: ReactNode;
}) {
  const languages = articleLanguages(data, a, against);
  const { target, base, locales } = languages;
  const [own, setOwn] = useState(languages.first);
  const tab = asked && locales.includes(asked) ? asked : own;
  const setTab = (l: string) => {
    setOwn(l);
    onTab?.(l);
  };
  const [views, setViews] = useState<Record<string, ArticleView>>({});
  const versions = languages.versions(tab);
  const view = views[tab] ?? languages.defaultView(tab);
  const stay = useStayWithDrafts();
  return (
    <div className='flex flex-col gap-4'>
      <AgentNotes summary={summary} notes={notes} />
      <PrimaryTags target={target} a={a} base={base} />
      {!settled && !a.changes.length && a.carried?.length ? (
        <p className='text-sm text-muted-foreground'>
          {$t('articleTask.alreadyPublished', {
            0: target?.name || a.targetId,
          })}
        </p>
      ) : null}
      <AlsoLines data={data} a={a} />
      {!settled && a.conflicts?.length ? (
        <ConflictList
          conflicts={a.conflicts}
          targetName={target?.name || a.targetId}
        />
      ) : null}
      {(a.also || []).map((x) =>
        !settled && x.conflicts?.length ? (
          <ConflictList
            key={x.targetId}
            conflicts={x.conflicts}
            targetName={nameOf(data, x.targetId)}
          />
        ) : null,
      )}
      {body ?? (
        <>
          <div className='flex flex-wrap items-end justify-between gap-x-4 gap-y-2'>
            <LanguageTabs locales={locales} tab={tab} onTab={setTab} />
            <div className='mb-1.5 flex items-center gap-1'>
              {versions && (
                <ViewSwitch
                  value={view}
                  onChange={(v) => setViews({ ...views, [tab]: v })}
                />
              )}
              {readerTo && (
                // The article on a page of its own, at reading width with nothing beside it (2026-10-24 user request).
                <Button
                  variant='ghost'
                  size='icon'
                  aria-label={$t('articleTask.readFullScreen')}
                  title={$t('articleTask.readFullScreen')}
                  nativeButton={false}
                  render={<Link to={readerTo(tab, view)} onClick={stay} />}
                >
                  <Maximize2 />
                </Button>
              )}
            </div>
          </div>
          <MissingLanguages languages={languages} unchanged={!settled} />
          <ArticleLanguage
            data={data}
            article={a}
            base={base}
            tab={tab}
            view={view}
          />
        </>
      )}
    </div>
  );
}
