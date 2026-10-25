import { formatDateTime } from '#lib/format';
import { useBusinessAccess } from '#hooks/use-business-access';
import {ConnectionError} from '#components/connection-error';
import { translateSourceError, useMessageState, getCurrentLocale, $t, $tj, $legacyText } from '#i18n';
import { useCallback,useEffect,useState} from 'react';
import {nocobaseClient as api} from '#lib/nocoreach-api';
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
import {WithInfo} from '#components/reach/info-tip';
// X 提及 (SPEC §11 外部讨论): the project's own X API Bearer Token (pay-per-use), read once a day within a monthly cap.
export type XStatus={connected:boolean;checking?:boolean;tokenSaved:boolean;terms?:string[];handle?:string;cap?:number;spend?:{usd:number;posts:number;requests:number};total?:number;lastRun?:{at:string;ok:boolean;errors:string[];added:number;capped:boolean}|null;nextCheckAt?:string|null};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrX',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function XConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const {can:canConnect}=useBusinessAccess('nrX.connect',projectId);
 const {can:canCheck}=useBusinessAccess('nrX.check',projectId);
 const {can:canDisconnect}=useBusinessAccess('nrX.disconnect',projectId);
 const [status,setStatus]=useState<XStatus>(),[form,setForm]=useState({token:'',terms:suggested||'',handle:'',cap:'5'}),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const load=useCallback(()=>call<XStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length)setForm(f=>({...f,terms:s.terms!.join(', '),handle:s.handle||'',cap:String(s.cap??5)}));}), [projectId]);
 useEffect(()=>{void load().catch(()=>setError(() => ($t('x.notLoadXStatus'))));},[load, projectId, setError]);
 useEffect(()=>{if(!status?.checking)return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[load, onChange, status?.checking]);
 async function run(fn:()=>Promise<XStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);setEditing(false);setForm(f=>({...f,token:''}));onChange();}}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailedRetry')));}finally{setBusy(false);}}
 if(!status)return error?<ConnectionError message={error}/>:<p role='status' className='nr-footnote'>{$t('common.loadingLoading')}</p>;
 if(status.connected&&(!editing||!canConnect)){const sp=status.spend!;return <div className='nr-guide-connected'>{error&&<ConnectionError message={error}/>}<h3>{$tj('x.search',{0:status.terms!.join('、'),1:status.handle?$t('common.excluding',{0:status.handle}):''})}</h3>
  <p>{$tj('x.aboutMonthCapReadSaved',{0:sp.usd.toFixed(2),1:status.cap,2:sp.posts.toLocaleString(getCurrentLocale()),3:status.total})}</p>
  {!status.lastRun?<p role='status'>{$t('x.firstSearchProgressLast7')}</p>:<p className='nr-footnote'>{$tj('x.lastSearchedDailyAfter',{0:formatDateTime(status.lastRun.at)})}{status.lastRun.capped?<span className='nr-block'>{$t('x.monthCapReachedReadingPaused')}</span>:null}{status.lastRun.errors.map(e=><span key={e} className='nr-block'>{$tj('common.notFullyCheckedValue',{0:translateSourceError(e)})}</span>)}</p>}
  <div className='nr-step-actions'>{canCheck&&<Button size='sm' variant='outline' disabled={busy||status.checking} onClick={()=>void run(()=>call<XStatus>(projectId,'check'))}>{busy?$t('common.searching'):$t('common.searchNow')}</Button>}{canConnect&&<Button size='sm' variant='ghost' disabled={busy} onClick={()=>setEditing(true)}>{$t('common.modify')}</Button>}{canDisconnect&&<Button size='sm' variant='ghost' disabled={busy} onClick={()=>{ void (async () => {if(await confirmAction({title:() => ($t('x.disconnectX')),description:() => ($t('x.savedTokenDeletedPostsAlready')),action:'common.disconnect'}))void run(()=>call<XStatus>(projectId,'disconnect'));})(); }}>{$t('common.disconnect')}</Button>}</div></div>;}
 return <>{error&&<ConnectionError message={error}/>}
  {!canConnect&&<p className='nr-footnote'>{$t('messages.notConnectedYet')}</p>}
  {canConnect&&<>
  <ol className='nr-footnote list-decimal pl-5'><li>{$t('x.xDeveloperPortalDeveloperX')}</li><li>{$t('x.copyBearerTokenAppKeys')}</li></ol>
  <label className='nr-field'>Bearer Token<input aria-label='Bearer Token' type='password' autoComplete='off' value={form.token} disabled={busy} placeholder={status.tokenSaved?$t('common.savedLeaveEmptyKeep'):'AAAAAAAAAAAAAAAAAAAAA…'} onChange={e=>setForm({...form,token:e.target.value})}/></label>
  <label className='nr-field'>{$t('common.searchTerm')}<input aria-label={$t('common.searchTerm')} value={form.terms} disabled={busy} placeholder='NocoBase, nocobase.com' onChange={e=>setForm({...form,terms:e.target.value})}/></label>
  <label className='nr-field'>{$t('x.officialAccountOptionalOwnPosts')}<input aria-label={$t('x.officialAccount')} value={form.handle} disabled={busy} placeholder='@NocoBase' onChange={e=>setForm({...form,handle:e.target.value})}/></label>
  <label className='nr-field'><WithInfo help={$t('x.scheduleAndBudgetHelp')}>{$t('x.monthlyCapUsd')}</WithInfo><input aria-label={$t('x.monthlyCap')} type='number' min={1} max={200} value={form.cap} disabled={busy} onChange={e=>setForm({...form,cap:e.target.value})}/></label>
  <div className='nr-step-actions'><Button disabled={busy||!form.terms.trim()||!(form.token.trim()||status.tokenSaved)} onClick={()=>void run(()=>call<XStatus>(projectId,'connect',{...form,cap:Number(form.cap)}))}>{busy?$t('x.checkingToken'):editing?$t('common.save'):$t('common.connectStartSearching')}</Button>{editing&&<Button variant='ghost' disabled={busy} onClick={()=>setEditing(false)}>{$t('common.cancel')}</Button>}</div></>}</>;
}
