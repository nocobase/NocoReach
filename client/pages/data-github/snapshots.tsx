import { $t } from "#i18n";
// GitHub page · 引荐站点 and 热门内容: GitHub gives the top ten of the last 14 days, so NocoReach saves one snapshot a
// day. 趋势 draws each item's 14-day total over the snapshot days (the eight largest now, the rest of the ten together);
// 最新快照 is the latest one as a table, its rows tickable for the Agent (看懂这些访问来源 / 写这些页面的内容).
import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "#components/ui/card";
import { InfoTip } from "#components/reach/info-tip";
import { AllCheck, RowCheck, useTickedList } from "#components/reach/hand-off-slot";
import { Tag, type Tone } from "#components/reach/tag";
import { githubTrafficDraft } from "../seo-hand-off";
import { Segmented } from "./trends";
import { num, pct, type PopularPath, type Referrer, type Snapshot } from "./model";

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "#7F77DD", "#D4537E", "#1D9E75", "var(--muted-foreground)"];
const KIND: Record<Referrer["kind"], { label: () => string; tone: Tone }> = {
  own: { label: () => $t('dataGithub.kindOwn'), tone: "blue" }, ai: { label: () => $t('dataGithub.kindAi'), tone: "violet" }, search: { label: () => $t('dataGithub.kindSearch'), tone: "green" },
  community: { label: () => $t('dataGithub.kindCommunity'), tone: "orange" }, content: { label: () => $t('dataGithub.kindContent'), tone: "amber" }, github: { label: () => "GitHub", tone: "slate" }, other: { label: () => $t('dataGithub.kindOther'), tone: "grey" },
};
const AREA: Record<string, () => string> = { home: () => $t('dataGithub.areaHome'), code: () => $t('dataGithub.areaCode'), releases: () => "Releases", issues: () => "Issues", pulls: () => "Pull requests", tags: () => "Tags", wiki: () => "Wiki", discussions: () => "Discussions", actions: () => "Actions", insights: () => "Insights" };

