// 趋势 › 关注的关键词 (2026-10-04 user choice): keywords added right here (or picked from 关键词), each with its own
// 12-month line in Google Trends (100 = its own busiest week, so they are not compared with each other) and its related
// searches. Queried at once when added, then weekly; a row opens the full line and the searches, which go to the Agent.
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ExternalLink, LoaderCircle, MoreHorizontal, Plus, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { EmptyState, InlineError } from "@/components/reach/states";
import { InfoTip } from "@/components/reach/info-tip";
import { Tag } from "@/components/reach/tag";
import { confirmAction } from "@/components/reach/confirm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, useDataTable } from "@/components/seo/data-table";
import { SortableHeader } from "@/components/seo/sortable-header";
import { DetailDrawer } from "./detail-drawer";
import { SectionHandOff } from "./section-hand-off";
import { trendsDraft, type TrendQuery } from "./seo-hand-off";
import { keywordRequest, type SavedKeyword } from "./keyword-api";

type Query = { query: string; value: number; isNew?: boolean };
export type WatchedKeyword = { id: string; keyword: string; addedAt: string; checking: boolean; lastRun: { at: string; ok: boolean; errors: string[] } | null; checkedAt: string | null; checkUrl: string | null; points: { date: string; value: number | null }[]; recent: number | null; change: number | null; average: number | null; top: Query[]; rising: Query[] };
export type KeywordWatch = { dataforseo?: boolean; keywords?: WatchedKeyword[]; maxKeywords?: number; keywordPlace?: string };
const call = <T,>(projectId: number, action: string, body: object = {}) => api.action<T>("nrTrends", action, { method: "POST", body: { projectId, ...body }, unwrap: "data" });
const change = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(v * 100))}%`);
const OWN = "这个词在 Google Trends 里的相对关注度：100 是它自己过去 12 个月最热的那周，不是搜索次数，不同关键词之间不能直接比较。";
const helper = createColumnHelper<WatchedKeyword>();
const right = { headerClassName: "text-right", cellClassName: "text-right tabular-nums" } as const;

// The 12-month line as a small sparkline.
function Spark({ points }: { points: WatchedKeyword["points"] }) {
  const vals = points.map((p) => p.value);
  if (vals.filter((v) => v !== null).length < 2) return <span className="text-muted-foreground">—</span>;
  const step = 110 / Math.max(vals.length - 1, 1);
  const line = vals.map((v, i) => (v === null ? null : `${(i * step).toFixed(1)},${(22 - (v / 100) * 20).toFixed(1)}`)).filter(Boolean).join(" ");
  return <svg width="110" height="24" viewBox="0 0 110 24" aria-hidden="true" data-spark><polyline fill="none" stroke="var(--chart-1)" strokeWidth="1.5" points={line} /></svg>;
}

export function TrendKeywords({ projectId, view, onView, onRetry }: { projectId: number; view: KeywordWatch; onView: (v: KeywordWatch) => void; onRetry: (keywordId: string) => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string>();
  const list = view.keywords ?? [], max = view.maxKeywords ?? 10, full = list.length >= max, place = view.keywordPlace || "全球";
  useEffect(() => { void keywordRequest<{ items: SavedKeyword[] }>("saved").then((d) => setSaved(d.items.map((k) => k.keyword))).catch(() => setSaved([])); }, [projectId]);
  const tracked = new Set(list.map((k) => k.keyword.toLowerCase()));
  const picks = saved.filter((k, i, all) => !tracked.has(k.toLowerCase()) && all.findIndex((x) => x.toLowerCase() === k.toLowerCase()) === i).slice(0, 6);
  const add = async (keyword: string) => {
    if (!keyword.trim()) return;
    setBusy(true); setError("");
    try { onView(await call<KeywordWatch>(projectId, "addKeyword", { keyword })); setText(""); toast.success(`已关注“${keyword.trim()}”，正在第一次查询`); }
    catch (e) { setError(e instanceof Error ? e.message : "没有添加，请重试"); }
    finally { setBusy(false); }
  };
  const remove = async (k: WatchedKeyword) => {
    if (!(await confirmAction({ title: `不再关注“${k.keyword}”？`, description: "已查到的数据一起删除。", action: "移除" }))) return;
    try { onView(await call<KeywordWatch>(projectId, "removeKeyword", { keywordId: k.id })); setOpenId(undefined); }
    catch (e) { toast.error(e instanceof Error ? e.message : "没有移除"); }
  };
  const columns = useMemo<ColumnDef<WatchedKeyword>[]>(() => [
    helper.accessor("keyword", {
      header: ({ column }) => <SortableHeader column={column} label="关键词" />,
      cell: ({ row }) => { const k = row.original; return <span className="flex min-w-0 items-center gap-2"><span className="truncate font-medium" title={k.keyword}>{k.keyword}</span>{k.checking || !k.lastRun ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />正在查询</span> : !k.lastRun.ok ? <Tag tone="red">没有查完</Tag> : null}</span>; },
    }) as ColumnDef<WatchedKeyword>,
    helper.accessor((k) => k.recent ?? undefined, { id: "recent", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="近 4 周" align="right" help={OWN} />, cell: ({ row }) => row.original.recent ?? "—", meta: right }) as ColumnDef<WatchedKeyword>,
    helper.accessor((k) => k.change ?? undefined, { id: "change", sortUndefined: "last", header: ({ column }) => <SortableHeader column={column} label="变化" align="right" help="近 4 周平均和再往前 4 周相比。" />, cell: ({ row }) => { const c = row.original.change; return <span className={c === null ? "text-muted-foreground" : c >= 0 ? "text-nr-ink-green" : "text-nr-ink-red"}>{change(c)}</span>; }, meta: right }) as ColumnDef<WatchedKeyword>,
    helper.display({ id: "spark", header: () => "12 个月走势", cell: ({ row }) => <Spark points={row.original.points} /> }) as ColumnDef<WatchedKeyword>,
    helper.display({ id: "rising", header: () => "上升的相关搜索", cell: ({ row }) => { const r = row.original.rising, fresh = r.filter((q) => q.isNew).length; return r.length ? <span className="flex min-w-0 items-center gap-2 text-sm"><span className="truncate" title={r[0].query}>{r[0].query} <span className="text-nr-ink-green tabular-nums">+{r[0].value.toLocaleString()}%</span></span>{r.length > 1 ? <span className="shrink-0 text-xs text-muted-foreground">等 {r.length} 个</span> : null}{fresh ? <Tag tone="blue">本周新出现 {fresh}</Tag> : null}</span> : <span className="text-muted-foreground">—</span>; } }) as ColumnDef<WatchedKeyword>,
    // The menu cell stops clicks: events from the menu's portal would reach the row and open the detail.
    helper.display({ id: "actions", header: () => <span className="sr-only">操作</span>, cell: ({ row }) => <div className="flex justify-end" onClick={(e) => e.stopPropagation()}><DropdownMenu><DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={`${row.original.keyword} 更多操作`} />}><MoreHorizontal /></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" onClick={() => void remove(row.original)}>移除</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div> }) as ColumnDef<WatchedKeyword>,
  ], []);
  const table = useDataTable({ data: list, columns, withSorting: true, getRowId: (k) => k.id });
  if (!view.dataforseo) return <EmptyState icon={<TrendingUp />} title="先接入 DataForSEO" description="关键词趋势通过 DataForSEO 查 Google Trends，每个词每周约 $0.011，算进月度预算。" action={<Button onClick={() => navigate("/connections?source=keywords")}>去接入</Button>} />;
  const open = list.find((k) => k.id === openId);
  return (
    <>
      <div className="space-y-2">
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e: FormEvent) => { e.preventDefault(); void add(text); }}>
          <Input className="max-w-md" aria-label="要关注的关键词" value={text} disabled={busy || full} placeholder={full ? `最多关注 ${max} 个，先移除一个` : "添加要关注的关键词，例如 low code platform"} onChange={(e) => setText(e.target.value)} />
          <Button type="submit" disabled={busy || full || !text.trim()}><Plus data-icon="inline-start" />{busy ? "正在添加…" : "添加"}</Button>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">已关注 {list.length} / {max} · {place}<InfoTip label="关键词趋势怎么查">每个词单独查 Google Trends：添加后马上查一次，之后每周一次，每次约 $0.011，算进 DataForSEO 的月度预算。{OWN}地区和“产品与竞品”一样。</InfoTip></span>
        </form>
        {picks.length && !full ? <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" data-picks>从关键词页选：{picks.map((k) => <Button key={k} type="button" size="xs" variant="outline" className="rounded-full" disabled={busy} onClick={() => void add(k)}>{k}</Button>)}</p> : null}
        {error ? <InlineError>{error}</InlineError> : null}
      </div>
      <Card className="gap-0 py-0">
        <DataTable table={table} empty={{ title: "还没有关注的关键词", description: "添加后每周看它在 Google 的关注度和上升的相关搜索。" }} onRowClick={(row) => setOpenId(row.original.id)} />
      </Card>
      {open ? <KeywordDetail projectId={projectId} k={open} place={place} onClose={() => setOpenId(undefined)} onRemove={() => void remove(open)} onRetry={() => onRetry(open.id)} /> : null}
    </>
  );
}

// One keyword: its full 12-month line, numbers, and the related searches to hand to the Agent.
function KeywordDetail({ projectId, k, place, onClose, onRemove, onRetry }: { projectId: number; k: WatchedKeyword; place: string; onClose: () => void; onRemove: () => void; onRetry: () => void }) {
  const [picked, setPicked] = useState<Record<string, TrendQuery>>({});
  const chosen = Object.values(picked);
  const toggle = (q: Query, kind: TrendQuery["kind"], on: boolean) => setPicked((cur) => { const next = { ...cur }; if (on) next[kind + q.query] = { query: q.query, value: q.value, kind }; else delete next[kind + q.query]; return next; });
  const rows = (title: string, kind: TrendQuery["kind"], list: Query[], empty: string) => (
    <section className="space-y-1" data-list={kind}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {list.length ? list.map((q) => (
        <label key={q.query} className="flex items-center gap-3 rounded-md px-1 py-1.5 text-sm hover:bg-muted/50" data-query={q.query}>
          <Checkbox checked={Boolean(picked[kind + q.query])} onCheckedChange={(on) => toggle(q, kind, on === true)} />
          <span className="min-w-0 flex-1 truncate">{q.query}</span>
          {q.isNew ? <Tag tone="blue">本周新出现</Tag> : null}
          <span className={kind === "rising" ? "tabular-nums text-nr-ink-green" : "tabular-nums text-muted-foreground"}>{kind === "rising" ? `+${q.value.toLocaleString()}%` : q.value}</span>
        </label>
      )) : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
  return (
    <DetailDrawer open onClose={onClose} title={k.keyword} description={`${place} · 过去 12 个月${k.checkedAt ? ` · 查询于 ${new Date(k.checkedAt).toLocaleString("zh-CN")}` : ""}`}
      footer={<div className="flex w-full flex-wrap items-center justify-between gap-2"><Button variant="ghost" className="text-destructive" onClick={onRemove}>移除</Button><SectionHandOff projectId={projectId} disabled={!chosen.length} playbookId="content-outline" label={chosen.length ? `交给 Agent（${chosen.length}）` : "交给 Agent"} description="选中的相关搜索合成一个任务，让 Agent 看看要不要新写页面或补进现有页面，确认后立即开始。" draft={() => trendsDraft(k.keyword, place, chosen)} /></div>}>
      <div className="space-y-4">
        {k.lastRun && !k.lastRun.ok && !k.checking ? <InlineError action={k.lastRun.errors[0]?.includes("不确定") ? <Button size="sm" variant="outline" onClick={onRetry}>重新查询</Button> : undefined}>上次查询没有完成：{k.lastRun.errors[0]}</InlineError> : null}
        {!k.checkedAt ? <p role="status" className="text-sm text-muted-foreground">{k.checking || !k.lastRun ? "正在查询，一般一两分钟。" : "还没有查到数据。"}</p> : (
          <>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="flex items-center gap-1">近 4 周 <b className="text-lg tabular-nums">{k.recent ?? "—"}</b><InfoTip label="数字是什么">{OWN}</InfoTip></span>
              <span>变化 <span className={k.change === null ? "" : k.change >= 0 ? "text-nr-ink-green" : "text-nr-ink-red"}>{change(k.change)}</span></span>
              <span className="text-muted-foreground">12 个月平均 {k.average ?? "—"}</span>
              {k.checkUrl ? <a className="nr-link inline-flex items-center gap-0.5" href={k.checkUrl} target="_blank" rel="noreferrer">在 Google Trends 打开<ExternalLink className="size-3" /></a> : null}
            </div>
            <div className="nr-chart-box" data-keyword-chart>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={k.points} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} minTickGap={32} fontSize={11} />
                  <YAxis domain={[0, 100]} allowDecimals={false} fontSize={11} width={32} />
                  <Tooltip />
                  <Line isAnimationActive={false} type="linear" dataKey="value" name="关注度" stroke="var(--chart-1)" strokeWidth={2} dot={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-muted-foreground">{chosen.length ? `已选 ${chosen.length} 个相关搜索` : "勾选相关搜索后交给 Agent，看要不要写页面回答它们。"}</p>
            {rows("上升中", "rising", k.rising, "这段时间没有明显上升的相关搜索。")}
            {rows("最热门", "top", k.top, "Google 没有给出相关搜索，可能是搜索量太少。")}
          </>
        )}
      </div>
    </DetailDrawer>
  );
}
