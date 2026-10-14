import { $t, isChinese } from "@/i18n";
// 访问 · 今天 (2026-10-14 user request): GA4's last 30 minutes (实时) and today so far against yesterday and the same
// weekday last week, up to the same hour, per hour, with today's sources. Read from GA4 while the page is open:
// 实时 every minute, 今天 every ten minutes, paused while the tab is hidden. GA4's realtime API has no source, so
// where visitors come from is today's standard data, which lags; the ⓘ says so.
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChevronRight } from "lucide-react";
import { nocobaseClient as api } from "@/lib/nocoreach-api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/reach/info-tip";
import { InlineError } from "@/components/reach/states";
import { Tag } from "@/components/reach/tag";
import { cn } from "@/lib/utils";
import { DetailDrawer } from "../detail-drawer";
import { change, deviceName, regionName, type Realtime, type Today } from "./model";

// Asks again every `every` ms while the tab is visible, and at once when it becomes visible; keeps the last answer when
// a later one fails.
function usePolled<T>(key: string | null, fetcher: () => Promise<T>, every: number): { data?: T; error?: unknown } {
  const [state, setState] = useState<{ key: string | null; data?: T; error?: unknown }>({ key });
  const fetch = useRef(fetcher);
  fetch.current = fetcher;
  useEffect(() => {
    if (!key) return;
    let alive = true;
    setState({ key });
    const run = () => fetch.current().then((data) => alive && setState({ key, data }), (error) => alive && setState((s) => ({ ...s, key, error })));
    run();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") run(); }, every);
    const onVisible = () => { if (document.visibilityState === "visible") run(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [key, every]);
  return state.key === key ? state : {};
}

const n = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString());
const message = (e: unknown) => (e instanceof Error ? e.message : $t("请稍后再试"));
function Delta({ now, before, label }: { now: number | null | undefined; before: number | null | undefined; label: string }) {
  const c = change(now ?? null, before ?? null);
  return (
    <p className="flex items-baseline justify-between gap-2 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="tabular-nums">
        {n(before)}
        {c !== null ? <span className={cn("ml-1.5", c >= 0 ? "nr-up" : "nr-down")}>{c > 0 ? "▲ " : c < 0 ? "▼ " : ""}{Math.abs(Math.round(c * 1000) / 10)}%</span> : null}
      </span>
    </p>
  );
}

export function TodayCard({ projectId }: { projectId?: number }) {
  const [open, setOpen] = useState(false);
  const today = usePolled<Today>(projectId ? `today:${projectId}` : null, () => api.action<Today>("nrDataViews", "websiteToday", { method: "POST", body: { projectId }, unwrap: "data" }), 10 * 60000);
  const live = usePolled<Realtime>(projectId ? `live:${projectId}` : null, () => api.action<Realtime>("nrDataViews", "websiteRealtime", { method: "POST", body: { projectId }, unwrap: "data" }), 60000);
  const t = today.data?.connected ? today.data : null;
  const r = live.data?.connected ? live.data : null;
  if (today.data?.connected === false) return null;
  const weekday = t ? new Date(`${t.lastWeekDate}T00:00:00Z`).toLocaleDateString(isChinese() ? "zh-CN" : "en", { weekday: "short", timeZone: "UTC" }) : "";
  const through = t ? `${String(t.through).padStart(2, "0")}:00` : "";
  return (
    <Card className="gap-3 px-4" data-today-card="">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{$t("今天")}</h2>
        {t ? <span className="text-xs text-muted-foreground">{t.through ? $t("截至 {0} · {1} · 每 10 分钟更新", { 0: through, 1: t.timeZone }) : $t("GA4 还没处理出今天的数据 · {0}", { 0: t.timeZone })}</span> : null}
        <InfoTip label={$t("今天的数字怎么算")}>
          <p>{$t("和昨天、上周同一天比的都是 0 点到同一个钟点，按 GA4 媒体资源的时区；GA4 处理数据有延迟，只比到它已经算出来的那个小时。")}</p>
          <p>{$t("实时是 GA4 过去 30 分钟的活跃用户，每分钟更新。GA4 的实时接口不提供访客来源，所以来源用的是今天的标准数据，最近一两个小时可能还没算进来。")}</p>
        </InfoTip>
      </div>
      {today.error && !t ? <InlineError>{$t("今天的数据没有读出来：{0}", { 0: $t(message(today.error)) })}</InlineError> : null}
      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)_16rem]">
        <div className="flex flex-col gap-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden="true" className={cn("size-1.5 rounded-full", r ? "bg-nr-ink-green" : "bg-muted-foreground")} />{$t("过去 30 分钟")}</p>
            <p className="text-2xl leading-tight font-semibold tabular-nums" data-realtime-users="">{r ? n(r.users) : live.error ? "—" : "…"}</p>
            {r ? <MinuteBars values={r.perMinute} /> : null}
            <Button variant="link" size="sm" className="h-auto px-0 text-xs" onClick={() => setOpen(true)} disabled={!r}>{$t("实时详情")}<ChevronRight data-icon="inline-end" /></Button>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">{$t("今天浏览量")}</p>
            <p className="text-2xl leading-tight font-semibold tabular-nums" data-today-views="">{t ? n(t.totals.today?.views ?? 0) : "…"}</p>
            {t?.through ? (
              <div className="mt-1 flex flex-col gap-0.5">
                <Delta label={$t("昨天同时段")} now={t.totals.today?.views} before={t.totals.yesterday?.views} />
                <Delta label={$t("上{0}同时段", { 0: weekday })} now={t.totals.today?.views} before={t.totals.lastWeek?.views} />
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">{$t("会话 {0} · 用户 {1} · 关键事件 {2}", { 0: n(t.totals.today?.sessions), 1: n(t.totals.today?.users), 2: n(t.totals.today?.keyEvents) })}</p>
              </div>
            ) : t ? <p className="text-xs text-muted-foreground">{$t("昨天全天 {0}", { 0: n(t.fullDay.yesterday) })}</p> : null}
          </div>
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground">{$t("每小时浏览量")}</p>
          {t ? <HourChart today={t} weekday={weekday} /> : <div className="h-44" />}
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-xs text-muted-foreground">{$t("今天的来源（会话）")}</p>
          {t?.sources.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {t.sources.slice(0, 8).map((s) => (
                <li key={`${s.source}|${s.medium}`} className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5"><span className="truncate" title={`${s.source} / ${s.medium}`}>{s.source}<span className="text-muted-foreground"> / {s.medium || "—"}</span></span>{s.ai ? <Tag tone="violet">{s.ai}</Tag> : null}</span>
                  <span className="tabular-nums">{n(s.sessions)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{t ? $t("GA4 还没算出今天的来源") : "…"}</p>}
        </div>
      </div>
      {open && r ? <RealtimeDrawer live={r} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function MinuteBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  return (
    <div className="mt-1 flex h-6 items-end gap-px" role="img" aria-label={$t("过去 30 分钟每分钟的活跃用户")}>
      {values.map((v, i) => <span key={i} className="flex-1 rounded-[1px] bg-primary/70" style={{ height: `${Math.max(v ? 8 : 2, (v / max) * 100)}%` }} />)}
    </div>
  );
}

function HourChart({ today, weekday }: { today: Today; weekday: string }) {
  const data = today.hours.map((h) => ({ hour: `${String(h.hour).padStart(2, "0")}:00`, today: h.today, yesterday: h.yesterday, lastWeek: h.lastWeek }));
  return (
    <div className="nr-chart-box" data-hour-chart="">
      <ResponsiveContainer width="100%" height={176}>
        <LineChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="hour" interval={5} fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} width={44} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line isAnimationActive={false} type="linear" dataKey="today" name={$t("今天")} stroke="var(--chart-3)" strokeWidth={2} dot={false} connectNulls={false} />
          <Line isAnimationActive={false} type="linear" dataKey="yesterday" name={$t("昨天")} stroke="var(--muted-foreground)" dot={false} />
          <Line isAnimationActive={false} type="linear" dataKey="lastWeek" name={$t("上{0}", { 0: weekday })} stroke="var(--muted-foreground)" strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function List({ title, rows }: { title: string; rows: { key: string; name: string; value: number; sub?: string }[] }) {
  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold">{title}</h3>
      {rows.length ? (
        <ul className="flex flex-col text-sm">
          {rows.map((r) => <li key={r.key} className="flex items-center justify-between gap-3 border-t border-border py-1.5"><span className="min-w-0 truncate" title={r.name}>{r.name}{r.sub ? <span className="text-muted-foreground"> · {r.sub}</span> : null}</span><span className="tabular-nums">{n(r.value)}</span></li>)}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{$t("过去 30 分钟没有")}</p>}
    </section>
  );
}

function RealtimeDrawer({ live, onClose }: { live: Realtime; onClose: () => void }) {
  const minutes = live.perMinute.map((users, i) => ({ minute: i === 29 ? $t("现在") : $t("{0} 分钟前", { 0: 29 - i }), users }));
  const at = new Date(live.fetchedAt).toLocaleTimeString(isChinese() ? "zh-CN" : "en", { hour: "2-digit", minute: "2-digit" });
  return (
    <DetailDrawer open onClose={onClose} title={$t("实时 · 过去 30 分钟")} description={$t("GA4 实时数据 · {0} 更新 · 每分钟刷新", { 0: at })}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {([["活跃用户", live.users], ["浏览量", live.views], ["事件数", live.eventCount], ["关键事件", live.keyEvents]] as const).map(([label, v]) => (
          <div key={label}><p className="text-xs text-muted-foreground">{$t(label)}</p><p className="text-xl font-semibold tabular-nums">{n(v)}</p></div>
        ))}
      </div>
      <div className="nr-chart-box mt-4">
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={minutes} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
            <XAxis dataKey="minute" hide />
            <YAxis allowDecimals={false} fontSize={11} width={32} />
            <Tooltip />
            <Bar isAnimationActive={false} dataKey="users" name={$t("活跃用户")} fill="var(--chart-3)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-col gap-5">
        <List title={$t("正在看的页面")} rows={live.pages.map((p) => ({ key: p.title, name: p.title || $t("（没有标题）"), value: p.users, sub: $t("浏览 {0}", { 0: n(p.views) }) }))} />
        <div className="grid gap-5 sm:grid-cols-2">
          <List title={$t("国家/地区")} rows={live.countries.map((c) => ({ key: c.id || c.name, name: regionName(c.id, c.name), value: c.users }))} />
          <List title={$t("城市")} rows={live.cities.map((c) => ({ key: `${c.name}|${c.countryId}`, name: c.name, sub: regionName(c.countryId, ""), value: c.users }))} />
          <List title={$t("设备")} rows={live.devices.map((d) => ({ key: d.name, name: deviceName(d.name), value: d.users }))} />
          <List title={$t("事件")} rows={live.events.map((e) => ({ key: e.name, name: e.name, value: e.count }))} />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">{$t("GA4 的实时接口不提供访客从哪来；来源看「今天」里的「今天的来源」，有一两个小时的延迟。")}</p>
    </DetailDrawer>
  );
}
