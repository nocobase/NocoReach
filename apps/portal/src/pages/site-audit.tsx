// 网站审计: after every-app/open-seo db8bde1 src/client/features/audit/ (results grouped by severity, affected pages per
// issue; MIT). Changes: checks the pages of 网站内容 as last read (re-read weekly, free) instead of a separate crawl,
// no Lighthouse, each issue can be handed to the Agent (技术修复 or 优化现有页面), Chinese copy.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { Bot, ClipboardCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, ListSkeleton, LoadError } from "@/components/reach/states";
import { Tag, type Tone } from "@/components/reach/tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatTile } from "@/components/seo/stat-tile";
import { HandOffNotice, type HandOffResult } from "./strategy/hand-off";
import { DetailDrawer } from "./reach-managed";
import { useProject } from "./reach-data";
import { safeLink } from "./analytics";
import { DraftHandOffDialog } from "./keyword-hand-off";
import "./reach-workspace.css";
import "./data-views.css";

type AuditPage = { url: string; title: string; detail: string };
type Issue = { type: string; severity: "critical" | "warning" | "notice"; title: string; description: string; job: "tech" | "content"; count: number; pages: AuditPage[] };
type Report = { connected: boolean; total?: number; read?: number; pending?: number; oldestRead?: string | null; newestRead?: string | null; counts?: { critical: number; warning: number; notice: number }; issues?: Issue[] };
const severity: Record<Issue["severity"], { label: string; tone: Tone }> = { critical: { label: "严重", tone: "red" }, warning: { label: "警告", tone: "amber" }, notice: { label: "提示", tone: "grey" } };
const day = (v?: string | null) => (v ? new Date(v).toLocaleDateString("zh-CN") : "—");
const pathOf = (u: string) => { try { return new URL(u).pathname || "/"; } catch { return u; } };

