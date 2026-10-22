import { useBusinessAccess } from '#hooks/use-business-access';
import {ConnectionError,NetworkSettingsLink} from '#components/connection-error';
import { useMessageState, $t, $tj, $legacyText } from "#i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
import {WithInfo} from '#components/reach/info-tip';
import { RedditTiming, type RedditTimingState } from './reddit-timing';
// Reddit 讨论 (SPEC §11 外部讨论): Reddit threads found through a weekly Google search on DataForSEO, since Reddit's own API
// needs an approved, paid commercial agreement for brand monitoring.
export type RedditStatus=RedditTimingState & {connected:boolean;checking?:boolean;dataforseo?:boolean;terms?:string[];lastRun?:{at:string;ok:boolean;errors:string[];found?:number;added?:number}|null;retainedFrom?:string|null;total?:number;nextCheckAt?:string|null;recent?:{title:string;subreddit:string;url:string}[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrReddit',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function RedditConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const {can:canConnect}=useBusinessAccess('nrReddit.connect',projectId);
 const {can:canCheck}=useBusinessAccess('nrReddit.check',projectId);
 const {can:canDisconnect}=useBusinessAccess('nrReddit.disconnect',projectId);
 const [status,setStatus]=useState<RedditStatus>(),[terms,setTerms]=useState(suggested||''),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const load=()=>call<RedditStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length)setTerms(t=>t||s.terms!.join(', '));});
 useEffect(()=>{void load().catch(()=>setError(() => ($t('reddit.notLoadRedditStatus'))));},[projectId]);
 useEffect(()=>{if(!status?.checking&&!(status?.connected&&!status.lastRun))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.checking,status?.lastRun,status?.connected]);
 async function run(fn:()=>Promise<RedditStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailedRetry')));}finally{setBusy(false);}}
 if(!status)return error?<ConnectionError message={error}/>:<p role="status" className="nr-footnote">{$t('common.loadingLoading')}</p>;
 if(status.connected)return <div className="nr-guide-connected">{error&&<ConnectionError message={error}/>}<h3>{$tj('common.search',{0:status.terms!.join('、')})}</h3>
  {!status.lastRun?<p role="status">{$t('reddit.firstSearchProgressUsuallyFew')}</p>:<><p>{$tj('reddit.postsRecorded',{0:status.total,1:status.retainedFrom?$t('common.recordingSince',{0:status.retainedFrom}):'',2:status.lastRun.added?$t('reddit.newFoundLastTime',{0:status.lastRun.added}):''})}</p>
  {!!status.recent?.length&&<div><p className="nr-guide-subtitle">{$t('reddit.recentlyFoundPosts')}</p>{status.recent.slice(0,3).map(p=><p key={p.url} className="nr-footnote"><a className="nr-link" href={p.url} target="_blank" rel="noreferrer">{p.title}</a> · r/{p.subreddit}</p>)}</div>}
  <RedditTiming state={status}/>{!status.diagnostics?.length&&!!status.lastRun.errors.length&&<div className="nr-error" role="alert">{status.lastRun.errors.map(e=><p key={e}>{$tj('reddit.searchIncomplete',{0:$legacyText(e)})}</p>)}<NetworkSettingsLink messages={status.lastRun.errors}/></div>}</>}
  <div className="nr-step-actions">{canCheck&&<Button size="sm" variant="outline" disabled={busy||status.checking} onClick={()=>void run(()=>call<RedditStatus>(projectId,'check'))}>{busy?$t('common.searching'):$t('common.searchNow')}</Button>}{canDisconnect&&<Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t('reddit.stopSearchingRedditDiscussions')),description:() => ($t('reddit.recordedPostsKept')),action:'common.stop'}))void run(()=>call<RedditStatus>(projectId,'disconnect'));}}>{$t('common.stop')}</Button>}</div></div>;
 return <>{error&&<ConnectionError message={error}/>}
  {!canConnect&&status.dataforseo&&<p className='nr-footnote'>{$t('messages.notConnectedYet')}</p>}
  {!status.dataforseo?<p className="nr-footnote">{$t('reddit.redditDiscussionsSearchedGoogleThrough')}</p>:canConnect?<>
  <label className="nr-field"><WithInfo help={$t('reddit.searchTermsHelp')}>{$t('common.productName')}</WithInfo><input aria-label={$t('common.productName')} value={terms} disabled={busy} placeholder="NocoBase" onChange={e=>setTerms(e.target.value)}/></label>
  <div className="nr-step-actions"><Button disabled={busy||!terms.trim()} onClick={()=>void run(()=>call<RedditStatus>(projectId,'connect',{terms}))}>{busy?$t('common.connecting'):$t('common.connectStartSearching')}</Button></div></>:null}</>;
}
