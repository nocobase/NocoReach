import { getCurrentLocale, $t } from "#i18n";
// GitHub page · 仓库结构与社区构成 (languages, topics, contributors, issue labels, releases and their files, each on its own
// tab) and 增长与社区效率 (ratios worth watching, with the period before), after the first NocoReach's GitHub page.
import { useState } from "react";
import { Card } from "#components/ui/card";
import { InfoTip } from "#components/reach/info-tip";
import { Tag } from "#components/reach/tag";
import { safeLink } from "../analytics";
import { Segmented } from "./trends";
import { bytes, change, hours, num, pct, type Figures, type View } from "./model";

const Empty = ({ children }: { children: React.ReactNode }) => <p className="px-4 py-6 text-sm text-muted-foreground">{children}</p>;
const Line = ({ name, value, sub, href }: { name: React.ReactNode; value: React.ReactNode; sub?: React.ReactNode; href?: string | null }) => (
  <li className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-0">
    <span className="min-w-0 flex-1 truncate">{href && safeLink(href) ? <a className="nr-link" href={safeLink(href)!} target="_blank" rel="noreferrer">{name}</a> : name}{sub ? <span className="ml-2 text-xs text-muted-foreground">{sub}</span> : null}</span>
    <span className="shrink-0 tabular-nums text-muted-foreground">{value}</span>
  </li>
);

export function CompositionCard({ view }: { view: View }) {
  const c = view.composition!;
  const [tab, setTab] = useState("languages");
  const tabs = [{ id: "languages", label: $t('dataGithub.languages') }, { id: "topics", label: "Topics" }, { id: "contributors", label: $t('dataGithub.contributors') }, { id: "labels", label: $t('dataGithub.issueLabels') }, { id: "releases", label: "Releases" }, { id: "assets", label: $t('dataGithub.assets') }];
  const date = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString(getCurrentLocale(), { timeZone: "UTC" }) : "—");
  return (
    <Card className="gap-0 py-0" data-composition="">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-1"><h2 className="text-sm font-semibold">{$t('dataGithub.composition')}</h2><InfoTip label={$t('common.aboutData')}>{$t('dataGithub.compositionInfo')}</InfoTip></div>
        <div className="ml-auto"><Segmented label={$t('dataGithub.composition')} options={tabs} value={tab} onChange={setTab} /></div>
      </div>
      {tab === "languages" ? (c.languages.length ? <ul>{c.languages.slice(0, 12).map((l) => <Line key={l.name} name={l.name} value={`${pct(l.share)} · ${bytes(l.bytes)}`} />)}</ul> : <Empty>{$t('dataGithub.shownAfterNextSync')}</Empty>)
        : tab === "topics" ? (c.topics.length ? <div className="flex flex-wrap gap-2 px-4 py-3">{c.topics.map((t) => <Tag key={t} tone="blue">{t}</Tag>)}</div> : <Empty>{$t('dataGithub.noTopics')}</Empty>)
        : tab === "contributors" ? (c.contributors.length ? <ul>{c.contributors.map((x) => <Line key={x.login} name={x.login} href={x.url} sub={x.external === null ? undefined : x.external ? <Tag tone="orange">{$t('dataGithub.outside')}</Tag> : <Tag tone="slate">{$t('dataGithub.team')}</Tag>} value={$t('dataGithub.commitsCount', { 0: num(x.contributions) })} />)}</ul> : <Empty>{$t('dataGithub.shownAfterNextSync')}</Empty>)
        : tab === "labels" ? (c.labels.length ? <ul>{c.labels.map((l) => <Line key={l.name} name={l.name} value={num(l.count)} />)}</ul> : <Empty>{$t('dataGithub.noLabels')}</Empty>)
        : tab === "releases" ? (c.releases.length ? <ul>{c.releases.map((r) => <Line key={r.tag} name={r.name || r.tag} href={r.url} sub={r.prerelease ? <Tag tone="grey">{$t('dataGithub.prerelease')}</Tag> : r.name && r.name !== r.tag ? r.tag : undefined} value={`${date(r.date)}${r.downloads != null ? ` · ${$t('dataGithub.downloadsCount', { 0: num(r.downloads) })}` : ""}`} />)}</ul> : <Empty>{$t('dataGithub.noReleases')}</Empty>)
        : (c.assets.length ? <ul>{c.assets.map((a) => <Line key={`${a.release}/${a.name}`} name={a.name} sub={a.release} value={`${$t('dataGithub.downloadsCount', { 0: num(a.downloads) })} · ${bytes(a.size)}`} />)}</ul> : <Empty>{$t('dataGithub.noAssets')}</Empty>)}
    </Card>
  );
}

