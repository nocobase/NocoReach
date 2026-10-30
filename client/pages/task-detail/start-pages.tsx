import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Search } from 'lucide-react';
import { $t, $tj } from '#i18n';
import { cn } from '#lib/utils';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import { Button } from '#components/ui/button';
import { Tag } from '#components/reach/tag';
import { pageKey } from '../../../shared/opportunity-parts.js';
import type { ArticleSummary } from '../../../shared/article-publishing.js';
import { searchArticles } from '../article-targets-api';
import type { TaskData } from '../task-execution-types';
import { restGroups, type PageFound, type PageGroup } from './article-model';
import { articlePageUrl } from './article-page';
import { Field } from './layout';
import { text } from './styles';

// The start card's pages (2026-10-29, after T-54): a task with no page known asks which page to change, searching the
// site's pages (Website content) and the CMS articles together, and the page picked decides where the change goes. A
// task whose pages are in two places changes where most of them are; one line names the others, with Create separate
// tasks for them (nrStrategy:splitTask), and once those exist, the tasks they are in.

type Hit = {
  kind: 'page' | 'article';
  url: string;
  title: string;
  targetId?: string;
  articleId?: string;
};
const pathOf = (url: string) => {
  try {
    return decodeURI(new URL(url).pathname || '/');
  } catch {
    return url;
  }
};
const HITS = 8;

