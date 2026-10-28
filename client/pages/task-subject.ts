import { $t } from '#i18n';

// The subject of a handed-off task (2026-10-27): what it is about, without what to do with it. The server titles the
// task "<playbook>: <subject>" and retitles it when another playbook is chosen before the start
// (server/nocoreach/execution/task-title.ts), so the title never names an action the playbook does not take.

const NOUNS = [
  'keywords',
  'queries',
  'pages',
  'packages',
  'sources',
  'popularPages',
  'questions',
  'issues',
  'topics',
  'repositories',
  'activities',
] as const;
export type SubjectNoun = (typeof NOUNS)[number];

const noun = (n: string) =>
  (NOUNS as readonly string[]).includes(n) ? $t(`taskSubject.${n}`) : n;

/** The one thing, or the first of several with how many there are: "3 keywords, including ai governance framework". */
export const subjectOf = (head: string, count: number, n: SubjectNoun) =>
  count > 1
    ? $t('taskSubject.several', { 0: head, 1: count, 2: noun(n) })
    : head;

/** How many things of one place: "5 pages from notion.so". `what` is a noun of the list, or a noun in words. */
export const countOf = (where: string, count: number, what: string) =>
  $t('taskSubject.countOf', { 0: where, 1: count, 2: noun(what) });
