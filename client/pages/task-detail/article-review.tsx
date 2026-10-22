import { useId, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { $t, getCurrentLocale } from '#i18n';
import { Alert, AlertDescription, AlertTitle } from '#components/ui/alert';
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
import { ChangeView } from '../change-view';
import { Markdown } from '../doc-view';
import { localeName } from '../article-targets-api';
import type {
  ArticleProposal,
  ArticleTargetRef,
  TaskData,
} from '../task-execution-types';
import { useTaskDraft } from './draft-store.js';
import {
  articleContext,
  fieldChange,
  fieldLabel,
  focusSoon,
  joinNames,
  nameOf,
  valueAt,
} from './article-model';

// The article an article step proposes, reviewed field by field against the version it was written from, and edited
// in place (a save is a new immutable version). Conflicts from a rebase are listed first, with both versions.

const draftContent = (
  a: Pick<ArticleProposal, 'draft'>,
): Partial<ArticleContent> => ({
  slug: a.draft.slug,
  status: a.draft.status,
  locales: a.draft.locales,
});

function TargetLine({
  target,
  a,
  base,
}: {
  target?: ArticleTargetRef;
  a: ArticleProposal;
  base: ArticleContent | null;
}) {
  const name = target?.name || a.targetId;
  const title = base
    ? base.locales[target?.locales[0] || '']?.title || base.slug
    : '';
  return (
    <p className='text-sm text-muted-foreground'>
      {a.articleId
        ? $t('articleTask.updateLine', {
            0: name,
            1: title,
            2: base?.slug || '',
          })
        : $t('articleTask.createLine', { 0: name, 1: a.draft.slug || '' })}
    </p>
  );
}

/**
 * One line per other target: update or new article, and what that target cannot hold. An update can be compared with
 * that target's own version, which may differ from the primary's.
 */
function AlsoLines({ data, a }: { data: TaskData; a: ArticleProposal }) {
  return (a.also || []).map((x) => {
    const name = nameOf(data, x.targetId),
      base = x.baseKey ? data.articleBases?.[x.baseKey] || null : null;
    const left = x.skipped.map((p) =>
      p.includes('.') || p === 'status'
        ? fieldLabel(p)
        : localeName(p, getCurrentLocale()),
    );
    const draft = draftContent(x);
    return (
      <div key={x.targetId} className='flex min-w-0 flex-col gap-1'>
        <p className='text-sm text-muted-foreground'>
          {x.articleId
            ? $t('articleTask.alsoUpdateLine', {
                0: name,
                1: x.title || x.slug,
                2: x.slug,
              })
            : $t('articleTask.alsoCreateLine', { 0: name })}
          {left.length > 0 &&
            ` · ${$t('articleTask.skipped', { 0: joinNames(left) })}`}
        </p>
        {x.articleId && base && x.changes.length > 0 && (
          <div className='border-l pl-3'>
            <Reveal label={$t('articleTask.alsoChanges', { 0: name })}>
              <ChangeView
                changes={x.changes.map((p) =>
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
    <Alert>
      <TriangleAlert />
      <AlertTitle>
        {$t('articleTask.conflictsTitle', { 0: targetName })}
      </AlertTitle>
      <AlertDescription className='flex flex-col gap-3'>
        {conflicts.map((c) => (
          <div key={c.field} className='flex min-w-0 flex-col gap-1'>
            <span>{$t('articleTask.currentToDraft', { 0: targetName })}</span>
            <ChangeView changes={[fieldChange(c.field, c.current, c.draft)]} />
          </div>
        ))}
      </AlertDescription>
    </Alert>
  );
}

export function ArticleReview({
  data,
  article: a,
  notes,
  settled = false,
}: {
  data: TaskData;
  article: ArticleProposal;
  notes: string;
  /** Looking back at a delivered version rather than reviewing it: what review settled (conflicts, adoption) is left out. */
  settled?: boolean;
}) {
  const { target, base } = articleContext(data, a);
  const locales = [
    ...new Set([...(target?.locales || []), ...Object.keys(a.draft.locales)]),
  ];
  const counts = (l: string) =>
    a.changes.filter((c) => c.startsWith(`${l}.`)).length;
  const [tab, setTab] = useState(locales.find((l) => counts(l)) || locales[0]);
  const other = a.changes.filter((c) => !c.includes('.'));
  const draft = draftContent(a);
  return (
    <div className='flex flex-col gap-4'>
      <TargetLine target={target} a={a} base={base} />
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
      {notes && <Markdown content={notes} />}
      {other.length > 0 && (
        <ChangeView
          changes={other.map((p) =>
            fieldChange(p, valueAt(base, p), valueAt(draft, p)),
          )}
        />
      )}
      <div
        className='nr-change-tabs'
        role='tablist'
        aria-label={$t('articleTask.article')}
      >
        {locales.map((l) => (
          <button
            key={l}
            type='button'
            role='tab'
            aria-selected={l === tab}
            onClick={() => setTab(l)}
          >
            {counts(l)
              ? $t('articleTask.changeCount', {
                  0: localeName(l, getCurrentLocale()),
                  1: counts(l),
                })
              : localeName(l, getCurrentLocale())}
          </button>
        ))}
      </div>
      <div role='tabpanel' className='flex flex-col gap-3'>
        {ARTICLE_FIELDS.map((f) => {
          const path = `${tab}.${f}`;
          return a.changes.includes(path) ? (
            <div key={path} className='flex min-w-0 flex-col gap-1'>
              <h4 className='text-sm font-medium'>
                {$t(`articleTask.field.${f}`)}
              </h4>
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
        })}
      </div>
    </div>
  );
}

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
      className='flex flex-col gap-4'
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <fieldset disabled={busy} className='flex flex-col gap-4'>
        {create && (
          <Field data-invalid={Boolean(errors.slug)}>
            <FieldLabel htmlFor={`${id}-slug`}>
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
            <FieldLabel id={`${id}-status`}>
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
                  <Label htmlFor={`${id}-status-${v}`}>
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
          <fieldset key={l} className='flex flex-col gap-3'>
            <legend className='text-sm font-medium'>
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
                  <FieldLabel htmlFor={`${id}-${key}`}>
                    {$t(`articleTask.field.${f}`)}
                    {required ? ' *' : ''}
                  </FieldLabel>
                  {f === 'title' ? (
                    <Input {...props} />
                  ) : (
                    <Textarea
                      {...props}
                      rows={f === 'body' ? 18 : 3}
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
          <FieldLabel htmlFor={`${id}-verifyText`}>
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
