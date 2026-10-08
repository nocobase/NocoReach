import { $t, $tj } from "@/i18n";
// 网站审计: after every-app/open-seo db8bde1 src/client/features/audit/ (results grouped by severity, affected pages per
// issue; MIT). Changes: checks the pages of 网站内容 as last read (re-read weekly, free) instead of a separate crawl,
// no Lighthouse, issues can be ticked and handed to the Agent from the page's button (技术修复 or 优化现有页面), Chinese copy.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { ClipboardCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Tag, type Tone } from "@/components/reach/tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/seo/stat-tile";
import { DetailDrawer } from "./detail-drawer";
import { useProject } from "./reach-data";
import { safeLink } from "./analytics";
import { type TaskDraft } from "./keyword-hand-off";
import { HandOffBar } from "./hand-off-bar";
import { AllCheck, RowCheck, useHandOffSource, useSelection } from "@/components/reach/hand-off-slot";
import { LighthouseCard } from "./lighthouse-card";
import "./reach-workspace.css";
import "./data-views.css";
import { InfoTip } from "@/components/reach/info-tip";

type AuditPage = { url: string; title: string; detail: string };
type Issue = { type: string; severity: "critical" | "warning" | "notice"; title: string; description: string; job: "tech" | "content"; count: number; pages: AuditPage[] };
type Report = { connected: boolean; total?: number; read?: number; pending?: number; oldestRead?: string | null; newestRead?: string | null; counts?: { critical: number; warning: number; notice: number }; issues?: Issue[] };
const severity: Record<Issue["severity"], { label: string; tone: Tone }> = { critical: { label: $t("严重"), tone: "red" }, warning: { label: $t("警告"), tone: "amber" }, notice: { label: $t("提示"), tone: "grey" } };
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("zh-CN") : "—");
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };

export default function SiteAudit() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Issue>();
  const issues = report?.issues || [];
  const selection = useSelection(issues.map((i) => i.type));
  const ticked = issues.filter((i) => selection.has(i.type));
  useHandOffSource("audit-issues", report?.connected ? { count: ticked.length, draft: () => auditDraft(ticked), playbookId: ticked[0]?.job === "tech" ? "tech-fix" : "optimize-page", page: ticked.length === 1 && ticked[0].pages.length === 1 ? ticked[0].pages[0].url : undefined, description: ticked.length === 1 ? $t("这个问题的 {0} 个页面合成一个任务，确认后立即开始。",{0:ticked[0].count}) : $t("勾选的 {0} 个问题合成一个任务，确认后立即开始。",{0:ticked.length}), clear: selection.clear } : null);
  const call = <T,>(action: string) => api.action<T>("nrAudit", action, { method: "POST", body: { projectId: String(project!.id) }, unwrap: "data" });
  const load = () => call<Report>("report").then((r) => { setReport(r); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : $t("审计结果没有读出来")));
  useEffect(() => { if (project) void load(); }, [project?.id]);
  const recheck = async () => {
    setBusy(true);
    try { setReport(await call<Report>("recheck")); toast.success($t("会在接下来几小时里重新读取全部页面，结果随读随更新")); }
    catch (e) { toast.error(e instanceof Error ? e.message : $t("没有开始")); }
    finally { setBusy(false); }
  };
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={report?.counts ? <InfoTip label={$t("数据说明")} side="bottom">{$tj("页面每周重新读取一次（每分钟最多 5 页）；最早一页读于 {0}，最近一页读于 {1}。数字是受影响的页面数。",{0:day(report.oldestRead),1:day(report.newestRead)})}</InfoTip> : undefined} title={$t("审计")} description={$t("检查“网站内容”里的页面有没有打不开、缺标题或描述、误设 noindex 等问题（用已读取的页面，不花钱）；单个页面还可以跑一次 Lighthouse 性能检查。")}
        actions={report?.connected ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void recheck()}><RefreshCw data-icon="inline-start" />{$t("重新读取全部页面")}</Button> : undefined} />
      {error ? <LoadError title={$t("审计结果没有读出来")} message={error} onRetry={() => void load()} /> : null}
      {!report && !error ? <ListSkeleton rows={5} /> : null}
      {report && !report.connected ? <EmptyState icon={<ClipboardCheck />} title={$t("先接入网站内容")} description={$t("审计检查的是“网站内容”列出的页面。把官网地址交给 AI，它会读取 sitemap。")} action={<Button onClick={() => navigate("/connections?source=site")}>{$t("接入网站内容")}</Button>} /> : null}
      {report?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="gap-0 p-4" data-metric={$t("已检查")}><StatTile label={$t("已检查页面")} value={`${report.read} / ${report.total}`} hint={report.pending ? $t("还有 {0} 页没读到",{0:report.pending}) : undefined} /></Card>
            <Card className="gap-0 p-4" data-metric={$t("严重")}><StatTile label={$t("严重")} value={String(report.counts!.critical)} tone={report.counts!.critical ? "destructive" : undefined} /></Card>
            <Card className="gap-0 p-4" data-metric={$t("警告")}><StatTile label={$t("警告")} value={String(report.counts!.warning)} /></Card>
            <Card className="gap-0 p-4" data-metric={$t("提示")}><StatTile label={$t("提示")} value={String(report.counts!.notice)} /></Card>
          </div>
          {!report.issues!.length ? <EmptyState icon={<ClipboardCheck />} title={report.read ? $t("没有发现问题") : $t("还没有读到页面")} description={report.read ? $t("已读取的页面都没问题。") : $t("网站内容会在后台逐页读取，读到后这里显示结果。")} /> : (
            <Card className="gap-0 py-0">
              <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground"><AllCheck selection={selection} count={issues.length} />{$t("问题")}<span className="ml-auto">{$tj("{0} 类",{0:issues.length})}</span></div>
              {report.issues!.map((i) => (
                <div key={i.type} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0" data-issue={i.type}>
                  <RowCheck selection={selection} k={i.type} label={$t("选择 {0}",{0:$t(i.title)})} />
                  <Tag tone={severity[i.severity].tone}>{severity[i.severity].label}</Tag>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(i)}>
                    <span className="block font-medium">{$t(i.title)}<span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{$tj("{0} 页",{0:i.count})}</span></span>
                    <span className="block text-sm text-muted-foreground">{$t(i.description)}</span>
                  </button>
                </div>
              ))}
            </Card>
          )}
        </>
      ) : null}
      <LighthouseCard projectId={project?.id} />
      {open ? (
        <DetailDrawer open onClose={() => setOpen(undefined)} title={$t("{0} · {1} 页",{0:$t(open.title),1:open.count})} description={$t(open.description)}>
          <ul className="space-y-2 text-sm">{open.pages.map((p) => <li key={p.url} className="min-w-0"><a className="nr-link block truncate" href={safeLink(p.url)} target="_blank" rel="noreferrer" title={p.url}>{p.title || pathOf(p.url)}</a><span className="block truncate text-xs text-muted-foreground">{pathOf(p.url)}{p.detail ? ` · ${$t(p.detail)}` : ""}</span></li>)}</ul>
          {open.count > open.pages.length ? <p className="nr-footnote mt-3">{$tj("只列出前 {0} 页。",{0:open.pages.length})}</p> : null}
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
  const lines = issues.flatMap((issue) => { const pages = issue.pages.slice(0, per); return [...(one ? [] : [`## ${$t(issue.title)}（${$tj("{0} 页",{0:issue.count})}）`]), ...(one ? [$t("网站审计发现 {0} 个页面：{1}。",{0:issue.count,1:$t(issue.title)})] : []), $t(issue.description), "", $t("受影响的页面："), ...pages.map((p) => `- ${p.url}${p.detail ? `（${p.detail}）` : ""}`), ...(issue.count > pages.length ? [$t("另有 {0} 页，见网站审计。",{0:issue.count - pages.length})] : []), ""]; });
  return {
    title: (one ? $t("修复 {0} 个页面{1}",{0:one.count,1:$t(one.title)}) : $t("修复网站审计的 {0} 个问题：{1}",{0:issues.length,1:issues.map((i) => $t(i.title)).join("、")})).slice(0, 200),
    objective: (one ? $t("让这些页面不再有“{0}”的问题",{0:$t(one.title)}) : $t("让这些页面不再有这些问题：{0}",{0:issues.map((i) => $t(i.title)).join("、")})).slice(0, 1000),
    brief: [...(one ? [] : [$t("网站审计勾选的 {0} 个问题：",{0:issues.length}), ""]), ...lines, $t("依据：网站审计按“网站内容”最近一次读取的页面检查。改完后下一次每周读取会核对。")].join("\n").slice(0, 20000),
  };
}
