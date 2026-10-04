// 竞品 (搜索): 动态 — what the listed competitors published this week (free, weekly) — and 查域名, any site's ranking
// keywords and pages through DataForSEO (paid, on request).
import { useState } from "react";
import { useSearchParams } from "react-router";
import { PageContainer, PageHeader } from "@/components/reach/page";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProject } from "./reach-data";
import { CompetitorWatchTab } from "./competitor-watch";
import DomainOverview from "./domain-overview";

export default function CompetitorsPage() {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  // A link with a looked-up domain opens 查域名; the tab stays while 查域名 rewrites its own query.
  const [tab, setTab] = useState(params.get("view") === "lookup" || params.has("d") || params.has("k") ? "lookup" : "watch");
  const choose = (v: string) => { setTab(v); const p = new URLSearchParams(params); if (v === "lookup") p.set("view", "lookup"); else p.delete("view"); setParams(p, { replace: true }); };
  return (
    <PageContainer className="nr-data-page">
      <PageHeader title="竞品" description={tab === "watch" ? "竞品的官网新页面和 GitHub 新版本，每周看一次，免费。" : "查任何网站（包括竞品）在 Google 里排名的关键词和热门页面。DataForSEO 的市场估算，不是本站数据。"} />
      <Tabs value={tab} onValueChange={(v) => choose(String(v))}>
        <TabsList variant="line" className="h-auto! justify-start">
          <TabsTrigger value="watch">动态</TabsTrigger>
          <TabsTrigger value="lookup">查域名</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "lookup" ? <DomainOverview embedded /> : project ? <CompetitorWatchTab projectId={project.id} /> : null}
    </PageContainer>
  );
}
