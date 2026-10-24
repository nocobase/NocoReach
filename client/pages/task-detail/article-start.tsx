import { useEffect, useId, useState, type ReactNode } from 'react';
import { ExternalLink } from 'lucide-react';
import { $t, getCurrentLocale, useMessageState } from '#i18n';
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
import type {
  ArticleMatch,
  ArticleSummary,
} from '../../../shared/article-publishing.js';
import {
  errorStatus,
  localeName,
  searchArticles,
} from '../article-targets-api';
import type { TaskData } from '../task-execution-types';
import {
  MAX_ALSO,
  REPO,
  choiceLocales,
  type DeliveryChoice,
} from './article-model';
import { articlePageUrl } from './article-page';
import { Field } from './layout';
import { text } from './styles';

// Where a task's change goes, chosen before it starts (docs/ARTICLE-PUBLISHING.md): a publishing target (an existing
// article or a new one), or the website repository as a PR. Other targets can receive the same article: matched by
// slug, updated there or created. The start card shows the choice in one line; Change opens it in a dialog.

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
          <DialogTitle>{$t('articleTask.chooseArticle')}</DialogTitle>
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
  const searching = Boolean(target && draft.mode === 'existing');
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
  const full = draft.also.length >= MAX_ALSO;
  const disabled = busy || saving;
  const done = (c: DeliveryChoice) => {
    onSave(c);
    onClose();
  };
  const save = async () => {
    if (!target) return done({ target: REPO, mode: 'new', also: [] });
    const also = draft.also.filter((x) => x !== target),
      locales = draft.locales ? { locales: draft.locales } : {};
    if (draft.mode === 'new')
      return done({ target, mode: 'new', also, ...locales });
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
        {target && targets.length > 1 && (
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
        {target && (
          <LanguagePicker
            id={id}
            all={targets.find((t) => t.id === target)?.locales || []}
            chosen={choiceLocales(data, draft)}
            disabled={disabled}
            onChange={(locales) => setDraft({ ...draft, locales })}
          />
        )}
        {target && (
          <div className='nr-td-start-field'>
            <span id={`${id}-article`}>{$t('articleTask.article')}</span>
            {notice && <small data-article-not-found=''>{notice}</small>}
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
            {draft.mode === 'existing' && (
              <div className='flex flex-col gap-2 text-sm'>
                <p className={article ? '' : 'nr-td-muted'}>
                  {article
                    ? $t('articleTask.selected', {
                        0: article.title,
                        1: article.slug,
                      })
                    : $t('articleTask.pickArticle')}
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
                          onClick={() =>
                            setPicked({
                              targetId: target,
                              id: h.id,
                              title: h.title || h.slug,
                              slug: h.slug,
                            })
                          }
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
            disabled || Boolean(target && draft.mode === 'existing' && !article)
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
 * it once it is approved. Every language of the target is chosen until the person changes it.
 */
function LanguagePicker({
  id,
  all,
  chosen,
  disabled,
  onChange,
}: {
  id: string;
  all: string[];
  chosen: string[];
  disabled: boolean;
  onChange: (locales: string[]) => void;
}) {
  const ui = getCurrentLocale(),
    primary = chosen[0] || all[0] || '',
    others = all.filter((l) => l !== primary);
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
      <small>{$t('articleTask.languagesHelp')}</small>
    </div>
  );
}

export function DeliverySummary({
  data,
  choice,
  finding,
  notice,
  allowed,
  busy,
  onChange,
}: {
  data: TaskData;
  choice: DeliveryChoice;
  finding: boolean;
  notice?: string;
  allowed: boolean;
  busy: boolean;
  onChange: () => void;
}) {
  const targets = data.articleTargets || [],
    name = (id: string) => targets.find((t) => t.id === id)?.name || id,
    also = choice.target === REPO ? [] : choice.also,
    languages = choiceLocales(data, choice);
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
      {languages.length > 1 && (
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
      )}
    </Field>
  );
  if (finding)
    return row(
      $t('articleTask.articleToChange'),
      <span className='text-muted-foreground'>
        {$t('articleTask.findingArticle')}
      </span>,
    );
  if (choice.target === REPO)
    return row($t('articleTask.changeVia'), $t('articleTask.repository'));
  if (choice.mode === 'new')
    return row(
      $t('articleTask.newArticle'),
      $t('articleTask.publishesTo', { 0: name(choice.target) }),
    );
  const picked = pickedOf(data, choice);
  if (!picked)
    return row(
      $t('articleTask.articleToChange'),
      <span className='text-muted-foreground' data-article-not-found=''>
        {notice || $t('articleTask.pickArticle')}
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
    $t('articleTask.articleToChange'),
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
