import { useId, useState, type ReactNode } from 'react';
import { $t, getCurrentLocale } from '#i18n';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Textarea } from '#components/ui/textarea';
import { Spinner } from '#components/ui/spinner';
import { Label } from '#components/ui/label';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '#components/ui/field';
import {
  ARTICLE_FIELDS,
  ARTICLE_LIMITS,
  SLUG,
  type ArticleContent,
  type ArticleDraft,
  type ArticleField,
  type ArticleStatus,
} from '../../../shared/article-publishing.js';
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
import { useTaskDraft } from './draft-store.js';
import { AgentNotes } from './agent-notes.js';
import { ArticlePreview } from './article-preview.js';
import { localePageUrl } from './article-page.js';
import { MarkdownEditor } from './markdown-editor.js';
import { Notice } from './layout.js';
import { text } from './styles.js';
import {
  articleContext,
  articleLanguages,
  draftContent,
  revisedText,
  type ArticleLanguages,
  type ArticleView,
  fieldChange,
  fieldLabel,
  focusSoon,
  joinNames,
  nameOf,
  valueAt,
} from './article-model';

// The article an article step proposes, read as its readers will see it or field by field against the version it was
// written from, and edited in place (a save is a new immutable version). Conflicts from a rebase are listed first, with
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
      p.includes('.') || p === 'status'
        ? fieldLabel(p)
        : localeName(p, getCurrentLocale()),
    );
    const draft = draftContent(x),
      fields = x.changes.filter((p) => p.includes('.'));
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

/** Which languages the article lacks: none written yet for a new article, none at all for a changed one. */
export function MissingLanguages({
  languages,
}: {
  languages: ArticleLanguages;
}) {
  const { locales, missing, isNew, pending } = languages;
  const names = (list: string[]) =>
    joinNames(list.map((l) => localeName(l, getCurrentLocale())));
  if (pending.length)
    return (
      <p className={text.muted}>
        {$t('articleTask.translateAfter', {
          0: names(pending),
          1: names(locales.slice(0, 1)),
        })}
      </p>
    );
  return missing.length > 0 ? (
    <p className={text.muted}>
      {isNew
        ? $t('articleTask.onlyWrote', { 0: names(locales) })
        : $t('articleTask.noVersion', { 0: names(missing) })}
    </p>
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
  const draft = draftContent(a);
  return (
    <div role='tabpanel' className='flex flex-col gap-3'>
      {view !== 'changes' ? (
        <ArticlePreview
          key={tab}
          text={revisedText(a, base, tab)}
          pageUrl={localePageUrl(
            data,
            a.targetId,
            a.draft.slug || base?.slug || '',
            tab,
          )}
        />
      ) : (
        ARTICLE_FIELDS.map((f) => {
          const path = `${tab}.${f}`;
          return a.changes.includes(path) ? (
            // The diff's own first line names the field ("English · Title"), so no label above it.
            <div key={path} className='flex min-w-0 flex-col gap-1'>
              <ChangeView
                changes={[
                  fieldChange(path, valueAt(base, path), valueAt(draft, path)),
                ]}
              />
            </div>
          ) : (
            <p key={path} className='text-sm text-muted-foreground'>
              {$t(`articleTask.field.${f}`)} · {$t('articleTask.unchanged')}
            </p>
          );
        })
      )}
    </div>
  );
}

export function ArticleReview({
  data,
  article: a,
  notes,
  settled = false,
  readerTo,
}: {
  data: TaskData;
  article: ArticleProposal;
  notes: string;
  /** Looking back at a delivered version rather than reviewing it: what review settled (conflicts, adoption) is left out. */
  settled?: boolean;
  /** Where Read full screen opens the language and view being shown; left out where there is no reading page. */
  readerTo?: (tab: string, view: ArticleView) => string;
}) {
  const languages = articleLanguages(data, a);
  const { target, base, locales } = languages;
  const [tab, setTab] = useState(locales.find(languages.changed) || locales[0]);
  const [views, setViews] = useState<Record<string, ArticleView>>({});
  const versions = languages.versions(tab);
  const view = views[tab] ?? languages.defaultView(tab);
  return (
    <div className='flex flex-col gap-4'>
      <AgentNotes summary={a.draft.summary} notes={notes} />
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
              render={<Link to={readerTo(tab, view)} />}
            >
              <Maximize2 />
            </Button>
          )}
        </div>
      </div>
      <MissingLanguages languages={languages} />
      <ArticleLanguage
        data={data}
        article={a}
        base={base}
        tab={tab}
        view={view}
      />
    </div>
  );
}

