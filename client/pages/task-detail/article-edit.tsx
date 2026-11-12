import { useContext, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Check, Lock, Maximize2, MoreHorizontal, Rocket } from 'lucide-react';
import { $t, getCurrentLocale } from '#i18n';
import { formatTime } from '#lib/format';
import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { Switch } from '#components/ui/switch';
import { Textarea } from '#components/ui/textarea';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupTextarea,
} from '#components/ui/input-group';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '#components/ui/dropdown-menu';
import { Field, FieldError, FieldLabel } from '#components/ui/field';
import { confirmAction } from '#components/reach/confirm';
import {
  ARTICLE_FIELDS,
  type ArticleField,
} from '../../../shared/article-publishing.js';
import { TASK_IMAGES_PER_MESSAGE } from '../../../shared/task-images.js';
import { localeName } from '../article-targets-api';
import type { ArticleProposal, TaskData } from '../task-execution-types';
import { articleLanguages, joinNames, valueAt } from './article-model';
import {
  editableLocales,
  primaryOf,
  type EditForm,
} from './article-edit-model.js';
import { savedText, type ArticleEditSession } from './article-edit-session.js';
import { ArticleBodyEditor } from './article-body-editor.js';
import { streamRewrite } from './article-rewrite-api.js';
import {
  ArticleLanguage,
  LanguageTabs,
  MissingLanguages,
} from './article-review.js';
import { useStayWithDrafts, useTaskDraft } from './draft-store.js';
import { AddImageButton, ComposerImages, ImageProblem } from './task-images.js';
import {
  TaskImageContext,
  imageNote,
  imageSources,
  readImages,
  useComposerImages,
  ArticleImageNotesContext,
} from './task-images-model.js';
import { localePageUrl } from './article-page.js';
import { imageChanges, taskImageOf } from '../../../shared/task-images.js';
import { text } from './styles.js';

// Reviewing an article is editing it (2026-11-04 user request, ui-references/inline-ai-edit-2026-11-04): once the Agent
// delivers, the review card is the article's title, summary and body, edited as they read; a paragraph that needs
// work is selected and rewritten with AI on the spot. Compare with original shows what changed instead, read-only.
// Approve makes a version of the edits first, and so does Request changes, which is left for changes across the whole
// article. Edit directly and its separate state are gone.

// The labels in the page's grey secondary style rather than the form default.
const LABEL = `${text.muted} font-normal`;

