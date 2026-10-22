import { useMessageState, getCurrentLocale, translateSourceError, $t, $tj, $legacyText } from "#i18n";
import {useEffect,useState} from 'react';
import {useBusinessAccess} from '#hooks/use-business-access';
import {Link,useNavigate} from 'react-router';
import {useCan} from '@nocobase/app-plugin-authorization/client';
import {timeZoneName} from '#lib/time-zone-name';
import {nocobaseClient as api} from "#lib/nocoreach-api";
import {Button} from '#components/ui/button';
import {Reveal} from '#components/reach/reveal';
import {InfoTip} from '#components/reach/info-tip';
import {help} from './glossary';
export type HealthText={key:string;params?:Record<string,string|number|HealthText|{systemError:string}>};
// A missing descriptor is legacy or user-authored content: preserve the original verbatim.
export function healthText(original:string|undefined,text?:HealthText):string{
 if(!text)return original||'';
 const params=Object.fromEntries(Object.entries(text.params||{}).map(([key,value])=>[key,typeof value==='object'?('systemError' in value?translateSourceError(value.systemError):healthText('',value)):value]));
 return $legacyText(text.key,params);
}
export type HealthItem={nameText?:HealthText;noteText?:HealthText;messageText?:HealthText;id:string;name:string;state:'healthy'|'warning'|'failing'|'pending';message:string;lastSuccessAt:string|null;dataThrough:string|null;nextSyncAt:string|null;note?:string;cadence?:'daily'|'weekly'|'manual';schedule?:{time:string;timezone:string;enabled:boolean};retry:{resource:string;action:string;body:object}|null};
export type Health={checkedAt:string;items:HealthItem[]};
export const getStateText = (): Record<HealthItem['state'],string> => ({healthy:$t('dataHealth.ok'),warning:$t('dataHealth.needsAttention'),failing:$t('dataHealth.needsFixing'),pending:$t('dataHealth.waitingSync')});
export function ago(v:string|null,now=Date.now()){if(!v)return $t('dataHealth.never');const m=Math.round((now-Date.parse(v))/60000);if(m<1)return $t('common.now');if(m<60)return $t('common.minAgo',{0:m});const h=Math.round(m/60);if(h<48)return $t('common.hAgo',{0:h});return $t('dataHealth.daysAgo',{0:Math.round(h/24)});}
export function loadHealth(projectId:number){return api.action<Health>('nrHealth','list',{method:'POST',body:{projectId},unwrap:'data'});}
// The reason on a source card that needs attention; a healthy card shows no sync line.
export function HealthLine({item}:{item:HealthItem}){return <p className={'nr-health-line nr-health-'+item.state}>{healthText(item.message,item.messageText)}</p>;}
// Healthy sources collapse into one line; anything needing attention is listed with its reason and a retry.
export function HealthPanel({projectId,reloadKey,onChange}:{projectId:number;reloadKey:number;onChange:()=>void}){
 const [health,setHealth]=useState<Health>(),[busy,setBusy]=useState(''),[error,setError]=useMessageState('');
 useEffect(()=>{void loadHealth(projectId).then(setHealth).catch(()=>setError(() => ($t('dataHealth.notLoadDataHealth'))));},[projectId, reloadKey, setError]);
 async function retry(item:HealthItem){if(!item.retry)return;setBusy(item.id);setError('');try{await api.action(item.retry.resource,item.retry.action,{method:'POST',body:{projectId:item.retry.resource==='nrGoogle'?String(projectId):projectId,...item.retry.body},unwrap:'data'});setHealth(await loadHealth(projectId));onChange();}catch(e){setError(() => (e instanceof Error?$legacyText(e.message):$t('dataHealth.retryNotWorkTryAgain')));}finally{setBusy('');}}
 if(!health)return error?<p className="nr-error" role="alert">{error}</p>:null;if(!health.items.length)return null;
 const attention=health.items.filter(i=>i.state==='failing'||i.state==='warning'),ok=health.items.length-attention.length;
 return <section className="nr-health" aria-label={$t('dataHealth.dataHealth')}><div className="nr-health-head"><h2>{$t('dataHealth.dataHealth')}</h2><InfoTip label={$t('dataHealth.whatDataHealthMeans')} className="self-center">{help($t('dataHealth.dataHealth'))}</InfoTip><span className="nr-footnote">{$tj('dataHealth.dataSourcesOk',{0:health.items.length,1:ok,2:attention.length?$t('dataHealth.needAttention',{0:attention.length}):''})}</span></div>
  {error&&<p className="nr-error" role="alert">{error}</p>}
  {attention.map(i=><div key={i.id} className={'nr-health-row nr-health-'+i.state}><span className="nr-health-dot" aria-hidden="true"/><div><strong>{healthText(i.name,i.nameText)}</strong><span className="nr-footnote">{$tj('dataHealth.lastSuccessValue',{0:healthText(i.message,i.messageText),1:ago(i.lastSuccessAt)})}</span></div>{i.retry&&<HealthRetry projectId={projectId} item={i} busy={busy} onRetry={()=>void retry(i)}/>}</div>)}
  <Reveal label={$t('dataHealth.viewSyncStatus')} className="nr-health-all"><div className='overflow-x-auto'><table><thead><tr><th>{$t('dataHealth.dataSource')}</th><th>{$t('dataHealth.frequency')}</th><th>{$t('common.status')}</th><th>{$t('dataHealth.lastSuccess')}</th><th>{$t('dataHealth.dataThrough')}</th><th>{$t('dataHealth.nextSync')}</th></tr></thead><tbody>{health.items.map(i=><tr key={i.id}><td>{healthText(i.name,i.nameText)}{i.schedule?<ScheduleNote schedule={i.schedule}/>:i.note&&<span className="nr-block nr-footnote">{healthText(i.note,i.noteText)}</span>}</td><td>{i.cadence?getCadenceText()[i.cadence]:'—'}</td><td>{getStateText()[i.state]}</td><td>{ago(i.lastSuccessAt)}</td><td>{i.dataThrough||'—'}</td><td>{i.nextSyncAt?new Date(i.nextSyncAt).toLocaleString(getCurrentLocale()):'—'}</td></tr>)}</tbody></table></div></Reveal>
 </section>;
}
export const getCadenceText = (): Record<NonNullable<HealthItem['cadence']>,string> => ({daily:$t('dataHealth.cadenceDaily'),weekly:$t('dataHealth.cadenceWeekly'),manual:$t('dataHealth.cadenceManual')});
// The daily analysis runs at one time for the whole application, set under Settings › Automatic runs: say it plainly
// and link there for whoever may open that page.
function ScheduleNote({schedule}:{schedule:NonNullable<HealthItem['schedule']>}){
 const {can}=useCan({resource:{type:'page',id:'scheduler.schedules'},action:'access'});
 return <span className='nr-block nr-footnote'>{$t('dataHealth.dailyAnalysisAt',{0:schedule.time,1:timeZoneName(schedule.timezone,getCurrentLocale())})}{can?<> · <Link className='underline underline-offset-4' to='/schedules'>{$t('dataHealth.changeTime')}</Link></>:null}</span>;
}
function HealthRetry({projectId,item,busy,onRetry}:{projectId:number;item:HealthItem;busy:string;onRetry:()=>void}){
 const {can}=useBusinessAccess(item.retry?`${item.retry.resource}.${item.retry.action}`:'',projectId);
 return can?<Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={onRetry}>{busy===item.id?$t('dataHealth.retryingLoading'):$t('common.retry')}</Button>:null;
}
// Overview reminder: only sources that have failed for more than a day, with a link to fix them.
export function HealthAlert({projectId}:{projectId:number}){const navigate=useNavigate();const [items,setItems]=useState<HealthItem[]>([]);useEffect(()=>{void loadHealth(projectId).then(h=>setItems(h.items.filter(i=>i.state==='failing'))).catch(()=>undefined);},[projectId]);
 if(!items.length)return null;return <p role="alert" className="nr-error nr-health-alert">{$tj('dataHealth.failedSyncOverDayOpportunities',{0:items.map(i=>healthText(i.name,i.nameText)).join('、')})}<Button variant="outline" size="sm" onClick={()=>navigate('/connections')}>{$t('dataHealth.fix')}</Button></p>;}
