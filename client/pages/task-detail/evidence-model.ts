import { $t, $legacyText } from '#i18n';
import type { ResultSource } from '../results/types.js';
import type { TaskData } from '../task-execution-types.js';
import { taskSignals } from '../../../shared/opportunity-parts.js';

export type Signal = {
  key: string;
  source: string;
  title: string;
  facts: string[];
  url?: string;
  action?: string | null;
};
type Evidence = {
  insight?: { signalIds?: string[] };
  part?: { signalIds?: string[] } | null;
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

/** The evidence a task carries: the signals it was made from, the brief, the owner's note and attachments. */
export function taskEvidence(data: TaskData) {
  const ev = (data.task.evidence || {}) as Evidence;
  // One of an opportunity's several tasks is there for its own place (shared/opportunity-parts.ts).
  const signals = taskSignals(
    { insight: ev.insight, part: ev.part },
    ev.context?.signals?.items || [],
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

// The objective's label at the start of a brief (messages.goal, "Goal: " in English), in any interface language.
const GOAL_LABEL =
  /^(?:行动目标|行動目標|Goal|目標|Objetivo|Objectif|Ziel|Mục tiêu|Tujuan)\s*[:：]\s*/i;

/**
 * A text's first sentence in plain words, at most about 80 characters (2026-10-23 user request: the Why card showed the
 * objective with its list of links, cut mid-word): the objective's label, links, list markers and Markdown removed;
 * a longer sentence ends at a word, not inside one.
 */
export function firstSentence(value: string, max = 80): string {
  const line =
    value
      .replace(GOAL_LABEL, '')
      .split(/\n/)
      .map((l) =>
        l
          .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
          .replace(/https?:\/\/\S+/g, '')
          .replace(/^\s*(?:[-*+]|\d+\.)\s+/, '')
          .replace(/[*_`#>]/g, '')
          .trim(),
      )
      .find((l) => l.replace(/[\s:：,，;；]/g, '')) || '';
  const sentence =
    line.match(/^.*?(?:[。！？]|[.!?](?=\s|$)|$)/)?.[0].trim() || line;
  if (sentence.length <= max) return sentence.replace(/[:：,，;；]$/, '');
  const cut = sentence.slice(0, max),
    space = cut.lastIndexOf(' ');
  // Latin text breaks at the last space; Chinese and Japanese can break anywhere.
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,，;；:：]+$/, '')}…`;
}

/**
 * What the Why card says first, in one or two sentences: the reason stored on the task, the opportunity's short reason,
 * the first signal it was made from, the result it came from, the first sentence of its objective, else of its brief.
 * Empty when the task carries none of them.
 */
export function whyText(data: TaskData): {
  text: string;
  fact?: string;
  more: number;
  /** Where the line comes from, so a page that already shows the brief need not repeat it. */
  from?: 'why' | 'signal' | 'result' | 'objective' | 'brief';
} {
  const { signals, brief, resultSource } = taskEvidence(data);
  const ev = (data.task.evidence || {}) as {
    why?: unknown;
    objective?: unknown;
    insight?: { reason?: unknown } | null;
  };
  const stored = typeof ev.why === 'string' ? ev.why.trim() : '';
  if (stored) return { text: stored, more: 0, from: 'why' };
  const reason =
    typeof ev.insight?.reason === 'string' ? ev.insight.reason.trim() : '';
  if (reason)
    return { text: $legacyText(reason), more: signals.length, from: 'why' };
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
  const objective =
    typeof ev.objective === 'string' ? firstSentence(ev.objective) : '';
  if (objective) return { text: objective, more: 0, from: 'objective' };
  const line = firstSentence(brief);
  return { text: line, more: 0, from: line ? 'brief' : undefined };
}