/** Which page to change, when the task names none: one search over the site's pages and the CMS articles. */
export function PagePicker({
  data,
  projectId,
  taskId,
  allowed,
  busy,
  onPage,
  onArticle,
  onChange,
}: {
  data: TaskData;
  projectId: number;
  taskId: string;
  allowed: boolean;
  busy: boolean;
  /** A page of Website content: linked to the task, so the lookup tells where it is changed. */
  onPage: (url: string) => void;
  /** A CMS article: linked to the task, changed in that article. */
  onArticle: (targetId: string, articleId: string) => void;
  /** The exceptions (a change that is about no single page): the delivery dialog. */
  onChange: () => void;
}) {
  const targets = data.articleTargets || [],
    targetIds = targets.map((t) => t.id).join('\n'),
    [q, setQ] = useState(''),
    [focused, setFocused] = useState(false),
    [result, setResult] = useState<{
      key: string;
      pages: { url: string; title: string }[];
      articles: { targetId: string; hits: ArticleSummary[] }[];
      failed: boolean;
    }>();
  const key = `${projectId}:${taskId}:${targetIds}:${q}`;
  useEffect(() => {
    const controller = new AbortController(),
      signal = controller.signal,
      ids = targetIds ? targetIds.split('\n') : [];
    const t = setTimeout(() => {
      void Promise.allSettled([
        api.action<{ url: string; title: string }[]>('nrTaskWork', 'pages', {
          method: 'POST',
          body: { projectId: String(projectId), taskId, q },
          unwrap: 'data',
          signal,
        }),
        ...ids.map((id) => searchArticles(projectId, id, q, signal)),
      ]).then((all) => {
        if (signal.aborted) return;
        const [pages, ...lists] = all;
        setResult({
          key: `${projectId}:${taskId}:${targetIds}:${q}`,
          pages:
            pages.status === 'fulfilled' && Array.isArray(pages.value)
              ? pages.value
              : [],
          articles: lists.map((r, i) => ({
            targetId: ids[i],
            hits:
              r.status === 'fulfilled' && Array.isArray(r.value) ? r.value : [],
          })),
          failed: all.every((r) => r.status === 'rejected'),
        });
      });
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [projectId, taskId, targetIds, q]);
  const current = result?.key === key ? result : undefined;
  const hits = useMemo((): Hit[] => {
    if (!current) return [];
    const articles: Hit[] = current.articles.flatMap(({ targetId, hits }) =>
      hits.map((a) => ({
        kind: 'article' as const,
        url: articlePageUrl(data, targetId, a.slug),
        title: a.title || a.slug,
        targetId,
        articleId: a.id,
      })),
    );
    // A post the sitemap also lists is shown once, as the article it is.
    const known = new Set(articles.map((a) => pageKey(a.url)).filter(Boolean));
    const site: Hit[] = current.pages
      .filter((p) => !known.has(pageKey(p.url)))
      .map((p) => ({ kind: 'page', url: p.url, title: p.title }));
    return [
      ...site.slice(0, HITS / 2),
      ...articles,
      ...site.slice(HITS / 2),
    ].slice(0, HITS);
  }, [current, data]);
  const disabled = busy || !allowed;
  return (
    <Field label={$t('taskPages.whichPage')}>
      <label className='nr-td-search'>
        <Search aria-hidden='true' />
        <input
          aria-label={$t('taskPages.whichPage')}
          value={q}
          placeholder={$t('taskPages.searchPlaceholder')}
          disabled={disabled}
          onFocus={() => setFocused(true)}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      {(focused || q) &&
        (!current ? (
          <p className='nr-td-muted'>{$t('articleTask.searching')}</p>
        ) : current.failed ? (
          <p className='text-sm text-destructive'>
            {$t('taskPages.searchFailed')}
          </p>
        ) : hits.length ? (
          <ul className='nr-td-hits' data-page-hits=''>
            {hits.map((h) => (
              <li key={`${h.kind}:${h.targetId || ''}:${h.articleId || h.url}`}>
                <button
                  type='button'
                  className='!flex-row items-center justify-between gap-3'
                  disabled={disabled}
                  onClick={() =>
                    h.kind === 'page'
                      ? onPage(h.url)
                      : onArticle(h.targetId!, h.articleId!)
                  }
                >
                  <span className='flex min-w-0 flex-col'>
                    <b className='truncate'>{h.title || pathOf(h.url)}</b>
                    {h.url && <small>{pathOf(h.url)}</small>}
                  </span>
                  <Tag tone='grey'>
                    {$t(
                      h.kind === 'page'
                        ? 'taskPages.sitePage'
                        : 'taskPages.blogArticle',
                    )}
                  </Tag>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className='nr-td-muted'>{$t('taskDetail.noMatchingPages')}</p>
        ))}
      {allowed && targets.length > 0 && (
        <p className={text.muted}>
          {$tj('taskPages.notOnePage', {
            0: (
              <Button
                variant='link'
                size='sm'
                className='h-auto p-0 align-baseline font-normal'
                disabled={busy}
                onClick={onChange}
              >
                {$t('articleTask.changeDeliveryTitle')}
              </Button>
            ),
          })}
        </p>
      )}
    </Field>
  );
}

type Related = NonNullable<TaskData['related']>[number];
/** The key of the line naming what is left out: blog posts, pages of the site, or both. */
const restKey = (
  { articles, site }: ReturnType<typeof restGroups>,
  where: 'NotHere' | 'In',
) =>
  `taskPages.rest${articles.length && site ? 'Both' : articles.length ? 'Articles' : 'SitePages'}${where}`;
const restCounts = ({ articles, site }: ReturnType<typeof restGroups>) =>
  articles.length && site
    ? [articles.length, site.pages.length]
    : [articles.length || site?.pages.length || 0];

/**
 * The pages this task leaves out: the ones no task has yet, with Create separate tasks; once each has one, the tasks
 * they are in (open tasks split off this one or of its opportunity, by their pages).
 */
export function RestNotice({
  rest,
  related = [],
  allowed,
  busy,
  error,
  onSplit,
}: {
  rest: PageFound[];
  related?: TaskData['related'];
  allowed: boolean;
  busy: boolean;
  error?: string;
  onSplit: (groups: PageGroup[]) => void;
}) {
  const siblings = related.filter(
    (r): r is Related & { pages: string[] } =>
      r.relation === 'sibling' &&
      r.state !== 'closed' &&
      Array.isArray(r.pages),
  );
  const direct = (p: PageFound) =>
      siblings.find((s) => s.pages.some((u) => pageKey(u) === pageKey(p.url))),
    article = (p: PageFound) =>
      p.article ? `${p.article.targetId}:${p.article.articleId}` : '';
  // A post's other address counts as held once a task has one of its addresses.
  const byArticle = new Map(
    rest.flatMap((p) => {
      const s = direct(p);
      return s && article(p) ? [[article(p), s] as const] : [];
    }),
  );
  const holder = (p: PageFound) => direct(p) || byArticle.get(article(p));
  const open = rest.filter((p) => !holder(p)),
    left = restGroups(open),
    held = restGroups(rest.filter((p) => holder(p))),
    tasks = [
      ...new Map(
        rest
          .map(holder)
          .filter((s): s is NonNullable<typeof s> => Boolean(s))
          .map((s) => [s.id, s]),
      ).values(),
    ];
  let line: ReactNode;
  if (open.length)
    line = (
      <>
        <span>{$t(restKey(left, 'NotHere'), { ...restCounts(left) })}</span>
        {allowed && (
          <Button
            variant='outline'
            size='sm'
            disabled={busy}
            onClick={() =>
              onSplit([...left.articles, ...(left.site ? [left.site] : [])])
            }
          >
            {$t('taskPages.splitTasks')}
          </Button>
        )}
      </>
    );
  else
    line = (
      <span>
        {$tj(restKey(held, 'In'), {
          ...restCounts(held),
          [restCounts(held).length]: (
            <span>
              {tasks.map((t, i) => (
                <span key={t.id}>
                  {i ? $t('taskPages.separator') : ''}
                  <Link className='nr-link' to={`/actions/${t.id}`}>
                    {t.no ? `T-${t.no}` : t.title}
                  </Link>
                </span>
              ))}
            </span>
          ),
        })}
      </span>
    );
  return (
    <div className='flex flex-col gap-1' data-start-rest=''>
      <div
        className={cn(
          text.muted,
          'flex flex-wrap items-center gap-x-2 gap-y-1',
        )}
      >
        {line}
      </div>
      {error && (
        <p role='alert' className='nr-error'>
          {error}
        </p>
      )}
    </div>
  );
}
