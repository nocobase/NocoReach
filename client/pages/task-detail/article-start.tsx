import { useEffect, useId, useState } from 'react';
import { $t } from '#i18n';
import { Button } from '#components/ui/button';
import { Checkbox } from '#components/ui/checkbox';
import { Input } from '#components/ui/input';
import { Label } from '#components/ui/label';
import { RadioGroup, RadioGroupItem } from '#components/ui/radio-group';
import type { ArticleSummary } from '../../../shared/article-publishing.js';
import { errorStatus, searchArticles } from '../article-targets-api';
import type { TaskData } from '../task-execution-types';
import { MAX_ALSO, REPO, type DeliveryChoice } from './article-model';

// Where a task's change goes, chosen before it starts (docs/ARTICLE-PUBLISHING.md): a publishing target (an existing
// article, picked by search and saved on the task at once, or a new article), or the website repository as a PR.
// Other targets can receive the same article: matched by slug, updated there or created.
export function ArticleStart({
  data,
  projectId,
  choice,
  setChoice,
  busy,
  allowed,
  link,
}: {
  data: TaskData;
  projectId: number;
  choice: DeliveryChoice;
  setChoice: (c: DeliveryChoice) => void;
  busy: boolean;
  allowed: boolean;
  link: (
    targetId: string | null,
    articleId?: string | null,
  ) => Promise<boolean>;
}) {
  const id = useId(),
    targets = data.articleTargets || [],
    hasRepo = Boolean(data.agent?.repo),
    linked = data.work.article;
  const [q, setQ] = useState(''),
    [picking, setPicking] = useState(!linked?.articleId);
  const [result, setResult] = useState<{
    key: string;
    hits?: ArticleSummary[];
    error?: 'failed' | 'denied';
  }>();
  const [attempt, setAttempt] = useState(0);
  const target = choice.target === REPO ? undefined : choice.target;
  const searching = Boolean(target && choice.mode === 'existing' && picking);
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
  const full = choice.also.length >= MAX_ALSO;
  return (
    <>
      <label className='nr-td-start-field'>
        <span>{$t('articleTask.publishTo')}</span>
        <select
          aria-label={$t('articleTask.publishTo')}
          value={choice.target}
          disabled={busy || !allowed}
          onChange={(e) =>
            setChoice({
              target: e.target.value,
              mode: choice.mode,
              // The new primary leaves the others; the repository takes no other target.
              also:
                e.target.value === REPO
                  ? []
                  : choice.also.filter((x) => x !== e.target.value),
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
                const checked = choice.also.includes(t.id);
                return (
                  <div key={t.id} className='flex items-center gap-2'>
                    <Checkbox
                      id={`${id}-also-${t.id}`}
                      checked={checked}
                      disabled={busy || !allowed || (!checked && full)}
                      onCheckedChange={(on) =>
                        setChoice({
                          ...choice,
                          also:
                            on === true
                              ? [...choice.also, t.id]
                              : choice.also.filter((x) => x !== t.id),
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
        <div className='nr-td-start-field'>
          <span id={`${id}-article`}>{$t('articleTask.article')}</span>
          <RadioGroup
            aria-labelledby={`${id}-article`}
            className='flex flex-wrap gap-4'
            value={choice.mode}
            disabled={busy || !allowed}
            onValueChange={(v) =>
              setChoice({
                ...choice,
                mode: v as DeliveryChoice['mode'],
              })
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
          {choice.mode === 'existing' &&
            (linked?.articleId && linked.targetId === target && !picking ? (
              <p className='text-sm'>
                {$t('articleTask.selected', {
                  0: linked.title || linked.slug,
                  1: linked.slug,
                })}{' '}
                {allowed && (
                  <Button
                    variant='link'
                    size='sm'
                    className='h-auto p-0'
                    disabled={busy}
                    onClick={() => setPicking(true)}
                  >
                    {$t('articleTask.change')}
                  </Button>
                )}
              </p>
            ) : (
              <div className='flex flex-col gap-2 text-sm'>
                <Input
                  aria-label={$t('articleTask.search')}
                  placeholder={$t('articleTask.search')}
                  value={q}
                  disabled={busy || !allowed}
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
                        className='h-auto p-0'
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
                          disabled={busy || !allowed}
                          onClick={() =>
                            void link(target, h.id).then(
                              (ok) => ok && setPicking(false),
                            )
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
            ))}
          {choice.mode === 'existing' &&
            !(linked?.articleId && linked.targetId === target) && (
              <small>{$t('articleTask.pickArticle')}</small>
            )}
        </div>
      )}
    </>
  );
}
