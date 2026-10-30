import { useEffect, useId, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { $t, $tj, getCurrentLocale, useMessageState } from '#i18n';
import { cn } from '#lib/utils';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#components/ui/dialog';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import { Tag } from '#components/reach/tag';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import type {
  ArticleMatch,
  ArticleSummary,
} from '../../../shared/article-publishing.js';
import { translationDefault } from '../../../shared/article-publishing.js';
import {
  articleLanguages,
  errorStatus,
  localeName,
  searchArticles,
} from '../article-targets-api';
import type { TaskData } from '../task-execution-types';
import {
  MAX_ALSO,
  REPO,
  choiceLocales,
  translationLocales,
  type DeliveryChoice,
} from './article-model';
import { articlePageUrl } from './article-page';
import { Field } from './layout';
import { text } from './styles';

// Where a task's change goes, chosen before it starts (docs/ARTICLE-PUBLISHING.md): a publishing target (an existing
// article or a new one), or the website repository as a PR. Other targets can receive the same article: matched by
// slug, updated there or created. The start card shows the choice in one line; Change opens it in a dialog. A
// translation (2026-10-25) takes an article that exists, and the languages to translate it from and into.

type Picked = { targetId: string; id: string; title: string; slug: string };

/** The article the choice already names: the one found from the page, else the one saved on the task. */
function pickedOf(data: TaskData, choice: DeliveryChoice): Picked | undefined {
  const linked = data.work.article;
  if (choice.target === REPO || choice.mode !== 'existing') return undefined;
  if (choice.article?.targetId === choice.target)
    return {
      targetId: choice.target,
      id: choice.article.articleId,
      title: choice.article.title || choice.article.slug,
      slug: choice.article.slug,
    };
  if (linked?.articleId && linked.targetId === choice.target)
    return {
      targetId: choice.target,
      id: linked.articleId,
      title: linked.title || linked.slug,
      slug: linked.slug,
    };
  return undefined;
}

const names = (data: TaskData, ids: string[]) =>
  new Intl.ListFormat(getCurrentLocale(), {
    style: 'short',
    type: 'conjunction',
  }).format(
    ids.map((id) => data.articleTargets?.find((t) => t.id === id)?.name || id),
  );