// The editor's labels in the page's grey secondary style rather than the form default.
const LABEL = `${text.muted} font-normal`;

type EditForm = {
  slug: string;
  status: ArticleStatus;
  verifyText: string;
  locales: Record<string, Record<ArticleField, string>>;
};

/** The draft as a form: the base's values with the draft's changes over them. */
function initialForm(
  a: ArticleProposal,
  base: ArticleContent | null,
  locales: string[],
): EditForm {
  return {
    slug: a.draft.slug || base?.slug || '',
    status: a.draft.status ?? base?.status ?? 'draft',
    verifyText: a.draft.verifyText || '',
    locales: Object.fromEntries(
      locales.map((l) => [
        l,
        Object.fromEntries(
          ARTICLE_FIELDS.map((f) => [
            f,
            a.draft.locales[l]?.[f] ?? base?.locales[l]?.[f] ?? '',
          ]),
        ) as Record<ArticleField, string>,
      ]),
    ),
  };
}

export function ArticleEditor({
  data,
  article: a,
  draftKey,
  busy,
  onSave,
  onCancel,
}: {
  data: TaskData;
  article: ArticleProposal;
  /** The artifact version being edited. */
  draftKey: string;
  busy: boolean;
  onSave: (article: ArticleDraft) => Promise<boolean>;
  onCancel: () => void;
}) {
  const id = useId();
  const { target, base } = articleContext(data, a);
  const locales = [
    ...new Set([...(target?.locales || []), ...Object.keys(a.draft.locales)]),
  ];
  // Kept in the task draft store: navigation asks before discarding it, like the other drafts on this page. One
  // draft per version, so an edit left on an older version never replaces a newer one.
  const [raw, setRaw, clear] = useTaskDraft(
    `article:${draftKey}`,
    JSON.stringify(initialForm(a, base, locales)),
  );
  // Draft or published, where the target stores a status; a new article starts as a draft.
  const withStatus = Boolean(target?.status);
  const initial = initialForm(a, base, locales);
  // A draft saved before status was part of the form has none: fall back to the version being edited.
  const form = {
    ...initial,
    ...(JSON.parse(raw) as Partial<EditForm>),
  };
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const create = !a.articleId;
  function check(f: EditForm) {
    const e: Record<string, string> = {};
    if (create && !SLUG.test(f.slug)) e.slug = $t('articleTask.slugInvalid');
    const first = locales[0];
    if (create && !f.locales[first]?.title.trim())
      e[`${first}.title`] = $t('articleTask.titleRequired');
    if (create && !f.locales[first]?.body.trim())
      e[`${first}.body`] = $t('articleTask.bodyRequired');
    for (const l of locales) {
      if (f.locales[l].title.length > ARTICLE_LIMITS.title)
        e[`${l}.title`] = $t('articleTask.tooLong', {
          0: ARTICLE_LIMITS.title,
        });
      if (f.locales[l].description.length > ARTICLE_LIMITS.description)
        e[`${l}.description`] = $t('articleTask.tooLong', {
          0: ARTICLE_LIMITS.description,
        });
    }
    if (f.verifyText.length > 200)
      e.verifyText = $t('articleTask.tooLong', { 0: 200 });
    return e;
  }
  const set = (next: EditForm) => {
    setRaw(JSON.stringify(next));
    if (submitted) setErrors(check(next));
  };
  async function save() {
    setSubmitted(true);
    const e = check(form);
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) return focusSoon(`${id}-${first}`);
    // Only what differs from the base is sent: unchanged fields stay the article's own.
    const draftLocales: ArticleDraft['locales'] = {};
    for (const l of locales)
      for (const f of ARTICLE_FIELDS) {
        const v = form.locales[l][f];
        if (v !== (base?.locales[l]?.[f] ?? '') || (create && v))
          (draftLocales[l] ||= {})[f] = v;
      }
    if (
      await onSave({
        // The chosen status, or the draft's own where the target view does not say; an unchanged one is dropped
        // against the base on the server.
        ...(withStatus
          ? { status: form.status }
          : a.draft.status
            ? { status: a.draft.status }
            : {}),
        ...(create ? { slug: form.slug } : {}),
        locales: draftLocales,
        ...(form.verifyText.trim()
          ? { verifyText: form.verifyText.trim() }
          : {}),
      })
    )
      clear();
  }
  const err = (key: string) =>
    errors[key] ? (
      <FieldError id={`${id}-${key}-error`}>{errors[key]}</FieldError>
    ) : null;
  const aria = (key: string) => ({
    id: `${id}-${key}`,
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `${id}-${key}-error` : undefined,
  });
  return (
    <form
      className='flex min-w-0 flex-col gap-4'
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={busy} className='flex min-w-0 flex-col gap-4'>
        {create && (
          <Field data-invalid={Boolean(errors.slug)}>
            <FieldLabel htmlFor={`${id}-slug`} className={LABEL}>
              {$t('articleTask.field.slug')} *
            </FieldLabel>
            <Input
              value={form.slug}
              onChange={(e) => set({ ...form, slug: e.target.value })}
              {...aria('slug')}
            />
            <FieldDescription>{$t('articleTask.slugHelp')}</FieldDescription>
            {err('slug')}
          </Field>
        )}
        {withStatus && (
          <Field>
            <FieldLabel id={`${id}-status`} className={LABEL}>
              {$t('articleTask.field.status')}
            </FieldLabel>
            <RadioGroup
              aria-labelledby={`${id}-status`}
              className='flex flex-wrap gap-4'
              value={form.status}
              onValueChange={(v) =>
                set({ ...form, status: v as ArticleStatus })
              }
            >
              {(['draft', 'published'] as const).map((v) => (
                <div key={v} className='flex items-center gap-2'>
                  <RadioGroupItem id={`${id}-status-${v}`} value={v} />
                  <Label htmlFor={`${id}-status-${v}`} className='font-normal'>
                    {$t(
                      v === 'draft'
                        ? 'articleTask.statusDraft'
                        : 'articleTask.statusPublished',
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <FieldDescription>{$t('articleTask.statusHelp')}</FieldDescription>
          </Field>
        )}
        {locales.map((l) => (
          <fieldset key={l} className='flex min-w-0 flex-col gap-3'>
            <legend className={text.muted}>
              {localeName(l, getCurrentLocale())}
            </legend>
            {ARTICLE_FIELDS.map((f) => {
              const key = `${l}.${f}`,
                required = create && l === locales[0] && f !== 'description';
              const props = {
                value: form.locales[l][f],
                onChange: (e: { target: { value: string } }) =>
                  set({
                    ...form,
                    locales: {
                      ...form.locales,
                      [l]: { ...form.locales[l], [f]: e.target.value },
                    },
                  }),
                ...aria(key),
              };
              return (
                <Field key={key} data-invalid={Boolean(errors[key])}>
                  <FieldLabel htmlFor={`${id}-${key}`} className={LABEL}>
                    {$t(`articleTask.field.${f}`)}
                    {required ? ' *' : ''}
                  </FieldLabel>
                  {f === 'title' ? (
                    <Input {...props} />
                  ) : f === 'body' ? (
                    // The body is written beside the article it makes (2026-10-23 user request, as dev.to does).
                    <MarkdownEditor
                      {...props}
                      preview={(body) => (
                        <ArticlePreview
                          text={{ ...form.locales[l], body }}
                          pageUrl={localePageUrl(
                            data,
                            a.targetId,
                            form.slug || base?.slug || '',
                            l,
                          )}
                        />
                      )}
                    />
                  ) : (
                    <Textarea
                      {...props}
                      rows={3}
                      className='field-sizing-fixed'
                    />
                  )}
                  {err(key)}
                </Field>
              );
            })}
          </fieldset>
        ))}
        <Field data-invalid={Boolean(errors.verifyText)}>
          <FieldLabel htmlFor={`${id}-verifyText`} className={LABEL}>
            {$t('articleTask.verifyText')}
          </FieldLabel>
          <Input
            value={form.verifyText}
            onChange={(e) => set({ ...form, verifyText: e.target.value })}
            {...aria('verifyText')}
          />
          <FieldDescription>{$t('articleTask.verifyHelp')}</FieldDescription>
          {err('verifyText')}
        </Field>
      </fieldset>
      <div className='flex flex-wrap justify-end gap-2'>
        <Button
          type='button'
          variant='ghost'
          disabled={busy}
          onClick={() => {
            clear();
            onCancel();
          }}
        >
          {$t('common.cancel')}
        </Button>
        <Button type='submit' disabled={busy}>
          {busy && <Spinner data-icon='inline-start' />}
          {$t('common.save')}
        </Button>
      </div>
    </form>
  );
}
