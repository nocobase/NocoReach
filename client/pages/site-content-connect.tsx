import { useBusinessAccess } from '#hooks/use-business-access';
import { useWorkspaceCache } from './workspace-cache';
import { useMessageState, $t, $tj, $legacyText } from "#i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
export const getTypeLabels = (): Record<string,string> => ({blog:$t('siteContent.blog'),docs:$t('siteContent.docs'),page:$t('siteContent.otherPages')});
export type SiteEntry={origin:string;pages:number;types:Record<string,number>;confirmedAt?:string;warnings:string[]};
export type SiteSummary={pages:number;origin?:string;sites?:SiteEntry[];types?:Record<string,number>;enriched?:number};
type Discovery={origin:string;sitemaps:string[];types:Record<string,number>;warnings:string[];total:number;samples:Record<string,string[]>;previewId:string};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrSiteContent',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function SiteContentConnect({projectId,onChange}:{projectId:number;onChange:()=>void}){
 const cache=useWorkspaceCache();
 const changed=()=>{cache.invalidate(key=>['data-view:site-list','data-view:content-page','data-view:search-index','data-view:search-index-page','data-view:search-sitemaps','data-view:overview'].some(prefix=>key.startsWith(`${prefix}:${projectId}:`)));onChange();};
 const {can:canDiscover}=useBusinessAccess('nrSiteContent.discover',projectId);
 const {can:canConfirm}=useBusinessAccess('nrSiteContent.confirm',projectId);
 const {can:canRemove}=useBusinessAccess('nrSiteContent.remove',projectId);
 const [summary,setSummary]=useState<SiteSummary>(),[url,setUrl]=useState(''),[found,setFound]=useState<Discovery>(),[keep,setKeep]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useMessageState(''),[editing,setEditing]=useState(false);
 useEffect(()=>{void call<SiteSummary>(projectId,'summary').then(setSummary).catch(()=>setError(() => ($t('siteContent.notLoadWebsiteContentStatus'))));},[projectId, setError]);
 async function run(fn:()=>Promise<void>){setBusy(true);setError('');try{await fn();}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailedRetry')));}finally{setBusy(false);}}
 const sites=summary?.sites||[],connected=sites.length>0&&(!editing||!canDiscover);
 const describe=(t:Record<string,number>)=>Object.entries(t).map(([k,n])=>`${getTypeLabels()[k]||k} ${n}`).join('，');
 if(connected&&summary)return <><div className="nr-guide-connected"><h3>{$tj('siteContent.urlsConnectedPagesTotal',{0:sites.length,1:summary.pages})}</h3>{error&&<p className="nr-error" role="alert">{error}</p>}{sites.map(x=><div className="nr-guide-row" key={x.origin}><div><strong>{x.origin}</strong><p className="nr-footnote">{$tj('siteContent.pagesValue',{0:x.pages,1:describe(x.types)})}</p>{x.warnings.map(w=><p className="nr-footnote" key={w}>{$legacyText(w)}</p>)}</div>{canDiscover&&<Button size="sm" variant="outline" disabled={busy} onClick={()=>{setUrl(x.origin);setEditing(true);setFound(undefined);}}>{$t('common.reread')}</Button>}{canRemove&&<Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t('siteContent.remove',{0:x.origin})),description:() => ($t('siteContent.pagesRemovedTooExistingTasks')),action:'common.remove'}))void run(async()=>{setSummary(await call<SiteSummary>(projectId,'remove',{origin:x.origin}));changed();});}}>{$t('common.remove')}</Button>}</div>)}<p className="nr-footnote">{$tj('siteContent.titlesBodyInfoReadPages',{0:summary.enriched||0,1:summary.pages})}</p></div>
 <div className="nr-step-actions">{canDiscover&&<Button variant="outline" onClick={()=>{setUrl('');setEditing(true);setFound(undefined);}}>{$t('siteContent.addAnotherUrlLikeDocs')}</Button>}</div></>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  {!canDiscover&&!found&&<p className='nr-footnote'>{$t('messages.notConnectedYet')}</p>}
  {canDiscover&&<>
  <label className="nr-field">{$t('common.websiteUrl')}<input aria-label={$t('common.websiteUrl')} value={url} disabled={busy} placeholder="https://example.com" onChange={e=>{setUrl(e.target.value);setFound(undefined);}}/></label>
  <div className="nr-step-actions">{editing&&<Button variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>{$t('common.cancel')}</Button>}<Button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{const d=await call<Discovery>(projectId,'discover',{url});setFound(d);setKeep(Object.keys(d.types));})}>{busy&&!found?$t('siteContent.readingWebsite'):$t('siteContent.readWebsite')}</Button></div>
  </>}
  {found&&<div className="nr-guide-preview"><p>{$tj('siteContent.foundSitemaps',{0:found.sitemaps.length})} <strong>{found.total}</strong>  {$t('siteContent.pagesChooseTypesIncludeAnalysis')}</p>
   {Object.entries(found.types).map(([t,n])=><label key={t} className="nr-guide-type"><input type="checkbox" checked={keep.includes(t)} disabled={busy||!canConfirm} onChange={e=>setKeep(k=>e.target.checked?[...k,t]:k.filter(x=>x!==t))}/><span><strong>{getTypeLabels()[t]||t}</strong>  {$tj('siteContent.pagesMetaValue',{0:n})}<small>{found.samples[t]?.slice(0,3).map(u=>{try{return new URL(u).pathname;}catch{return u;}}).join('、')}</small></span></label>)}
   {found.warnings.map(w=><p className="nr-footnote" key={w}>{$legacyText(w)}</p>)}
   <p className="nr-footnote">{$t('siteContent.typesGuessedUrlPathsMay')}</p>
   <div className="nr-step-actions">{canConfirm&&<Button disabled={busy||!keep.length} onClick={()=>void run(async()=>{const s=await call<SiteSummary>(projectId,'confirm',{previewId:found.previewId,types:keep});setSummary(s);setFound(undefined);setEditing(false);changed();})}>{$t('common.confirmConnect')}</Button>}</div></div>}</>;
}
