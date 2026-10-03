import {useEffect,useState} from 'react';
import {nocobaseClient as api} from '@nocobase/portal-sdk/client';
import {Button} from '@/components/ui/button';
// Reddit 讨论 (SPEC §11 外部讨论): Reddit threads found through a weekly Google search on DataForSEO, since Reddit's own API
// needs an approved, paid commercial agreement for brand monitoring.
export type RedditStatus={connected:boolean;checking?:boolean;dataforseo?:boolean;terms?:string[];lastRun?:{at:string;ok:boolean;errors:string[];found?:number;added?:number}|null;retainedFrom?:string|null;total?:number;nextCheckAt?:string|null;recent?:{title:string;subreddit:string;url:string}[]};
const call=<T,>(projectId:number,action:string,body:object={})=>api.action<T>('nrReddit',action,{method:'POST',body:{projectId,...body},unwrap:'data'});
export function RedditConnect({projectId,suggested,onChange}:{projectId:number;suggested?:string;onChange:()=>void}){
 const [status,setStatus]=useState<RedditStatus>(),[terms,setTerms]=useState(suggested||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=()=>call<RedditStatus>(projectId,'status').then(s=>{setStatus(s);if(s.terms?.length)setTerms(t=>t||s.terms!.join(', '));});
 useEffect(()=>{void load().catch(()=>setError('读取 Reddit 状态失败。'));},[projectId]);
 useEffect(()=>{if(!status?.checking&&!(status?.connected&&!status.lastRun))return;const t=setInterval(()=>{void load().then(()=>onChange()).catch(()=>undefined);},4000);return()=>clearInterval(t);},[status?.checking,status?.lastRun,status?.connected]);
 async function run(fn:()=>Promise<RedditStatus|void>){setBusy(true);setError('');try{const s=await fn();if(s){setStatus(s);onChange();}}catch(e){setError(e instanceof Error?e.message:'操作未完成，请重试。');}finally{setBusy(false);}}
 if(!status)return error?<p className="nr-error" role="alert">{error}</p>:<p role="status" className="nr-footnote">正在读取…</p>;
 if(status.connected)return <div className="nr-guide-connected">{error&&<p className="nr-error" role="alert">{error}</p>}<h3>搜索：{status.terms!.join('、')}</h3>
  {!status.lastRun?<p role="status">正在第一次查找，一般十几秒，可以先关闭面板。</p>:<><p>已记录 {status.total} 个帖子{status.retainedFrom?` · 从 ${status.retainedFrom} 开始记录`:''}{status.lastRun.added?` · 上次新发现 ${status.lastRun.added} 个`:''}</p>
  {!!status.recent?.length&&<details><summary className="nr-footnote">最近发现的帖子</summary>{status.recent.map(p=><p key={p.url} className="nr-footnote"><a className="nr-link" href={p.url} target="_blank" rel="noreferrer">{p.title}</a> · r/{p.subreddit}</p>)}</details>}
  <p className="nr-footnote">上次查找 {new Date(status.lastRun.at).toLocaleString()}，之后每周一次{status.nextCheckAt?`（下次约 ${new Date(status.nextCheckAt).toLocaleDateString()}）`:''}。{status.lastRun.errors.map(e=><span key={e} className="nr-block">部分未完成：{e}</span>)}</p></>}
  <div className="nr-step-actions"><Button size="sm" variant="outline" disabled={busy||status.checking} onClick={()=>void run(()=>call<RedditStatus>(projectId,'check'))}>{busy?'正在查找…':'立即查找'}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>{if(confirm('停止查找 Reddit 讨论？已记录的帖子仍保留。'))void run(()=>call<RedditStatus>(projectId,'disconnect'));}}>停止</Button></div></div>;
 return <>{error&&<p className="nr-error" role="alert">{error}</p>}
  {!status.dataforseo?<p className="nr-footnote">Reddit 讨论通过 DataForSEO 在 Google 里搜，请先接入 DataForSEO（数据接入 → DataForSEO）。</p>:<>
  <label className="nr-field">产品名<input aria-label="产品名" value={terms} disabled={busy} placeholder="NocoBase" onChange={e=>setTerms(e.target.value)}/></label>
  <p className="nr-footnote">多个词用逗号分开，最多 5 个；按整个词组搜。每周每个词在 Google 搜一次 site:reddit.com，约 $0.002，算进 DataForSEO 的月度预算。只看得到 Google 收录了的帖子，看不到点赞和评论数；不保存作者。</p>
  <div className="nr-step-actions"><Button disabled={busy||!terms.trim()} onClick={()=>void run(()=>call<RedditStatus>(projectId,'connect',{terms}))}>{busy?'正在接入…':'接入并开始查找'}</Button></div></>}</>;
}
