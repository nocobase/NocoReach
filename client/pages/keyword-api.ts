import { getCurrentLocale, $t } from '#i18n';
import {nocobaseClient as api} from '#lib/nocoreach-api';
import {useLocation,useNavigate} from 'react-router';
import {currentProjectId} from './current-project';
export const keywordRequest=<T,>(action:string,body:object={},headers?:Record<string,string>)=>api.action<T>('nrKeywords',action,{method:'POST',body:{projectId:String(currentProjectId()),...body},headers,unwrap:'data'});
export type KeywordConnectionState={configured:boolean;verifiedAt:string|null;monthlyBudgetUsd:number};
export type Spend={monthUsd:number;totalUsd:number;budgetUsd:number;monthRuns:number;totalRuns:number;uncertain:number};
// Research ways offered on 关键词研究 (OpenSEO's keyword sources; its blended "auto" mode costs two queries and is left out).
export const getResearchViews = () => ({suggestions:$t('keyword.containsTerm'),related:$t('keyword.relatedSearches'),ideas:$t('keyword.similarTopics')} as const);
export type ResearchView=keyof ReturnType<typeof getResearchViews>|'serp';
// Market = country or region + language, as the server's keyword policy allows.
export const getMarkets = (): {locationCode:number;language:string;label:string}[] => ([
 {locationCode:2840,language:'en',label:$t('common.unitedStatesEnglish')},{locationCode:2826,language:'en',label:$t('keyword.unitedKingdomEnglish')},{locationCode:2124,language:'en',label:$t('keyword.canadaEnglish')},{locationCode:2036,language:'en',label:$t('keyword.australiaEnglish')},{locationCode:2702,language:'en',label:$t('keyword.singaporeEnglish')},
 {locationCode:2276,language:'de',label:$t('keyword.germanyGerman')},{locationCode:2250,language:'fr',label:$t('keyword.franceFrench')},{locationCode:2392,language:'ja',label:$t('keyword.japanJapanese')},{locationCode:2158,language:'zh-TW',label:$t('keyword.taiwanTraditionalChinese')},{locationCode:2344,language:'zh-TW',label:$t('keyword.hongKongTraditionalChinese')}]);
export const marketLabel=(m?:{locationCode:number;language:string}|null)=>m?getMarkets().find(x=>x.locationCode===m.locationCode&&x.language===m.language)?.label||`${m.locationCode} · ${m.language}`:'—';
export type KeywordItem={id:string;keyword:string;title?:string;volume:number|null;difficulty:number|null;cpc:number|null;competition?:number|null;intent:string|null;position:number|null;url:string;monthlySearches:{year:number;month:number;search_volume?:number|null;volume?:number|null}[]};
export type ResearchSpec={view:ResearchView;target:string;locationCode:number;language:string;limit:number;estimatedUsd:number;reservationUsd:number};
export type ResearchRun={id:number|string;status:string;spec:ResearchSpec;result?:{items:KeywordItem[];totalCount:number|null;providerTime?:string};costUsd:number|null;errorCode?:string;createdAt:string;completedAt?:string};
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
export const metric=(v:number|null|undefined)=>v==null?'—':new Intl.NumberFormat(getCurrentLocale(),{maximumFractionDigits:3}).format(v);
// 关键词 详情 opens over the tab it is opened from (/keywords/detail), keeping that tab's query; these are its own
// parameters, named apart from 找新词's loc and lang, and the way back removes only them.
export const DETAIL_PARAMS=['kw','kwLoc','kwLang'] as const;
export const detailSearch=(search:string,keyword:string,market?:{locationCode:number;language:string}|null)=>{const p=new URLSearchParams(search),m=market??getMarkets()[0];p.set('kw',keyword);p.set('kwLoc',String(m.locationCode));p.set('kwLang',m.language);return `?${p}`;};
export function useOpenKeyword(){const navigate=useNavigate(),location=useLocation();return (keyword:string,market?:{locationCode:number;language:string}|null)=>{void navigate({pathname:'/keywords/detail',search:detailSearch(location.search,keyword,market)});};}
