import { $legacyText, $t } from '#i18n';
import { nocobaseClient as api } from '#lib/nocoreach-api';
import type { Tone } from '#components/reach/tag';
import { getWorkColumns } from '../task-execution-types';
import type { TaskStanding } from '../../../shared/task-pending.js';
import {
  destinationLabel,
  destinationName,
  type Destination,
  type Repurpose,
  type RepurposeForm,
  type RepurposeSource,
} from '../../../shared/repurpose.js';

// Content workshop (2026-11-13 user decision): what `nrWorkshop.view` returns and the words the page, its dialogs and the
// task page share. Recommendations are the site's own figures, never an AI's judgement; nothing is pre-ticked.

export type Standing = TaskStanding;
export type Made = {
  form: RepurposeForm;
  destination?: Destination;
  taskId: string;
  no: number | null;
  standing: Standing;
};
export type Article = {
  url: string;
  title: string;
  published?: string;
  clicks7: number;
  previous7: number;
  clicks30: number;
  clicks12m: number;
  cited: number;
  made: Made[];
};
export type WorkshopRecord = {
  taskId: string;
  no: number | null;
  title: string;
  updatedAt: string;
  form: RepurposeForm;
  destination?: Destination;
  source: RepurposeSource;
  standing: Standing;
  failed?: boolean;
  restart?: boolean;
};
export type Community = { name: string; url: string; sections: string[] };
export type Brand = { revision: number; community: Community | null };
export type WorkshopView = {
  recent: Article[];
  earlier: Article[];
  searchConnected: boolean;
  dataThrough: string | null;
  articles: Article[];
  records: WorkshopRecord[];
  recordCount: number;
  brand: Brand;
  voice: string;
  destinations: {
    reddit: {
      subreddits: { subreddit: string; discussions: number }[];
      weeks: number;
      recent: string[];
    };
  };
};

export const workshopRequest = <T>(
  action: string,
  projectId: number | string,
  body: object = {},
) =>
  api.action<T>('nrWorkshop', action, {
    method: 'POST',
    body: { projectId: String(projectId), ...body },
    unwrap: 'data',
  });

/** Each form's name, in the interface language. */
export const getFormNames = (): Record<RepurposeForm, string> => ({
  xhs: $t('workshop.formXhs'),
  x: $t('workshop.formX'),
  linkedin: $t('workshop.formLinkedin'),
  community: $t('workshop.formCommunity'),
});

/** What a task makes: "LinkedIn post", "Community post · Hacker News". */
export const outputLabel = (form: RepurposeForm, destination?: Destination) =>
  [getFormNames()[form], destination ? destinationLabel(destination) : '']
    .filter(Boolean)
    .join(' · ');

/** The mark beside a form or destination (SourceLogo's names). */
export const logoOf = (form: RepurposeForm, destination?: Destination) =>
  form === 'x'
    ? 'x'
    : form === 'linkedin'
      ? 'linkedin'
      : form === 'xhs'
        ? 'xiaohongshu'
        : destination?.kind === 'reddit'
          ? 'reddit'
          : destination?.kind === 'hn'
            ? 'hackernews'
            : 'community';

/** A task's status in the words of the task page header and the board: Needs you, In progress, Done. */
export const standingText = (s: Standing): string =>
  s === 'closed' ? $t('common.closed') : s === 'snoozed' ? $t('common.snoozed') : getWorkColumns()[s];

/** What the Agent's last run left, as the task list's current step says it: waiting for a restart, or stopped. */
export function runNote(r: Pick<WorkshopRecord, 'standing' | 'failed' | 'restart'>): {
  text: string;
  tone: Tone;
} | null {
  if (r.standing !== 'review') return null;
  if (r.restart) return { text: $t('taskList.waitingRestart'), tone: 'amber' };
  if (r.failed) return { text: $t('taskList.runFailed', { 0: 'Agent' }), tone: 'red' };
  return null;
}

/** The forms an article was made into, each once: "X posts, Reddit r/selfhosted". */
export const madeList = (made: Made[]) => [
  ...new Set(
    made.map((m) =>
      m.form === 'community' && m.destination
        ? destinationName(m.destination)
        : getFormNames()[m.form],
    ),
  ),
];

/** The source's line in lists: the article's title, or the topic. */
export const sourceLabel = (s: RepurposeSource) =>
  s.kind === 'article' ? s.title : s.topic;

/** A failed request's message in the interface language (the server's own text is Chinese). */
export const errorText = (e: unknown, fallback: string) =>
  e instanceof Error && e.message ? $legacyText(e.message) : fallback;

/** The task's short number, as boards show it. */
export const taskNo = (no: number | null | undefined) => (no ? `T-${no}` : '');

/** What a result is called: "X posts", "LinkedIn post", "Reddit r/selfhosted post". */
export const resultName = (form: RepurposeForm, destination?: Destination) =>
  form === 'community' && destination
    ? $t('workshop.communityPostAt', { 0: destinationName(destination) })
    : getFormNames()[form];

/** The review card's title: "X posts are written; approving completes the task". */
export const repurposeReviewTitle = (r: Repurpose) =>
  $t('workshop.reviewTitle', { 0: resultName(r.form, r.destination) });
