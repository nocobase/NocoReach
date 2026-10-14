import { $t } from "#i18n";
// GitHub page · 社区增长趋势 and 仓库流量趋势: one chart, the figures of the chosen group as lines, the period before dashed
// (not for 全部时间), and under it the chosen group's first figure: 日均, 较上期日均, 本期峰值, 近 7 日动量 — as the first
// NocoReach's GitHub page had them. The group is kept in the URL (communityView, trafficView).
import { useSearchParams } from "react-router";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "#components/ui/card";
import { InfoTip } from "#components/reach/info-tip";
import { cn } from "#lib/utils";
import { change, num, pct, stats, type Day, type Group } from "./model";

export function Segmented({ label, options, value, onChange }: { label: string; options: { id: string; label: string }[]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="inline-flex flex-wrap overflow-hidden rounded-md border" role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={o.id === value} onClick={() => onChange(o.id)} className={cn("inline-flex h-8 items-center px-3 text-sm text-muted-foreground transition-colors hover:text-foreground", o.id === value && "bg-muted font-medium text-foreground")}>{o.label}</button>)}
    </div>
  );
}

function Strip({ items }: { items: { label: string; value: string; detail?: string }[] }) {
  return (
    <div className="grid grid-cols-2 border-t border-border sm:grid-cols-4" data-stats="">
      {items.map((x) => <div key={x.label} className="min-w-0 border-border px-4 py-2.5 [&:not(:last-child)]:sm:border-r"><p className="text-xs text-muted-foreground">{x.label}</p><p className="text-sm font-semibold tabular-nums">{x.value}</p>{x.detail ? <p className="truncate text-xs text-muted-foreground">{x.detail}</p> : null}</div>)}
    </div>
  );
}

export function TrendCard({ title, info, param, groups, rows, previous, compare, empty }: { title: string; info: string; param: string; groups: Group[]; rows: Day[]; previous: Day[]; compare: boolean; empty: string }) {
  const [params, setParams] = useSearchParams();
  const group = groups.find((g) => g.id === params.get(param)) ?? groups[0];
  const choose = (id: string) => { const p = new URLSearchParams(params); if (id === groups[0].id) p.delete(param); else p.set(param, id); setParams(p, { replace: true }); };
  const has = group.series.some((s) => rows.some((r) => typeof r[s.key] === "number"));
  // The day before lines up with the same position in the period before.
  const data = rows.map((r, i) => Object.fromEntries([["date", r.date], ...group.series.flatMap((s) => [[s.key, r[s.key] ?? null], [`previous_${s.key}`, compare ? (previous[i]?.[s.key] ?? null) : null]])]));
  const main = group.series[0], s = stats(rows, previous, main.key, group.cumulative);
  const items = !s ? [] : group.cumulative
    ? [{ label: $t('dataGithub.atPeriodEnd'), value: num(s.end) }, { label: $t('dataGithub.grownInPeriod'), value: `${(s.grown ?? 0) >= 0 ? "+" : ""}${num(s.grown)}` }]
    : [
        { label: $t('dataGithub.dailyAverageOf', { 0: main.label() }), value: num(s.average, 2) },
        { label: $t('dataGithub.vsPreviousAverage'), value: compare ? pct(change(s.average, s.previousAverage)) : "—", detail: compare && s.previousAverage != null ? $t('dataGithub.previousValue', { 0: num(s.previousAverage, 2) }) : $t('dataGithub.noPreviousPeriod') },
        { label: $t('dataGithub.peakInPeriod'), value: num(s.peak), detail: s.peakDate ?? undefined },
        { label: $t('dataGithub.last7DaysMomentum'), value: pct(s.momentum), detail: $t('dataGithub.dailyAverageValue', { 0: num(s.recent, 2) }) },
      ];
  return (
    <Card className="gap-0 py-0" data-trend={param}>
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{title}</h2><InfoTip label={$t('common.howReadChart')}>{info}</InfoTip></div>
        <div className="ml-auto"><Segmented label={$t('dataGithub.figuresOf', { 0: title })} options={groups.map((g) => ({ id: g.id, label: g.label() }))} value={group.id} onChange={choose} /></div>
      </div>
      {has ? (
        <div className="nr-chart-box h-[300px] px-4 py-3">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ left: 0, right: 12, top: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" minTickGap={32} fontSize={11} />
              <YAxis allowDecimals={false} fontSize={11} width={52} />
              <Tooltip formatter={(v) => num(Number(v))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {group.series.map((x) => <Line key={x.key} isAnimationActive={false} type="linear" dataKey={x.key} name={x.label()} stroke={x.color} strokeWidth={2} dot={false} connectNulls={false} />)}
              {compare ? group.series.map((x) => <Line key={`previous_${x.key}`} isAnimationActive={false} type="linear" dataKey={`previous_${x.key}`} name={$t('dataGithub.previousOf', { 0: x.label() })} stroke={x.color} strokeOpacity={0.42} strokeWidth={1.5} strokeDasharray="5 4" dot={false} />) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="px-4 py-6 text-sm text-muted-foreground">{empty}</p>}
      {has && items.length ? <Strip items={items} /> : null}
    </Card>
  );
}
