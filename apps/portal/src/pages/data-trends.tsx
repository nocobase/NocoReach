// 趋势 (搜索): Google Trends once a week through DataForSEO. 产品与竞品: the product and its competitors over the past 12
// months, each term's last four weeks against the four before, and the searches related to the product (rising ones new
// this week marked); picked searches go to the Agent as one content task. 关注的关键词 (2026-10-04): keywords added on
// this page, each on its own line (trends-keywords.tsx).
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { ExternalLink, LoaderCircle, RefreshCw, TrendingUp } from "lucide-react";
import { confirmAction } from "@/components/reach/confirm";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { EmptyState, InlineError, ListSkeleton, LoadError } from "@/components/reach/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProject } from "./reach-data";
import { useFreshData } from "./workspace-cache";
import { SectionHandOff } from "./section-hand-off";
import { trendsDraft, type TrendQuery } from "./seo-hand-off";
import "./data-views.css";
import { Tag } from "@/components/reach/tag";
import { InfoTip, NotesTip } from "@/components/reach/info-tip";
import { TrendKeywords, type KeywordWatch } from "./trends-keywords";

type Query = { query: string; value: number; isNew?: boolean };
type Rival = { id: string; name: string; included: boolean };
type View = KeywordWatch & { connected: boolean; product?: string; competitors?: Rival[]; maxRivals?: number; terms?: string[]; place?: string; checking?: boolean; lastRun?: { at: string; ok: boolean; errors: string[] } | null; checkedAt?: string | null; checkUrl?: string | null; points?: { date: string; values: (number | null)[] }[]; summary?: { term: string; average: number | null; recent: number | null; change: number | null }[]; top?: Query[]; rising?: Query[]; notes?: string[] };
const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const change = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(v * 100))}%`);

export default function DataTrends() {
  const { project } = useProject();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, TrendQuery>>({});
  const [params, setParams] = useSearchParams();
  const load = () => api.action<View>("nrTrends", "view", { method: "POST", body: { projectId: project!.id }, unwrap: "data" });
  const { data, error } = useFreshData(project ? `data-view:trends:${project.id}` : null, load);
  // After adding or removing a keyword, and while a new keyword is being queried, the page shows the latest view.
  const [live, setLive] = useState<View>();
  useEffect(() => setLive(undefined), [data]);
  const view = live ?? data;
  const pending = Boolean(view?.checking) || (view?.keywords ?? []).some((k) => k.checking || (!k.lastRun && Date.now() - Date.parse(k.addedAt) < 600000));
  // After an uncertain run the same query is held back; 重新查询 is the user's own decision to ask again.
  const retry = async (keywordId?: string) => {
    if (!(await confirmAction({ title: "重新查询？", description: "上次的查询可能已经扣费；再查一次约 $0.011–$0.022，算进 DataForSEO 的月度预算。", action: "重新查询", destructive: false }))) return;
    try { setLive(await api.action<View>("nrTrends", "retry", { method: "POST", body: { projectId: project!.id, ...(keywordId ? { keywordId } : {}) }, unwrap: "data" })); toast.success("已开始重新查询"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有开始"); }
  };
  useEffect(() => { if (!pending || !project) return; const t = setInterval(() => void load().then(setLive).catch(() => undefined), 4000); return () => clearInterval(t); }, [pending, project?.id]);
  const explicit = params.get("tab");
  const tab = explicit === "brand" || explicit === "keywords" ? explicit : view && !view.connected ? "keywords" : "brand";
  const setTab = (t: string) => { const next = new URLSearchParams(params); next.set("tab", t); setParams(next, { replace: true }); };
  const check = async () => {
    setBusy(true);
    try { await api.action("nrTrends", "check", { method: "POST", body: { projectId: project!.id }, unwrap: "data" }); toast.success("已开始查询，一般一两分钟"); setLive(await load()); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有查完"); }
    finally { setBusy(false); }
  };
  const terms = view?.terms || [], chart = (view?.points || []).map((p) => ({ date: p.date, ...Object.fromEntries(terms.map((t, i) => [t, p.values[i]])) }));
  const toggle = (q: Query, kind: TrendQuery["kind"], on: boolean) => setPicked((cur) => { const next = { ...cur }; if (on) next[kind + q.query] = { query: q.query, value: q.value, kind }; else delete next[kind + q.query]; return next; });
  const list = (title: string, kind: TrendQuery["kind"], rows: Query[], empty: string) => (
    <Card className="gap-0 py-0" data-list={kind}>
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{title}</h2>
      {rows.length ? rows.map((q) => (
        <label key={q.query} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-0 hover:bg-muted/50" data-query={q.query}>
          <Checkbox checked={Boolean(picked[kind + q.query])} onCheckedChange={(on) => toggle(q, kind, on === true)} />
          <span className="min-w-0 flex-1 truncate">{q.query}</span>
          {q.isNew ? <Tag tone="blue">本周新出现</Tag> : null}
          <span className={kind === "rising" ? "tabular-nums text-nr-ink-green" : "tabular-nums text-muted-foreground"}>{kind === "rising" ? `+${q.value.toLocaleString()}%` : q.value}</span>
        </label>
      )) : <p className="px-4 py-3 text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
  const chosen = Object.values(picked);
  return (
    <PageContainer className="nr-data-page">
      <PageHeader info={tab === "brand" ? <NotesTip notes={view?.notes} /> : undefined} title="趋势" description="产品、竞品和你关注的关键词在 Google 的关注度，每周用 Google Trends 查一次。" actions={view?.connected || view?.keywords?.length ? <Button variant="outline" size="sm" disabled={busy || view.checking} onClick={() => void check()}><RefreshCw data-icon="inline-start" />{busy ? "正在查询…" : "立即查询"}</Button> : undefined} />
      {error ? <LoadError title="趋势没有读出来" message={error instanceof Error ? error.message : "请稍后再试"} /> : null}
      {!view && !error ? <ListSkeleton rows={4} /> : null}
      {view ? (
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList variant="line" className="h-auto! justify-start">
            <TabsTrigger value="brand">产品与竞品</TabsTrigger>
            <TabsTrigger value="keywords">关注的关键词{view.keywords?.length ? ` (${view.keywords.length})` : ""}</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}
      {view && project && tab === "keywords" ? <TrendKeywords projectId={project.id} view={view} onView={(v) => setLive({ ...view, ...v })} onRetry={(id) => void retry(id)} /> : null}
      {view && tab === "brand" && !view.connected ? <EmptyState icon={<TrendingUp />} title="还没有设置产品与竞品对比" description="填上产品名和最多 4 个竞品，每周用 Google Trends 比较它们的关注度，不需要 Google 账号。" action={<Button onClick={() => navigate("/connections?source=trends")}>设置对比</Button>} /> : null}
      {view?.connected && tab === "brand" ? (
        <>
          <Rivals projectId={project!.id} view={view} onView={setLive} />
          <p className="nr-footnote">{view.place} · 过去 12 个月{view.checkedAt ? ` · 查询于 ${new Date(view.checkedAt).toLocaleString("zh-CN")}` : ""}{view.checkUrl ? <> · <a className="nr-link" href={view.checkUrl} target="_blank" rel="noreferrer">在 Google Trends 打开<ExternalLink className="ml-0.5 inline size-3" /></a></> : null}</p>
          {view.lastRun && !view.lastRun.ok && !view.checking ? <InlineError action={view.lastRun.errors[0]?.includes("不确定") ? <Button size="sm" variant="outline" onClick={() => void retry()}>重新查询</Button> : undefined}>上次查询没有完成：{view.lastRun.errors[0]}</InlineError> : null}
          {view.checking ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />正在查询 Google Trends，一般一两分钟…</p> : null}
          {!view.checkedAt ? (view.checking ? null : <p role="status" className="text-sm text-muted-foreground">{!view.lastRun ? "正在第一次查询，一般一两分钟。" : "还没有查到数据。"}</p>) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                {view.summary!.map((s, i) => (
                  <Card key={s.term} className="gap-1 p-4" data-metric={s.term}>
                    <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground"><span className="inline-block size-2 shrink-0 rounded-full" style={{ background: COLORS[i] }} />{s.term}</p>
                    <p className="text-2xl font-semibold tabular-nums">{s.recent ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">近 4 周 <span className={s.change === null ? "" : s.change >= 0 ? "text-nr-ink-green" : "text-nr-ink-red"}>{change(s.change)}</span> · 12 个月平均 {s.average ?? "—"}</p>
                  </Card>
                ))}
              </div>
              <Card className="gap-3 px-4">
                <h2 className="text-sm font-semibold">关注度（每周，最高为 100）</h2>
                <div className="nr-chart-box" data-trends-chart>
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={chart} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                      <YAxis domain={[0, 100]} allowDecimals={false} fontSize={11} width={36} />
                      <Tooltip />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {terms.map((t, i) => <Line key={t} isAnimationActive={false} type="linear" dataKey={t} stroke={COLORS[i]} strokeWidth={i === 0 ? 2.5 : 1.5} dot={false} connectNulls />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">「{terms[0]}」的相关搜索{chosen.length ? `，已选 ${chosen.length} 个` : "：勾选后交给 Agent，看要不要写页面回答它们"}</p>
                <SectionHandOff projectId={project?.id} disabled={!chosen.length} playbookId="content-outline" label={chosen.length ? `交给 Agent（${chosen.length}）` : "交给 Agent"} description="选中的相关搜索合成一个任务，让 Agent 看看要不要新写页面或补进现有页面，确认后立即开始。" draft={() => trendsDraft(terms[0], view.place || "全球", chosen)} />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                {list("上升中", "rising", view.rising || [], "这段时间没有明显上升的相关搜索。")}
                {list("最热门", "top", view.top || [], "Google 没有给出相关搜索，可能是搜索量太少。")}
              </div>
              
            </>
          )}
        </>
      ) : null}
    </PageContainer>
  );
}

// 对比 (2026-10-05 user choice): the product and the competitors from 竞品. With more than four, chips pick which four
// (Google Trends compares five words at most); the new set is queried once 重新比较 is pressed.
function Rivals({ projectId, view, onView }: { projectId: number; view: View; onView: (v: View) => void }) {
  const navigate = useNavigate();
  const list = view.competitors ?? [], max = view.maxRivals ?? 4, terms = view.terms ?? [];
  const included = list.filter((c) => c.included).map((c) => c.id);
  const [draft, setDraft] = useState<string[]>(included);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(included), [included.join()]);
  const choosing = list.length > max, changed = draft.join() !== included.join();
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : d.length < max ? [...list.map((c) => c.id).filter((x) => d.includes(x) || x === id)] : d));
  const apply = async () => {
    setBusy(true);
    try { onView({ ...view, ...(await api.action<View>("nrTrends", "pick", { method: "POST", body: { projectId, competitorIds: draft }, unwrap: "data" })) }); toast.success("正在按新的竞品重新比较"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有保存"); }
    finally { setBusy(false); }
  };
  const chip = (name: string, color: string | null, id?: string) => {
    const on = !id || draft.includes(id), canClick = Boolean(id) && choosing && !busy;
    const body = <><span className="size-2 shrink-0 rounded-full" style={{ background: on && color ? color : "transparent", border: on ? undefined : "1px dashed var(--muted-foreground)" }} />{name}</>;
    return canClick
      ? <button key={id} type="button" aria-pressed={on} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${on ? "bg-card" : "border-dashed text-muted-foreground"}`} onClick={() => toggle(id!)}>{body}</button>
      : <span key={id || name} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${on ? "bg-card" : "border-dashed text-muted-foreground"}`}>{body}</span>;
  };
  return (
    <div className="space-y-1.5" data-rivals>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-sm text-muted-foreground">对比：</span>
        {chip(view.product || terms[0] || "", COLORS[0])}
        {list.map((c) => chip(c.name, terms.includes(c.name) ? COLORS[terms.indexOf(c.name)] : "var(--muted-foreground)", c.id))}
        {!list.length ? <span className="text-sm text-muted-foreground">还没有竞品</span> : null}
        {changed ? <Button size="sm" disabled={busy || !draft.length} onClick={() => void apply()}>{busy ? "正在保存…" : `按这 ${draft.length} 个重新比较`}</Button> : null}
        <Button size="sm" variant="outline" className="ml-auto" onClick={() => navigate("/competitors")}>{list.length ? "管理竞品" : "去添加竞品"}</Button>
      </div>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">竞品来自“竞品”页，增删后自动重新比较<InfoTip label="对比怎么定">产品名在数据接入里设置。Google Trends 一次最多比较 5 个词，所以最多放 4 个竞品；超过时点竞品选哪 4 个，再点“重新比较”。每次重新比较约 $0.022，算进 DataForSEO 的月度预算。</InfoTip></p>
    </div>
  );
}
