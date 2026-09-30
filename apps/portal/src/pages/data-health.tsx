import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
export type HealthItem={id:string;name:string;state:'healthy'|'warning'|'failing'|'pending';message:string;lastSuccessAt:string|null;dataThrough:string|null;nextSyncAt:string|null;note?:string;retry:{resource:string;action:string;body:object}|null};
export type Health={checkedAt:string;items:HealthItem[]};
export const stateText:Record<HealthItem['state'],string>={healthy:'正常',warning:'需要留意',failing:'需要处理',pending:'等待同步'};
export function ago(v:string|null,now=Date.now()){if(!v)return '从未';const m=Math.round((now-Date.parse(v))/60000);if(m<1)return '刚刚';if(m<60)return `${m} 分钟前`;const h=Math.round(m/60);if(h<48)return `${h} 小时前`;return `${Math.round(h/24)} 天前`;}
export function loadHealth(projectId:number){return api.action<Health>('nrHealth','list',{method:'POST',body:{projectId},unwrap:'data'});}
export function HealthLine({item}:{item:HealthItem}){return <p className={'nr-health-line nr-health-'+item.state}><span className="nr-health-dot" aria-hidden="true"/>{item.state==='healthy'?`上次同步 ${ago(item.lastSuccessAt)}${item.dataThrough?` · 数据截至 ${item.dataThrough}`:''}`:item.message}</p>;}
// Healthy sources collapse into one line; anything needing attention is listed with its reason and a retry.
export function HealthPanel({projectId,reloadKey,onChange}:{projectId:number;reloadKey:number;onChange:()=>void}){
 const [health,setHealth]=useState<Health>(),[busy,setBusy]=useState(''),[error,setError]=useState('');
 useEffect(()=>{void loadHealth(projectId).then(setHealth).catch(()=>setError('读取数据健康状态失败。'));},[projectId,reloadKey]);
 async function retry(item:HealthItem){if(!item.retry)return;setBusy(item.id);setError('');try{await api.action(item.retry.resource,item.retry.action,{method:'POST',body:{projectId:item.retry.resource==='nrGoogle'?String(projectId):projectId,...item.retry.body},unwrap:'data'});setHealth(await loadHealth(projectId));onChange();}catch(e){setError(e instanceof Error?e.message:'重试没有成功，请稍后再试。');}finally{setBusy('');}}
 if(!health)return error?<p className="nr-error" role="alert">{error}</p>:null;if(!health.items.length)return null;
 const attention=health.items.filter(i=>i.state==='failing'||i.state==='warning'),ok=health.items.length-attention.length;
 return <section className="nr-health" aria-label="数据健康"><div className="nr-health-head"><h2>数据健康</h2><span className="nr-footnote">{health.items.length} 个数据源 · {ok} 个正常{attention.length?` · ${attention.length} 个需要留意`:''}</span></div>
  {error&&<p className="nr-error" role="alert">{error}</p>}
  {attention.map(i=><div key={i.id} className={'nr-health-row nr-health-'+i.state}><span className="nr-health-dot" aria-hidden="true"/><div><strong>{i.name}</strong><span className="nr-footnote">{i.message} · 上次成功 {ago(i.lastSuccessAt)}</span></div>{i.retry&&<Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={()=>void retry(i)}>{busy===i.id?'正在重试…':'重试'}</Button>}</div>)}
  <details className="nr-health-all"><summary className="nr-footnote">查看全部同步状态</summary><table><thead><tr><th>数据源</th><th>状态</th><th>上次成功</th><th>数据截至</th><th>下次同步</th></tr></thead><tbody>{health.items.map(i=><tr key={i.id}><td>{i.name}{i.note&&<span className="nr-block nr-footnote">{i.note}</span>}</td><td>{stateText[i.state]}</td><td>{ago(i.lastSuccessAt)}</td><td>{i.dataThrough||'—'}</td><td>{i.nextSyncAt?new Date(i.nextSyncAt).toLocaleString():'—'}</td></tr>)}</tbody></table></details>
 </section>;
}
// Overview reminder: only sources that have failed for more than a day, with a link to fix them.
export function HealthAlert({projectId}:{projectId:number}){const navigate=useNavigate();const [items,setItems]=useState<HealthItem[]>([]);useEffect(()=>{void loadHealth(projectId).then(h=>setItems(h.items.filter(i=>i.state==='failing'))).catch(()=>undefined);},[projectId]);
 if(!items.length)return null;return <p role="alert" className="nr-error nr-health-alert">{items.map(i=>i.name).join('、')} 同步失败超过 1 天，建议和观察可能缺少这些数据。<Button variant="outline" size="sm" onClick={()=>navigate('/connections')}>去处理</Button></p>;}
