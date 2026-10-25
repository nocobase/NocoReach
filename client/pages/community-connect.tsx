import { formatDateTime } from '#lib/format';
import { useBusinessAccess } from '#hooks/use-business-access';
import {ConnectionError,NetworkSettingsLink} from '#components/connection-error';
import { useMessageState, $t, $tj, $legacyText } from '#i18n';
import { useCallback,useEffect,useState} from 'react';
import {nocobaseClient as api} from '#lib/nocoreach-api';
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
import {InfoTip} from '#components/reach/info-tip';
export type CommunityStatus={connected:boolean;syncing?:boolean;origin?:string;title?:string;lastSync?:{at:string;ok:boolean;errors:string[]}|null;total?:number;unanswered?:number;solved?:number;categories?:{name:string;count:number}[];top?:{title:string;views:number;replies:number;solved:boolean;url:string}[]};
type Preview={origin:string;title:string;description:string;recent:string[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrCommunity',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function CommunityConnect({projectId,suggestedUrl,onChange}:{projectId:number;suggestedUrl?:string;onChange:()=>void}){
 const {can:canPreview}=useBusinessAccess('nrCommunity.preview',projectId);
 const {can:canConnect}=useBusinessAccess('nrCommunity.connect',projectId);
 const {can:canSync}=useBusinessAccess('nrCommunity.sync',projectId);
 const {can:canDisconnect}=useBusinessAccess('nrCommunity.disconnect',projectId);
 const [status,setStatus]=useState<CommunityStatus>(),[url,setUrl]=useState(suggestedUrl||''),[preview,setPreview]=useState<Preview>(),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const load=useCallback(()=>call<CommunityStatus>(projectId,'status').then(setStatus), [projectId]);
 useEffect(()=>{void load().catch(()=>setError(() => ($t('community.notLoadForumStatus'))));},[load, projectId, setError]);
 // The first sync runs in the background; poll until it has finished.
 useEffect(()=>{if(!status?.syncing&&!(status?.connected&&!status.lastSync))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},5000);return()=>clearInterval(t);},[status?.syncing, status?.lastSync, status?.connected, load, onChange]);
 async function run(fn:()=>Promise<CommunityStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailedRetry')));}finally{setBusy(false);}}
 if(!status)return error?<ConnectionError message={error}/>:<p role='status' className='nr-footnote'>{$t('common.loadingLoading')}</p>;
 if(status.connected)return <div className='nr-guide-connected'>{error&&<ConnectionError message={error}/>}<h3><a className='nr-link' href={status.origin} target='_blank' rel='noreferrer'>{status.title||status.origin}</a></h3>
  {!status.lastSync?<p role='status'>{$t('community.syncingPublicPostsLast90')}</p>:<><p>{$tj('community.last90DaysTopicsUnanswered',{0:status.total,1:status.unanswered,2:status.solved})}</p>
  {!!status.categories?.length&&<p className='nr-footnote'>{$tj('community.mainCategories',{0:status.categories.map(c=>`${c.name} ${c.count}`).join('、')})}</p>}
  {!!status.top?.length&&<div><p className='nr-guide-subtitle'>{$t('common.mostDiscussedTopics')}</p>{status.top.slice(0,3).map(t=><p key={t.url} className='nr-footnote'><a className='nr-link' href={t.url} target='_blank' rel='noreferrer'>{t.title}</a>  {$tj('community.viewsReplies',{0:t.views,1:t.replies,2:t.solved?$t('common.solved'):''})}</p>)}</div>}
  <p className='nr-footnote'>{$tj('common.lastSyncedSyncsAutomaticallyEvery',{0:formatDateTime(status.lastSync.at)})}{status.lastSync.errors.map(e=><span key={e} className='nr-block'>{$tj('common.partlyNotUpdated',{0:$legacyText(e)})}</span>)}<NetworkSettingsLink messages={status.lastSync.errors}/></p></>}
  <div className='nr-step-actions'>{canSync&&<Button size='sm' variant='outline' disabled={busy||status.syncing} onClick={()=>void run(()=>call<CommunityStatus>(projectId,'sync'))}>{busy?$t('common.syncing'):$t('common.syncNow')}</Button>}{canDisconnect&&<Button size='sm' variant='ghost' disabled={busy} onClick={()=>{ void (async () => {if(await confirmAction({title:() => ($t('community.stopSyncingForum')),description:() => ($t('community.dataAlreadyReadKept')),action:'community.stopSyncing'}))void run(()=>call<CommunityStatus>(projectId,'disconnect'));})(); }}>{$t('common.disconnect')}</Button>}</div></div>;
 return <>{error&&<ConnectionError message={error}/>}
  {!canPreview&&!preview&&<p className='nr-footnote'>{$t('messages.notConnectedYet')}</p>}
  {canPreview&&<>
  <label className='nr-field'>{$t('community.forumUrl')}<input aria-label={$t('community.forumUrl')} value={url} disabled={busy} placeholder='https://forum.example.com' onChange={e=>{setUrl(e.target.value);setPreview(undefined);}}/></label>
  <div className='nr-step-actions'><Button disabled={busy||!url.trim()} onClick={()=>void run(async()=>{setPreview(await call<Preview>(projectId,'preview',{url}));})}>{busy&&!preview?$t('community.detecting'):$t('community.readForum')}</Button></div>
  </>}
  {preview&&<div className='nr-guide-preview'><p><strong>{preview.title}</strong>  {$t('community.discourseForum')}<InfoTip className='ml-1'>{$t('community.readsPostContentEngagementPublic')}</InfoTip></p>{preview.description&&<p className='nr-footnote'>{preview.description}</p>}{!!preview.recent.length&&<p className='nr-footnote'>{$tj('community.latestTopics',{0:preview.recent.join('；')})}</p>}<div className='nr-step-actions'>{canConnect&&<Button disabled={busy} onClick={()=>void run(()=>call<CommunityStatus>(projectId,'connect',{url}))}>{$t('common.confirmConnect')}</Button>}</div></div>}</>;
}