export function DeliveryDialog({
  open,
  onClose,
  ...form
}: {
  open: boolean;
  onClose: () => void;
  data: TaskData;
  projectId: number;
  choice: DeliveryChoice;
  /** The article found from the task's page: picking it again keeps it unsaved until the task starts. */
  found?: ArticleMatch | null;
  /** Why the article has to be picked by hand (not found from the page, or the lookup failed). */
  notice?: string;
  /** A translation playbook: an article that exists, the source language and the languages to write. */
  translate?: boolean;
  busy: boolean;
  link: (targetId: string, articleId: string) => Promise<boolean>;
  onSave: (choice: DeliveryChoice) => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className='flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {$t(
              form.translate
                ? 'articleTask.chooseTranslation'
                : 'articleTask.chooseArticle',
            )}
          </DialogTitle>
        </DialogHeader>
        {open && <DeliveryForm {...form} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

// The dialog's fields, set from the card's choice each time it opens; nothing changes until Save.
function DeliveryForm({
  data,
  projectId,
  choice,
  found,
  notice,
  translate = false,
  busy,
  link,
  onSave,
  onClose,
}: {
  data: TaskData;
  projectId: number;
  choice: DeliveryChoice;
  found?: ArticleMatch | null;
  notice?: string;
  translate?: boolean;
  busy: boolean;
  link: (targetId: string, articleId: string) => Promise<boolean>;
  onSave: (choice: DeliveryChoice) => void;
  onClose: () => void;
}) {
  const id = useId(),
    targets = data.articleTargets || [],
    hasRepo = Boolean(data.agent?.repo),
    linked = data.work.article;
  const [draft, setDraft] = useState<DeliveryChoice>({
      target: choice.target,
      mode: choice.mode,
      also: choice.also,
      ...(choice.locales ? { locales: choice.locales } : {}),
    }),
    [picked, setPicked] = useState(() => pickedOf(data, choice));
  const [q, setQ] = useState(''),
    [attempt, setAttempt] = useState(0),
    [saving, setSaving] = useState(false),
    [error, setError] = useMessageState('');
  const [result, setResult] = useState<{
    key: string;
    hits?: ArticleSummary[];
    error?: 'failed' | 'denied';
  }>();
  const target = draft.target === REPO ? undefined : draft.target;
  // A translation always changes an article that exists.
  const mode = translate ? 'existing' : draft.mode;
  const searching = Boolean(target && mode === 'existing');
  useEffect(() => {
    if (!searching || !target) return;
    const controller = new AbortController();
    const t = setTimeout(() => {
      void searchArticles(projectId, target, q, controller.signal).then(
        (hits) =>
          setResult({
            key: `${target}:${q}`,
            hits: Array.isArray(hits) ? hits : [],
          }),
        (e) => {
          if (!controller.signal.aborted)
            setResult({
              key: `${target}:${q}`,
              error: errorStatus(e) === 403 ? 'denied' : 'failed',
            });
        },
      );
    }, 300);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [searching, target, q, projectId, attempt]);
  const current = result?.key === `${target}:${q}` ? result : undefined;
  const article = picked?.targetId === target ? picked : undefined;
  // The languages the picked article has: known for the article found from the page or saved on the task, otherwise
  // read from the target (unknown while reading or when the read fails: every language counts as present).
  const known = !article
    ? undefined
    : found?.targetId === target && found?.articleId === article.id
      ? found?.locales
      : linked?.targetId === target && linked?.articleId === article.id
        ? linked?.locales
        : undefined;
  const languagesKey =
    translate && target && article && !known ? `${target}:${article.id}` : '';
  const [read, setRead] = useState<{ key: string; locales?: string[] }>();
  useEffect(() => {
    if (!languagesKey || !target || !article) return;
    const controller = new AbortController();
    void articleLanguages(
      projectId,
      target,
      article.id,
      controller.signal,
    ).then(
      (r) => {
        if (!controller.signal.aborted)
          setRead({
            key: languagesKey,
            locales: Array.isArray(r?.locales) ? r.locales : undefined,
          });
      },
      () => {
        if (!controller.signal.aborted) setRead({ key: languagesKey });
      },
    );
    return () => controller.abort();
  }, [languagesKey, projectId, target, article]);
  const present =
    known ?? (read?.key === languagesKey ? read.locales : undefined);
  const translation =
    translate && target
      ? translationLocales(
          data,
          { target, mode, also: [], locales: draft.locales },
          present,
        )
      : [];
  const full = draft.also.length >= MAX_ALSO;
  const disabled = busy || saving;
  const done = (c: DeliveryChoice) => {
    onSave(c);
    onClose();
  };
  const save = async () => {
    if (!target) return done({ target: REPO, mode: 'new', also: [] });
    const also = translate ? [] : draft.also.filter((x) => x !== target),
      locales = translate
        ? { locales: translation }
        : draft.locales
          ? { locales: draft.locales }
          : {};
    if (mode === 'new') return done({ target, mode: 'new', also, ...locales });
    if (!article) return;
    if (linked?.articleId === article.id && linked.targetId === target)
      return done({ target, mode: 'existing', also, ...locales });
    if (found?.targetId === target && found.articleId === article.id)
      return done({
        target,
        mode: 'existing',
        also,
        article: found,
        ...locales,
      });
    // Any other article is saved on the task now, as picking one always was.
    setSaving(true);
    setError('');
    const ok = await link(target, article.id);
    setSaving(false);
    if (ok) done({ target, mode: 'existing', also, ...locales });
    else setError(() => $t('common.notSavedTryAgain'));
  };
  return (
    <>
      <div className='-mx-4 flex min-h-0 flex-col gap-4 overflow-y-auto px-4 pb-2'>
        <label className='nr-td-start-field'>
          <span>{$t('articleTask.publishTo')}</span>
          <select
            aria-label={$t('articleTask.publishTo')}
            value={draft.target}
            disabled={disabled}
            onChange={(e) =>
              setDraft({
                // Another target has its own languages: start from all of them.
                target: e.target.value,
                mode: draft.mode,
                // The new primary leaves the others; the repository takes no other target.
                also:
                  e.target.value === REPO
                    ? []
                    : draft.also.filter((x) => x !== e.target.value),
              })
            }
          >
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value={REPO} disabled={!hasRepo}>
              {$t('articleTask.repository')}
              {hasRepo ? '' : ` · ${$t('articleTask.noRepository')}`}
            </option>
          </select>
        </label>
        {target && !translate && targets.length > 1 && (
          <div className='nr-td-start-field'>
            <span id={`${id}-also`}>{$t('articleTask.alsoPublishTo')}</span>
            <div
              role='group'
              aria-labelledby={`${id}-also`}
              className='flex flex-wrap gap-x-4 gap-y-2'
            >
              {targets
                .filter((t) => t.id !== target)
                .map((t) => {
                  const checked = draft.also.includes(t.id);
                  return (
                    <div key={t.id} className='flex items-center gap-2'>
                      <Checkbox
                        id={`${id}-also-${t.id}`}
                        checked={checked}
                        disabled={disabled || (!checked && full)}
                        onCheckedChange={(on) =>
                          setDraft({
                            ...draft,
                            also:
                              on === true
                                ? [...draft.also, t.id]
                                : draft.also.filter((x) => x !== t.id),
                          })
                        }
                      />
                      <Label htmlFor={`${id}-also-${t.id}`}>{t.name}</Label>
                    </div>
                  );
                })}
            </div>
            <small>{$t('articleTask.alsoHelp')}</small>
            {full && (
              <small>{$t('articleTask.alsoLimit', { 0: MAX_ALSO })}</small>
            )}
          </div>
        )}
        {target && !translate && (
          <LanguagePicker
            id={id}
            all={targets.find((t) => t.id === target)?.locales || []}
            chosen={choiceLocales(data, draft)}
            present={
              mode === 'existing' && article ? (present ?? null) : undefined
            }
            disabled={disabled}
            onChange={(locales) => setDraft({ ...draft, locales })}
          />
        )}
        {target && (
          <div className='nr-td-start-field'>
            <span id={`${id}-article`}>{$t('articleTask.article')}</span>
            {notice && <small data-article-not-found=''>{notice}</small>}
            {!translate && (
              <RadioGroup
                aria-labelledby={`${id}-article`}
                className='flex flex-wrap gap-4'
                value={draft.mode}
                disabled={disabled}
                onValueChange={(v) =>
                  setDraft({ ...draft, mode: v as DeliveryChoice['mode'] })
                }
              >
                <div className='flex items-center gap-2'>
                  <RadioGroupItem id={`${id}-new`} value='new' />
                  <Label htmlFor={`${id}-new`}>
                    {$t('articleTask.newArticle')}
                  </Label>
                </div>
                <div className='flex items-center gap-2'>
                  <RadioGroupItem id={`${id}-existing`} value='existing' />
                  <Label htmlFor={`${id}-existing`}>
                    {$t('articleTask.existingArticle')}
                  </Label>
                </div>
              </RadioGroup>
            )}
            {mode === 'existing' && (
              <div className='flex flex-col gap-2 text-sm'>
                <p className={article ? '' : 'nr-td-muted'}>
                  {article
                    ? $t('articleTask.selected', {
                        0: article.title,
                        1: article.slug,
                      })
                    : $t(
                        translate
                          ? 'articleTask.pickArticleToTranslate'
                          : 'articleTask.pickArticle',
                      )}
                </p>
                <Input
                  aria-label={$t('articleTask.search')}
                  placeholder={$t('articleTask.search')}
                  value={q}
                  disabled={disabled}
                  onChange={(e) => setQ(e.target.value)}
                />
                {!current ? (
                  <p className='nr-td-muted'>{$t('articleTask.searching')}</p>
                ) : current.error ? (
                  <p className='text-destructive'>
                    {$t(
                      current.error === 'denied'
                        ? 'articleTask.searchDenied'
                        : 'articleTask.searchFailed',
                    )}{' '}
                    {current.error === 'failed' && (
                      <Button
                        variant='link'
                        size='sm'
                        className='h-auto p-0 font-normal'
                        onClick={() => setAttempt((n) => n + 1)}
                      >
                        {$t('common.retry')}
                      </Button>
                    )}
                  </p>
                ) : current.hits?.length ? (
                  <ul className='nr-td-hits'>
                    {current.hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type='button'
                          aria-pressed={article?.id === h.id}
                          className='aria-pressed:bg-muted'
                          disabled={disabled}
                          onClick={() => {
                            // Another article has its own languages: start from its default.
                            if (article?.id !== h.id && translate)
                              setDraft({ ...draft, locales: undefined });
                            setPicked({
                              targetId: target,
                              id: h.id,
                              title: h.title || h.slug,
                              slug: h.slug,
                            });
                          }}
                        >
                          <b>{h.title || h.slug}</b>
                          <small>{h.slug}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className='nr-td-muted'>{$t('articleTask.noMatches')}</p>
                )}
              </div>
            )}
          </div>
        )}
        {target && translate && (
          <TranslationPicker
            id={id}
            all={targets.find((t) => t.id === target)?.locales || []}
            present={article ? present : undefined}
            chosen={translation}
            disabled={disabled}
            onChange={(locales) => setDraft({ ...draft, locales })}
          />
        )}
        {error && (
          <p role='alert' className='nr-error'>
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <Button variant='outline' disabled={saving} onClick={onClose}>
          {$t('common.cancel')}
        </Button>
        <Button
          disabled={
            disabled ||
            Boolean(target && mode === 'existing' && !article) ||
            Boolean(target && translate && translation.length < 2)
          }
          onClick={() => void save()}
        >
          {$t('common.save')}
        </Button>
      </DialogFooter>
    </>
  );
}

// Where the change goes, in one line (2026-10-21): the article found from the task's page, the one saved on the
// task, a new article in the playbook's target, or the website repository. Change opens DeliveryDialog; when an
// article still has to be picked, the line says why and Choose article opens the same dialog.
/**
 * The languages a task writes (2026-10-24): the primary, written and reviewed first, and the others, translated from
 * it once it is approved, or updated in place with its changes where an existing article has them (2026-10-28).
 * Every language of the target is chosen until the person changes it.
 */
function LanguagePicker({
  id,
  all,
  chosen,
  present,
  disabled,
  onChange,
}: {
  id: string;
  all: string[];
  chosen: string[];
  /** An existing article's languages (null: not known yet, every one counts as present); undefined for a new one. */
  present?: string[] | null;
  disabled: boolean;
  onChange: (locales: string[]) => void;
}) {
  const ui = getCurrentLocale(),
    primary = chosen[0] || all[0] || '',
    others = all.filter((l) => l !== primary);
  // An existing article's languages get the primary's changes in place rather than a new translation (2026-10-28).
  const updates =
    present !== undefined &&
    chosen.slice(1).some((l) => !present || present.includes(l));
  if (all.length < 2) return null;
  return (
    <div className='nr-td-start-field'>
      <span id={`${id}-languages`}>{$t('articleTask.languages')}</span>
      <label className='flex flex-wrap items-center gap-2 text-sm'>
        <span className='text-muted-foreground'>
          {$t('articleTask.primaryLanguage')}
        </span>
        <select
          aria-label={$t('articleTask.primaryLanguage')}
          value={primary}
          disabled={disabled}
          onChange={(e) =>
            // The others keep the target's order; the language that was primary stays in, as one to translate.
            onChange([
              e.target.value,
              ...all.filter(
                (l) =>
                  l !== e.target.value && (l === primary || chosen.includes(l)),
              ),
            ])
          }
        >
          {all.map((l) => (
            <option key={l} value={l}>
              {localeName(l, ui)}
            </option>
          ))}
        </select>
      </label>
      <div
        role='group'
        aria-labelledby={`${id}-languages`}
        className='flex flex-wrap gap-x-4 gap-y-2'
      >
        {others.map((l) => {
          const checked = chosen.includes(l);
          return (
            <div key={l} className='flex items-center gap-2'>
              <Checkbox
                id={`${id}-language-${l}`}
                checked={checked}
                disabled={disabled}
                onCheckedChange={(on) =>
                  onChange(
                    on === true
                      ? [
                          primary,
                          ...all.filter(
                            (x) =>
                              x !== primary && (x === l || chosen.includes(x)),
                          ),
                        ]
                      : chosen.filter((x) => x !== l),
                  )
                }
              />
              <Label htmlFor={`${id}-language-${l}`}>{localeName(l, ui)}</Label>
            </div>
          );
        })}
      </div>
      <small>
        {$t(
          updates
            ? 'articleTask.languagesHelpUpdate'
            : 'articleTask.languagesHelp',
        )}
      </small>
    </div>
  );
}

/**
 * What a translation writes (2026-10-25): the source language, which the article must have, and the languages to
 * translate it into, each marked Missing when the article lacks it. Choosing another source starts its default again.
 */
function TranslationPicker({
  id,
  all,
  present,
  chosen,
  disabled,
  onChange,
}: {
  id: string;
  all: string[];
  /** The languages the article has; unknown counts every language as present. */
  present?: string[];
  chosen: string[];
  disabled: boolean;
  onChange: (locales: string[]) => void;
}) {
  const ui = getCurrentLocale(),
    from = chosen[0] || '',
    to = chosen.slice(1),
    sources = present ? all.filter((l) => present.includes(l)) : all;
  if (all.length < 2)
    return (
      <p className={text.muted} data-translate-one-language=''>
        {$t('articleTask.translateOneLanguage')}
      </p>
    );
  return (
    <>
      <label className='nr-td-start-field'>
        <span>{$t('articleTask.sourceLanguage')}</span>
        <select
          aria-label={$t('articleTask.sourceLanguage')}
          value={from}
          disabled={disabled}
          onChange={(e) => {
            const d = translationDefault(all, present, e.target.value);
            onChange([d.from, ...d.to]);
          }}
        >
          {sources.map((l) => (
            <option key={l} value={l}>
              {localeName(l, ui)}
            </option>
          ))}
        </select>
      </label>
      <div className='nr-td-start-field'>
        <span id={`${id}-into`}>{$t('articleTask.translateInto')}</span>
        <div
          role='group'
          aria-labelledby={`${id}-into`}
          className='flex flex-wrap gap-x-4 gap-y-2'
        >
          {all
            .filter((l) => l !== from)
            .map((l) => {
              const checked = to.includes(l);
              return (
                <div key={l} className='flex items-center gap-2'>
                  <Checkbox
                    id={`${id}-into-${l}`}
                    checked={checked}
                    disabled={disabled}
                    onCheckedChange={(on) =>
                      onChange([
                        from,
                        ...all.filter(
                          (x) =>
                            x !== from &&
                            (x === l ? on === true : to.includes(x)),
                        ),
                      ])
                    }
                  />
                  <Label htmlFor={`${id}-into-${l}`}>{localeName(l, ui)}</Label>
                  {present && !present.includes(l) && (
                    <Tag tone='amber'>{$t('articleTask.languageMissing')}</Tag>
                  )}
                </div>
              );
            })}
        </div>
        <small>{$t('articleTask.translateHelp')}</small>
      </div>
    </>
  );
}

export function DeliverySummary({
  data,
  choice,
  finding,
  notice,
  allowed,
  busy,
  translate = false,
  onChange,
}: {
  data: TaskData;
  choice: DeliveryChoice;
  finding: boolean;
  notice?: string;
  allowed: boolean;
  busy: boolean;
  /** A translation playbook: the article to translate and, in one line, from and into which languages. */
  translate?: boolean;
  onChange: () => void;
}) {
  const targets = data.articleTargets || [],
    name = (id: string) => targets.find((t) => t.id === id)?.name || id,
    also = choice.target === REPO || translate ? [] : choice.also,
    languages = translate
      ? translationLocales(data, choice)
      : choiceLocales(data, choice),
    ui = getCurrentLocale(),
    toChange = $t(
      translate
        ? 'articleTask.articleToTranslate'
        : 'articleTask.articleToChange',
    );
  const change = allowed && !finding && (
    <Button
      variant='link'
      size='sm'
      className='h-auto p-0 font-normal'
      disabled={busy}
      onClick={onChange}
    >
      {$t('articleTask.changeDelivery')}
    </Button>
  );
  const row = (label: string, body: ReactNode, action: ReactNode = change) => (
    <Field label={label}>
      <div
        className={cn(text.body, 'flex flex-wrap items-center gap-x-2 gap-y-1')}
        data-delivery-summary=''
      >
        {body}
        {action}
      </div>
      {also.length > 0 && (
        <p className={text.muted}>
          {$t('articleTask.alsoPublishesTo', { 0: names(data, also) })}
        </p>
      )}
      {translate && choice.target !== REPO ? (
        languages.length > 1 ? (
          <p
            className={cn(text.muted, 'flex flex-wrap items-center gap-1')}
            data-delivery-languages=''
          >
            {$tj('articleTask.translateLine', {
              0: <Tag tone='grey'>{localeName(languages[0], ui)}</Tag>,
              1: (
                <span className='inline-flex flex-wrap gap-1'>
                  {languages.slice(1).map((l) => (
                    <Tag key={l} tone='grey'>
                      {localeName(l, ui)}
                    </Tag>
                  ))}
                </span>
              ),
            })}
          </p>
        ) : (
          <p className={text.muted} data-translate-one-language=''>
            {$t('articleTask.translateOneLanguage')}
          </p>
        )
      ) : (
        languages.length > 1 && (
          <p className={text.muted} data-delivery-languages=''>
            {$t('articleTask.languagesLine', {
              0: [
                $t('articleTask.primaryMark', {
                  0: localeName(languages[0], getCurrentLocale()),
                }),
                ...languages
                  .slice(1)
                  .map((l) => localeName(l, getCurrentLocale())),
              ].join(' · '),
            })}
          </p>
        )
      )}
    </Field>
  );
  if (finding)
    return row(
      toChange,
      <span className='text-muted-foreground'>
        {$t('articleTask.findingArticle')}
      </span>,
    );
  if (choice.target === REPO)
    return row($t('articleTask.changeVia'), $t('articleTask.repository'));
  if (choice.mode === 'new' && !translate)
    return row(
      $t('articleTask.newArticle'),
      $t('articleTask.publishesTo', { 0: name(choice.target) }),
    );
  const picked = pickedOf(data, choice);
  if (!picked)
    return row(
      toChange,
      <span className='text-muted-foreground' data-article-not-found=''>
        {notice ||
          $t(
            translate
              ? 'articleTask.pickArticleToTranslate'
              : 'articleTask.pickArticle',
          )}
      </span>,
      allowed && (
        <Button variant='outline' size='sm' disabled={busy} onClick={onChange}>
          {$t('articleTask.chooseArticle')}
        </Button>
      ),
    );
  const url =
    choice.article?.targetId === choice.target
      ? choice.article.url
      : articlePageUrl(data, choice.target, picked.slug);
  return row(
    toChange,
    <>
      {/^https?:\/\//i.test(url) ? (
        <a
          className='nr-link inline-flex items-center gap-1'
          href={url}
          target='_blank'
          rel='noreferrer'
        >
          {picked.title}
          <ExternalLink className='size-3 shrink-0' aria-hidden='true' />
        </a>
      ) : (
        <span>{picked.title}</span>
      )}
      <Tag tone='grey'>{name(choice.target)}</Tag>
      {choice.article && (
        <Tag tone='green'>{$t('articleTask.foundByPage')}</Tag>
      )}
    </>,
  );
}

/**
 * Primary language under Continue with (2026-10-30, T-58: a hand-off wrote English first in a Chinese project): the
 * language the new task writes and has reviewed first, the project's AI content language preselected; the target's
 * other languages are translated after it is approved.
 */
export function HandoffLanguage({
  id,
  all,
  primary,
  busy,
  onChange,
}: {
  id: string;
  all: string[];
  primary: string;
  busy: boolean;
  onChange: (primary: string) => void;
}) {
  const ui = getCurrentLocale();
  if (all.length < 2) return null;
  const others = all.filter((l) => l !== primary);
  return (
    <Field label={$t('articleTask.primaryLanguage')} id={`${id}-primary`}>
      <Select
        value={primary}
        disabled={busy}
        onValueChange={(v) => {
          if (typeof v === 'string') onChange(v);
        }}
      >
        <SelectTrigger className='w-full' aria-labelledby={`${id}-primary`}>
          <SelectValue>{(v: string) => localeName(v, ui)}</SelectValue>
        </SelectTrigger>
        <SelectContent className='min-w-(--anchor-width)'>
          {all.map((l) => (
            <SelectItem key={l} value={l}>
              {localeName(l, ui)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className={text.muted}>
        {$t('articleTask.handoffLanguagesHelp', {
          0: others
            .map((l) => localeName(l, ui))
            .join(ui.startsWith('zh') ? '、' : ', '),
        })}
      </p>
    </Field>
  );
}

/**
 * The primary language on the article review card while it waits for approval (2026-10-30): choosing another one
 * writes a new version in it, and the others, the former primary included, are translated once it is approved.
 */
export function PrimaryLanguage({
  data,
  busy,
  allowed,
  onChange,
}: {
  data: TaskData;
  busy: boolean;
  allowed: boolean;
  onChange: (locale: string) => void;
}) {
  const id = useId(),
    ui = getCurrentLocale(),
    d = data.work.delivery,
    all =
      (data.articleTargets || []).find((t) => t.id === d?.targetId)?.locales ||
      [];
  const primary = d?.locales?.[0];
  if (
    !primary ||
    (d?.locales?.length || 0) < 2 ||
    d?.translateFrom ||
    all.length < 2
  )
    return null;
  return (
    <Field label={$t('articleTask.primaryLanguage')} id={`${id}-primary`}>
      <Select
        value={primary}
        disabled={busy || !allowed}
        onValueChange={(v) => {
          if (typeof v === 'string' && v !== primary) onChange(v);
        }}
      >
        <SelectTrigger
          className='w-full sm:w-64'
          aria-labelledby={`${id}-primary`}
        >
          <SelectValue>{(v: string) => localeName(v, ui)}</SelectValue>
        </SelectTrigger>
        <SelectContent className='min-w-(--anchor-width)'>
          {all.map((l) => (
            <SelectItem key={l} value={l}>
              {localeName(l, ui)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className={text.muted}>{$t('articleTask.changePrimaryHelp')}</p>
    </Field>
  );
}
