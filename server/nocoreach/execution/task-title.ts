import { systemMessageText } from '../../../shared/i18n/messages.js';

// Automatic task titles (2026-10-27 user report: a task handed off from Keywords kept "Write content about …" after it
// was started with Keyword research). A task a hand-off creates is titled "<playbook>: <subject>", and keeps its subject
// and the language it was written in (evidence.autoTitle), so choosing another playbook before the start retitles it.
// A title a person writes (New task) has no subject and is never changed.

export type AutoTitle = { subject: string; locale?: string };
type Named = { name: string; system?: boolean; edited?: boolean };

/** A hand-off's subject: the thing the task is about, without what to do with it. */
export const subjectInput = (v: unknown) =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, 160) : '';

/** "<playbook>: <subject>", the built-in playbooks named in the title's language as the interface names them. */
export function playbookTitle(p: Named, subject: string, locale?: string) {
  const name =
    p.system && !p.edited ? systemMessageText(p.name, {}, locale) : p.name;
  return systemMessageText(
    'taskTitle.auto',
    { 0: name, 1: subject },
    locale,
  ).slice(0, 200);
}

/** The title a playbook gives the task: only when its title is automatic, and only when it would change. */
export function retitle(
  task: { title?: string; evidence?: { autoTitle?: AutoTitle } | null },
  p: Named,
) {
  const auto = task.evidence?.autoTitle;
  if (!auto?.subject) return null;
  const title = playbookTitle(p, auto.subject, auto.locale);
  return title !== task.title ? title : null;
}
