/* eslint-disable react-refresh/only-export-components -- the card's result check is exported beside it */
import { useEffect } from 'react';
import { Link } from 'react-router';
import { $t } from '#i18n';
import { notifyPageChange } from '../online-agent/page-changes.js';
import type { OnlineRun } from '../../shared/online-agent.js';

type Done = {
  confirmed: true;
  group?: { name: string; keywords: number; url: string };
  list?: { keywords: number; url: string };
};
export const isKeywordDig = (output: unknown): output is Done => {
  const value = output as Partial<Done> | null;
  return Boolean(value?.confirmed === true && (value.group || value.list));
};
// The URL the tool returns carries the application's base path; the router's link wants the route path.
const routeOf = (url: string) =>
  url.slice(Math.max(0, url.indexOf('/keywords')));

/**
 * What a confirmed keyword_dig did in the chat: the group it added to Keywords › AI suggestions (or the list it
 * rebuilt), with a link there. The page, when open, reads its suggestions again.
 */
export function KeywordDigCard({
  run,
  output,
}: {
  run: OnlineRun;
  output: unknown;
}) {
  const done = output as Done;
  useEffect(() => {
    if (run.projectId) notifyPageChange('keywords', run.projectId);
  }, [run.projectId]);
  const url = done.group?.url ?? done.list?.url ?? '/keywords?tab=suggest';
  return (
    <p
      className='flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm text-card-foreground'
      data-keyword-dig={done.group ? 'group' : 'list'}
    >
      <span className='min-w-0 flex-1'>
        {done.group
          ? $t('keywordSuggestions.digAdded', {
              0: done.group.name,
              1: done.group.keywords,
            })
          : $t('keywordSuggestions.listRebuilt', { 0: done.list!.keywords })}
      </span>
      <Link className='nr-link' to={routeOf(url)}>
        {$t('common.view')}
      </Link>
    </p>
  );
}
