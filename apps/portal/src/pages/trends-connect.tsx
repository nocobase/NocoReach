import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
import {confirmAction} from '@/components/reach/confirm';
// 趋势 (SPEC §11 市场需求): Google Trends through DataForSEO, once a week — the product and up to four competitors over
// 12 months, and the searches related to the product.
export type TrendsStatus={connected:boolean;checking?:boolean;dataforseo?:boolean;terms?:string[];locationCode?:number;place?:string;locations:{code:number;name:string}[];lastRun?:{at:string;ok:boolean;errors:string[]}|null;checkedAt?:string|null;nextCheckAt?:string|null;summary?:{term:string;average:number|null;recent:number|null;change:number|null}[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrTrends',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function TrendsConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const [status,setStatus]=useState<TrendsStatus>(),[terms,setTerms]=useState(suggested||''),[place,setPlace]=useState(0),[editing,setEditing]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<TrendsStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length){setTerms(s.terms.join(', '));setPlace(s.locationCode||0);}});
 useEffect(()=>{void load().catch(()=>setError('读取趋势状态失败。'));},[projectId]);
 useEffect(()=>{if(!status?.checking&&!(status?.connected&&!status.lastRun))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.checking,status?.lastRun,status?.connected]);
 async function run(fn:()=>Promise<TrendsStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);setEditing(false);onChange();}}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试。');}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">正在读取…</p>;
 const form=<><label className="nr-field">比较的词<input aria-label="比较的词" value={terms} disabled={busy} placeholder="NocoBase, Retool, Appsmith" onChange={e=>setTerms(e.target.value)}/></label>
  <label className="nr-field">地区<select aria-label="地区" value={place} disabled={busy} onChange={e=>setPlace(Number(e.target.value))}>{status.locations.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}</select></label>
  <p className="nr-footnote">第一个写产品名，后面可以加最多 4 个竞品，用逗号分开。每周查一次过去 12 个月的关注度，以及和第一个词相关的搜索；每次约 $0.022，算进 DataForSEO 的月度预算。</p></>;
 if(status.connected&&!editing)return <div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3>比较：{status.terms!.join('、')} · {status.place}</h3>
  {!status.lastRun?<p role="status">正在第一次查询，一般半分钟，可以先关闭面板。</p>:<>{status.summary?.length&&status.checkedAt?<p>{status.summary.map(x=>`${x.term} 近 4 周 ${x.recent??'—'}`).join(' · ')}</p>:null}
  <p className="nr-footnote">上次查询 {new Date(status.lastRun.at).toLocaleString()}，之后每周一次{status.nextCheckAt?`（下次约 ${new Date(status.nextCheckAt).toLocaleDateString()}）`:''}。{status.lastRun.errors.map(e=><span key={e} className="nr-block">没有查完：{e}</span>)}</p></>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.checking} onClick={()=>void run(()=>call<TrendsStatus>(projectId,'check'))}>{busy?'正在查询…':'立即查询'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(true)}>改比较的词</Button><Button size="sm" variant="ghost" disabled={busy} onClick={async()=>{if(await confirmAction({title:'停止每周查询趋势？',description:'已查到的数据保留。',action:'停止'}))void run(()=>call<TrendsStatus>(projectId,'disconnect'));}}>停止</Button></div></div>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  {!status.dataforseo?<p className="nr-footnote">趋势通过 DataForSEO 查 Google Trends，请先接入 DataForSEO（数据接入 → DataForSEO）。</p>:<>{form}
  <div className="nr-step-actions"><Button disabled={busy||!terms.trim()} onClick={()=>void run(()=>call<TrendsStatus>(projectId,'connect',{terms,locationCode:place}))}>{busy?'正在接入…':editing?'保存并重新查询':'接入并开始查询'}</Button>{editing&&<Button variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>取消</Button>}</div></>}</>;
}