// A ratio of the period and the same ratio of the period before.
export function EfficiencyCard({ view }: { view: View }) {
  const f = view.figures!, p = view.previous ?? null, t = view.totals!;
  const of = (x: Figures | null, k: (x: Figures) => number | null) => (x ? k(x) : null);
  const ratio = (a: number | null, b: number | null) => (a != null && b ? a / b : null);
  const rows: { label: string; now: number | null; before: number | null; show: (v: number | null) => string; help?: string }[] = [
    { label: $t('dataGithub.viewsPerVisitor'), now: of(f, (x) => ratio(x.views, x.uniques)), before: of(p, (x) => ratio(x.views, x.uniques)), show: (v) => num(v, 2) },
    { label: $t('dataGithub.clonesPerCloner'), now: of(f, (x) => ratio(x.clones, x.cloners)), before: of(p, (x) => ratio(x.clones, x.cloners)), show: (v) => num(v, 2) },
    { label: $t('dataGithub.externalPrShare'), now: of(f, (x) => ratio(x.externalPrsOpened, x.prsOpened)), before: of(p, (x) => ratio(x.externalPrsOpened, x.prsOpened)), show: pct },
    { label: $t('dataGithub.externalCommitShare'), now: of(f, (x) => ratio(x.externalCommits, x.commits)), before: of(p, (x) => ratio(x.externalCommits, x.commits)), show: pct },
    { label: $t('dataGithub.externalPrMergeRate'), now: of(f, (x) => ratio(x.externalPrsMerged, x.externalPrsClosed)), before: of(p, (x) => ratio(x.externalPrsMerged, x.externalPrsClosed)), show: pct },
    { label: $t('dataGithub.prMergeMedian'), now: f.prMergeHours, before: p?.prMergeHours ?? null, show: hours },
    { label: $t('dataGithub.issueCloseMedian'), now: f.issueCloseHours, before: p?.issueCloseHours ?? null, show: hours },
  ];
  return (
    <Card className="gap-0 py-0" data-efficiency="">
      <div className="flex items-center gap-1 border-b border-border px-4 py-3"><h2 className="text-sm font-semibold">{$t('dataGithub.efficiency')}</h2><InfoTip label={$t('common.aboutData')}>{$t('dataGithub.efficiencyInfo')}</InfoTip></div>
      <ul>
        {rows.map((r) => { const c = change(r.now, r.before); return <Line key={r.label} name={r.label} sub={r.before != null ? $t('dataGithub.previousValue', { 0: r.show(r.before) }) : undefined} value={<>{r.show(r.now)}{c != null ? <span className={`ml-1.5 text-xs ${c >= 0 ? "nr-up" : "nr-down"}`}>{c > 0 ? "▲" : c < 0 ? "▼" : ""}{Math.abs(Math.round(c * 1000) / 10)}%</span> : null}</>} />; })}
        <Line name={$t('dataGithub.openIssuesPrs')} value={`${num(t.openIssues)} / ${num(t.openPrs)}`} />
        <Line name="Watchers" value={num(t.watchers)} />
      </ul>
    </Card>
  );
}
