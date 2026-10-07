import { $t, $tj } from "@/i18n";
// 性能检查 (Lighthouse) on 审计: after every-app/open-seo db8bde1 src/client/features/lighthouse/ (scores, metrics, failing
// checks by category; MIT). One page at a time and only when asked (DataForSEO, about $0.005); Chinese names for the common
// checks, the failing checks can go to the Agent as 技术修复.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "@nocobase/portal-sdk/client";
import { Gauge } from "lucide-react";
import { Tag, type Tone } from "@/components/reach/tag";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { currentProjectId } from "./current-project";
import { SectionHandOff } from "./section-hand-off";
import type { TaskDraft } from "./keyword-hand-off";
import { WithInfo } from "@/components/reach/info-tip";
import { help } from "./glossary";

type Issue = { category: string; key: string; title: string; description: string; value: string; score: number; savingsMs: number | null; savingsBytes: number | null; severity: "high" | "medium" };
type Result = { url: string; finalUrl: string; strategy: "mobile" | "desktop"; version: string | null; scores: Record<string, number | null>; metrics: { key: string; label: string; value: string; score: number | null }[]; issues: Issue[] };
type Run = { id: string | number; status: string; spec: { url: string; strategy: "mobile" | "desktop" }; result?: Result | null; errorCode?: string | null; createdAt: string };
type Recent = { id: string; status: string; url: string; strategy: string; createdAt: string; scores: Record<string, number | null> | null };
const call = <T,>(action: string, body: object = {}) => api.action<T>("nrLighthouse", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const CATEGORY: Record<string, string> = { performance: $t("性能"), accessibility: $t("无障碍"), "best-practices": $t("最佳实践"), seo: "SEO" };
const tone = (v: number | null): Tone => (v == null ? "grey" : v >= 90 ? "green" : v >= 50 ? "amber" : "red");
const ink = (v: number | null) => (v == null ? "" : v >= 90 ? "text-nr-ink-green" : v >= 50 ? "text-nr-ink-amber" : "text-nr-ink-red");
// Chinese names for the checks that come up most; others keep Lighthouse's English title.
const ZH: Record<string, string> = {
  "render-blocking-resources": $t("减少阻塞渲染的资源"), "unused-javascript": $t("减少没用到的 JavaScript"), "unused-css-rules": $t("减少没用到的 CSS"), "uses-optimized-images": $t("压缩图片"), "modern-image-formats": $t("改用 WebP、AVIF 等新格式图片"),
  "uses-responsive-images": $t("按显示尺寸提供图片"), "offscreen-images": $t("屏幕外的图片延后加载"), "total-byte-weight": $t("页面总体积太大"), "dom-size": $t("页面元素太多"), "bootup-time": $t("减少 JavaScript 执行时间"), "mainthread-work-breakdown": $t("减少主线程的工作"),
  "font-display": $t("字体加载时先显示文字"), "server-response-time": $t("服务器响应慢"), redirects: $t("避免多次跳转"), "uses-text-compression": $t("开启文本压缩"), "uses-long-cache-ttl": $t("静态资源缓存时间太短"), "unminified-javascript": $t("压缩 JavaScript"), "unminified-css": $t("压缩 CSS"),
  "legacy-javascript": $t("去掉给旧浏览器的 JavaScript"), "duplicated-javascript": $t("去掉重复的 JavaScript"), "third-party-summary": $t("第三方代码拖慢加载"), "lcp-lazy-loaded": $t("最大内容元素不要延后加载"), "prioritize-lcp-image": $t("优先加载最大内容的图片"), "unsized-images": $t("图片没有写宽高"),
  "non-composited-animations": $t("动画会引起重新绘制"), "layout-shift-elements": $t("有元素引起布局跳动"), "largest-contentful-paint": $t("最大内容出现得太晚"), "uses-rel-preconnect": $t("提前连接需要的域名"), "efficient-animated-content": $t("动图改用视频"),
  "color-contrast": $t("文字与背景对比度不够"), "image-alt": $t("图片缺少替代文字"), "link-name": $t("链接没有可读的文字"), "button-name": $t("按钮没有可读的名称"), "html-has-lang": $t("页面没有声明语言"), label: $t("表单项缺少标签"), "heading-order": $t("标题层级跳级"), "target-size": $t("点击区域太小"), "tap-targets": $t("点击区域太小"),
  "meta-description": $t("缺少页面描述"), "document-title": $t("缺少页面标题"), "is-crawlable": $t("页面不让搜索引擎收录"), "link-text": $t("链接文字不具体"), "crawlable-anchors": $t("链接无法被抓取"), "hreflang": $t("多语言标记有误"), canonical: $t("规范网址有误"), "robots-txt": $t("robots.txt 有误"),
  "errors-in-console": $t("浏览器控制台有报错"), "image-aspect-ratio": $t("图片比例显示不对"), "image-size-responsive": $t("图片清晰度不够"), "valid-source-maps": $t("缺少 source map"), deprecations: $t("用到了将被淘汰的接口"), "inspector-issues": $t("浏览器检测到问题"),
};
const zh = (i: Issue) => ZH[i.key] || i.title;
const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname === "/" ? x.host : x.pathname; } catch { return u; } };
function draft(r: Result): TaskDraft {
  const device = r.strategy === "mobile" ? $t("手机") : $t("电脑");
  return {
    title: $t("提升 {0} 的页面性能（{1}）",{0:pathOf(r.finalUrl),1:device}).slice(0, 200),
    objective: $t("让 {0} 的 Lighthouse 性能分到 90 以上，问题项都解决",{0:r.finalUrl}).slice(0, 1000),
    brief: [`页面：${r.finalUrl}（Lighthouse ${r.version || ""}，${device}）`, `分数：${Object.entries(r.scores).map(([k, v]) => `${CATEGORY[k]} ${v ?? "—"}`).join("，")}`, `指标：${r.metrics.map((m) => `${m.label} ${m.value}`).join("，")}`, "", "没通过的检查：", ...r.issues.slice(0, 20).map((i) => `- [${CATEGORY[i.category]}] ${zh(i)}${ZH[i.key] ? `（${i.title}）` : ""}${i.value ? `：${i.value}` : ""}`), "", "建议：先改节省时间最多的几项；只改必要的文件，改完后重新跑一次 Lighthouse 确认。"].join("\n").slice(0, 20000),
  };
}