export default function SiteAudit() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [report, setReport] = useState<Report>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Issue>();
  const [handing, setHanding] = useState<Issue>();
  const [handOff, setHandOff] = useState<HandOffResult>();
  const call = <T,>(action: string) => api.action<T>("nrAudit", action, { method: "POST", body: { projectId: String(project!.id) }, unwrap: "data" });
  const load = () => call<Report>("report").then((r) => { setReport(r); setError(""); }).catch((e) => setError(e instanceof Error ? e.message : "审计结果没有读出来"));
  useEffect(() => { if (project) void load(); }, [project?.id]);
  const recheck = async () => {
    setBusy(true);
    try { setReport(await call<Report>("recheck")); toast.success("会在接下来几小时里重新读取全部页面，结果随读随更新"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有开始"); }
    finally { setBusy(false); }
  };
  return (
    <PageContainer className="nr-data-page">
      <PageHeader title="审计" description="检查“网站内容”里的页面有没有打不开、缺标题或描述、误设 noindex 等问题。用已读取的页面，不花钱。"
        actions={report?.connected ? <Button variant="outline" size="sm" disabled={busy} onClick={() => void recheck()}><RefreshCw data-icon="inline-start" />重新读取全部页面</Button> : undefined} />
      <HandOffNotice result={handOff} />
      {error ? <LoadError title="审计结果没有读出来" message={error} onRetry={() => void load()} /> : null}
      {!report && !error ? <ListSkeleton rows={5} /> : null}
      {report && !report.connected ? <EmptyState icon={<ClipboardCheck />} title="先接入网站内容" description="审计检查的是“网站内容”列出的页面。把官网地址交给 AI，它会读取 sitemap。" action={<Button onClick={() => navigate("/connections?source=site")}>接入网站内容</Button>} /> : null}
      {report?.connected ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card className="gap-0 p-4" data-metric="已检查"><StatTile label="已检查页面" value={`${report.read} / ${report.total}`} hint={report.pending ? `还有 ${report.pending} 页没读到` : undefined} /></Card>
            <Card className="gap-0 p-4" data-metric="严重"><StatTile label="严重" value={String(report.counts!.critical)} tone={report.counts!.critical ? "destructive" : undefined} /></Card>
            <Card className="gap-0 p-4" data-metric="警告"><StatTile label="警告" value={String(report.counts!.warning)} /></Card>
            <Card className="gap-0 p-4" data-metric="提示"><StatTile label="提示" value={String(report.counts!.notice)} /></Card>
          </div>
          <p className="nr-footnote">页面每周重新读取一次（每分钟最多 5 页）；最早一页读于 {day(report.oldestRead)}，最近一页读于 {day(report.newestRead)}。数字是受影响的页面数。</p>
          {!report.issues!.length ? <EmptyState icon={<ClipboardCheck />} title={report.read ? "没有发现问题" : "还没有读到页面"} description={report.read ? "已读取的页面都没问题。" : "网站内容会在后台逐页读取，读到后这里显示结果。"} /> : (
            <Card className="gap-0 py-0">
              {report.issues!.map((i) => (
                <div key={i.type} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0" data-issue={i.type}>
                  <Tag tone={severity[i.severity].tone}>{severity[i.severity].label}</Tag>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(i)}>
                    <span className="block font-medium">{i.title}<span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">{i.count} 页</span></span>
                    <span className="block text-sm text-muted-foreground">{i.description}</span>
                  </button>
                  <Button variant="outline" size="sm" onClick={() => setHanding(i)}><Bot data-icon="inline-start" />交给 Agent</Button>
                </div>
              ))}
            </Card>
          )}
        </>
      ) : null}
      {open ? (
        <DetailDrawer open onClose={() => setOpen(undefined)} title={`${open.title} · ${open.count} 页`} description={open.description}>
          <ul className="space-y-2 text-sm">{open.pages.map((p) => <li key={p.url} className="min-w-0"><a className="nr-link block truncate" href={safeLink(p.url)} target="_blank" rel="noreferrer" title={p.url}>{p.title || pathOf(p.url)}</a><span className="block truncate text-xs text-muted-foreground">{pathOf(p.url)}{p.detail ? ` · ${p.detail}` : ""}</span></li>)}</ul>
          {open.count > open.pages.length ? <p className="nr-footnote mt-3">只列出前 {open.pages.length} 页。</p> : null}
        </DetailDrawer>
      ) : null}
      {handing && project ? <AuditHandOff projectId={project.id} issue={handing} onClose={() => setHanding(undefined)} onDone={(r) => { setHanding(undefined); setHandOff(r); }} /> : null}
    </PageContainer>
  );
}

// One issue becomes one task listing the affected pages; 技术修复 for technical issues, 优化现有页面 for content ones.
function AuditHandOff({ projectId, issue, onClose, onDone }: { projectId: number; issue: Issue; onClose: () => void; onDone: (r: HandOffResult) => void }) {
  const pages = issue.pages.slice(0, 30);
  const title = `修复 ${issue.count} 个页面${issue.title}`.slice(0, 200);
  const draft = { title, objective: `让这些页面不再有“${issue.title}”的问题`, brief: [`网站审计发现 ${issue.count} 个页面：${issue.title}。`, issue.description, "", "受影响的页面：", ...pages.map((p) => `- ${p.url}${p.detail ? `（${p.detail}）` : ""}`), ...(issue.count > pages.length ? [`另有 ${issue.count - pages.length} 页，见网站审计。`] : []), "", "依据：网站审计按“网站内容”最近一次读取的页面检查。改完后下一次每周读取会核对。"].join("\n").slice(0, 20000) };
  return <DraftHandOffDialog projectId={projectId} draft={draft} playbookId={issue.job === "tech" ? "tech-fix" : "optimize-page"} page={pages.length === 1 ? pages[0].url : undefined} description={`这个问题的 ${issue.count} 个页面合成一个任务，确认后立即开始。`} onClose={onClose} onDone={onDone} />;
}
