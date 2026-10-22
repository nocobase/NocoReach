import { useMessageState, getCurrentLocale, translateSourceError, $t, $tj, $legacyText } from "#i18n";
import {useCallback,useEffect,useState} from 'react';
import {useBusinessAccess} from '#hooks/use-business-access';
import {Link,useNavigate} from 'react-router';
import {useCan} from '@nocobase/app-plugin-authorization/client';
import {timeZoneName} from '#lib/time-zone-name';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {confirmAction} from '#components/reach/confirm';
import {formatDateTime} from '#lib/format';
import {InfoTip} from '#components/reach/info-tip';
import {SourceLogo} from '#components/reach/source-logo';
import {help} from './glossary';
export type HealthText={key:string;params?:Record<string,string|number|HealthText|{systemError:string}>};
// A missing descriptor is legacy or user-authored content: preserve the original verbatim.
export function healthText(original:string|undefined,text?:HealthText):string{
 if(!text)return original||'';
 const params=Object.fromEntries(Object.entries(text.params||{}).map(([key,value])=>[key,typeof value==='object'?('systemError' in value?translateSourceError(value.systemError):healthText('',value)):value]));
 return $legacyText(text.key,params);
}
export type HealthItem={nameText?:HealthText;noteText?:HealthText;messageText?:HealthText;id:string;name:string;state:'healthy'|'warning'|'failing'|'pending';message:string;lastSuccessAt:string|null;dataThrough:string|null;nextSyncAt:string|null;note?:string;cadence?:'daily'|'weekly'|'manual';schedule?:{time:string;timezone:string;enabled:boolean};retry:{resource:string;action:string;body:object}|null;fix?:HealthFix};
export type Health={checkedAt:string;items:HealthItem[]};
export const getStateText = (): Record<HealthItem['state'],string> => ({healthy:$t('dataHealth.ok'),warning:$t('dataHealth.needsAttention'),failing:$t('dataHealth.needsFixing'),pending:$t('dataHealth.waitingSync')});
export function ago(v:string|null,now=Date.now()){if(!v)return $t('dataHealth.never');const m=Math.round((now-Date.parse(v))/60000);if(m<1)return $t('common.now');if(m<60)return $t('common.minAgo',{0:m});const h=Math.round(m/60);if(h<48)return $t('common.hAgo',{0:h});return $t('dataHealth.daysAgo',{0:Math.round(h/24)});}
export function loadHealth(projectId:number){return api.action<Health>('nrHealth','list',{method:'POST',body:{projectId},unwrap:'data'});}
// The reason on a source card that needs attention; a healthy card shows no sync line.
export function HealthLine({item}:{item:HealthItem}){return <p className={'nr-health-line nr-health-'+item.state}>{healthText(item.message,item.messageText)}</p>;}
// What a row needing attention asks for, as the server classifies it (server/nocoreach/data-health.ts).
export type HealthFix='retry'|'settings'|'verify'|'wait';
export const needsAttention=(item:HealthItem)=>item.state==='failing'||item.state==='warning';
// A server from before the classification sends no `fix`: a row with a retry is retried as before.
const fixOf=(item:HealthItem):HealthFix|undefined=>item.fix??(item.retry?'retry':undefined);
// A list of source names in the interface language: Chinese and Japanese use the enumeration comma.
export const sourceList=(names:string[])=>names.join(/^(zh|ja)/i.test(getCurrentLocale())?'、':', ');
type RetryRun={status:'running'|'started'|'failed';error?:string};
// The Data health tab (2026-10-22): the count and Retry all, the rows needing attention with the action that fits each
// failure, then every source's sync status. Retry all runs only the rows a plain retry can help and the person may
// retry, one after another; each row shows its own progress and result.
export function HealthPanel({projectId,reloadKey,onChange,settingsOf}:{projectId:number;reloadKey:number;onChange:()=>void;settingsOf?:(item:HealthItem)=>(()=>void)|null}){
 const [health,setHealth]=useState<Health>(),[runs,setRuns]=useState<Record<string,RetryRun>>({}),[error,setError]=useMessageState('');
 useEffect(()=>{void loadHealth(projectId).then(setHealth).catch(()=>setError(() => ($t('dataHealth.notLoadDataHealth'))));},[projectId, reloadKey, setError]);
 const attention=(health?.items||[]).filter(needsAttention);
 const [allowed,setAllowed]=useState<Record<string,boolean>>({}),onAccess=useCallback((id:string,can:boolean)=>setAllowed(a=>a[id]===can?a:{...a,[id]:can}),[]);
 const may=(i:HealthItem)=>Boolean(i.retry&&allowed[i.id]);
 const retryable=attention.filter(i=>fixOf(i)==='retry'&&may(i)&&!runs[i.id]?.status.match(/running|started/)),running=Object.values(runs).some(r=>r.status==='running');
 async function retry(items:HealthItem[]){
  setError('');
  for(const item of items){if(!item.retry)continue;setRuns(r=>({...r,[item.id]:{status:'running'}}));
   try{await api.action(item.retry.resource,item.retry.action,{method:'POST',body:{projectId:item.retry.resource==='nrGoogle'?String(projectId):projectId,...item.retry.body},unwrap:'data'});setRuns(r=>({...r,[item.id]:{status:'started'}}));}
   catch(e){setRuns(r=>({...r,[item.id]:{status:'failed',error:e instanceof Error?$legacyText(e.message):$t('dataHealth.retryNotWorkTryAgain')}}));}}
  try{setHealth(await loadHealth(projectId));}catch{setError(() => ($t('dataHealth.notLoadDataHealth')));}onChange();
 }
 // An uncertain DataForSEO result may already be billed: ask before querying again.
 async function verify(item:HealthItem){if(await confirmAction({title:() => $t('dataHealth.verifyTitle',{0:healthText(item.name,item.nameText)}),description:() => $t('dataHealth.verifyDescription'),action:() => $t('dataHealth.retryAnyway'),destructive:false}))await retry([item]);}
 if(!health)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="text-sm text-muted-foreground">{$t('common.loadingLoading')}</p>;
 if(!health.items.length)return <p className="text-sm text-muted-foreground">{$t('dataHealth.noSourcesYet')}</p>;
 return <section className="flex flex-col gap-4" aria-label={$t('dataHealth.dataHealth')}>
  <div className="flex flex-wrap items-center gap-2"><p className="text-sm text-muted-foreground">{$tj('dataHealth.dataSourcesOk',{0:health.items.length,1:health.items.length-attention.length,2:attention.length?$t('dataHealth.needAttention',{0:attention.length}):''})}</p><InfoTip label={$t('dataHealth.whatDataHealthMeans')}>{help($t('dataHealth.dataHealth'))}</InfoTip>
   {retryable.length?<Button size="sm" variant="outline" className="ml-auto" disabled={running} onClick={()=>void retry(retryable)}>{$t('dataHealth.retryAll',{0:retryable.length})}</Button>:null}</div>
  {attention.map(i=>i.retry?<RetryAccess key={i.id} projectId={projectId} item={i} onAccess={onAccess}/>:null)}
  {error&&<p className="nr-error" role="alert">{error}</p>}
  {attention.length?<ul className="divide-y rounded-lg border bg-card">{attention.map(i=>{const run=runs[i.id],fix=fixOf(i),open=fix==='settings'?settingsOf?.(i)??null:null;return <li key={i.id} data-health-row={i.id} data-fix={fix} className={'flex flex-wrap items-center gap-3 px-4 py-3 text-sm nr-health-'+i.state}><span className="nr-health-dot" aria-hidden="true"/><SourceLogo source={i.id} size="sm"/>
   <div className="min-w-0 flex-1"><p className="font-medium">{healthText(i.name,i.nameText)}</p><p className="text-muted-foreground">{$tj('dataHealth.lastSuccessValue',{0:healthText(i.message,i.messageText),1:ago(i.lastSuccessAt)})}</p>{fix==='settings'?<p className="text-nr-ink-amber">{$t('dataHealth.settingsFirst')}</p>:null}{run?.status==='failed'?<p className="text-destructive">{run.error}</p>:null}</div>
   {run?.status==='running'?<span role="status" className="text-muted-foreground">{$t('dataHealth.retryingLoading')}</span>:run?.status==='started'?<span role="status" className="text-muted-foreground">{$t('dataHealth.retryStarted')}</span>
    :fix==='retry'&&may(i)?<Button size="sm" variant="outline" disabled={running} onClick={()=>void retry([i])}>{$t('common.retry')}</Button>
    :fix==='verify'&&may(i)?<Button size="sm" variant="outline" disabled={running} onClick={()=>void verify(i)}>{$t('dataHealth.verifyRetry')}</Button>
    :open?<Button size="sm" variant="outline" onClick={open}>{$t('dataHealth.changeSettings')}</Button>:null}
  </li>;})}</ul>:null}
  <div className="overflow-x-auto rounded-lg border bg-card"><table><thead><tr><th>{$t('dataHealth.dataSource')}</th><th>{$t('dataHealth.frequency')}</th><th>{$t('common.status')}</th><th>{$t('dataHealth.lastSuccess')}</th><th>{$t('dataHealth.dataThrough')}</th><th>{$t('dataHealth.nextSync')}</th></tr></thead><tbody>{health.items.map(i=><tr key={i.id}><td><span className="flex items-center gap-2"><SourceLogo source={i.id} size="sm"/>{healthText(i.name,i.nameText)}</span>{i.schedule?<ScheduleNote schedule={i.schedule}/>:i.note&&<span className="nr-block nr-footnote">{healthText(i.note,i.noteText)}</span>}</td><td>{i.cadence?getCadenceText()[i.cadence]:'—'}</td><td>{getStateText()[i.state]}</td><td>{ago(i.lastSuccessAt)}</td><td>{i.dataThrough||'—'}</td><td>{i.nextSyncAt?formatDateTime(i.nextSyncAt):'—'}</td></tr>)}</tbody></table></div>
 </section>;
}
export const getCadenceText = (): Record<NonNullable<HealthItem['cadence']>,string> => ({daily:$t('dataHealth.cadenceDaily'),weekly:$t('dataHealth.cadenceWeekly'),manual:$t('dataHealth.cadenceManual')});
// The daily analysis runs at one time for the whole application, set under Settings › Automatic runs: say it plainly
// and link there for whoever may open that page.
function ScheduleNote({schedule}:{schedule:NonNullable<HealthItem['schedule']>}){
 const {can}=useCan({resource:{type:'page',id:'scheduler.schedules'},action:'access'});
 return <span className='nr-block nr-footnote'>{$t('dataHealth.dailyAnalysisAt',{0:schedule.time,1:timeZoneName(schedule.timezone,getCurrentLocale())})}{can?<> · <Link className='underline underline-offset-4' to='/schedules'>{$t('dataHealth.changeTime')}</Link></>:null}</span>;
}
// Each row checks its own retry action, as every other control does, and reports it, so Retry all counts only the rows
// this person may retry.
function RetryAccess({projectId,item,onAccess}:{projectId:number;item:HealthItem;onAccess:(id:string,can:boolean)=>void}){
 const {can}=useBusinessAccess(item.retry?`${item.retry.resource}.${item.retry.action}`:'',projectId);
 useEffect(()=>{onAccess(item.id,can);},[item.id,can,onAccess]);
 return null;
}
// Overview reminder: only sources that have failed for more than a day, with a link to fix them.
export function HealthAlert({projectId}:{projectId:number}){const navigate=useNavigate();const [items,setItems]=useState<HealthItem[]>([]);useEffect(()=>{void loadHealth(projectId).then(h=>setItems(h.items.filter(i=>i.state==='failing'))).catch(()=>undefined);},[projectId]);
 if(!items.length)return null;return <p role="alert" className="nr-error nr-health-alert">{$tj('dataHealth.failedSyncOverDayOpportunities',{0:items.map(i=>healthText(i.name,i.nameText)).join('、')})}<Button variant="outline" size="sm" onClick={()=>navigate('/connections?tab=health')}>{$t('dataHealth.fix')}</Button></p>;}
