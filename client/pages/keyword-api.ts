import { getCurrentLocale, $t, translateDataForSeoReason } from "#i18n";
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {useLocation,useNavigate} from 'react-router';
import {currentProjectId} from './current-project';
import {countryName,languageName,marketName,type KeywordMarket} from '../../shared/keyword-markets.js';
export const keywordRequest=<T,>(action:string,body:object={},headers?:Record<string,string>)=>api.action<T>('nrKeywords',action,{method:'POST',body:{projectId:String(currentProjectId()),...body},headers,unwrap:'data'});
export type KeywordConnectionState={configured:boolean;verifiedAt:string|null;monthlyBudgetUsd:number};
export type Spend={monthUsd:number;totalUsd:number;budgetUsd:number;monthRuns:number;totalRuns:number;uncertain:number};
// Research ways offered on 关键词研究 (OpenSEO's keyword sources; its blended "auto" mode costs two queries and is left out).
export const getResearchViews = () => ({suggestions:$t('keyword.containsTerm'),related:$t('keyword.relatedSearches'),ideas:$t('keyword.similarTopics')} as const);
export type ResearchView=keyof ReturnType<typeof getResearchViews>|'serp';
// Market = country or region + language. Find keywords, AI suggestions and a keyword's overview pick from every market
// DataForSEO has keyword data for (shared/keyword-markets.ts); the other keyword pages keep these ten, as the server's
// keyword policy allows them.
const PAGE_MARKETS: KeywordMarket[] = [
 {locationCode:2840,language:'en'},{locationCode:2826,language:'en'},{locationCode:2124,language:'en'},{locationCode:2036,language:'en'},{locationCode:2702,language:'en'},
 {locationCode:2276,language:'de'},{locationCode:2250,language:'fr'},{locationCode:2392,language:'ja'},{locationCode:2158,language:'zh-TW'},{locationCode:2344,language:'zh-TW'}];
export const getMarkets = (): {locationCode:number;language:string;label:string}[] => PAGE_MARKETS.map((m)=>({...m,label:marketLabel(m)}));
// The product's own names for Taiwan and Hong Kong; every other country takes the reader's Intl name.
const PLACE_KEYS: Record<number,string> = {2158:'keywordMarket.taiwan',2344:'keywordMarket.hongKong'};
export const countryLabel=(locationCode:number)=>PLACE_KEYS[locationCode]?$t(PLACE_KEYS[locationCode]):countryName(locationCode,getCurrentLocale());
export const languageLabel=(language:string)=>languageName(language,getCurrentLocale());
export const marketLabel=(m?:KeywordMarket|null)=>m?marketName(m,getCurrentLocale(),(code)=>PLACE_KEYS[code]?$t(PLACE_KEYS[code]):undefined):'—';
export type KeywordItem={id:string;keyword:string;title?:string;volume:number|null;difficulty:number|null;cpc:number|null;competition?:number|null;intent:string|null;position:number|null;url:string;monthlySearches:{year:number;month:number;search_volume?:number|null;volume?:number|null}[]};
export type ResearchSpec={view:ResearchView;target:string;locationCode:number;language:string;limit:number;estimatedUsd:number;reservationUsd:number};
export type ResearchRun={id:number|string;status:string;spec:ResearchSpec;result?:{items:KeywordItem[];totalCount:number|null;providerTime?:string};costUsd:number|null;errorCode?:string;createdAt:string;completedAt?:string;reused?:boolean};
export type RecentRun={id:string;status:string;spec:ResearchSpec;createdAt:string;completedAt:string|null;errorCode:string|null;count:number|null};
export type Tag={id:string;name:string;color:string};
export type SavedKeyword={id:string;keyword:string;source:'dataforseo'|'gsc'|'ai';market:{locationCode:number;language:string}|null;metrics:{volume:number|null;difficulty:number|null;cpc:number|null;competition:number|null;intent:string|null;monthlySearches:KeywordItem['monthlySearches']}|null;retrievedAt:string|null;savedAt:string;tagIds:string[]};
export type SiteRank={position:number;clicks:number;impressions:number;page:string};
export type Ranks={connected:boolean;cutoff?:string|null;ranks:Record<string,SiteRank>};
export const rankRequest=(projectId:number|string,keywords:string[])=>api.action<Ranks>('nrDataViews','ranks',{method:'POST',body:{projectId:String(projectId),keywords},unwrap:'data'});
export const rankOf=(ranks:Ranks|undefined,keyword:string)=>ranks?.ranks?.[keyword.toLowerCase().trim()];
// A month's search volume: research runs keep DataForSEO's search_volume, keywords saved from AI 建议 and the keyword
// overview keep volume (the 12-month chart was empty for them until 2026-10-15).
export const monthVolume=(m:KeywordItem['monthlySearches'][number])=>m.search_volume??m.volume??null;
// A most possible cost, rounded up to the cent so it never reads lower than it can be (Keywords › AI suggestions).
export const usdUpTo=(n:number)=>(Math.ceil(Number((n*100).toFixed(6)))/100).toFixed(2);
export const metric=(v:number|null|undefined)=>v==null?'—':new Intl.NumberFormat(getCurrentLocale(),{maximumFractionDigits:3}).format(v);
// 关键词 详情 opens over the tab it is opened from (/keywords/detail), keeping that tab's query; these are its own
// parameters, named apart from 找新词's loc and lang, and the way back removes only them.
export const DETAIL_PARAMS=['kw','kwLoc','kwLang'] as const;
export const detailSearch=(search:string,keyword:string,market?:{locationCode:number;language:string}|null)=>{const p=new URLSearchParams(search),m=market??getMarkets()[0];p.set('kw',keyword);p.set('kwLoc',String(m.locationCode));p.set('kwLang',m.language);return `?${p}`;};
export function useOpenKeyword(){const navigate=useNavigate(),location=useLocation();return (keyword:string,market?:{locationCode:number;language:string}|null)=>{void navigate({pathname:'/keywords/detail',search:detailSearch(location.search,keyword,market)});};}

/** A Find keywords row merged from several runs: the keyword as the first way found it, every way that found it, and where each one keeps it. */
export type ResearchRow = KeywordItem & { views: ResearchView[]; refs: { runId: string; itemId: string }[] };
export function mergeRuns(runs: ResearchRun[]): ResearchRow[] {
  const rows = new Map<string, ResearchRow>();
  for (const run of runs) {
    if (run.status !== "completed") continue;
    const view = run.spec.view;
    for (const item of run.result?.items ?? []) {
      const key = item.keyword.trim().toLowerCase(), ref = { runId: String(run.id), itemId: item.id }, row = rows.get(key);
      if (!row) rows.set(key, { ...item, id: key, views: [view], refs: [ref] });
      else { if (!row.views.includes(view)) row.views.push(view); row.refs.push(ref); }
    }
  }
  return [...rows.values()];
}

// Why a lookup did not complete: a provider status or a malformed reply is stored as a code, anything else as a system sentence.
export const researchRunError = (code?: string | null) =>
  !code ? $t('common.notRunSameLookupAgain')
  : code.startsWith('provider_status_') ? $t('dataforseo.thirdPartyRequestFailedCheck')
  : /^[a-z][a-z0-9_]*$/.test(code) ? $t('common.lookupNotCompleteTryAgain')
  : translateDataForSeoReason(code);
