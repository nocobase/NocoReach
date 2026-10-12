import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// 网站审计: after every-app/open-seo db8bde1 src/client/features/audit/ (results grouped by severity, affected pages per
// issue; MIT). Changes: checks the pages of 网站内容 as last read (re-read weekly, free) instead of a separate crawl,
// no Lighthouse, issues can be ticked and handed to the Agent from the page's button (技术修复 or 优化现有页面), Chinese copy.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { toast } from "#lib/toast";
import { PageContainer, PageHeader } from "#components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "#components/reach/states";
import { Tag, type Tone } from "#components/reach/tag";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { StatTile } from "#components/seo/stat-tile";
import { DetailDrawer } from "./detail-drawer";
import { useProject } from "./reach-data";
import { safeLink } from "./analytics";
import { type TaskDraft } from "./keyword-hand-off";
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useHandOffSource, useSelection } from "#components/reach/hand-off-slot";
import { LighthouseCard } from "./lighthouse-card";
import "./reach-workspace.css";
import "./data-views.css";
import { InfoTip } from "#components/reach/info-tip";

type AuditPage = { url: string; title: string; detail: string };
type Issue = { type: string; severity: "critical" | "warning" | "notice"; title: string; description: string; job: "tech" | "content"; count: number; pages: AuditPage[] };
type Report = { connected: boolean; total?: number; read?: number; pending?: number; oldestRead?: string | null; newestRead?: string | null; counts?: { critical: number; warning: number; notice: number }; issues?: Issue[] };
const getSeverity = (): Record<Issue["severity"], { label: string; tone: Tone }> => ({ critical: { label: $t('siteAudit.critical'), tone: "red" }, warning: { label: $t('siteAudit.warning'), tone: "amber" }, notice: { label: $t('siteAudit.notice'), tone: "grey" } });
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString(getCurrentLocale()) : "—");
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };

export default function SiteAudit() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report>();
  const [error, setError] = useMessageState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Issue>();
  const issues = report?.issues || [];
  const selection = useSelection(issues.map((i) => i.type));
  const ticked = issues.filter((i) => selection.has(i.type));
  useHandOffSource("audit-issues", report?.connected ? { count: ticked.length, draft: () => auditDraft(ticked), playbookId: ticked[0]?.job === "tech" ? "tech-fix" : "optimize-page", page: ticked.length === 1 && ticked[0].pages.length === 1 ? ticked[0].pages[0].url : undefined, description: ticked.length === 1 ? $t('siteAudit.pagesIssueBecomeOneTask',{0:ticked[0].count}) : $t('siteAudit.tickedIssuesBecomeOneTask',{0:ticked.length}), clear: selection.clear } : null);
  const call = <T,>(action: string) => api.action<T>("nrAudit", action, { method: "POST", body: { projectId: String(project!.id) }, unwrap: "data" });
  const load = () => call<Report>("report").then((r) => { setReport(r); setError(""); }).catch((e) => setError(() => (e instanceof Error ? $legacyText(e.message) : $t('siteAudit.notLoadAuditResults'))));
  useEffect(() => { if (project) void load(); }, [project?.id]);
  const recheck = async () => {
    setBusy(true);
    try { setReport(await call<Report>("recheck")); toast.success(() => ($t('siteAudit.pagesReadAgainOverNext'))); }
    catch (e) { toast.error(() => (e instanceof Error ? $legacyText(e.message) : $t('common.startFailed'))); }
    finally { setBusy(false); }
  };
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={report?.counts ? <InfoTip label={$t('common.aboutData')} side="bottom">{$tj('siteAudit.pagesReadAgainWeeklyUp',{0:day(report.oldestRead),1:day(report.newestRead)})}</InfoTip> : undefined} title={$t('siteAudit.siteAudit')} description={$t('siteAudit.scopeHelp')}
        actions={report?.connected ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void recheck()}><RefreshCw data-icon="inline-start" />{$t('siteAudit.readPagesAgain')}</Button> : undefined} />
      {error ? <LoadError title={$t('siteAudit.notLoadAuditResults')} message={error} onRetry={() => void load()} /> : null}
      {!report && !error ? <ListSkeleton rows={5} /> : null}
      {report && !report.connected ? <EmptyState icon={<ClipboardCheck />} title={$t('siteAudit.connectWebsiteContentFirst')} description={$t('siteAudit.auditChecksPagesListedWebsite')} action={<Button onClick={() => navigate("/connections?source=site")}>{$t('common.connectWebsiteContent')}</Button>} /> : null}
      {report?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="gap-0 p-4" data-metric={$t('siteAudit.checked')}><StatTile label={$t('siteAudit.pagesChecked')} value={`${report.read} / ${report.total}`} hint={report.pending ? $t('siteAudit.pagesNotReadYet',{0:report.pending}) : undefined} /></Card>
            <Card className="gap-0 p-4" data-metric={$t('siteAudit.critical')}><StatTile label={$t('siteAudit.critical')} value={String(report.counts!.critical)} tone={report.counts!.critical ? "destructive" : undefined} /></Card>
            <Card className="gap-0 p-4" data-metric={$t('siteAudit.warning')}><StatTile label={$t('siteAudit.warning')} value={String(report.counts!.warning)} /></Card>
            <Card className="gap-0 p-4" data-metric={$t('siteAudit.notice')}><StatTile label={$t('siteAudit.notice')} value={String(report.counts!.notice)} /></Card>
          </div>
          {!report.issues!.length ? <EmptyState icon={<ClipboardCheck />} title={report.read ? $t('siteAudit.noIssuesFound') : $t('siteAudit.noPagesReadYet')} description={report.read ? $t('siteAudit.noIssuesPagesRead') : $t('siteAudit.websiteContentReadPagePage')} /> : (
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground"><AllCheck selection={selection} count={issues.length} />{$t('common.question')}<span className="ml-auto">{$tj('siteAudit.types',{0:issues.length})}</span></div>
              {report.issues!.map((i) => (
                <div key={i.type} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0" data-issue={i.type}>
                  <RowCheck selection={selection} k={i.type} label={$t('common.selectValue',{0:$legacyText(i.title)})} />
                  <Tag tone={getSeverity()[i.severity].tone}>{getSeverity()[i.severity].label}</Tag>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(i)}>
                    <span className="block font-medium">{$legacyText(i.title)}<span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{$tj('siteAudit.pageCount',{0:i.count})}</span></span>
                    <span className="block text-sm text-muted-foreground">{$legacyText(i.description)}</span>
                  </button>
                </div>
              ))}
            </Card>
          )}
        </>
      ) : null}
      <LighthouseCard projectId={project?.id} />
      {open ? (
        <DetailDrawer open onClose={() => setOpen(undefined)} title={$t('siteAudit.statusPageCount',{0:$legacyText(open.title),1:open.count})} description={$legacyText(open.description)}>
          <ul className="space-y-2 text-sm">{open.pages.map((p) => <li key={p.url} className="min-w-0"><a className="nr-link block truncate" href={safeLink(p.url)} target="_blank" rel="noreferrer" title={p.url}>{p.title || pathOf(p.url)}</a><span className="block truncate text-xs text-muted-foreground">{pathOf(p.url)}{p.detail ? ` · ${$legacyText(p.detail)}` : ""}</span></li>)}</ul>
          {open.count > open.pages.length ? <p className="nr-footnote mt-3">{$tj('siteAudit.firstPagesListed',{0:open.pages.length})}</p> : null}
        </DetailDrawer>
      ) : null}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}

// The ticked issues become one task listing the affected pages; 技术修复 when the first is technical, 优化现有页面 for
// content (changeable in the dialog).
function auditDraft(issues: Issue[]): TaskDraft {
  const one = issues.length === 1 ? issues[0] : null, per = Math.max(5, Math.floor(30 / issues.length));
  const lines = issues.flatMap((issue) => { const pages = issue.pages.slice(0, per); return [...(one ? [] : [`## ${$legacyText(issue.title)}（${$tj('siteAudit.pageCount',{0:issue.count})}）`]), ...(one ? [$t('siteAudit.siteAuditFoundPages',{0:issue.count,1:$legacyText(issue.title)})] : []), $legacyText(issue.description), "", $t('siteAudit.affectedPages'), ...pages.map((p) => `- ${p.url}${p.detail ? `（${p.detail}）` : ""}`), ...(issue.count > pages.length ? [$t('siteAudit.morePagesSiteAudit',{0:issue.count - pages.length})] : []), ""]; });
  return {
    title: (one ? $t('siteAudit.fixPages',{0:one.count,1:$legacyText(one.title)}) : $t('siteAudit.fixSiteAuditIssues',{0:issues.length,1:issues.map((i) => $legacyText(i.title)).join("、")})).slice(0, 200),
    objective: (one ? $t('siteAudit.pagesNoLongerIssue',{0:$legacyText(one.title)}) : $t('siteAudit.clearIssuesPages',{0:issues.map((i) => $legacyText(i.title)).join("、")})).slice(0, 1000),
    brief: [...(one ? [] : [$t('siteAudit.issuesTickedSiteAudit',{0:issues.length}), ""]), ...lines, $t('siteAudit.evidenceSiteAuditChecksPages')].join("\n").slice(0, 20000),
  };
}
