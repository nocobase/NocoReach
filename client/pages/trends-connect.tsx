import { useBusinessAccess } from '#hooks/use-business-access';
import {ConnectionError} from '#components/connection-error';
import { useMessageState, getCurrentLocale, $t, $tj, $legacyText } from "#i18n";
import {useEffect,useState} from 'react';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
// 趋势 (SPEC §11 市场需求): Google Trends through DataForSEO, once a week — the product and up to four competitors over
// 12 months, and the searches related to the product. Only the product name is typed here; the competitors come from 竞品.
export type TrendsStatus={connected:boolean;checking?:boolean;dataforseo?:boolean;product?:string;competitors?:{id:string;name:string;included:boolean}[];maxRivals?:number;terms?:string[];locationCode?:number;place?:string;locations:{code:number;name:string}[];lastRun?:{at:string;ok:boolean;errors:string[]}|null;checkedAt?:string|null;nextCheckAt?:string|null;summary?:{term:string;average:number|null;recent:number|null;change:number|null}[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrTrends',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function TrendsConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const {can:canConnect}=useBusinessAccess('nrTrends.connect',projectId);
 const {can:canCheck}=useBusinessAccess('nrTrends.check',projectId);
 const {can:canDisconnect}=useBusinessAccess('nrTrends.disconnect',projectId);
 const [status,setStatus]=useState<TrendsStatus>(),[product,setProduct]=useState(suggested||''),[place,setPlace]=useState(0),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useMessageState('');
 const load=()=>call<TrendsStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length){setProduct(s.product||s.terms[0]);setPlace(s.locationCode||0);}});
 useEffect(()=>{void load().catch(()=>setError(() => ($t('trends.notLoadTrendsStatus'))));},[projectId]);
 useEffect(()=>{if(!status?.checking&&!(status?.connected&&!status.lastRun))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.checking,status?.lastRun,status?.connected]);
 async function run(fn:()=>Promise<TrendsStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);setEditing(false);onChange();}}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('common.operationFailedRetry')));}finally{setBusy(false);}}
 if(!status)return error?<ConnectionError message={error}/>:<p role="status" className="nr-footnote">{$t('common.loadingLoading')}</p>;
 const rivals=(status.competitors||[]).filter(c=>c.included).map(c=>c.name);
 const form=<><label className="nr-field">{$t('common.productName')}<input aria-label={$t('common.productName')} value={product} disabled={busy} placeholder="NocoBase" onChange={e=>setProduct(e.target.value)}/></label>
  <label className="nr-field">{$t('trends.region')}<select aria-label={$t('trends.region')} value={place} disabled={busy} onChange={e=>setPlace(Number(e.target.value))}>{status.locations.map(l=><option key={l.code} value={l.code}>{$legacyText(l.name)}</option>)}</select></label>
  <p className="nr-footnote">{$tj('trends.competitorScheduleHelp',{0:rivals.length?rivals.join('、'):$t('trends.noneYet')})}</p></>;
 if(status.connected&&(!editing||!canConnect))return <div className="nr-guide-connected">{error&&<ConnectionError message={error}/>}<h3>{$tj('trends.compare',{0:status.terms!.join('、'),1:$legacyText(status.place||"")})}</h3>
  {!status.lastRun?<p role="status">{$t('trends.firstCheckProgressUsuallyHalf')}</p>:<>{status.summary?.length&&status.checkedAt?<p>{status.summary.map(x=>$t('trends.last4Weeks',{0:x.term,1:x.recent??'—'})).join(' · ')}</p>:null}
  <p className="nr-footnote">{$tj('trends.lastCheckedWeeklyAfter',{0:new Date(status.lastRun.at).toLocaleString(getCurrentLocale()),1:status.nextCheckAt?$t('common.nextAbout',{0:new Date(status.nextCheckAt).toLocaleDateString(getCurrentLocale())}):''})}{status.lastRun.errors.map(e=><span key={e} className="nr-block">{$tj('common.notFullyCheckedValue',{0:$legacyText(e)})}</span>)}</p></>}
  <div className="nr-step-actions">{canCheck&&<Button size="sm" variant="outline" disabled={busy||status.checking} onClick={()=>void run(()=>call<TrendsStatus>(projectId,'check'))}>{busy?$t('common.querying'):$t('common.queryNow')}</Button>}{canConnect&&<Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(true)}>{$t('trends.changeProductNameRegion')}</Button>}{canDisconnect&&<Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:() => ($t('trends.stopWeeklyTrendsCheck')),description:() => ($t('trends.dataAlreadyCheckedKept')),action:'common.stop'}))void run(()=>call<TrendsStatus>(projectId,'disconnect'));}}>{$t('common.stop')}</Button>}</div></div>;
 return <>{error&&<ConnectionError message={error}/>}
  {!canConnect&&status.dataforseo&&<p className='nr-footnote'>{$t('messages.notConnectedYet')}</p>}
  {!status.dataforseo?<p className="nr-footnote">{$t('trends.trendsUsesDataforseoCheckGoogle')}</p>:canConnect?<>{form}
  <div className="nr-step-actions"><Button disabled={busy||!product.trim()} onClick={()=>void run(()=>call<TrendsStatus>(projectId,'connect',{product,locationCode:place}))}>{busy?$t('common.connecting'):editing?$t('trends.saveCheckAgain'):$t('trends.connectStartChecking')}</Button>{editing&&<Button variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>{$t('common.cancel')}</Button>}</div></>:null}</>;
}