function Trend<T>({ snap, label }: { snap: Snapshot<T>; label: (key: string) => string }) {
  const data = snap.dates.map((d, i) => Object.fromEntries([["date", d], ...snap.series.map((s) => [s.key, s.values[i]])]));
  return (
    <div className="nr-chart-box h-[280px] px-4 py-3">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" minTickGap={28} fontSize={11} />
          <YAxis allowDecimals={false} fontSize={11} width={52} />
          <Tooltip formatter={(v) => num(Number(v))} labelFormatter={(d) => $t('dataGithub.fourteenDaysTo', { 0: d })} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {snap.series.map((s, i) => <Line key={s.key} isAnimationActive={false} type="linear" dataKey={s.key} name={s.key === "*others" ? $t('dataGithub.restOfTopTen') : label(s.key)} stroke={COLORS[s.key === "*others" ? 8 : i]} strokeWidth={2} dot={snap.dates.length < 3} connectNulls={false} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Frame({ title, info, view, onView, check, children, ...rest }: { title: string; info: string; view: string; onView: (v: string) => void; check?: React.ReactNode; children: React.ReactNode; [k: `data-${string}`]: unknown }) {
  return (
    <Card className="gap-0 py-0" {...rest}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        {check}<div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{title}</h2><InfoTip label={$t('common.howReadChart')}>{info}</InfoTip></div>
        <div className="ml-auto"><Segmented label={title} options={[{ id: "trend", label: $t('dataGithub.trend') }, { id: "latest", label: $t('dataGithub.latestSnapshot') }]} value={view} onChange={onView} /></div>
      </div>
      {children}
    </Card>
  );
}

export function ReferrersCard({ snap, repo, empty }: { snap: Snapshot<Referrer> | null | undefined; repo: string; empty: string }) {
  const [view, setView] = useState("trend");
  const items = snap?.latest.items;
  const selection = useTickedList("github-referrers", view === "latest" ? items : undefined, (r) => r.referrer, (ticked) => ({ playbookId: "change-research", description: $t('dataGithub.tickedReferringSitesBecomeOne'), draft: () => githubTrafficDraft(repo, "referrers", ticked.map((r) => ({ name: r.referrer, count: r.count, uniques: r.uniques }))) }));
  const names = new Map((items ?? []).map((r) => [r.referrer.toLowerCase(), r.referrer]));
  return (
    <Frame data-referrers="" title={$t('dataGithub.referringSites')} info={$t('dataGithub.snapshotInfo', { 0: snap ? `${snap.dates[0]} – ${snap.dates.at(-1)}` : "—" })} view={view} onView={setView}
      check={view === "latest" && items?.length ? <AllCheck selection={selection} count={items.length} /> : undefined}>
      {!snap ? <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p> : view === "trend" ? <Trend snap={snap} label={(k) => names.get(k) ?? k} /> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="w-10 py-2 pl-4" /><th className="py-2 font-medium">{$t('dataGithub.source')}</th><th className="py-2 font-medium">{$t('dataGithub.kind')}</th><th className="py-2 text-right font-medium">{$t('dataGithub.viewsUniques')}</th><th className="py-2 pr-4 text-right font-medium">{$t('dataGithub.shareOfTopTen')}</th></tr></thead>
          <tbody>{items!.map((r) => (
            <tr key={r.referrer} className="border-b border-border last:border-0" data-referrer={r.referrer}>
              <td className="py-2 pl-4"><RowCheck selection={selection} k={r.referrer} label={r.referrer} /></td>
              <td className="py-2">{r.referrer}</td><td className="py-2"><Tag tone={KIND[r.kind].tone}>{KIND[r.kind].label()}</Tag></td>
              <td className="py-2 text-right tabular-nums">{num(r.count)} / {num(r.uniques)}</td><td className="py-2 pr-4 text-right tabular-nums">{pct(r.share)}</td>
            </tr>))}</tbody>
        </table>
      )}
    </Frame>
  );
}

export function PathsCard({ snap, repo, empty }: { snap: Snapshot<PopularPath> | null | undefined; repo: string; empty: string }) {
  const [view, setView] = useState("trend");
  const items = snap?.latest.items;
  const selection = useTickedList("github-paths", view === "latest" ? items : undefined, (p) => p.path, (ticked) => ({ playbookId: "content-outline", description: $t('dataGithub.tickedPopularPagesBecomeOne'), draft: () => githubTrafficDraft(repo, "paths", ticked.map((p) => ({ name: `${p.title || p.path}（${p.path}）`, count: p.count, uniques: p.uniques }))) }));
  const short = (path: string) => path.replace(new RegExp(`^/${repo}`), "") || "/";
  return (
    <Frame data-paths="" title={$t('dataGithub.popularContent')} info={$t('dataGithub.snapshotInfo', { 0: snap ? `${snap.dates[0]} – ${snap.dates.at(-1)}` : "—" })} view={view} onView={setView}
      check={view === "latest" && items?.length ? <AllCheck selection={selection} count={items.length} /> : undefined}>
      {!snap ? <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p> : view === "trend" ? <Trend snap={snap} label={short} /> : (
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border text-left text-xs text-muted-foreground"><th className="w-10 py-2 pl-4" /><th className="py-2 font-medium">{$t('dataGithub.path')}</th><th className="py-2 font-medium">{$t('dataGithub.area')}</th><th className="py-2 text-right font-medium">{$t('dataGithub.viewsUniques')}</th><th className="py-2 pr-4 text-right font-medium">{$t('dataGithub.shareOfTopTen')}</th></tr></thead>
          <tbody>{items!.map((p) => (
            <tr key={p.path} className="border-b border-border last:border-0" data-path={p.path}>
              <td className="py-2 pl-4"><RowCheck selection={selection} k={p.path} label={p.title || p.path} /></td>
              <td className="max-w-md py-2"><span className="block truncate">{short(p.path)}</span>{p.title ? <span className="block truncate text-xs text-muted-foreground">{p.title}</span> : null}</td>
              <td className="py-2 text-muted-foreground">{(AREA[p.area] ?? (() => $t('dataGithub.kindOther')))()}</td>
              <td className="py-2 text-right tabular-nums">{num(p.count)} / {num(p.uniques)}</td><td className="py-2 pr-4 text-right tabular-nums">{pct(p.share)}</td>
            </tr>))}</tbody>
        </table>
      )}
    </Frame>
  );
}