/** Approve, Request changes, and the rest in a menu. */
export function ArticleEditActions({
  session,
  version,
  busy,
  approve,
  info,
  request,
  lead,
  fullScreenTo,
  onVersions,
}: {
  session: ArticleEditSession;
  version: number;
  busy: boolean;
  /** Approve as the round says it, or nothing when there is no target to publish to. */
  approve?: {
    label: string;
    primary: boolean;
    disabled: boolean;
    run: () => void;
  };
  /** Beside Approve: what approving does, when it needs saying (ⓘ). */
  info?: ReactNode;
  request: () => void;
  /** Before Approve: Update again, for a version that changed none of the other languages. */
  lead?: ReactNode;
  fullScreenTo?: string;
  onVersions?: () => void;
}) {
  const stay = useStayWithDrafts();
  const held = Boolean(session.holder);
  const discard = async () => {
    if (
      await confirmAction({
        title: () => $t('articleEdit.discardTitle'),
        description: () => $t('articleEdit.discardDescription', { 0: version }),
        action: 'articleEdit.discardAction',
      })
    )
      await session.discard();
  };
  return (
    <>
      {lead}
      {approve && (
        <Button
          variant={approve.primary ? 'default' : 'outline'}
          disabled={busy || approve.disabled || held}
          onClick={approve.run}
        >
          {approve.primary && <Rocket />}
          {approve.label}
        </Button>
      )}
      {approve && info}
      <Button variant='ghost' disabled={busy || held} onClick={request}>
        {$t('taskDetail.requestChanges')}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant='ghost'
              size='icon'
              aria-label={$t('articleEdit.more')}
              title={$t('articleEdit.more')}
            />
          }
        >
          <MoreHorizontal />
        </DropdownMenuTrigger>
        <DropdownMenuContent align='end' className='min-w-48'>
          <DropdownMenuItem
            disabled={busy || session.readOnly || !session.changed}
            onClick={() => void discard()}
          >
            {$t('articleEdit.discardEdits')}
          </DropdownMenuItem>
          {fullScreenTo && (
            <DropdownMenuItem
              render={<Link to={fullScreenTo} onClick={stay} />}
            >
              {$t('articleTask.editFullScreen')}
            </DropdownMenuItem>
          )}
          {onVersions && (
            <DropdownMenuItem onClick={onVersions}>
              {$t('articleEdit.allVersions')}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/** The article as it reads after the edits, its fields against the article it was written from (Compare with original). */
function comparedArticle(
  a: ArticleProposal,
  base: ReturnType<typeof articleLanguages>['base'],
  form: EditForm,
): ArticleProposal {
  const changes = Object.keys(form.locales).flatMap((l) =>
    ARTICLE_FIELDS.flatMap((f) => {
      const path = `${l}.${f}`;
      return valueAt(base, path) !== form.locales[l][f] ? [path] : [];
    }),
  );
  return {
    ...a,
    draft: { ...a.draft, locales: form.locales },
    changes,
  };
}

/**
 * The article being reviewed as a form: the languages it is edited in (the others named as following on approval),
 * Compare with original, the automatic save and full screen in one row; then title, summary and body.
 */
export function ArticleEditFields({
  data,
  article: a,
  session,
  tab: asked,
  onTab,
  id,
  errors,
  fullScreenTo,
}: {
  data: TaskData;
  article: ArticleProposal;
  session: ArticleEditSession;
  tab?: string;
  onTab: (tab: string) => void;
  /** The ids' prefix, from useArticleSubmit, so a field with a problem can be focused. */
  id: string;
  errors: Record<string, string>;
  /** The same form on the article's own page; left out there. */
  fullScreenTo?: (tab: string) => string;
}) {
  const languages = articleLanguages(data, a);
  const { base } = languages;
  const editable = editableLocales(data, a);
  // The language asked for, else the one the review opens on (a version that updated others, the first of them).
  const tab =
    asked && editable.includes(asked)
      ? asked
      : editable.includes(languages.first)
        ? languages.first
        : editable.find(languages.changed) || editable[0];
  const [compare, setCompare] = useState(false);
  const comparable = !languages.isNew && Boolean(base?.locales[tab]);
  const comparing = compare && comparable;
  const stay = useStayWithDrafts();
  const scope = useContext(TaskImageContext);
  const { form, readOnly } = session;
  const create = !a.articleId,
    primary = primaryOf(data, a);
  const targets = [
      a.targetId,
      ...(a.also || []).map((x) => x.targetId),
    ].flatMap((t) => data.articleTargets?.find((x) => x.id === t) ?? []),
    takesImages =
      targets.length > 0 && targets.every((t) => t.capabilities.images);
  const set = (l: string, f: ArticleField, value: string) =>
    session.set({
      ...form,
      locales: { ...form.locales, [l]: { ...form.locales[l], [f]: value } },
    });
  const names = (list: string[]) =>
    joinNames(list.map((l) => localeName(l, getCurrentLocale())));
  const saved = savedText(session, (iso) => formatTime(iso));
  const err = (key: string) =>
    errors[key] ? (
      <FieldError id={`${id}-${key}-error`}>{errors[key]}</FieldError>
    ) : null;
  const aria = (key: string) => ({
    id: `${id}-${key}`,
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': errors[key] ? `${id}-${key}-error` : undefined,
  });
  // A note under each new task image, as the preview has (2026-11-03 user request).
  const sources = imageSources(data),
    notes = new Map<string, string>(),
    images = imageChanges(base?.locales[tab]?.body, form.locales[tab]?.body);
  for (const [image, replaced] of [
    ...images.replaced.map((r) => [r.image, true] as const),
    ...images.added.map((i) => [i, false] as const),
  ]) {
    const task = taskImageOf(image.address);
    if (task) notes.set(task.id, imageNote(sources.get(task.id), replaced));
  }
  const pageUrl = localePageUrl(
    data,
    a.targetId,
    form.slug || base?.slug || '',
    tab,
  );
  return (
    <div className='flex min-w-0 flex-col gap-4'>
      <div className='flex flex-col gap-2'>
        <div className='flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b'>
          <div className='flex min-w-0 flex-wrap items-end gap-x-4'>
            <LanguageTabs locales={editable} tab={tab} onTab={onTab} />
            {languages.pending.length > 0 && (
              <span className='mb-2.5 text-sm text-muted-foreground'>
                {$t('articleEdit.afterApproval', {
                  0: names(languages.pending),
                })}
              </span>
            )}
          </div>
          <div className='mb-1.5 flex items-center gap-3'>
            {comparable && (
              <Label className='gap-2 text-sm font-normal'>
                <Switch
                  checked={compare}
                  onCheckedChange={setCompare}
                  size='sm'
                />
                {$t('articleEdit.compare')}
              </Label>
            )}
            {saved && (
              <span
                role='status'
                className={cn(
                  'inline-flex items-center gap-1 text-xs',
                  session.saveFailed
                    ? 'text-destructive'
                    : 'text-muted-foreground',
                )}
              >
                {session.savedAt && !session.saving && (
                  <Check className='size-3.5' />
                )}
                {saved}
              </span>
            )}
            {fullScreenTo && (
              // The editor on the article's own page, with the same edits (2026-11-04 user request).
              <Button
                variant='ghost'
                size='icon-sm'
                aria-label={$t('articleTask.editFullScreen')}
                title={$t('articleTask.editFullScreen')}
                nativeButton={false}
                render={<Link to={fullScreenTo(tab)} onClick={stay} />}
              >
                <Maximize2 />
              </Button>
            )}
          </div>
        </div>
        {!languages.pending.length && (
          <MissingLanguages languages={languages} unchanged />
        )}
        {session.holder && (
          <p
            role='status'
            className={cn(text.muted, 'flex items-center gap-1.5')}
          >
            <Lock aria-hidden='true' className='size-3.5 shrink-0' />
            {$t('articleEdit.someoneEditing', { 0: session.holder })}
          </p>
        )}
      </div>
      {comparing ? (
        <ArticleLanguage
          data={data}
          article={comparedArticle(a, base, form)}
          base={base}
          tab={tab}
          view='changes'
        />
      ) : (
        <div role='tabpanel' className='flex min-w-0 flex-col gap-4'>
          {create && (
            <Field data-invalid={Boolean(errors.slug)}>
              <FieldLabel htmlFor={`${id}-slug`} className={LABEL}>
                {$t('articleTask.field.slug')} *
              </FieldLabel>
              <Input
                value={form.slug}
                readOnly={readOnly}
                onChange={(e) => session.set({ ...form, slug: e.target.value })}
                {...aria('slug')}
              />
              {err('slug')}
            </Field>
          )}
          {ARTICLE_FIELDS.map((f) => {
            const key = `${tab}.${f}`,
              required = create && tab === primary && f !== 'description';
            const label = `${$t(`articleTask.field.${f}`)}${required ? ' *' : ''}`;
            return (
              <Field key={key} data-invalid={Boolean(errors[key])}>
                <FieldLabel
                  htmlFor={f === 'body' ? undefined : `${id}-${key}`}
                  id={`${id}-${key}-label`}
                  className={LABEL}
                >
                  {label}
                </FieldLabel>
                {f === 'title' ? (
                  <Input
                    value={form.locales[tab][f]}
                    readOnly={readOnly}
                    onChange={(e) => set(tab, f, e.target.value)}
                    {...aria(key)}
                  />
                ) : f === 'description' ? (
                  <Textarea
                    value={form.locales[tab][f]}
                    readOnly={readOnly}
                    rows={2}
                    className='field-sizing-content min-h-16'
                    onChange={(e) => set(tab, f, e.target.value)}
                    {...aria(key)}
                  />
                ) : (
                  <ArticleImageNotesContext.Provider value={notes}>
                    <ArticleBodyEditor
                      // One editor per language, so each keeps its own undo history and source.
                      key={tab}
                      {...aria(key)}
                      aria-label={label}
                      value={form.locales[tab].body}
                      readOnly={readOnly}
                      takesImages={takesImages}
                      pageUrl={pageUrl}
                      onChange={(body) => set(tab, 'body', body)}
                      rewrite={
                        scope
                          ? {
                              stream: (request, signal) =>
                                streamRewrite(
                                  {
                                    projectId: String(scope.projectId),
                                    taskId: scope.taskId,
                                    artifactId: session.artifactId,
                                    locale: tab,
                                    title: form.locales[tab].title,
                                    description: form.locales[tab].description,
                                    body: form.locales[tab].body,
                                    ...request,
                                  },
                                  signal,
                                ),
                              onAccepted: session.accepted,
                            }
                          : undefined
                      }
                    />
                  </ArticleImageNotesContext.Provider>
                )}
                {err(key)}
              </Field>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Request changes for the whole article (ui-references/inline-ai-edit-2026-11-04 frame 5): what to change, with images
 * if need be. The edits are made a version first, and the Agent works from it, changing only what is asked.
 */
export function RequestChangesBox({
  session,
  nextVersion,
  busy,
  onSend,
  onCancel,
}: {
  session: ArticleEditSession;
  /** The version the edits become when there are any. */
  nextVersion: number;
  busy: boolean;
  onSend: (comment: string, imageIds: string[]) => Promise<boolean>;
  onCancel: () => void;
}) {
  const id = useId();
  const [message, setMessage, clearMessage] = useTaskDraft('changeRequest', '');
  const [stored, setStored, clearStored] = useTaskDraft(
    'changeRequestImages',
    '',
  );
  const images = useComposerImages({
    stored: readImages(stored),
    store: (list) => {
      if (list.length) setStored(JSON.stringify(list));
      else clearStored();
    },
    max: TASK_IMAGES_PER_MESSAGE,
  });
  const send = async () => {
    if (await onSend(message, images.ids)) {
      clearMessage();
      images.sent();
    }
  };
  return (
    <section
      aria-labelledby={`${id}-title`}
      className='flex flex-col gap-3 rounded-lg border p-4'
    >
      <div className='flex flex-col gap-0.5'>
        <h3 id={`${id}-title`} className='text-sm font-semibold'>
          {$t('articleEdit.requestTitle')}
        </h3>
        <p className={text.muted}>{$t('articleEdit.requestHint')}</p>
      </div>
      <InputGroup
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={images.onDrop}
      >
        <InputGroupTextarea
          aria-label={$t('articleEdit.requestTitle')}
          autoFocus
          rows={2}
          className='max-h-60 min-h-14 px-2.5 pt-2'
          value={message}
          disabled={busy}
          placeholder={$t('articleEdit.requestPlaceholder')}
          onChange={(e) => setMessage(e.target.value)}
          onPaste={images.onPaste}
        />
        {images.entries.length > 0 && (
          <InputGroupAddon align='block-end' className='font-normal'>
            <ComposerImages
              images={images.entries}
              disabled={busy}
              onRemove={images.remove}
            />
          </InputGroupAddon>
        )}
        <InputGroupAddon
          align='block-end'
          className='flex-wrap gap-x-3 gap-y-1 font-normal'
        >
          <AddImageButton
            disabled={busy || images.entries.length >= TASK_IMAGES_PER_MESSAGE}
            onFiles={images.add}
          />
          {session.changed && (
            <span className='ml-auto text-xs text-muted-foreground'>
              {$t('articleEdit.savedAsVersion', { 0: nextVersion })}
            </span>
          )}
          <Button
            size='sm'
            className={cn(!session.changed && 'ml-auto')}
            disabled={busy || !message.trim() || images.uploading}
            onClick={() => void send()}
          >
            {$t('articleEdit.sendToAgent')}
          </Button>
          <Button size='sm' variant='ghost' disabled={busy} onClick={onCancel}>
            {$t('common.cancel')}
          </Button>
        </InputGroupAddon>
      </InputGroup>
      <ImageProblem>{images.problem}</ImageProblem>
    </section>
  );
}
