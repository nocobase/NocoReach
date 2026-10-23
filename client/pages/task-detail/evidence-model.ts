import { $t, $legacyText } from '#i18n';
import type { ResultSource } from '../results/types.js';
import type { TaskData } from '../task-execution-types.js';

export type Signal = {
  key: string;
  source: string;
  title: string;
  facts: string[];
};
type Evidence = {
  insight?: { signalIds?: string[] };
  context?: { signals?: { items?: Signal[] } };
  handoff?: { playbook?: string; content?: string };
  resultSource?: ResultSource;
  attachmentIds?: unknown[];
};

export const getSourceNames = (): Record<string, string> => ({
  gsc: 'Search Console',
  ga4: 'GA4',
  site: $t('common.websiteContent'),
  github: 'GitHub',
  'github-traffic': 'GitHub Traffic',
  discourse: $t('common.communityForum'),
  packages: $t('common.downloads'),
  hackernews: 'Hacker News',
  reddit: 'Reddit',
  trends: 'Google Trends',
  competitors: $t('common.competitorActivity'),
  x: 'X',
  'discord-slack': 'Discord、Slack',
  discord: 'Discord',
  slack: 'Slack',
  rank: $t('common.rankTracking'),
  'ai-search': $t('common.aiSearch'),
});

const plain = (text: string) =>
  text
    .replace(/[#*>`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** The evidence a task carries: the signals it was made from, the brief, the owner's note and attachments. */
export function taskEvidence(data: TaskData) {
  const ev = (data.task.evidence || {}) as Evidence;
  const ids = new Set(ev.insight?.signalIds || []);
  const signals = (ev.context?.signals?.items || []).filter((s) =>
    ids.has(s.key),
  );
  const brief = ev.handoff?.content || data.task.brief || '';
  const briefTitle = ev.handoff?.content
    ? $t('taskDetail.documentDelivered', { 0: ev.handoff.playbook })
    : $t('taskDetail.taskBrief');
  return {
    signals,
    brief,
    briefTitle,
    note: data.work.note || '',
    resultSource: ev.resultSource,
    attachments: Array.isArray(ev.attachmentIds) && ev.attachmentIds.length > 0,
  };
}

/**
 * The one line under the title that says why the task exists: the first signal it was made from, else the result it
 * came from, else the start of its brief. Empty when the task carries none of them.
 */
export function whyText(data: TaskData): {
  text: string;
  fact?: string;
  more: number;
  /** Where the line comes from, so a page that already shows the brief need not repeat it. */
  from?: 'signal' | 'result' | 'brief';
} {
  const { signals, brief, resultSource } = taskEvidence(data);
  if (signals.length) {
    const first = signals[0];
    const text = $legacyText(first.title),
      fact = first.facts[0] ? $legacyText(first.facts[0]) : '';
    // A title that already states the figure (Average position 19.8, close to page one) is not followed by it again.
    const bare = (value: string) => value.replace(/[\s:：]/g, '');
    return {
      text,
      fact: fact && bare(text).includes(bare(fact)) ? '' : fact,
      more: signals.length - 1,
      from: 'signal',
    };
  }
  if (resultSource)
    return {
      text: $t('taskDetail.whyFromResult', {
        0: resultSource.pages[0] || $t('results.title'),
      }),
      more: 0,
      from: 'result',
    };
  const line = plain(brief);
  return {
    text: line.length > 120 ? `${line.slice(0, 120)}…` : line,
    more: 0,
    from: line ? 'brief' : undefined,
  };
}
