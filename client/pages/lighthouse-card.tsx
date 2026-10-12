import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
// 性能检查 (Lighthouse) on 审计: after every-app/open-seo db8bde1 src/client/features/lighthouse/ (scores, metrics, failing
// checks by category; MIT). One page at a time and only when asked (DataForSEO, about $0.005); Chinese names for the common
// checks, the failing checks can go to the Agent as 技术修复.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { nocobaseClient as api } from "#lib/nocoreach-api";
import { Gauge } from "lucide-react";
import { Tag, type Tone } from "#components/reach/tag";
import { Button } from "#components/ui/button";
import { Card } from "#components/ui/card";
import { Input } from "#components/ui/input";
import { currentProjectId } from "./current-project";
import { useHandOffSource } from "#components/reach/hand-off-slot";
import { Checkbox } from "#components/ui/checkbox";
import type { TaskDraft } from "./keyword-hand-off";
import { WithInfo } from "#components/reach/info-tip";
import { help } from "./glossary";

type Issue = { category: string; key: string; title: string; description: string; value: string; score: number; savingsMs: number | null; savingsBytes: number | null; severity: "high" | "medium" };
type Result = { url: string; finalUrl: string; strategy: "mobile" | "desktop"; version: string | null; scores: Record<string, number | null>; metrics: { key: string; label: string; value: string; score: number | null }[]; issues: Issue[] };
type Run = { id: string | number; status: string; spec: { url: string; strategy: "mobile" | "desktop" }; result?: Result | null; errorCode?: string | null; createdAt: string };
type Recent = { id: string; status: string; url: string; strategy: string; createdAt: string; scores: Record<string, number | null> | null };
const call = <T,>(action: string, body: object = {}) => api.action<T>("nrLighthouse", action, { method: "POST", body: { projectId: String(currentProjectId()), ...body }, unwrap: "data" });
const getCategory = (): Record<string, string> => ({ performance: $t('lighthouseCard.performance'), accessibility: $t('lighthouseCard.accessibility'), "best-practices": $t('lighthouseCard.bestPractices'), seo: "SEO" });
const tone = (v: number | null): Tone => (v == null ? "grey" : v >= 90 ? "green" : v >= 50 ? "amber" : "red");
const ink = (v: number | null) => (v == null ? "" : v >= 90 ? "text-nr-ink-green" : v >= 50 ? "text-nr-ink-amber" : "text-nr-ink-red");
// Chinese names for the checks that come up most; others keep Lighthouse's English title.
const getZh = (): Record<string, string> => ({
  "render-blocking-resources": $t('lighthouseCard.eliminateRenderBlockingResources'), "unused-javascript": $t('lighthouseCard.reduceUnusedJavascript'), "unused-css-rules": $t('lighthouseCard.reduceUnusedCss'), "uses-optimized-images": $t('lighthouseCard.compressImages'), "modern-image-formats": $t('lighthouseCard.useModernImageFormatsLike'),
  "uses-responsive-images": $t('lighthouseCard.serveProperlySizedImages'), "offscreen-images": $t('lighthouseCard.deferOffscreenImages'), "total-byte-weight": $t('lighthouseCard.pageTooHeavy'), "dom-size": $t('lighthouseCard.tooManyPageElements'), "bootup-time": $t('lighthouseCard.reduceJavascriptExecutionTime'), "mainthread-work-breakdown": $t('lighthouseCard.reduceMainThreadWork'),
  "font-display": $t('lighthouseCard.showTextWhileFontsLoad'), "server-response-time": $t('lighthouseCard.slowServerResponse'), redirects: $t('lighthouseCard.avoidMultipleRedirects'), "uses-text-compression": $t('lighthouseCard.enableTextCompression'), "uses-long-cache-ttl": $t('lighthouseCard.staticAssetsCachedTooBriefly'), "unminified-javascript": $t('lighthouseCard.minifyJavascript'), "unminified-css": $t('lighthouseCard.minifyCss'),
  "legacy-javascript": $t('lighthouseCard.removeJavascriptLegacyBrowsers'), "duplicated-javascript": $t('lighthouseCard.removeDuplicateJavascript'), "third-party-summary": $t('lighthouseCard.thirdPartyCodeSlowsLoading'), "lcp-lazy-loaded": $t('lighthouseCard.notLazyLoadLargestContent'), "prioritize-lcp-image": $t('lighthouseCard.preloadLargestContentImage'), "unsized-images": $t('lighthouseCard.imagesLackWidthHeight'),
  "non-composited-animations": $t('lighthouseCard.animationsCauseRepaints'), "layout-shift-elements": $t('lighthouseCard.elementsCauseLayoutShifts'), "largest-contentful-paint": $t('lighthouseCard.largestContentAppearsTooLate'), "uses-rel-preconnect": $t('lighthouseCard.preconnectRequiredOrigins'), "efficient-animated-content": $t('lighthouseCard.useVideoAnimatedContent'),
  "color-contrast": $t('lighthouseCard.insufficientTextContrast'), "image-alt": $t('lighthouseCard.imagesLackAltText'), "link-name": $t('lighthouseCard.linksNoReadableText'), "button-name": $t('lighthouseCard.buttonsNoAccessibleName'), "html-has-lang": $t('lighthouseCard.pageNotDeclareLanguage'), label: $t('lighthouseCard.formFieldsLackLabels'), "heading-order": $t('lighthouseCard.headingLevelsSkip'), "target-size": $t('lighthouseCard.tapTargetsTooSmall'), "tap-targets": $t('lighthouseCard.tapTargetsTooSmall'),
  "meta-description": $t('lighthouseCard.missingMetaDescription'), "document-title": $t('lighthouseCard.missingPageTitle'), "is-crawlable": $t('lighthouseCard.pageBlocksSearchEngineIndexing'), "link-text": $t('lighthouseCard.linkTextNotDescriptive'), "crawlable-anchors": $t('lighthouseCard.linksCannotCrawled'), "hreflang": $t('lighthouseCard.invalidHreflang'), canonical: $t('lighthouseCard.invalidCanonicalUrl'), "robots-txt": $t('lighthouseCard.robotsTxtInvalid'),
  "errors-in-console": $t('lighthouseCard.errorsBrowserConsole'), "image-aspect-ratio": $t('lighthouseCard.imagesShowWrongAspectRatio'), "image-size-responsive": $t('lighthouseCard.imagesLowResolution'), "valid-source-maps": $t('lighthouseCard.missingSourceMaps'), deprecations: $t('lighthouseCard.usesDeprecatedApis'), "inspector-issues": $t('lighthouseCard.browserReportedIssues'),
});
const zh = (i: Issue) => getZh()[i.key] || i.title;
const pathOf = (u: string) => { try { const x = new URL(u); return x.pathname === "/" ? x.host : x.pathname; } catch { return u; } };
function draft(r: Result): TaskDraft {
  const device = r.strategy === "mobile" ? $t('lighthouseCard.mobile') : $t('lighthouseCard.computer');
  return {
    title: $t('lighthouseCard.improvePagePerformance',{0:pathOf(r.finalUrl),1:device}).slice(0, 200),
    objective: $t('lighthouseCard.getLighthousePerformanceScore90',{0:r.finalUrl}).slice(0, 1000),
    brief: [$t('lighthouseCard.pageLighthouse',{0:r.finalUrl,1:r.version || "",2:device}), $t('lighthouseCard.scores',{0:Object.entries(r.scores).map(([k, v]) => `${getCategory()[k]} ${v ?? "—"}`).join("，")}), $t('lighthouseCard.metrics',{0:r.metrics.map((m) => `${m.label} ${m.value}`).join("，")}), "", $t('lighthouseCard.failedChecks'), ...r.issues.slice(0, 20).map((i) => `- [${getCategory()[i.category]}] ${zh(i)}${getZh()[i.key] ? `（${i.title}）` : ""}${i.value ? `：${i.value}` : ""}`), "", $t('lighthouseCard.suggestionFixItemsSaveMost')].join("\n").slice(0, 20000),
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
  const [error, setError] = useMessageState("");
  const loadRecent = () => call<Recent[]>("list").then(setRecent).catch(() => setRecent([]));
  useEffect(() => { void call<{ connected: boolean; suggested: string }>("status").then((s) => { setStatus(s); setUrl((u) => u || asked || s.suggested); }).catch(() => setStatus({ connected: false, suggested: "" })); void loadRecent(); }, [projectId]);
  const check = async () => {
    setBusy(true); setError("");
    try { const r = await call<Run>("run", { url: url.trim(), strategy, requestKey: crypto.randomUUID().replace(/-/g, "") }); setRun(r); if (r.status !== "completed") setError(() => (r.status === "unknown" ? r.errorCode || $t('common.resultUncertainMayChargedRepeat') : $t('lighthouseCard.noResults',{0:r.errorCode || $t('errors.unknownReason')}))); void loadRecent(); }
    catch (e) { setError(() => (e instanceof Error ? $legacyText(e.message) : $t('lighthouseCard.notFullyCheckedTryAgain'))); }
    finally { setBusy(false); }
  };
  const open = (id: string) => void call<Run>("getRun", { runId: id }).then((r) => { setRun(r); setUrl(r.spec.url); setStrategy(r.spec.strategy); }).catch(() => undefined);
  const r = run?.status === "completed" ? run.result : null;
  // The result can be ticked and handed off with the page's 交给 Agent, together with ticked audit issues.
  const [picked, setPicked] = useState(false);
  useEffect(() => setPicked(false), [run?.id]);
  useHandOffSource("lighthouse", r && projectId ? { count: picked ? 1 : 0, draft: () => draft(r), playbookId: "tech-fix", page: r.finalUrl, description: $t('lighthouseCard.scoresMetricsFailedChecksRun'), clear: () => setPicked(false) } : null);
  return (
    <Card className="gap-3 px-4" data-lighthouse ref={(el) => { if (el && asked && !el.dataset.scrolled) { el.dataset.scrolled = "1"; el.scrollIntoView({ block: "start" }); } }}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Gauge className="size-4 text-muted-foreground" />{$t('lighthouseCard.performanceCheckLighthouse')}</h2></div>
      {status && !status.connected ? (
        <p className="text-sm text-muted-foreground">{$t('lighthouseCard.lighthouseRunsThroughDataforseoFirst')}<Button variant="link" className="h-auto p-0" onClick={() => navigate("/connections?source=keywords")}>{$t('common.connectDataforseo')}</Button>。</p>
      ) : (
        <>
          <form className="flex flex-col gap-2 lg:flex-row lg:items-center" onSubmit={(e) => { e.preventDefault(); void check(); }}>
            <Input className="lg:max-w-xl" aria-label={$t('lighthouseCard.urlCheck')} value={url} placeholder="https://www.example.com/pricing" onChange={(e) => setUrl(e.target.value)} />
            <div className="nr-range !m-0" role="group" aria-label={$t('lighthouseCard.device')}>{(["mobile", "desktop"] as const).map((s) => <button key={s} type="button" aria-pressed={strategy === s} onClick={() => setStrategy(s)}>{s === "mobile" ? $t('lighthouseCard.mobile') : $t('lighthouseCard.computer')}</button>)}</div>
            <Button type="submit" disabled={busy || !url.trim()}>{busy ? $t('lighthouseCard.checkingAboutHalfMinute') : $t('common.check')}</Button>
          </form>
          <p className="text-xs text-muted-foreground">{$t('lighthouseCard.checksOnePageTimeWhen')}</p>
        </>
      )}
      {error ? <p role="alert" className="nr-error">{error}</p> : null}
      {r ? (
        <div className="flex flex-col gap-3" data-lighthouse-result>
          <label className="flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={picked} onCheckedChange={(on) => setPicked(Boolean(on))} aria-label={$t('lighthouseCard.selectCheckResult')} data-row-check="" />{r.finalUrl} · {r.strategy === "mobile" ? $t('lighthouseCard.mobile') : $t('lighthouseCard.computer')} · {new Date(run!.createdAt).toLocaleString(getCurrentLocale())}</label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{Object.entries(r.scores).map(([k, v]) => <div key={k} className="rounded-lg border p-3" data-score={k}><p className="text-xs text-muted-foreground"><WithInfo help={help(getCategory()[k])}>{getCategory()[k]}</WithInfo></p><p className={`font-heading text-2xl font-semibold tabular-nums ${ink(v)}`}>{v ?? "—"}</p></div>)}</div>
          {r.metrics.length ? <div className="flex flex-wrap gap-2 text-xs">{r.metrics.map((m) => <span key={m.key} className="rounded-md bg-muted px-2 py-1"><span className="text-muted-foreground"><WithInfo help={help(m.label)}>{m.label}</WithInfo></span> <span className={ink(m.score)}>{m.value}</span></span>)}</div> : null}
          {r.issues.length ? (
            <ul className="divide-y rounded-lg border text-sm">{r.issues.map((i) => <li key={i.category + i.key} className="flex flex-wrap items-center gap-2 px-3 py-2" title={i.description} data-issue-key={i.key}><Tag tone={i.severity === "high" ? "red" : "amber"}>{getCategory()[i.category]}</Tag><span className="min-w-0 flex-1">{zh(i)}{getZh()[i.key] ? <span className="ml-2 text-xs text-muted-foreground">{i.title}</span> : null}</span>{i.value ? <span className="text-xs text-muted-foreground">{i.value}</span> : null}</li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">{$t('lighthouseCard.checksPassed')}</p>}
        </div>
      ) : null}
      {recent.length ? (
        <div className="flex flex-col gap-1"><p className="text-xs text-muted-foreground">{$t('lighthouseCard.pagesChecked')}</p>
          <ul className="divide-y rounded-lg border text-sm">{recent.map((x) => <li key={x.id}><button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/50" onClick={() => open(x.id)}><span className="min-w-0 truncate">{x.url}<span className="ml-2 text-xs text-muted-foreground">{x.strategy === "mobile" ? $t('lighthouseCard.mobile') : $t('lighthouseCard.computer')}</span></span><span className="flex items-center gap-2 text-xs text-muted-foreground">{x.scores ? <Tag tone={tone(x.scores.performance)}>{$tj('lighthouseCard.performanceValue',{0:x.scores.performance ?? "—"})}</Tag> : <span>{x.status === "unknown" ? $t('common.resultUncertain') : $t('common.noResults')}</span>}{new Date(x.createdAt).toLocaleDateString(getCurrentLocale())}</span></button></li>)}</ul>
        </div>
      ) : null}
    </Card>
  );
}
