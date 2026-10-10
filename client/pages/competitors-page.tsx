import { $t } from "#i18n";
// 竞品 (搜索): 总览 — our site and the competitors side by side (2026-10-05) —, 动态 — what the listed competitors published
// this week (free, weekly) — and 查域名, any site's ranking keywords and pages through DataForSEO (paid, on request).
import { useState } from "react";
import { useSearchParams } from "react-router";
import { PageContainer, PageHeader } from "#components/reach/page";
import { Tabs, TabsList, TabsTrigger } from "#components/ui/tabs";
import { useProject } from "./reach-data";
import { CompetitorWatchTab } from "./competitor-watch";
import { HandOffBar } from "./hand-off-bar";
import DomainOverview from "./domain-overview";
import { CompetitorOverview } from "./competitor-overview";

export default function CompetitorsPage() {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  // A link with a looked-up domain opens 查域名; ?view= keeps the tab; 总览 by default.
  const initial = params.get("view") === "lookup" || params.has("d") || params.has("k") ? "lookup" : params.get("view") === "watch" ? "watch" : "overview";
  const [tab, setTab] = useState(initial);
  const choose = (v: string) => { setTab(v); const p = new URLSearchParams(params); if (v === "overview") p.delete("view"); else p.set("view", v); setParams(p, { replace: true }); };
  const description = tab === "overview" ? $t("我们和竞品放在一起比：搜索流量、关键词、Google 关注度、GitHub Star、AI 提及和最近的动态。") : tab === "watch" ? $t("竞品的官网新页面和 GitHub 新版本，每周看一次，免费。") : $t("查任何网站（包括竞品）在 Google 里排名的关键词和热门页面。DataForSEO 的市场估算，点了查询才收费。");
  return (
    <PageContainer className="nr-data-page">
      <PageHeader title={$t("竞品",undefined,"title")} description={description} />
      <Tabs value={tab} onValueChange={(v) => choose(String(v))}>
        <TabsList variant="line" className="h-auto! justify-start">
          <TabsTrigger value="overview">{$t("总览")}</TabsTrigger>
          <TabsTrigger value="watch">{$t("动态")}</TabsTrigger>
          <TabsTrigger value="lookup">{$t("查域名")}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "lookup" ? <DomainOverview embedded /> : !project ? null : tab === "watch" ? <CompetitorWatchTab projectId={project.id} /> : <CompetitorOverview projectId={project.id} onManage={() => choose("watch")} />}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
