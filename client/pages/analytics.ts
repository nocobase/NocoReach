import { $t } from "#i18n";
export type Pair = {keyword:string;page:string;clicks:number|null;impressions:number|null;previous:number|null;previousImpressions:number|null;position:number|null};
export type Opportunity = {keyword:string;clicks:number;impressions:number;previous:number;position:number;pages:Pair[];kind:string;reason:string;recommendation:string};
export function opportunities(pairs:Pair[]):Opportunity[]{
 const groups=new Map<string,Pair[]>();
 for(const pair of pairs) groups.set(pair.keyword,[...(groups.get(pair.keyword)||[]),pair]);
 return [...groups.entries()].map(([keyword,pages])=>{
  const sum=(key:'clicks'|'impressions'|'previous')=>pages.reduce((s,p)=>s+(p[key]||0),0);
  const clicks=sum('clicks'),impressions=sum('impressions'),previous=sum('previous');
  const position=pages.reduce((s,p)=>s+(p.position||0)*(p.impressions||0),0)/(impressions||1);
  const active=pages.filter(p=>(p.impressions||0)>=100);
  let kind=$t('common.watch'),reason=$t('analytics.alreadySearchImpressionsUsefulTopic'),recommendation=$t('analytics.confirmSearchIntentFitsProduct');
  if(/noco\s*base/i.test(keyword)){reason=$t('analytics.brandQuerySeveralPagesMay');recommendation=$t('analytics.watchBrandDemandHowHomepage');}
  else if(previous>=10 && clicks<previous*.75){kind=$t('analytics.trafficDropped');reason=$t('analytics.clicksFellCheckFirst',{0:previous,1:clicks});recommendation=$t('analytics.checkRankingIndexingSeasonalityRecent');}
  else if(impressions>=200 && position>=4 && position<=20){kind=$t('analytics.rankingImproved');reason=$t('analytics.impressionsAveragePositionThereSome',{0:impressions,1:position.toFixed(1)});recommendation=$t('analytics.checkWhetherExistingPageFully');}
  else if(active.length>1){kind=$t('analytics.severalPagesCheck');reason=$t('analytics.leastUrlsGetImpressionsCheck',{0:active.length});recommendation=$t('analytics.separateLanguageRegionSearchIntent');}
  else if(impressions>=500 && clicks/impressions<.01){kind=$t('analytics.checkCtr');reason=$t('analytics.impressionsCtr',{0:impressions,1:(clicks/impressions*100).toFixed(2)});recommendation=$t('analytics.checkTitleSnippetAgainstRanking');}
  return {keyword,clicks,impressions,previous,position,pages,kind,reason,recommendation};
 }).sort((a,b)=>(a.kind===$t('common.watch')?1:0)-(b.kind===$t('common.watch')?1:0)||b.impressions-a.impressions);
}
export function delta(current:number,previous:number){return previous===0?(current===0?$t('common.flat'):$t('analytics.previousPeriod0')): `${current>=previous?'+':''}${((current/previous-1)*100).toFixed(1)}%`;}
export function safeLink(value:string){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}}