export function LighthouseCard({ projectId }: { projectId?: number }) {
  const navigate = useNavigate();
  // 页面 → 性能检查 opens 审计 with the page filled in (?lighthouse=); it still runs only when 检查 is clicked.
  const [params] = useSearchParams();
  const asked = params.get("lighthouse");
  const [status, setStatus] = useState<{ connected: boolean; suggested: string }>();
  const [url, setUrl] = useState("");
  const [strategy, setStrategy] = useState<"mobile" | "desktop">("mobile");
  const [run, setRun] = useState<Run>();
  const [recent, setRecent] = useState<Recent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadRecent = () => call<Recent[]>("list").then(setRecent).catch(() => setRecent([]));
  useEffect(() => { void call<{ connected: boolean; suggested: string }>("status").then((s) => { setStatus(s); setUrl((u) => u || asked || s.suggested); }).catch(() => setStatus({ connected: false, suggested: "" })); void loadRecent(); }, [projectId]);
  const check = async () => {
    setBusy(true); setError("");
    try { const r = await call<Run>("run", { url: url.trim(), strategy, requestKey: crypto.randomUUID().replace(/-/g, "") }); setRun(r); if (r.status !== "completed") setError(r.status === "unknown" ? r.errorCode || $t("结果不确定：可能已计费，已阻止重复查询") : $t("没有查出结果（{0}）",{0:r.errorCode || $t("原因未知")})); void loadRecent(); }
    catch (e) { setError(e instanceof Error ? e.message : $t("没有查完，请稍后再试")); }
    finally { setBusy(false); }
  };
  const open = (id: string) => void call<Run>("getRun", { runId: id }).then((r) => { setRun(r); setUrl(r.spec.url); setStrategy(r.spec.strategy); }).catch(() => undefined);
  const r = run?.status === "completed" ? run.result : null;
  return (
    <Card className="gap-3 px-4" data-lighthouse ref={(el) => { if (el && asked && !el.dataset.scrolled) { el.dataset.scrolled = "1"; el.scrollIntoView({ block: "start" }); } }}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Gauge className="size-4 text-muted-foreground" />{$t("性能检查（Lighthouse）")}</h2>{r ? <SectionHandOff projectId={projectId} playbookId="tech-fix" page={r.finalUrl} description={$t("这次检查的分数、指标和没通过的项写进任务说明，确认后立即开始。")} draft={() => draft(r)} /> : null}</div>
      {status && !status.connected ? (
        <p className="text-sm text-muted-foreground">{$t("用 DataForSEO 跑 Lighthouse，请先")}<Button variant="link" className="h-auto p-0" onClick={() => navigate("/connections?source=keywords")}>{$t("接入 DataForSEO")}</Button>。</p>
      ) : (
        <>
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center" onSubmit={(e) => { e.preventDefault(); void check(); }}>
            <Input className="lg:max-w-xl" aria-label={$t("要检查的网址")} value={url} placeholder="https://www.example.com/pricing" onChange={(e) => setUrl(e.target.value)} />
            <div className="nr-range !m-0" role="group" aria-label={$t("设备")}>{(["mobile", "desktop"] as const).map((s) => <button key={s} type="button" aria-pressed={strategy === s} onClick={() => setStrategy(s)}>{s === "mobile" ? $t("手机") : $t("电脑")}</button>)}</div>
            <Button type="submit" disabled={busy || !url.trim()}>{busy ? $t("正在检查，约半分钟…") : $t("检查")}</Button>
          </form>
          <p className="text-xs text-muted-foreground">{$t("一次检查一个页面，点了才查（约 $0.005，算进 DataForSEO 的月度预算）；同一页面、同一设备 30 天内直接打开上次的结果。")}</p>
        </>
      )}
      {error ? <p role="alert" className="nr-error">{error}</p> : null}
      {r ? (
        <div className="flex flex-col gap-3" data-lighthouse-result>
          <p className="text-xs text-muted-foreground">{r.finalUrl} · {r.strategy === "mobile" ? $t("手机") : $t("电脑")} · {new Date(run!.createdAt).toLocaleString("zh-CN")}</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(r.scores).map(([k, v]) => <div key={k} className="rounded-lg border p-3" data-score={k}><p className="text-xs text-muted-foreground"><WithInfo help={help(CATEGORY[k])}>{CATEGORY[k]}</WithInfo></p><p className={`font-heading text-2xl font-semibold tabular-nums ${ink(v)}`}>{v ?? "—"}</p></div>)}</div>
          {r.metrics.length ? <div className="flex flex-wrap gap-2 text-xs">{r.metrics.map((m) => <span key={m.key} className="rounded-md bg-muted px-2 py-1"><span className="text-muted-foreground"><WithInfo help={help(m.label)}>{m.label}</WithInfo></span> <span className={ink(m.score)}>{m.value}</span></span>)}</div> : null}
          {r.issues.length ? (
            <ul className="divide-y rounded-lg border text-sm">{r.issues.map((i) => <li key={i.category + i.key} className="flex flex-wrap items-center gap-2 px-3 py-2" title={i.description} data-issue-key={i.key}><Tag tone={i.severity === "high" ? "red" : "amber"}>{CATEGORY[i.category]}</Tag><span className="min-w-0 flex-1">{zh(i)}{ZH[i.key] ? <span className="ml-2 text-xs text-muted-foreground">{i.title}</span> : null}</span>{i.value ? <span className="text-xs text-muted-foreground">{i.value}</span> : null}</li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">{$t("所有检查都通过了。")}</p>}
        </div>
      ) : null}
      {recent.length ? (
        <div className="flex flex-col gap-1"><p className="text-xs text-muted-foreground">{$t("检查过的页面")}</p>
          <ul className="divide-y rounded-lg border text-sm">{recent.map((x) => <li key={x.id}><button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50" onClick={() => open(x.id)}><span className="min-w-0 truncate">{x.url}<span className="ml-2 text-xs text-muted-foreground">{x.strategy === "mobile" ? $t("手机") : $t("电脑")}</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground">{x.scores ? <Tag tone={tone(x.scores.performance)}>{$tj("性能 {0}",{0:x.scores.performance ?? "—"})}</Tag> : <span>{x.status === "unknown" ? $t("结果不确定") : $t("没有结果")}</span>}{new Date(x.createdAt).toLocaleDateString("zh-CN")}</span></button></li>)}</ul>
        </div>
      ) : null}
    </Card>
  );
}
