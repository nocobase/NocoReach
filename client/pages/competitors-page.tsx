import { $t } from '#i18n';
import { usePageTab } from '#hooks/use-page-tab';
// 竞品 (搜索): 总览 — our site and the competitors side by side (2026-10-05) —, 动态 — what the listed competitors published
// this week (free, weekly) — and 查域名, any site's ranking keywords and pages through DataForSEO (paid, on request).
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageContainer, PageHeader } from '#components/reach/page';
import { Tabs, TabsList, TabsTrigger } from '#components/ui/tabs';
import { useProject } from './reach-data';
import { CompetitorWatchTab } from './competitor-watch';
import { HandOffBar } from './hand-off-bar';
import DomainOverview from './domain-overview';
import { CompetitorOverview } from './competitor-overview';

export default function CompetitorsPage() {
  const { project } = useProject();
  const [params, setParams] = useSearchParams();
  // A link with a looked-up domain opens 查域名; ?view= keeps the tab; 总览 by default.
  const initial = params.get('view') === 'lookup' || params.has('d') || params.has('k') ? 'lookup' : params.get('view') === 'watch' ? 'watch' : 'overview';
  const [tab, setTab] = useState(initial);
  usePageTab($t(tab === 'lookup' ? 'competitorsPage.domainLookup' : tab === 'watch' ? 'common.activity' : 'competitorsPage.overview'));
  const choose = (v: string) => { setTab(v); const p = new URLSearchParams(params); if (v === 'overview') p.delete('view'); else p.set('view', v); setParams(p, { replace: true }); };
  // One description for the page and all its tabs (2026-10-22 decision D3): switching tabs does not change it.
  const description = $t('competitorsPage.pageSummary');
  return (
    <PageContainer className='nr-data-page'>
      <PageHeader title={$t('competitors.title',undefined)} description={description} />
      <Tabs value={tab} onValueChange={(v) => choose(String(v))}>
        <TabsList variant='line' className='h-auto! justify-start'>
          <TabsTrigger value='overview'>{$t('competitorsPage.overview')}</TabsTrigger>
          <TabsTrigger value='watch'>{$t('common.activity')}</TabsTrigger>
          <TabsTrigger value='lookup'>{$t('competitorsPage.domainLookup')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === 'lookup' ? <DomainOverview embedded /> : !project ? null : tab === 'watch' ? <CompetitorWatchTab projectId={project.id} /> : <CompetitorOverview projectId={project.id} onManage={() => choose('watch')} />}
      <HandOffBar projectId={project?.id} />
    </PageContainer>
  );
}
