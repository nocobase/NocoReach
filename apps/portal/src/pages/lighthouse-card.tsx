// 性能检查 (Lighthouse) on 审计: after every-app/open-seo db8bde1 src/client/features/lighthouse/ (scores, metrics, failing
// checks by category; MIT). One page at a time and only when asked (DataForSEO, about $0.005); Chinese names for the common
// checks, the failing checks can go to the Agent as 技术修复.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { Gauge } from "lucide-react";
import { Tag, type Tone } from "@/components/reach/tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { currentProjectId } from "./current-project";
import { SectionHandOff } from "./section-hand-off";
import type { TaskDraft } from "./keyword-hand-off";

type Issue = { category: string; key: string; title: string; description: string; value: string; score: number; savingsMs: number | null; savingsBytes: number | null; severity: "high" | "medium" };
type Result = { url: string; finalUrl: string; strategy: "mobile" | "desktop"; version: string | null; scores: Record<string, number | null>; metrics: { key: string; label: string; value: string; score: number | null }[]; issues: Issue[] };
type Run = { id: string | number; status: string; spec: { url: string; strategy: "mobile" | "desktop" }; result?: Result | null; errorCode?: string | null; createdAt: string };
type Recent = { id: string; status: string; url: string; strategy: string; createdAt: string; scores: Record<string, number | null> | null };
const call = <T,>(action: string, body: object = {}) => api.action<T>("nrLighthouse", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const CATEGORY: Record<string, string> = { performance: "性能", accessibility: "无障碍", "best-practices": "最佳实践", seo: "SEO" };
const tone = (v: number | null): Tone => (v == null ? "grey" : v >= 90 ? "green" : v >= 50 ? "amber" : "red");
const ink = (v: number | null) => (v == null ? "" : v >= 90 ? "text-nr-ink-green" : v >= 50 ? "text-nr-ink-amber" : "text-nr-ink-red");
// Chinese names for the checks that come up most; others keep Lighthouse's English title.
const ZH: Record<string, string> = {
  "render-blocking-resources": "减少阻塞渲染的资源", "unused-javascript": "减少没用到的 JavaScript", "unused-css-rules": "减少没用到的 CSS", "uses-optimized-images": "压缩图片", "modern-image-formats": "改用 WebP、AVIF 等新格式图片",
  "uses-responsive-images": "按显示尺寸提供图片", "offscreen-images": "屏幕外的图片延后加载", "total-byte-weight": "页面总体积太大", "dom-size": "页面元素太多", "bootup-time": "减少 JavaScript 执行时间", "mainthread-work-breakdown": "减少主线程的工作",
  "font-display": "字体加载时先显示文字", "server-response-time": "服务器响应慢", redirects: "避免多次跳转", "uses-text-compression": "开启文本压缩", "uses-long-cache-ttl": "静态资源缓存时间太短", "unminified-javascript": "压缩 JavaScript", "unminified-css": "压缩 CSS",
  "legacy-javascript": "去掉给旧浏览器的 JavaScript", "duplicated-javascript": "去掉重复的 JavaScript", "third-party-summary": "第三方代码拖慢加载", "lcp-lazy-loaded": "最大内容元素不要延后加载", "prioritize-lcp-image": "优先加载最大内容的图片", "unsized-images": "图片没有写宽高",
  "non-composited-animations": "动画会引起重新绘制", "layout-shift-elements": "有元素引起布局跳动", "largest-contentful-paint": "最大内容出现得太晚", "uses-rel-preconnect": "提前连接需要的域名", "efficient-animated-content": "动图改用视频",
  "color-contrast": "文字与背景对比度不够", "image-alt": "图片缺少替代文字", "link-name": "链接没有可读的文字", "button-name": "按钮没有可读的名称", "html-has-lang": "页面没有声明语言", label: "表单项缺少标签", "heading-order": "标题层级跳级", "target-size": "点击区域太小", "tap-targets": "点击区域太小",
  "meta-description": "缺少页面描述", "document-title": "缺少页面标题", "is-crawlable": "页面不让搜索引擎收录", "link-text": "链接文字不具体", "crawlable-anchors": "链接无法被抓取", "hreflang": "多语言标记有误", canonical: "规范网址有误", "robots-txt": "robots.txt 有误",
  "errors-in-console": "浏览器控制台有报错", "image-aspect-ratio": "图片比例显示不对", "image-size-responsive": "图片清晰度不够", "valid-source-maps": "缺少 source map", deprecations: "用到了将被淘汰的接口", "inspector-issues": "浏览器检测到问题",
};
const zh = (i: Issue) => ZH[i.key] || i.title;
const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname === "/" ? x.host : x.pathname; } catch { return u; } };
function draft(r: Result): TaskDraft {
  const device = r.strategy === "mobile" ? "手机" : "电脑";
  return {
    title: `提升 ${pathOf(r.finalUrl)} 的页面性能（${device}）`.slice(0, 200),
    objective: `让 ${r.finalUrl} 的 Lighthouse 性能分到 90 以上，问题项都解决`.slice(0, 1000),
    brief: [`页面：${r.finalUrl}（Lighthouse ${r.version || ""}，${device}）`, `分数：${Object.entries(r.scores).map(([k, v]) => `${CATEGORY[k]} ${v ?? "—"}`).join("，")}`, `指标：${r.metrics.map((m) => `${m.label} ${m.value}`).join("，")}`, "", "没通过的检查：", ...r.issues.slice(0, 20).map((i) => `- [${CATEGORY[i.category]}] ${zh(i)}${ZH[i.key] ? `（${i.title}）` : ""}${i.value ? `：${i.value}` : ""}`), "", "建议：先改节省时间最多的几项；只改必要的文件，改完后重新跑一次 Lighthouse 确认。"].join("\n").slice(0, 20000),
  };
}

