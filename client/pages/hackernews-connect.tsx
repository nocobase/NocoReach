import { formatDateTime } from '#lib/format';
import { useBusinessAccess } from '#hooks/use-business-access';
import {ConnectionError,NetworkSettingsLink} from '#components/connection-error';
import { translateSourceError, useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
import {InfoTip,WithInfo} from '#components/reach/info-tip';
// Hacker News 提及 (SPEC §11 外部讨论): exact-phrase search on the public HN search; read the last 30 days, then confirm.
export type HackerNewsStatus={connected:boolean;syncing?:boolean;terms?:string[];lastSync?:{at:string;ok:boolean;errors:string[]}|null;retainedFrom?:string|null;total?:number;last30?:number;stories30?:number;top?:{title:string;points:number;comments:number;hnUrl:string;createdAt:string}[]};
type Preview={terms:string[];last30:number;stories:number;recent:{title:string;type:string;hnUrl:string;createdAt:string}[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrHackerNews',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function HackerNewsConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const {can:canPreview}=useBusinessAccess('nrHackerNews.preview',projectId);
 const {can:canConnect}=useBusinessAccess('nrHackerNews.connect',projectId);
 const {can:canSync}=useBusinessAccess('nrHackerNews.sync',projectId);
 const {can:canDisconnect}=useBusinessAccess('nrHackerNews.disconnect',projectId);
 const [status,setStatus]=useState<HackerNewsStatus>(),[terms,setTerms]=useState(suggested||''),[preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const load=()=>call<HackerNewsStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length)setTerms(t=>t||s.terms!.join(', '));});
 useEffect(()=>{void load().catch(()=>setError(() => ($t('hackernews.notLoadHackerNewsStatus'))));},[projectId]);
 useEffect(()=>{if(!status?.syncing&&!(status?.connected&&!status.lastSync))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},5000);return()=>clearInterval(t);},[status?.syncing,status?.lastSync,status?.connected]);
 async function run(fn:()=>Promise<HackerNewsStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailedRetry')));}finally{setBusy(false);}}
 if(!status)return error?<ConnectionError message={error}/>:<p role="status" className="nr-footnote">{$t('common.loadingLoading')}</p>;
 if(status.connected)return <div className="nr-guide-connected">{error&&<ConnectionError message={error}/>}<h3>{$tj('common.search',{0:status.terms!.join('、')})}</h3>
  {!status.lastSync?<p role="status">{$t('hackernews.readingMentionsPastYearUsually')}</p>:<><p>{$tj('hackernews.mentionsLast30DaysThem',{0:status.last30,1:status.stories30,2:status.retainedFrom?$t('common.recordingSince',{0:status.retainedFrom}):''})}</p>
  {!!status.top?.length&&<div><p className="nr-guide-subtitle">{$t('common.topScoringPosts')}</p>{status.top.slice(0,3).map(t=><p key={t.hnUrl} className="nr-footnote"><a className="nr-link" href={t.hnUrl} target="_blank" rel="noreferrer">{t.title}</a>  {$tj('hackernews.pointsComments',{0:t.points,1:t.comments,2:t.createdAt.slice(0,10)})}</p>)}</div>}
  <p className="nr-footnote">{$tj('common.lastSyncedSyncsAutomaticallyEvery',{0:formatDateTime(status.lastSync.at)})}{status.lastSync.errors.map(e=><span key={e} className="nr-block">{$tj('common.partlyNotUpdated',{0:translateSourceError(e)})}</span>)}<NetworkSettingsLink messages={status.lastSync.errors}/></p></>}
  <div className="nr-step-actions">{canSync&&<Button size="sm" variant="outline" disabled={busy||status.syncing} onClick={()=>void run(()=>call<HackerNewsStatus>(projectId,'sync'))}>{busy?$t('common.syncing'):$t('common.syncNow')}</Button>}{canDisconnect&&<Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t('hackernews.stopSearchingHackerNews')),description:() => ($t('hackernews.savedMentionsKept')),action:'common.stop'}))void run(()=>call<HackerNewsStatus>(projectId,'disconnect'));}}>{$t('common.disconnect')}</Button>}</div></div>;
 return <>{error&&<ConnectionError message={error}/>}
  {!canPreview&&!preview&&<p className='nr-footnote'>{$t('messages.notConnectedYet')}</p>}
  {canPreview&&<>
  <label className="nr-field"><WithInfo help={$t('hackernews.separateTermsCommasUp5')}>{$t('hackernews.productNameDomain')}</WithInfo><input aria-label={$t('hackernews.productNameDomain')} value={terms} disabled={busy} placeholder="nocobase, nocobase.com" onChange={e=>{setTerms(e.target.value);setPreview(undefined);}}/></label>
  <div className="nr-step-actions"><Button disabled={busy||!terms.trim()} onClick={()=>void run(async()=>{setPreview(await call<Preview>(projectId,'preview',{terms}));})}>{busy&&!preview?$t('hackernews.searching'):$t('hackernews.searchLast30Days')}</Button></div>
  </>}
  {preview&&<div className="nr-guide-preview"><p><strong>{$tj('hackernews.mentionsLast30Days',{0:preview.last30})}</strong>{$tj('hackernews.themPosts',{0:preview.stories})}<InfoTip className='ml-1'>{$t('hackernews.contentScoreCommentCountPosts')}</InfoTip></p>{preview.recent.map(r=><p key={r.hnUrl} className="nr-footnote"><a className="nr-link" href={r.hnUrl} target="_blank" rel="noreferrer">{r.title||$t('hackernews.comment')}</a> · {r.type==='story'?$t('common.posts'):$t('common.comments')} · {r.createdAt.slice(0,10)}</p>)}
   {!preview.last30&&<p className="nr-footnote">{$t('hackernews.nothingFoundLast30Days')}</p>}
   <div className="nr-step-actions">{canConnect&&<Button disabled={busy} onClick={()=>void run(()=>call<HackerNewsStatus>(projectId,'connect',{terms:preview.terms}))}>{$t('common.confirmConnect')}</Button>}</div></div>}</>;
}
