import { $t, $legacyText } from '#i18n';
import type { TaskDraft } from './keyword-hand-off';
import { subjectOf } from './task-subject';
import { distinctPages } from '../../shared/task-start.js';

// Site audit's ticked issues as one task (site-audit.tsx): each issue with its affected pages, every one of them kept
// on the task.

export type AuditPage = { url: string; title: string; detail: string };
export type Issue = {
  type: string;
  severity: 'critical' | 'warning' | 'notice';
  title: string;
  description: string;
  job: 'tech' | 'content';
  count: number;
  pages: AuditPage[];
};

export function auditDraft(issues: Issue[]): TaskDraft {
  const one = issues.length === 1 ? issues[0] : null,
    per = Math.max(5, Math.floor(30 / issues.length));
  const lines = issues.flatMap((issue) => {
    const pages = issue.pages.slice(0, per);
    return [
      ...(one
        ? []
        : [
            `## ${$legacyText(issue.title)}（${$t('siteAudit.pageCount', { 0: issue.count })}）`,
          ]),
      ...(one
        ? [
            $t('siteAudit.siteAuditFoundPages', {
              0: issue.count,
              1: $legacyText(issue.title),
            }),
          ]
        : []),
      $legacyText(issue.description),
      '',
      $t('siteAudit.affectedPages'),
      ...pages.map((p) => `- ${p.url}${p.detail ? `（${p.detail}）` : ''}`),
      ...(issue.count > pages.length
        ? [
            $t('siteAudit.morePagesSiteAudit', {
              0: issue.count - pages.length,
            }),
          ]
        : []),
      '',
    ];
  });
  return {
    // Every affected page (2026-10-29: T-54's seven pages were only written into the brief), so the start card knows
    // where the change goes.
    pages: distinctPages(issues.flatMap((i) => i.pages.map((p) => p.url))),
    title: (one
      ? $t('siteAudit.fixPages', { 0: one.count, 1: $legacyText(one.title) })
      : $t('siteAudit.fixSiteAuditIssues', {
          0: issues.length,
          1: issues.map((i) => $legacyText(i.title)).join('、'),
        })
    ).slice(0, 200),
    subject: subjectOf(
      $legacyText(issues[0].title),
      issues.length,
      'issues',
    ).slice(0, 160),
    objective: (one
      ? $t('siteAudit.pagesNoLongerIssue', { 0: $legacyText(one.title) })
      : $t('siteAudit.clearIssuesPages', {
          0: issues.map((i) => $legacyText(i.title)).join('、'),
        })
    ).slice(0, 1000),
    brief: [
      ...(one
        ? []
        : [$t('siteAudit.issuesTickedSiteAudit', { 0: issues.length }), '']),
      ...lines,
      $t('siteAudit.evidenceSiteAuditChecksPages'),
    ]
      .join('\n')
      .slice(0, 20000),
  };
}