export function LighthouseCard({ projectId }: { projectId?: number }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ connected: boolean; suggested: string }>();
  const [url, setUrl] = useState("");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [run, setRun] = useState<Run>();
  const [recent, setRecent] = useState<Recent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadRecent = () => call<Recent[]>("list").then(setRecent).catch(() => setRecent([]));
  useEffect(() => { void call<{ connected: boolean; suggested: string }>("status").then((s) => { setStatus(s); setUrl((u) => u || s.suggested); }).catch(() => setStatus({ connected: false, suggested: "" })); void loadRecent(); }, [projectId]);
  const check = async () => {
    setBusy(true); setError("");
    try { const r = await call<Run>("run", { url: url.trim(), strategy, requestKey: crypto.randomUUID().replace(/-/g, "") }); setRun(r); if (r.status !== "completed") setError(r.status === "unknown" ? r.errorCode || "结果不确定：可能已计费，已阻止重复查询" : `没有查出结果（${r.errorCode || "原因未知"}）`); void loadRecent(); }
    catch (e) { setError(e instanceof Error ? e.message : "没有查完，请稍后再试"); }
    finally { setBusy(false); }
  };
  const open = (id: string) => void call<Run>("getRun", { runId: id }).then((r) => { setRun(r); setUrl(r.spec.url); setStrategy(r.spec.strategy); }).catch(() => undefined);
  const r = run?.status === "completed" ? run.result : null;
  return (
    <Card className="gap-3 px-4" data-lighthouse>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Gauge className="size-4 text-muted-foreground" />性能检查（Lighthouse）</h2>{r ? <SectionHandOff projectId={projectId} playbookId="tech-fix" page={r.finalUrl} description="这次检查的分数、指标和没通过的项写进任务说明，确认后立即开始。" draft={() => draft(r)} /> : null}</div>
      {status && !status.connected ? (
        <p className="text-sm text-muted-foreground">用 DataForSEO 跑 Lighthouse，请先<Button variant="link" className="h-auto p-0" onClick={() => navigate("/connections?source=keywords")}>接入 DataForSEO</Button>。</p>
      ) : (
        <>
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center" onSubmit={(e) => { e.preventDefault(); void check(); }}>
            <Input className="lg:max-w-xl" aria-label="要检查的网址" value={url} placeholder="https://www.example.com/pricing" onChange={(e) => setUrl(e.target.value)} />
            <div className="nr-range !m-0" role="group" aria-label="设备">{(["mobile", "desktop"] as const).map((s) => <button key={s} type="button" aria-pressed={strategy === s} onClick={() => setStrategy(s)}>{s === "mobile" ? "手机" : "电脑"}</button>)}</div>
            <Button type="submit" disabled={busy || !url.trim()}>{busy ? "正在检查，约半分钟…" : "检查"}</Button>
          </form>
          <p className="text-xs text-muted-foreground">一次检查一个页面，点了才查（约 $0.005，算进 DataForSEO 的月度预算）；同一页面、同一设备 30 天内直接打开上次的结果。</p>
        </>
      )}
      {error ? <p role="alert" className="nr-error">{error}</p> : null}
      {r ? (
        <div className="flex flex-col gap-3" data-lighthouse-result>
          <p className="text-xs text-muted-foreground">{r.finalUrl} · {r.strategy === "mobile" ? "手机" : "电脑"} · {new Date(run!.createdAt).toLocaleString("zh-CN")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(r.scores).map(([k, v]) => <div key={k} className="rounded-lg border p-3" data-score={k}><p className="text-xs text-muted-foreground">{CATEGORY[k]}</p><p className={`font-heading text-2xl font-semibold tabular-nums ${ink(v)}`}>{v ?? "—"}</p></div>)}</div>
          {r.metrics.length ? <div className="flex flex-wrap gap-2 text-xs">{r.metrics.map((m) => <span key={m.key} className="rounded-md bg-muted px-2 py-1"><span className="text-muted-foreground">{m.label}</span> <span className={ink(m.score)}>{m.value}</span></span>)}</div> : null}
          {r.issues.length ? (
            <ul className="divide-y rounded-lg border text-sm">{r.issues.map((i) => <li key={i.category + i.key} className="flex flex-wrap items-center gap-2 px-3 py-2" title={i.description} data-issue-key={i.key}><Tag tone={i.severity === "high" ? "red" : "amber"}>{CATEGORY[i.category]}</Tag><span className="min-w-0 flex-1">{zh(i)}{ZH[i.key] ? <span className="ml-2 text-xs text-muted-foreground">{i.title}</span> : null}</span>{i.value ? <span className="text-xs text-muted-foreground">{i.value}</span> : null}</li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">所有检查都通过了。</p>}
        </div>
      ) : null}
      {recent.length ? (
        <div className="flex flex-col gap-1"><p className="text-xs text-muted-foreground">检查过的页面</p>
          <ul className="divide-y rounded-lg border text-sm">{recent.map((x) => <li key={x.id}><button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50" onClick={() => open(x.id)}><span className="min-w-0 truncate">{x.url}<span className="ml-2 text-xs text-muted-foreground">{x.strategy === "mobile" ? "手机" : "电脑"}</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground">{x.scores ? <Tag tone={tone(x.scores.performance)}>性能 {x.scores.performance ?? "—"}</Tag> : <span>{x.status === "unknown" ? "结果不确定" : "没有结果"}</span>}{new Date(x.createdAt).toLocaleDateString("zh-CN")}</span></button></li>)}</ul>
        </div>
      ) : null}
    </Card>
  );
}
